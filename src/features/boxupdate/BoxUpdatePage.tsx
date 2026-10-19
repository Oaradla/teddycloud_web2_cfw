import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CloudDownload, Cpu, FileText, GitBranch, RefreshCw, Send, Trash2, UploadCloud } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { tc } from "../../api/tc";
import type { CfwBox, CfwChannel, CfwImage, CfwResult } from "../../api/types";
import { ago, dateTime } from "../../lib/format";
import { t } from "../../lib/i18n";
import { keys, useBoxes, useBoxImage, useCfwBoxes } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { Empty, ErrorBox, Loading, Notice, Page, Row, Section, Segmented, useUi } from "../../ui/kit";
import { cfwMessage } from "./cfwMessages";
import { InstallGuide } from "./InstallGuide";

const CHANNELS: CfwChannel[] = ["release", "beta", "alpha"];
const CHANNEL_NUMBER: Record<CfwChannel, number> = { none: 0, release: 1, beta: 2, alpha: 3 };
const CHANNEL_CLASS: Record<CfwChannel, string> = { none: "", release: "ok", beta: "accent", alpha: "warn" };

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
    image.original ? image.version : `${image.version || formatBuild(image.build)}${image.version ? " · " + formatBuild(image.build) : ""}`;

/** the images a box can take: its own platform; the original ESP32 firmware only for the return from the CFW */
const imagesForBox = (images: CfwImage[], box: CfwBox) =>
    images.filter((i) => platformOf(i) === platformOf(box) && (!i.original || box.isCfw));

/** an ESP32 box with the original firmware takes its assigned image once, through its own update check */
const esp32Installs = (box: CfwBox) =>
    !box.isCfw && platformOf(box) === "esp32" && box.update.target !== 0 && box.esp32Delivered !== box.update.target;

const ChannelBadge = ({ c }: { c: CfwChannel }) => <span className={`badge ${CHANNEL_CLASS[c]}`}>{t(`channel_${c}` as never)}</span>;

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
    const boxes = useCfwBoxes();
    const firmware = useQuery({ queryKey: ["cfwFirmware"], queryFn: tc.cfwFirmware, refetchInterval: 20_000 });
    const [image, setImage] = useState<CfwImage | null>(null);
    const [upload, setUpload] = useState(false);

    const refresh = async () => {
        await Promise.all([qc.invalidateQueries({ queryKey: keys.cfwBoxes }), qc.invalidateQueries({ queryKey: ["cfwFirmware"] })]);
    };
    const notify = async (r: CfwResult, ok: string) => {
        if (r.ok) ui.toast("ok", ok, r.message && r.message !== "OK" ? cfwMessage(r.message) : undefined);
        else ui.toast("error", t("actionFailed"), cfwMessage(r.message));
        await refresh();
    };

    if (boxes.data === null) return <SupportOff />;

    const images = firmware.data?.images ?? [];
    // the guide is for the first box; once one runs the custom firmware it moves down, closed
    const anyCfw = (boxes.data ?? []).some((b) => b.isCfw);
    const sorted = [...images].sort((a, b) => b.build - a.build);

    return (
        <Page
            title={t("boxUpdate")}
            subtitle={t("boxUpdateHint")}
            back="/more"
            narrow
            right={
                <button className="icon-btn" onClick={refresh} aria-label={t("refresh")}>
                    <RefreshCw size={20} />
                </button>
            }
        >
            {(boxes.isLoading || firmware.isLoading) && <Loading />}
            {firmware.error && <ErrorBox error={firmware.error} retry={() => firmware.refetch()} />}

            {boxes.data && !anyCfw && <InstallGuide open />}

            {boxes.data && (
                <Section title={t("boxes")} plain footer={t("boxUpdateBoxesHint")}>
                    {boxes.data.length === 0 && <Empty icon={<Cpu size={28} />} title={t("noBoxes")} />}
                    <div style={{ display: "grid", gap: 12 }}>
                        {boxes.data.map((box) => (
                            <BoxCard key={box.id} box={box} images={images} notify={notify} />
                        ))}
                    </div>
                </Section>
            )}

            {firmware.data && (
                <Section
                    title={t("firmwareLibrary")}
                    right={
                        <button className="btn ghost small" onClick={() => setUpload(true)}>
                            <UploadCloud size={16} />
                            {t("upload")}
                        </button>
                    }
                    footer={firmware.data.defaultPage ? t("defaultPage", { v: firmware.data.defaultPage.label }) : undefined}
                >
                    {sorted.length === 0 && <Row title={t("noImages")} sub={t("noImagesHint")} />}
                    {sorted.map((i) => (
                        <Row
                            key={`${platformOf(i)}-${i.build}`}
                            icon={<Cpu size={17} />}
                            title={
                                <>
                                    {i.version || formatBuild(i.build)} <span className="badge">{platformName(i)}</span>{" "}
                                    {i.original ? <span className="badge warn">{t("originalFirmware")}</span> : <ChannelBadge c={i.channel} />}
                                </>
                            }
                            sub={[i.original ? "" : formatBuild(i.build), i.source === "github" ? `GitHub ${i.githubTag}` : t("uploaded"), i.pageLabel ? t("setupPageV", { v: i.pageLabel }) : "", i.notes]
                                .filter(Boolean)
                                .join(" · ")}
                            onClick={() => setImage(i)}
                        />
                    ))}
                </Section>
            )}

            {firmware.data && <GithubSection github={firmware.data.github} notify={notify} />}

            {anyCfw && <InstallGuide open={false} />}

            <ImageSheet image={image} onClose={() => setImage(null)} notify={notify} />
            <UploadSheet open={upload} onClose={() => setUpload(false)} notify={notify} />
        </Page>
    );
}

/** CFW support off (or not on this server): switch it on, and the guide */
function SupportOff() {
    const qc = useQueryClient();
    const ui = useUi();
    const enabled = useQuery({ queryKey: ["cfwEnabled"], queryFn: tc.cfwEnabled });
    if (enabled.isLoading) return <Loading />;
    if (enabled.data !== "false")
        return (
            <Page title={t("boxUpdate")} back="/more" narrow>
                <Empty icon={<Cpu size={28} />} title={t("noCfwSupport")} text={t("noCfwSupportText")} />
            </Page>
        );
    return (
        <Page title={t("boxUpdate")} subtitle={t("boxUpdateHint")} back="/more" narrow>
            <Notice info>
                {t("cfwSupportOff")}
                <div style={{ marginTop: 10 }}>
                    <button
                        className="btn primary small"
                        onClick={async () => {
                            const ok = await ui.run(async () => {
                                await tc.setSetting("cfw.enabled", true);
                                return true;
                            }, t("saved"));
                            if (ok) await Promise.all([qc.invalidateQueries({ queryKey: keys.cfwBoxes }), qc.invalidateQueries({ queryKey: ["cfwEnabled"] })]);
                        }}
                    >
                        {t("cfwSupportEnable")}
                    </button>
                </div>
            </Notice>
            <InstallGuide open />
        </Page>
    );
}

function BoxCard({ box, images, notify }: { box: CfwBox; images: CfwImage[]; notify: (r: CfwResult, ok: string) => Promise<void> }) {
    const ui = useUi();
    const boxes = useBoxes();
    const img = useBoxImage(boxes.data?.find((b) => b.ID.toLowerCase() === box.id.toLowerCase()));
    const running = images.find((i) => i.build === box.version && platformOf(i) === platformOf(box));
    const offered = images.find((i) => i.build === box.update.next && platformOf(i) === platformOf(box));
    const choices = imagesForBox(images, box);
    const setSetting = async (name: string, value: number) => {
        await notify(
            await result(async () => {
                await tc.setSetting(name, value, box.id);
                return { ok: true, message: "" };
            }),
            t("saved"),
        );
    };

    let next: ReactNode;
    if (!box.update.enabled || !box.settings.enabled) next = <span className="muted">{t("updateOff")}</span>;
    else if (esp32Installs(box)) next = <span className="badge warn">{t("esp32Install")}</span>;
    else if (!box.update.next) next = <span className="muted">{t("upToDate")}</span>;
    else
        next = (
            <span className="row-gap" style={{ flexWrap: "wrap" }}>
                <span className="badge warn">
                    {offered?.original ? t("esp32Return") : `${offered?.version ? offered.version + " · " : ""}${formatBuild(box.update.next)}`}
                </span>
                <button
                    className="btn small soft"
                    disabled={!box.helloValid}
                    title={t("deliverNowHint")}
                    onClick={async () => notify(await result(() => tc.cfwCheckNow(box.id)), t("checkingNow"))}
                >
                    <Send size={14} />
                    {t("deliverNow")}
                </button>
            </span>
        );

    return (
        <div className="card" style={{ padding: 16 }}>
            <div className="row-gap" style={{ alignItems: "center", gap: 12 }}>
                {img ? <img src={img} alt="" style={{ width: 46, height: 46, objectFit: "contain", flexShrink: 0 }} /> : null}
                <div className="grow">
                    <div style={{ fontWeight: 700, fontSize: 17 }}>{box.boxName || box.commonName}</div>
                    <div className="row-gap small muted" style={{ flexWrap: "wrap", marginTop: 4 }}>
                        <span className="badge">{platformName(box)}</span>
                        {box.isCfw ? (
                            <span className={`badge ${box.helloValid ? "ok" : ""}`}>{box.helloValid ? t("connected") : t("notConnected")}</span>
                        ) : (
                            <span className="badge">{t("originalFirmware")}</span>
                        )}
                        {box.updateResult === 1 && <span className="badge ok">{t("updateConfirmed")}</span>}
                    </div>
                </div>
            </div>
            <div className="list" style={{ marginTop: 12, boxShadow: "none", background: "var(--bg-sunken)" }}>
                <Row
                    title={t("runningFirmware")}
                    value={box.isCfw ? `${running?.version ? running.version + " · " : ""}${formatBuild(box.version)}` : box.version ? formatBuild(box.version) : "–"}
                />
                {!!box.rolledBackBuild && (
                    <Row icon={<AlertTriangle size={17} />} iconColor="var(--warn)" title={t("rolledBack")} value={formatBuild(box.rolledBackBuild)} />
                )}
                <Row title={t("nextUpdate")} right={next} />
            </div>

            <div className="choice-group" style={{ marginTop: 14 }}>
                <div className="choice-label">{t("delivery")}</div>
                <Segmented
                    value={box.update.mode}
                    onChange={(m) => setSetting("cfw.update.mode", m === "automatic" ? 1 : 0)}
                    options={[
                        { value: "manual", label: t("deliveryManual") },
                        { value: "automatic", label: t("deliveryAutomatic") },
                    ]}
                />
            </div>
            {box.update.mode === "automatic" ? (
                <div className="choice-group">
                    <div className="choice-label">{t("updateChannel")}</div>
                    <Segmented
                        value={box.update.channel}
                        onChange={(c) => setSetting("cfw.update.channel", CHANNEL_NUMBER[c])}
                        options={(["none", ...CHANNELS] as CfwChannel[]).map((c) => ({ value: c, label: t(`channel_${c}` as never) }))}
                    />
                </div>
            ) : (
                <div className="choice-group">
                    <div className="choice-label">{t("assignedImage")}</div>
                    <select
                        className="select"
                        value={box.update.target || 0}
                        onChange={async (e) => {
                            const build = Number(e.target.value);
                            if (build && platformOf(box) === "esp32" && !box.isCfw) {
                                const ok = await ui.confirm({ title: t("esp32InstallTitle"), text: t("esp32InstallText"), confirm: t("assign") });
                                if (!ok) return;
                            }
                            await notify(await result(() => tc.cfwDeliver(box.id, build)), build ? t("assigned") : t("unassigned"));
                        }}
                    >
                        <option value={0}>{t("noAssignment")}</option>
                        {choices.map((i) => (
                            <option key={i.build} value={i.build} disabled={i.build === box.version}>
                                {imageLabel(i)} ({i.original ? t("originalFirmware") : t(`channel_${i.channel}` as never)})
                            </option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    );
}

function ImageSheet({ image, onClose, notify }: { image: CfwImage | null; onClose: () => void; notify: (r: CfwResult, ok: string) => Promise<void> }) {
    const ui = useUi();
    const [notes, setNotes] = useState("");
    const pageInput = useRef<HTMLInputElement>(null);
    useEffect(() => setNotes(image?.notes ?? ""), [image]);
    if (!image) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

    const remove = async () => {
        const ok = await ui.confirm({ title: t("deleteImage"), text: t("deleteImageText", { v: imageLabel(image) }), confirm: t("delete"), danger: true });
        if (!ok) return;
        await notify(await result(() => tc.cfwDeleteFirmware(image)), t("deleted"));
        onClose();
    };

    return (
        <Sheet
            open={!!image}
            onClose={onClose}
            title={image.version || formatBuild(image.build)}
            footer={
                <>
                    <button className="btn danger" style={{ flex: "0 0 auto" }} onClick={remove} aria-label={t("delete")}>
                        <Trash2 size={18} />
                    </button>
                    <button className="btn" onClick={onClose}>
                        {t("close")}
                    </button>
                    {notes !== (image.notes ?? "") && (
                        <button
                            className="btn primary"
                            onClick={async () => {
                                await notify(await result(() => tc.cfwEditFirmware(image, { notes })), t("saved"));
                                onClose();
                            }}
                        >
                            {t("save")}
                        </button>
                    )}
                </>
            }
        >
            <Section>
                <Row title={t("platform")} value={platformName(image)} />
                {!image.original && <Row title={t("buildDate")} value={formatBuild(image.build)} />}
                {image.revision && <Row title="Revision" value={<span className="mono">{image.revision}</span>} />}
                <Row title={t("source")} value={image.source === "github" ? `GitHub ${image.githubTag}` : t("uploaded")} />
                <Row title={t("added")} value={dateTime(image.added * 1000)} />
                {image.original && <Row title={t("patches")} value={image.patches || t("unpatched")} />}
                {!!image.page && (
                    <Row
                        title={t("setupPage")}
                        value={`${image.pageLabel}${image.pageRequires ? " · " + t("requires", { v: image.pageRequires }) : ""}`}
                    />
                )}
            </Section>
            {!image.original && (
                <div className="choice-group">
                    <div className="choice-label">{t("updateChannel")}</div>
                    <Segmented
                        value={image.channel}
                        onChange={async (channel) => notify(await result(() => tc.cfwEditFirmware(image, { channel })), t("saved"))}
                        options={CHANNELS.map((c) => ({ value: c, label: t(`channel_${c}` as never) }))}
                    />
                </div>
            )}
            <div className="field">
                <label>{t("notes")}</label>
                <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {!image.original && (
                <>
                    <button className="btn soft block" onClick={() => pageInput.current?.click()}>
                        <FileText size={17} />
                        {t("uploadSetupPage")}
                    </button>
                    <input
                        ref={pageInput}
                        type="file"
                        accept=".htm,.html"
                        className="hidden-input"
                        onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) await notify(await result(() => tc.cfwUploadPage(f, image)), t("setupPageUploaded"));
                        }}
                    />
                </>
            )}
        </Sheet>
    );
}

function UploadSheet({ open, onClose, notify }: { open: boolean; onClose: () => void; notify: (r: CfwResult, ok: string) => Promise<void> }) {
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
            tc.cfwUpload(file, channel, { hostname: patch.hostname || undefined, hostnameOld: patch.hostnameOld || undefined, port: Number(patch.port) || undefined }, setProgress),
        );
        setProgress(null);
        await notify(r, t("imageUploadedFw"));
        if (r.ok) onClose();
    };

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={t("uploadFirmware")}
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
                            {t("cancel")}
                        </button>
                        <button className="btn primary" disabled={!file} onClick={send}>
                            <UploadCloud size={17} />
                            {t("upload")}
                        </button>
                    </>
                )
            }
        >
            <p className="small muted" style={{ margin: "0 2px 14px" }}>
                {t("uploadFirmwareHint")}
            </p>
            <div className="list" style={{ marginBottom: 16 }}>
                <Row
                    icon={<Cpu size={17} />}
                    title={file ? file.name : t("chooseFile")}
                    sub={file ? `${Math.round(file.size / 1024)} KB` : t("firmwareFileTypes")}
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
                <div className="choice-label">{t("updateChannel")}</div>
                <Segmented value={channel} onChange={setChannel} options={CHANNELS.map((c) => ({ value: c, label: t(`channel_${c}` as never) }))} />
            </div>
            <details>
                <summary className="small muted" style={{ padding: "6px 2px 12px", cursor: "pointer" }}>
                    {t("esp32Patch")}
                </summary>
                <p className="small muted" style={{ marginTop: 0 }}>
                    {t("esp32PatchHint")}
                </p>
                <div className="field">
                    <label>{t("patchHost")}</label>
                    <input className="input mono" maxLength={64} value={patch.hostname} onChange={(e) => setPatch({ ...patch, hostname: e.target.value.trim() })} />
                </div>
                <div className="field">
                    <label>{t("patchHostOld")}</label>
                    <input className="input mono" maxLength={64} value={patch.hostnameOld} disabled={!patch.hostname} onChange={(e) => setPatch({ ...patch, hostnameOld: e.target.value.trim() })} />
                </div>
                <div className="field">
                    <label>{t("patchPort")}</label>
                    <input className="input mono" inputMode="numeric" value={patch.port} onChange={(e) => setPatch({ ...patch, port: e.target.value.replace(/\D/g, "") })} />
                </div>
            </details>
        </Sheet>
    );
}

function GithubSection({ github, notify }: { github: { repo: string; autoDownload: number; lastCheck: number; message: string; releases: import("../../api/types").CfwGithubRelease[] }; notify: (r: CfwResult, ok: string) => Promise<void> }) {
    const [repo, setRepo] = useState(github.repo);
    const [busy, setBusy] = useState(false);
    useEffect(() => setRepo(github.repo), [github.repo]);
    const interval = useQuery({ queryKey: ["cfwGithubInterval"], queryFn: () => tc.getSetting("cfw.firmware.github_interval").then(Number) });
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
        }, t("saved"));

    return (
        <Section title="GitHub" plain footer={github.lastCheck ? t("lastChecked", { when: ago(github.lastCheck * 1000) }) + (github.message ? ` · ${github.message}` : "") : undefined}>
            <div className="list">
                <div className="row-wrap">
                    <Row icon={<GitBranch size={17} />} title={t("githubRepo")} />
                    <div style={{ padding: "0 16px 12px" }} className="row-gap">
                        <input className="input mono" placeholder="owner/repository" value={repo} onChange={(e) => setRepo(e.target.value)} />
                        <button className="btn small" disabled={repo.trim() === github.repo} onClick={() => set("cfw.firmware.github_repo", repo.trim())}>
                            {t("save")}
                        </button>
                    </div>
                </div>
                <div className="row-wrap">
                    <Row icon={<CloudDownload size={17} />} title={t("githubAuto")} />
                    <div style={{ padding: "0 16px 12px" }}>
                        <select className="select" value={github.autoDownload} onChange={(e) => set("cfw.firmware.github_download", Number(e.target.value))}>
                            {[0, 1, 2, 3].map((v) => (
                                <option key={v} value={v}>
                                    {t(`githubAuto${v}` as never)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                {github.autoDownload > 0 && (
                    <div className="row-wrap">
                        <Row icon={<RefreshCw size={17} />} title={t("githubInterval")} sub={t("githubIntervalHint")} />
                        <div style={{ padding: "0 16px 12px" }} className="row-gap">
                            <input className="input" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.trim())} style={{ maxWidth: 120 }} aria-label={t("githubInterval")} />
                            <span className="muted">h</span>
                            <button
                                className="btn small"
                                disabled={!hoursValid || Number(hours) === interval.data}
                                onClick={async () => {
                                    await set("cfw.firmware.github_interval", Number(hours));
                                    interval.refetch();
                                }}
                            >
                                {t("save")}
                            </button>
                        </div>
                    </div>
                )}
                <Row icon={<RefreshCw size={17} />} title={t("githubCheck")} onClick={github.repo && !busy ? () => run(tc.cfwCheckGithub, t("githubChecked")) : undefined} disabled={!github.repo || busy} chevron={false} />
            </div>
            {github.releases.length > 0 && (
                <div className="list mt">
                    {github.releases.map((r) => (
                        <Row
                            key={r.tag}
                            title={
                                <>
                                    {r.tag} <ChannelBadge c={r.channel} />
                                </>
                            }
                            sub={[r.name !== r.tag ? r.name : "", r.published ? dateTime(Date.parse(r.published)) : ""].filter(Boolean).join(" · ")}
                            right={
                                r.downloaded ? (
                                    <span className="badge ok">{t("inLibrary")}</span>
                                ) : (
                                    <button className="btn small soft" disabled={!r.hasImage || busy} onClick={() => run(() => tc.cfwDownloadGithub(r.tag), t("downloadedFw"))}>
                                        {r.hasImage ? t("download") : t("noImage")}
                                    </button>
                                )
                            }
                        />
                    ))}
                </div>
            )}
            {!github.repo && (
                <div className="mt">
                    <Notice info>{t("githubHint")}</Notice>
                </div>
            )}
        </Section>
    );
}
