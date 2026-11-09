import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    AlertTriangle,
    Check,
    CheckSquare,
    CloudDownload,
    Cpu,
    ExternalLink,
    FileText,
    GitBranch,
    RefreshCw,
    Send,
    Trash2,
    UploadCloud,
    X,
} from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { tc } from "../../api/tc";
import type { CfwBox, CfwChannel, CfwImage, CfwResult } from "../../api/types";
import { ago, dateTime } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useAccess } from "../../lib/access";
import { keys, useBoxes, useBoxImage, useCfwBoxes } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import {
    Empty,
    ErrorBox,
    Loading,
    Notice,
    Page,
    Row,
    Section,
    Segmented,
    useUi,
} from "../../ui/kit";
import { useSelection } from "../../ui/useSelection";
import { remoteAvailable } from "../boxes/BoxesPage";
import { cfwMessage } from "./cfwMessages";
import { InstallGuide } from "./InstallGuide";

const CHANNELS: CfwChannel[] = ["release", "beta", "alpha"];
const CHANNEL_NUMBER: Record<CfwChannel, number> = { none: 0, release: 1, beta: 2, alpha: 3 };
const CHANNEL_CLASS: Record<CfwChannel, string> = {
    none: "",
    release: "ok",
    beta: "accent",
    alpha: "warn",
};

const platformOf = (x: { platform?: string }) => (x.platform === "esp32" ? "esp32" : "cc3200");
const platformName = (x: { platform?: string }) => (platformOf(x) === "esp32" ? "ESP32" : "CC3200");

/** "YYYY-MM-DD HH:MM" of a build number (seconds since 1970) */
export const formatBuild = (build?: number) => {
    if (!build) return "–";
    const d = new Date(build * 1000);
    const two = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
};

const imageLabel = (image: CfwImage) =>
    image.original
        ? image.version
        : `${image.version || formatBuild(image.build)}${image.version ? " · " + formatBuild(image.build) : ""}`;

/** the images a box can take: its own platform; the original ESP32 firmware only for the return from the CFW */
const imagesForBox = (images: CfwImage[], box: CfwBox) =>
    images.filter((i) => platformOf(i) === platformOf(box) && (!i.original || box.isCfw));

const imageId = (i: CfwImage) => `${platformOf(i)}-${i.build}`;

/** custom firmware images no box runs or has assigned, except the newest of each platform */
const oldImages = (images: CfwImage[], boxes: CfwBox[]) => {
    const newest = new Map<string, number>();
    for (const i of images)
        if (!i.original)
            newest.set(platformOf(i), Math.max(newest.get(platformOf(i)) ?? 0, i.build));
    return images.filter(
        (i) => !i.original && i.build !== newest.get(platformOf(i)) && !usedBy(i, boxes).length,
    );
};

/** the boxes that run an image, have it assigned or take it next */
const usedBy = (i: CfwImage, boxes: CfwBox[]) =>
    boxes.filter(
        (b) =>
            platformOf(b) === platformOf(i) &&
            [b.version, b.update?.target, b.update?.next].includes(i.build),
    );

/** a warning for deleting images boxes use, or "" */
const inUseText = (list: CfwImage[], boxes: CfwBox[]) => {
    const names = [...new Set(list.flatMap((i) => usedBy(i, boxes)))].map(
        (b) => b.boxName || b.commonName,
    );
    return names.length ? " " + t("boxupdate.imagesInUse", { boxes: names.join(", ") }) : "";
};

/** an ESP32 box with the original firmware takes its assigned image once, through its own update check */
const esp32Installs = (box: CfwBox) =>
    !box.isCfw &&
    platformOf(box) === "esp32" &&
    box.update.target !== 0 &&
    box.esp32Delivered !== box.update.target;

const ChannelBadge = ({ c }: { c: CfwChannel }) => (
    <span className={`badge ${CHANNEL_CLASS[c]}`}>{t(`boxupdate.channel_${c}` as never)}</span>
);

/** a CfwResult, also from an error answer */
const result = async (fn: () => Promise<CfwResult>): Promise<CfwResult> => {
    try {
        return await fn();
    } catch (e) {
        if (e instanceof ApiError) {
            try {
                return JSON.parse(e.message) as CfwResult;
            } catch {
                return { ok: false, message: e.message };
            }
        }
        return { ok: false, message: String((e as Error).message) };
    }
};

export function BoxUpdatePage() {
    const qc = useQueryClient();
    const ui = useUi();
    const access = useAccess();
    const boxes = useCfwBoxes();
    const firmware = useQuery({
        queryKey: ["cfwFirmware"],
        queryFn: tc.cfwFirmware,
        refetchInterval: 20_000,
    });
    const [imageKey, setImageKey] = useState<string | null>(null);
    const [upload, setUpload] = useState(false);

    const refresh = async () => {
        await Promise.all([
            qc.invalidateQueries({ queryKey: keys.cfwBoxes }),
            qc.invalidateQueries({ queryKey: ["cfwFirmware"] }),
        ]);
    };
    const notify = async (r: CfwResult, ok: string) => {
        if (r.ok)
            // "assigned, but ...": the box will not get it (update off, rolled back)
            ui.toast(
                r.message?.startsWith("assigned, but") ? "info" : "ok",
                ok,
                r.message && r.message !== "OK" ? cfwMessage(r.message) : undefined,
            );
        else ui.toast("error", t("common.actionFailed"), cfwMessage(r.message));
        await refresh();
    };

    const images = firmware.data?.images ?? [];
    const sorted = [...images].sort((a, b) => b.build - a.build);
    const sel = useSelection(setImageKey, sorted.map(imageId));
    // taken from the current list, so that a change shows at once
    const image = sorted.find((i) => imageId(i) === imageKey) ?? null;

    if (boxes.data === null) return <SupportOff />;

    /* users update the boxes they have the update right for; the builds are the admin's */
    const mine = (boxes.data ?? []).filter((b) => access.can("box", b.id, "box.update"));
    // the guide is for the first box; once one runs the custom firmware it moves down, closed
    const anyCfw = mine.some((b) => b.isCfw);
    const old = oldImages(images, boxes.data ?? []);
    const chosen = sorted.filter((i) => sel.selected.has(imageId(i)));

    const removeImages = async (list: CfwImage[], title: string) => {
        const ok = await ui.confirm({
            title,
            text:
                t("boxupdate.deleteImagesText", {
                    n: list.length,
                    v: list.map(imageLabel).join(", "),
                }) + inUseText(list, boxes.data ?? []),
            confirm: t("common.delete"),
            danger: true,
        });
        if (!ok) return;
        let failed = 0;
        for (const i of list)
            if (
                !(await tc.cfwDeleteFirmware(i).then(
                    (r) => r.ok,
                    () => false,
                ))
            )
                failed++;
        sel.clear();
        if (failed) ui.toast("error", t("common.bulkFailed", { n: failed }));
        else ui.toast("ok", t("common.deleted"));
        await refresh();
    };

    return (
        <Page
            title={t("common.boxUpdate")}
            subtitle={t("common.boxUpdateHint")}
            back="/more"
            narrow
            right={
                <button className="icon-btn" onClick={refresh} aria-label={t("boxupdate.refresh")}>
                    <RefreshCw size={20} />
                </button>
            }
        >
            {(boxes.isLoading || firmware.isLoading) && <Loading />}
            {boxes.error && <ErrorBox error={boxes.error} retry={() => boxes.refetch()} />}
            {firmware.error && <ErrorBox error={firmware.error} retry={() => firmware.refetch()} />}

            {boxes.data && !anyCfw && access.admin && <InstallGuide open />}

            {boxes.data && (
                <Section title={t("common.boxes")} plain footer={t("boxupdate.boxUpdateBoxesHint")}>
                    {mine.length === 0 && (
                        <Empty icon={<Cpu size={28} />} title={t("common.noBoxes")} />
                    )}
                    <div style={{ display: "grid", gap: 12 }}>
                        {mine.map((box) => (
                            <BoxCard key={box.id} box={box} images={images} notify={notify} />
                        ))}
                    </div>
                </Section>
            )}

            {firmware.data && (
                <Section
                    title={t("boxupdate.firmwareLibrary")}
                    right={
                        access.admin && (
                            <>
                                {sorted.length > 1 && (
                                    <button
                                        className="btn ghost small"
                                        onClick={() => sel.setSelecting(true)}
                                    >
                                        <CheckSquare size={16} />
                                        {t("common.select")}
                                    </button>
                                )}
                                <button className="btn ghost small" onClick={() => setUpload(true)}>
                                    <UploadCloud size={16} />
                                    {t("common.upload")}
                                </button>
                            </>
                        )
                    }
                    footer={
                        firmware.data.defaultPage
                            ? t("boxupdate.defaultPage", { v: firmware.data.defaultPage.label })
                            : undefined
                    }
                >
                    {sorted.length === 0 && (
                        <Row title={t("boxupdate.noImages")} sub={t("boxupdate.noImagesHint")} />
                    )}
                    {sorted.map((i) => (
                        <div
                            key={imageId(i)}
                            className="row-wrap"
                            role="button"
                            tabIndex={0}
                            {...(access.admin ? sel.itemProps(imageId(i)) : {})}
                        >
                            <Row
                                className={sel.selected.has(imageId(i)) ? "checked" : ""}
                                icon={sel.selecting ? undefined : <Cpu size={17} />}
                                leading={
                                    sel.selecting ? (
                                        <button
                                            type="button"
                                            className={`select-box ${sel.selected.has(imageId(i)) ? "checked" : ""}`}
                                            aria-label={t("common.select")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                sel.toggle(imageId(i), e.shiftKey);
                                            }}
                                            onPointerDown={(e) => e.stopPropagation()}
                                        >
                                            {sel.selected.has(imageId(i)) && (
                                                <Check size={15} strokeWidth={3} />
                                            )}
                                        </button>
                                    ) : undefined
                                }
                                title={
                                    <>
                                        {i.version || formatBuild(i.build)}{" "}
                                        <span className="badge">{platformName(i)}</span>{" "}
                                        {i.original ? (
                                            <span className="badge warn">
                                                {t("boxupdate.originalFirmware")}
                                            </span>
                                        ) : (
                                            <ChannelBadge c={i.channel} />
                                        )}
                                    </>
                                }
                                sub={[
                                    i.original ? "" : formatBuild(i.build),
                                    i.source === "github"
                                        ? `GitHub ${i.githubTag}`
                                        : t("boxupdate.uploaded"),
                                    i.pageLabel
                                        ? t("boxupdate.setupPageV", { v: i.pageLabel })
                                        : "",
                                    i.notes,
                                ]
                                    .filter(Boolean)
                                    .join(" · ")}
                            />
                        </div>
                    ))}
                    {access.admin && old.length > 0 && (
                        <Row
                            icon={<Trash2 size={17} />}
                            title={t("boxupdate.deleteOldImages", { n: old.length })}
                            sub={t("boxupdate.deleteOldImagesHint")}
                            danger
                            onClick={() => removeImages(old, t("boxupdate.deleteOldImagesTitle"))}
                            chevron={false}
                        />
                    )}
                </Section>
            )}

            {sel.selecting && (
                <div className="select-bar" role="toolbar">
                    <button
                        className="icon-btn"
                        onClick={sel.clear}
                        aria-label={t("common.cancel")}
                    >
                        <X size={20} />
                    </button>
                    <span className="count">
                        {chosen.length
                            ? t("common.nSelected", { n: chosen.length })
                            : t("boxupdate.selectImages")}
                    </span>
                    <button
                        className="btn danger small"
                        disabled={!chosen.length}
                        onClick={() => removeImages(chosen, t("boxupdate.deleteImages"))}
                    >
                        <Trash2 size={15} />
                        {t("common.delete")}
                    </button>
                </div>
            )}

            {firmware.data && access.admin && (
                <GithubSection github={firmware.data.github} notify={notify} />
            )}

            {anyCfw && access.admin && <InstallGuide open={false} />}

            <ImageSheet
                image={image}
                inUse={image ? inUseText([image], boxes.data ?? []) : ""}
                onClose={() => setImageKey(null)}
                notify={notify}
            />
            <UploadSheet open={upload} onClose={() => setUpload(false)} notify={notify} />
        </Page>
    );
}

/** CFW support off (or not on this server): switch it on, and the guide */
function SupportOff() {
    const access = useAccess();
    const qc = useQueryClient();
    const ui = useUi();
    const enabled = useQuery({ queryKey: ["cfwEnabled"], queryFn: tc.cfwEnabled });
    if (enabled.isLoading) return <Loading />;
    if (enabled.data !== "false" || !access.admin)
        return (
            <Page title={t("common.boxUpdate")} back="/more" narrow>
                <Empty
                    icon={<Cpu size={28} />}
                    title={t("boxupdate.noCfwSupport")}
                    text={t("boxupdate.noCfwSupportText")}
                />
            </Page>
        );
    return (
        <Page
            title={t("common.boxUpdate")}
            subtitle={t("common.boxUpdateHint")}
            back="/more"
            narrow
        >
            <Notice info>
                {t("boxupdate.cfwSupportOff")}
                <div style={{ marginTop: 10 }}>
                    <button
                        className="btn primary small"
                        onClick={async () => {
                            const ok = await ui.run(async () => {
                                await tc.setSetting("cfw.enabled", true);
                                return true;
                            }, t("common.saved"));
                            if (ok)
                                await Promise.all([
                                    qc.invalidateQueries({ queryKey: keys.cfwBoxes }),
                                    qc.invalidateQueries({ queryKey: ["cfwEnabled"] }),
                                ]);
                        }}
                    >
                        {t("boxupdate.cfwSupportEnable")}
                    </button>
                </div>
            </Notice>
            <InstallGuide open />
        </Page>
    );
}

function BoxCard({
    box,
    images,
    notify,
}: {
    box: CfwBox;
    images: CfwImage[];
    notify: (r: CfwResult, ok: string) => Promise<void>;
}) {
    const ui = useUi();
    const boxes = useBoxes();
    const img = useBoxImage(boxes.data?.find((b) => b.ID.toLowerCase() === box.id.toLowerCase()));
    const running = images.find(
        (i) => i.build === box.version && platformOf(i) === platformOf(box),
    );
    const offered = images.find(
        (i) => i.build === box.update.next && platformOf(i) === platformOf(box),
    );
    const choices = imagesForBox(images, box);
    const setSetting = async (name: string, value: number) => {
        await notify(
            await result(async () => {
                await tc.setSetting(name, value, box.id);
                return { ok: true, message: "" };
            }),
            t("common.saved"),
        );
    };

    let next: ReactNode;
    if (!box.update.enabled || !box.settings.enabled)
        next = <span className="muted">{t("boxupdate.updateOff")}</span>;
    else if (esp32Installs(box))
        next = <span className="badge warn">{t("boxupdate.esp32Install")}</span>;
    else if (!box.update.next) next = <span className="muted">{t("boxupdate.upToDate")}</span>;
    else
        next = (
            <span className="row-gap" style={{ flexWrap: "wrap" }}>
                <span className="badge warn">
                    {offered?.original
                        ? t("boxupdate.esp32Return")
                        : `${offered?.version ? offered.version + " · " : ""}${formatBuild(box.update.next)}`}
                </span>
                <button
                    className="btn small soft"
                    disabled={!box.helloValid || !remoteAvailable(box)}
                    title={t("boxupdate.deliverNowHint")}
                    onClick={async () =>
                        notify(
                            await result(() => tc.cfwCheckNow(box.id)),
                            t("boxupdate.checkingNow"),
                        )
                    }
                >
                    <Send size={14} />
                    {t("boxupdate.deliverNow")}
                </button>
            </span>
        );

    return (
        <div className="card" style={{ padding: 16 }}>
            <div className="row-gap" style={{ alignItems: "center", gap: 12 }}>
                {img ? (
                    <img
                        src={img}
                        alt=""
                        style={{ width: 46, height: 46, objectFit: "contain", flexShrink: 0 }}
                    />
                ) : null}
                <div className="grow">
                    <div style={{ fontWeight: 700, fontSize: 17 }}>
                        {box.boxName || box.commonName}
                    </div>
                    <div className="row-gap small muted" style={{ flexWrap: "wrap", marginTop: 4 }}>
                        <span className="badge">{platformName(box)}</span>
                        {box.isCfw ? (
                            <span className={`badge ${box.helloValid ? "ok" : ""}`}>
                                {box.helloValid
                                    ? t("boxupdate.connected")
                                    : t("boxupdate.notConnected")}
                            </span>
                        ) : (
                            <span className="badge">{t("boxupdate.originalFirmware")}</span>
                        )}
                        {box.updateResult === 1 && (
                            <span className="badge ok">{t("boxupdate.updateConfirmed")}</span>
                        )}
                    </div>
                </div>
            </div>
            <div
                className="list"
                style={{ marginTop: 12, boxShadow: "none", background: "var(--bg-sunken)" }}
            >
                <Row
                    title={t("boxupdate.runningFirmware")}
                    value={
                        box.isCfw
                            ? `${running?.version ? running.version + " · " : ""}${formatBuild(box.version)}`
                            : box.version
                              ? formatBuild(box.version)
                              : "–"
                    }
                />
                {!!box.rolledBackBuild && (
                    <Row
                        icon={<AlertTriangle size={17} />}
                        iconColor="var(--warn)"
                        title={t("boxupdate.rolledBack")}
                        sub={[
                            box.rolledBackReason &&
                                t(`boxupdate.rolledBackReason.${box.rolledBackReason}` as never),
                            dateTime((box.rolledBackTime ?? 0) * 1000),
                        ]
                            .filter(Boolean)
                            .join(" · ")}
                        value={formatBuild(box.rolledBackBuild)}
                    />
                )}
                <Row title={t("boxupdate.nextUpdate")} right={next} />
            </div>

            <div className="choice-group" style={{ marginTop: 14 }}>
                <div className="choice-label">{t("boxupdate.delivery")}</div>
                <Segmented
                    value={box.update.mode}
                    onChange={(m) => setSetting("cfw.update.mode", m === "automatic" ? 1 : 0)}
                    options={[
                        { value: "manual", label: t("boxupdate.deliveryManual") },
                        { value: "automatic", label: t("boxupdate.deliveryAutomatic") },
                    ]}
                />
            </div>
            {box.update.mode === "automatic" ? (
                <div className="choice-group">
                    <div className="choice-label">{t("boxupdate.updateChannel")}</div>
                    <Segmented
                        value={box.update.channel}
                        onChange={(c) => setSetting("cfw.update.channel", CHANNEL_NUMBER[c])}
                        options={(["none", ...CHANNELS] as CfwChannel[]).map((c) => ({
                            value: c,
                            label: t(`boxupdate.channel_${c}` as never),
                        }))}
                    />
                </div>
            ) : (
                <div className="choice-group">
                    <div className="choice-label">{t("boxupdate.assignedImage")}</div>
                    <select
                        className="select"
                        value={box.update.target || 0}
                        onChange={async (e) => {
                            const build = Number(e.target.value);
                            if (build && platformOf(box) === "esp32" && !box.isCfw) {
                                const ok = await ui.confirm({
                                    title: t("boxupdate.esp32InstallTitle"),
                                    text: t("boxupdate.esp32InstallText"),
                                    confirm: t("common.assign"),
                                });
                                if (!ok) return;
                            }
                            await notify(
                                await result(() => tc.cfwDeliver(box.id, build)),
                                build ? t("boxupdate.assigned") : t("boxupdate.unassigned"),
                            );
                        }}
                    >
                        <option value={0}>{t("boxupdate.noAssignment")}</option>
                        {!!box.update.target &&
                            !choices.some((i) => i.build === box.update.target) && (
                                <option value={box.update.target}>
                                    {formatBuild(box.update.target)} ({t("boxupdate.notInLibrary")})
                                </option>
                            )}
                        {choices.map((i) => (
                            <option
                                key={i.build}
                                value={i.build}
                                disabled={i.build === box.version}
                            >
                                {imageLabel(i)} (
                                {i.original
                                    ? t("boxupdate.originalFirmware")
                                    : t(`boxupdate.channel_${i.channel}` as never)}
                                )
                            </option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    );
}

function ImageSheet({
    image,
    inUse,
    onClose,
    notify,
}: {
    image: CfwImage | null;
    /** the warning when boxes use the image */
    inUse: string;
    onClose: () => void;
    notify: (r: CfwResult, ok: string) => Promise<void>;
}) {
    const ui = useUi();
    const [notes, setNotes] = useState("");
    const pageInput = useRef<HTMLInputElement>(null);
    useEffect(() => setNotes(image?.notes ?? ""), [image]);
    if (!image)
        return (
            <Sheet open={false} onClose={onClose}>
                {null}
            </Sheet>
        );

    const remove = async () => {
        const ok = await ui.confirm({
            title: t("boxupdate.deleteImage"),
            text: t("boxupdate.deleteImageText", { v: imageLabel(image) }) + inUse,
            confirm: t("common.delete"),
            danger: true,
        });
        if (!ok) return;
        await notify(await result(() => tc.cfwDeleteFirmware(image)), t("common.deleted"));
        onClose();
    };

    return (
        <Sheet
            open={!!image}
            onClose={onClose}
            title={image.version || formatBuild(image.build)}
            footer={
                <>
                    <button
                        className="btn danger"
                        style={{ flex: "0 0 auto" }}
                        onClick={remove}
                        aria-label={t("common.delete")}
                    >
                        <Trash2 size={18} />
                    </button>
                    <button className="btn" onClick={onClose}>
                        {t("boxupdate.close")}
                    </button>
                    {notes !== (image.notes ?? "") && (
                        <button
                            className="btn primary"
                            onClick={async () => {
                                await notify(
                                    await result(() => tc.cfwEditFirmware(image, { notes })),
                                    t("common.saved"),
                                );
                                onClose();
                            }}
                        >
                            {t("common.save")}
                        </button>
                    )}
                </>
            }
        >
            <Section>
                <Row title={t("boxupdate.platform")} value={platformName(image)} />
                {!image.original && (
                    <Row title={t("boxupdate.buildDate")} value={formatBuild(image.build)} />
                )}
                {image.revision && (
                    <Row title="Revision" value={<span className="mono">{image.revision}</span>} />
                )}
                <Row
                    title={t("boxupdate.source")}
                    value={
                        image.source === "github"
                            ? `GitHub ${image.githubTag}`
                            : t("boxupdate.uploaded")
                    }
                />
                <Row title={t("boxupdate.added")} value={dateTime(image.added * 1000)} />
                {image.original && (
                    <Row
                        title={t("boxupdate.patches")}
                        value={image.patches || t("boxupdate.unpatched")}
                    />
                )}
                {!!image.page && (
                    <Row
                        title={t("boxupdate.setupPage")}
                        value={`${image.pageLabel}${image.pageRequires ? " · " + t("boxupdate.requires", { v: image.pageRequires }) : ""}`}
                    />
                )}
            </Section>
            {!image.original && (
                <div className="choice-group">
                    <div className="choice-label">{t("boxupdate.updateChannel")}</div>
                    <Segmented
                        value={image.channel}
                        onChange={async (channel) =>
                            notify(
                                await result(() => tc.cfwEditFirmware(image, { channel })),
                                t("common.saved"),
                            )
                        }
                        options={CHANNELS.map((c) => ({
                            value: c,
                            label: t(`boxupdate.channel_${c}` as never),
                        }))}
                    />
                </div>
            )}
            <div className="field">
                <label>{t("boxupdate.notes")}</label>
                <textarea
                    className="textarea"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>
            {!image.original && (
                <>
                    <button className="btn soft block" onClick={() => pageInput.current?.click()}>
                        <FileText size={17} />
                        {t("boxupdate.uploadSetupPage")}
                    </button>
                    <input
                        ref={pageInput}
                        type="file"
                        accept=".htm,.html"
                        className="hidden-input"
                        onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f)
                                await notify(
                                    await result(() => tc.cfwUploadPage(f, image)),
                                    t("boxupdate.setupPageUploaded"),
                                );
                        }}
                    />
                </>
            )}
        </Sheet>
    );
}

function UploadSheet({
    open,
    onClose,
    notify,
}: {
    open: boolean;
    onClose: () => void;
    notify: (r: CfwResult, ok: string) => Promise<void>;
}) {
    const [channel, setChannel] = useState<CfwChannel>("beta");
    const [file, setFile] = useState<File | null>(null);
    const [patch, setPatch] = useState({ hostname: "", hostnameOld: "", port: "" });
    const [progress, setProgress] = useState<number | null>(null);
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (open) {
            setFile(null);
            setProgress(null);
        }
    }, [open]);

    const send = async () => {
        if (!file) return;
        setProgress(0);
        const r = await result(() =>
            tc.cfwUpload(
                file,
                channel,
                {
                    hostname: patch.hostname || undefined,
                    hostnameOld: patch.hostnameOld || undefined,
                    port: Number(patch.port) || undefined,
                },
                setProgress,
            ),
        );
        setProgress(null);
        await notify(r, t("boxupdate.imageUploadedFw"));
        if (r.ok) onClose();
    };

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={t("boxupdate.uploadFirmware")}
            footer={
                progress !== null ? (
                    <div style={{ flex: 1 }}>
                        <div className="progressbar">
                            <div style={{ width: `${Math.round(progress * 100)}%` }} />
                        </div>
                    </div>
                ) : (
                    <>
                        <button className="btn" onClick={onClose}>
                            {t("common.cancel")}
                        </button>
                        <button className="btn primary" disabled={!file} onClick={send}>
                            <UploadCloud size={17} />
                            {t("common.upload")}
                        </button>
                    </>
                )
            }
        >
            <p className="small muted" style={{ margin: "0 2px 14px" }}>
                {t("boxupdate.uploadFirmwareHint")}
            </p>
            <div className="list" style={{ marginBottom: 16 }}>
                <Row
                    icon={<Cpu size={17} />}
                    title={file ? file.name : t("common.chooseFile")}
                    sub={
                        file
                            ? `${Math.round(file.size / 1024)} KB`
                            : t("boxupdate.firmwareFileTypes")
                    }
                    onClick={() => input.current?.click()}
                    chevron
                />
            </div>
            <input
                ref={input}
                type="file"
                accept=".bin,.zip,.htm,.html"
                className="hidden-input"
                onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                }}
            />
            <div className="choice-group">
                <div className="choice-label">{t("boxupdate.updateChannel")}</div>
                <Segmented
                    value={channel}
                    onChange={setChannel}
                    options={CHANNELS.map((c) => ({
                        value: c,
                        label: t(`boxupdate.channel_${c}` as never),
                    }))}
                />
            </div>
            <details>
                <summary
                    className="small muted"
                    style={{ padding: "6px 2px 12px", cursor: "pointer" }}
                >
                    {t("boxupdate.esp32Patch")}
                </summary>
                <p className="small muted" style={{ marginTop: 0 }}>
                    {t("boxupdate.esp32PatchHint")}
                </p>
                <div className="field">
                    <label>{t("boxupdate.patchHost")}</label>
                    <input
                        className="input mono"
                        maxLength={64}
                        value={patch.hostname}
                        onChange={(e) => setPatch({ ...patch, hostname: e.target.value.trim() })}
                    />
                </div>
                <div className="field">
                    <label>{t("boxupdate.patchHostOld")}</label>
                    <input
                        className="input mono"
                        maxLength={64}
                        value={patch.hostnameOld}
                        disabled={!patch.hostname}
                        onChange={(e) => setPatch({ ...patch, hostnameOld: e.target.value.trim() })}
                    />
                </div>
                <div className="field">
                    <label>{t("boxupdate.patchPort")}</label>
                    <input
                        className="input mono"
                        inputMode="numeric"
                        value={patch.port}
                        onChange={(e) =>
                            setPatch({ ...patch, port: e.target.value.replace(/\D/g, "") })
                        }
                    />
                </div>
            </details>
        </Sheet>
    );
}

function GithubSection({
    github,
    notify,
}: {
    github: {
        repo: string;
        autoDownload: number;
        lastCheck: number;
        message: string;
        releases: import("../../api/types").CfwGithubRelease[];
    };
    notify: (r: CfwResult, ok: string) => Promise<void>;
}) {
    const [repo, setRepo] = useState(github.repo);
    const [busy, setBusy] = useState(false);
    useEffect(() => setRepo(github.repo), [github.repo]);
    const interval = useQuery({
        queryKey: ["cfwGithubInterval"],
        queryFn: () => tc.getSetting("cfw.firmware.github_interval").then(Number),
    });
    const [hours, setHours] = useState("");
    useEffect(() => setHours(interval.data ? String(interval.data) : ""), [interval.data]);
    const hoursValid = /^\d+$/.test(hours) && Number(hours) >= 1 && Number(hours) <= 720;
    const run = async (fn: () => Promise<CfwResult>, ok: string) => {
        setBusy(true);
        try {
            await notify(await result(fn), ok);
        } finally {
            setBusy(false);
        }
    };
    const set = (name: string, value: string | number) =>
        run(async () => {
            await tc.setSetting(name, value);
            return { ok: true, message: "" };
        }, t("common.saved"));

    return (
        <Section
            title="GitHub"
            plain
            footer={
                github.lastCheck
                    ? t("boxupdate.lastChecked", { when: ago(github.lastCheck * 1000) }) +
                      (github.message ? ` · ${github.message}` : "")
                    : undefined
            }
        >
            <div className="list">
                <div className="row-wrap">
                    <Row icon={<GitBranch size={17} />} title={t("boxupdate.githubRepo")} />
                    <div style={{ padding: "0 16px 12px" }} className="row-gap">
                        <input
                            className="input mono"
                            placeholder="owner/repository"
                            value={repo}
                            onChange={(e) => setRepo(e.target.value)}
                        />
                        <button
                            className="btn small"
                            disabled={repo.trim() === github.repo}
                            onClick={() => set("cfw.firmware.github_repo", repo.trim())}
                        >
                            {t("common.save")}
                        </button>
                    </div>
                </div>
                <div className="row-wrap">
                    <Row icon={<CloudDownload size={17} />} title={t("boxupdate.githubAuto")} />
                    <div style={{ padding: "0 16px 12px" }}>
                        <select
                            className="select"
                            value={github.autoDownload}
                            onChange={(e) =>
                                set("cfw.firmware.github_download", Number(e.target.value))
                            }
                        >
                            {[0, 1, 2, 3].map((v) => (
                                <option key={v} value={v}>
                                    {t(`boxupdate.githubAuto${v}` as never)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                {github.autoDownload > 0 && (
                    <div className="row-wrap">
                        <Row
                            icon={<RefreshCw size={17} />}
                            title={t("boxupdate.githubInterval")}
                            sub={t("boxupdate.githubIntervalHint")}
                        />
                        <div style={{ padding: "0 16px 12px" }} className="row-gap">
                            <input
                                className="input"
                                inputMode="numeric"
                                value={hours}
                                onChange={(e) => setHours(e.target.value.trim())}
                                style={{ maxWidth: 120 }}
                                aria-label={t("boxupdate.githubInterval")}
                            />
                            <span className="muted">h</span>
                            <button
                                className="btn small"
                                disabled={!hoursValid || Number(hours) === interval.data}
                                onClick={async () => {
                                    await set("cfw.firmware.github_interval", Number(hours));
                                    interval.refetch();
                                }}
                            >
                                {t("common.save")}
                            </button>
                        </div>
                    </div>
                )}
                <Row
                    icon={<RefreshCw size={17} />}
                    title={t("boxupdate.githubCheck")}
                    onClick={
                        github.repo && !busy
                            ? () => run(tc.cfwCheckGithub, t("boxupdate.githubChecked"))
                            : undefined
                    }
                    disabled={!github.repo || busy}
                    chevron={false}
                />
            </div>
            {github.releases.length > 0 && (
                <div className="list mt">
                    {github.releases.slice(0, 2).map((r) => (
                        <Row
                            key={r.tag}
                            title={
                                <>
                                    {r.tag} <ChannelBadge c={r.channel} />
                                </>
                            }
                            sub={[
                                r.name !== r.tag ? r.name : "",
                                r.published ? dateTime(Date.parse(r.published)) : "",
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                            right={
                                r.downloaded ? (
                                    <span className="badge ok">{t("boxupdate.inLibrary")}</span>
                                ) : (
                                    <button
                                        className="btn small soft"
                                        disabled={!r.hasImage || busy}
                                        onClick={() =>
                                            run(
                                                () => tc.cfwDownloadGithub(r.tag),
                                                t("boxupdate.downloadedFw"),
                                            )
                                        }
                                    >
                                        {r.hasImage ? t("common.download") : t("boxupdate.noImage")}
                                    </button>
                                )
                            }
                        />
                    ))}
                    {github.releases.length > 2 && (
                        <Row
                            icon={<ExternalLink size={17} />}
                            title={t("boxupdate.githubOlder", { n: github.releases.length - 2 })}
                            onClick={() =>
                                window.open(
                                    `https://github.com/${github.repo}/releases`,
                                    "_blank",
                                    "noopener",
                                )
                            }
                            chevron={false}
                        />
                    )}
                </div>
            )}
            {!github.repo && (
                <div className="mt">
                    <Notice info>{t("boxupdate.githubHint")}</Notice>
                </div>
            )}
        </Section>
    );
}
