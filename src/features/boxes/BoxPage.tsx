import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    BatteryMedium,
    Cpu,
    Disc3,
    ExternalLink,
    FileKey,
    Lock,
    Ear,
    Hand,
    Headphones,
    Info,
    Lightbulb,
    MoveDiagonal,
    Pencil,
    Play,
    PlugZap,
    Radio,
    RefreshCw,
    Settings2,
    Share2,
    SlidersHorizontal,
    Speaker,
    Trash2,
    Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { tc } from "../../api/tc";
import type { SettingOption } from "../../api/types";
import {
    ago,
    contentTitle,
    dateTime,
    figureSubtitle,
    figureTitle,
    linkedContent,
} from "../../lib/format";
import { useAccess } from "../../lib/access";
import { t } from "../../lib/i18n";
import { canPlayTag, tagPlayItem } from "../../lib/play";
import {
    keys,
    useAllTags,
    useBoxes,
    useBoxImage,
    useBoxModels,
    useBoxState,
    useTagsPlaced,
    useCfwBox,
    useSetting,
    useSettings,
} from "../../lib/queries";
import { BoxModelSheet } from "./BoxModelSheet";
import { usePlayer } from "../../player/Player";
import { ErrorBox, Loading, Page, Row, Section, SwitchRow, useUi } from "../../ui/kit";
import { certStatusText } from "../tools/CertificatesPage";
import { FigurePic } from "../../ui/FigurePic";
import { TonieImage } from "../../ui/TonieImage";
import { SettingRow } from "../settings/SettingControls";
import { cfwSettingsFor } from "../settings/visibility";
import { batteryInfo, remoteAvailable } from "./BoxesPage";
import { RemoteControl } from "./RemoteControl";
import { ShareSheet, useCanShare } from "../users/ShareSheet";

export function BoxPage() {
    const { id = "" } = useParams();
    const [search] = useSearchParams();
    const focus = search.get("focus");
    const boxes = useBoxes();
    const box = boxes.data?.find((b) => b.ID === id);
    const state = useBoxState(id);
    const cfw = useCfwBox(id);
    const img = useBoxImage(box);
    const models = useBoxModels();
    const [modelOpen, setModelOpen] = useState(false);
    const [sharing, setSharing] = useState(false);
    const canShare = useCanShare();
    const access = useAccess();
    const tags = useAllTags();
    const settings = useSettings(id);
    const cfwEnabled = useSetting("cfw.enabled", id);
    const cfwForced = useSetting("cfw.force_box_settings", id);
    const boxGeneration = useSetting("toniebox.boxGeneration", id);
    const apiAccess = useSetting("toniebox.api_access", id);
    const certStatus = useSetting("internal.boxCertStatus", id);
    const checkHackiebox = useSetting("frontend.check_cc3200_cfw");
    const boxIC = useSetting("internal.toniebox_firmware.boxIC", id);
    const ip = state.data?.ip;
    // the custom firmware of the hackiebox project answers on the box itself; boxIC 1 is a CC3200
    const hackiebox = useQuery({
        queryKey: ["hackiebox", ip],
        queryFn: () => fetch(`http://${ip}/api/ajax?cmd=box-battery&sub=stats`).then((r) => r.ok),
        enabled: checkHackiebox.data === "true" && boxIC.data === "1" && Boolean(ip),
        retry: false,
    });
    const navigate = useNavigate();
    const tagsPlaced = useTagsPlaced();
    const player = usePlayer();
    const ui = useUi();
    const qc = useQueryClient();
    const settingsRef = useRef<HTMLDivElement>(null);
    const remoteRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el =
            focus === "settings"
                ? settingsRef.current
                : focus === "remote"
                  ? remoteRef.current
                  : null;
        if (el && settings.data)
            window.setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    }, [focus, settings.data]);

    if (boxes.isLoading)
        return (
            <Page title={t("common.box")} back="/">
                <Loading />
            </Page>
        );
    if (!box)
        return (
            <Page title={t("common.box")} back="/">
                <ErrorBox error={boxes.error ?? t("boxes.boxNotFound")} />
            </Page>
        );

    const s = state.data;
    const online = Boolean(s?.online || cfw?.online);
    const tag = s?.lastRuid ? tags.data?.find((x) => x.ruid === s.lastRuid) : undefined;
    const battery = batteryInfo(cfw);
    const opts = new Map<string, SettingOption>((settings.data ?? []).map((o) => [o.ID, o]));
    const opt = (k: string) => opts.get(k);
    const useCfwSettings = cfwSettingsFor({
        enabled: cfwEnabled.data === "true",
        isCfwBox: Boolean(cfw?.isCfw),
        forced: cfwForced.data === "true",
    });
    const tb2 = boxGeneration.data === "2";
    const tagCount = tags.data?.filter(
        (x) => x.placedOn.includes(id) && x.type !== "system",
    ).length;

    const rename = async () => {
        const name = await ui.prompt({
            title: t("boxes.renameBox"),
            label: t("common.name"),
            value: box.boxName,
        });
        if (!name) return;
        await ui.run(async () => {
            await tc.renameBox(id, name);
            await qc.invalidateQueries({ queryKey: keys.boxes });
        }, t("common.saved"));
    };

    const row = (k: string, props: Omit<Parameters<typeof SettingRow>[0], "opt" | "overlay">) => {
        const o = opt(k);
        return o ? <SettingRow key={k} opt={o} overlay={id} {...props} /> : null;
    };

    return (
        <Page
            title={box.boxName || box.ID}
            back="/"
            compact
            right={
                <button className="icon-btn" onClick={rename} aria-label={t("boxes.renameBox")}>
                    <Pencil size={19} />
                </button>
            }
        >
            <div className="hero side">
                {img ? (
                    <img
                        className="hero-pic"
                        src={img}
                        alt=""
                        style={{ width: 150, height: 150 }}
                    />
                ) : (
                    <div className="tonie-pic-fallback" style={{ width: 120, height: 120 }}>
                        <Radio size={44} />
                    </div>
                )}
                <div>
                    <h1>{box.boxName || box.ID}</h1>
                    <p>
                        {online
                            ? t("boxes.onlineNow")
                            : s?.lastSeen
                              ? t("boxes.lastSeen", { when: ago(s.lastSeen) })
                              : t("boxes.offline")}
                    </p>
                    <div className="badges">
                        <span className={`badge ${online ? "ok" : ""}`}>
                            <span className={`dot ${online ? "ok" : ""}`} />
                            {online ? t("boxes.online") : t("boxes.offline")}
                        </span>
                        {battery && (
                            <span className={`badge ${battery.cls}`} title={battery.volts}>
                                {battery.icon}
                                {battery.text}
                            </span>
                        )}
                        {cfw?.isCfw && <span className="badge accent">CFW</span>}
                        {apiAccess.data === "false" && (
                            <span className="badge danger">
                                <Lock size={12} />
                                {t("boxes.apiAccessOff")}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {s?.lastRuid && (
                <Section title={online ? t("boxes.onTheBox") : t("boxes.lastTonie")}>
                    <Row
                        leading={
                            tag ? (
                                <div style={{ width: 56, height: 56, flexShrink: 0 }}>
                                    <FigurePic tag={tag} />
                                </div>
                            ) : (
                                <TonieImage size={56} />
                            )
                        }
                        title={tag ? figureTitle(tag) : s.lastRuid.toUpperCase()}
                        sub={[
                            tag
                                ? linkedContent(tag)
                                    ? "→ " + contentTitle(linkedContent(tag)!)
                                    : figureSubtitle(tag)
                                : "",
                            s.lastRuidTime ? ago(s.lastRuidTime) : "",
                        ]
                            .filter(Boolean)
                            .join(" · ")}
                        to={`/tonie/${s.lastRuid}?box=${id}`}
                        right={
                            tag && canPlayTag(tag) ? (
                                <button
                                    className="icon-btn"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        player.play(tagPlayItem(tag));
                                    }}
                                    aria-label={t("common.play")}
                                >
                                    <Play size={22} fill="currentColor" />
                                </button>
                            ) : undefined
                        }
                    />
                </Section>
            )}

            {remoteAvailable(cfw) && access.can("box", id, "box.cfw") && (
                <div ref={remoteRef} className="section" style={{ scrollMarginTop: 70 }}>
                    <div className="section-head">
                        <h2 className="section-title">{t("boxes.remote")}</h2>
                    </div>
                    <RemoteControl boxId={id} />
                </div>
            )}

            <div ref={settingsRef} style={{ scrollMarginTop: 70 }}>
                {settings.isLoading && <Loading />}
                {settings.data && (
                    <Section title={t("boxes.boxSettings")} footer={t("boxes.boxSettingsHint")}>
                        {useCfwSettings ? (
                            <>
                                {row("cfw.box.speaker_limit", {
                                    label: t("common.speakerLimit"),
                                    icon: <Speaker size={17} />,
                                })}
                                {row("cfw.box.headphone_limit", {
                                    label: t("common.headphoneLimit"),
                                    icon: <Headphones size={17} />,
                                })}
                            </>
                        ) : (
                            <>
                                {row("toniebox.max_vol_spk", {
                                    label: t("common.speakerLimit"),
                                    icon: <Speaker size={17} />,
                                })}
                                {row("toniebox.max_vol_hdp", {
                                    label: t("common.headphoneLimit"),
                                    icon: <Headphones size={17} />,
                                })}
                            </>
                        )}
                        {tb2
                            ? row("toniebox2.lightring_brightness", {
                                  label: t("boxes.ledBrightness"),
                                  icon: <Lightbulb size={17} />,
                                  format: (v) => `${v} %`,
                              })
                            : row("toniebox.led", {
                                  label: t("common.led"),
                                  icon: <Lightbulb size={17} />,
                                  labels: {
                                      0: t("common.ledOn"),
                                      1: t("common.ledOff"),
                                      2: t("common.ledDimmed"),
                                  },
                              })}
                        {useCfwSettings ? (
                            <>
                                {row("cfw.box.slap_lock", {
                                    label: t("common.slapLock"),
                                    sub: t("boxes.slapLockHint"),
                                    icon: <Hand size={17} />,
                                })}
                                {row("cfw.box.tilt_lock", {
                                    label: t("common.tiltLock"),
                                    sub: t("boxes.tiltLockHint"),
                                    icon: <MoveDiagonal size={17} />,
                                })}
                                {row("cfw.box.volume_lock", {
                                    label: t("common.volumeLock"),
                                    sub: t("boxes.volumeLockHint"),
                                    icon: <Volume2 size={17} />,
                                })}
                                {row("cfw.box.both_ears_off", {
                                    label: t("boxes.bothEarsOff"),
                                    sub: t("boxes.bothEarsOffHint"),
                                    icon: <Ear size={17} />,
                                })}
                                {row("cfw.box.idle_off_battery", {
                                    label: t("boxes.idleOffBattery"),
                                    sub: t("boxes.idleOffHint"),
                                    icon: <BatteryMedium size={17} />,
                                    format: (v) => `${v} ${t("common.minutesShort")}`,
                                })}
                                {row("cfw.box.idle_off_station", {
                                    label: t("boxes.idleOffStation"),
                                    sub: t("boxes.idleOffHint"),
                                    icon: <PlugZap size={17} />,
                                    format: (v) => `${v} ${t("common.minutesShort")}`,
                                })}
                            </>
                        ) : (
                            <>
                                {row("toniebox.slap_enabled", {
                                    label: t("boxes.slapToSkip"),
                                    icon: <Hand size={17} />,
                                })}
                                {row("toniebox.slap_back_left", {
                                    label: t("boxes.slapDirection"),
                                    sub: t("boxes.slapDirectionHint"),
                                    icon: <MoveDiagonal size={17} />,
                                })}
                            </>
                        )}
                        {tb2 &&
                            row("toniebox2.baby_mode", {
                                label: t("boxes.babyMode"),
                                icon: <Disc3 size={17} />,
                            })}
                    </Section>
                )}
                {settings.error && (
                    <ErrorBox error={settings.error} retry={() => settings.refetch()} />
                )}
            </div>

            <Section>
                {tagsPlaced && (
                    <Row
                        icon={<Disc3 size={17} />}
                        title={t("boxes.toniesOfBox")}
                        value={tagCount ?? ""}
                        to={`/tonies?box=${id}`}
                    />
                )}
                <Row
                    icon={<SlidersHorizontal size={17} />}
                    title={t("common.allBoxSettings")}
                    sub={t("boxes.allBoxSettingsHint")}
                    to={`/box/${id}/settings`}
                />
                {canShare("box", id) && (
                    <Row
                        icon={<Share2 size={17} />}
                        title={t("common.share")}
                        sub={t("common.shareHint")}
                        onClick={() => setSharing(true)}
                        chevron
                    />
                )}
                {cfw?.isCfw && access.can("box", id, "box.update") && (
                    <Row
                        icon={<RefreshCw size={17} />}
                        title={t("boxes.firmwareUpdate")}
                        to="/boxupdate"
                    />
                )}
            </Section>

            {access.admin && (
                <Section title={t("boxes.boxAdmin")}>
                    <SwitchRow
                        icon={<Lock size={17} />}
                        title={t("boxes.apiAccess")}
                        sub={t("boxes.apiAccessHint")}
                        checked={apiAccess.data !== "false"}
                        onChange={async (on) => {
                            await ui.run(
                                () => tc.setSetting("toniebox.api_access", on, id),
                                t("common.saved"),
                            );
                            apiAccess.refetch();
                        }}
                    />
                    <Row
                        icon={<FileKey size={17} />}
                        title={t("boxes.boxCertificates")}
                        value={
                            certStatus.data !== undefined
                                ? certStatusText(certStatus.data)
                                : undefined
                        }
                        to={`/system/certificates?box=${id}`}
                    />
                    <Row
                        icon={<Trash2 size={17} />}
                        title={t("boxes.removeBox")}
                        sub={t("boxes.removeBoxHint")}
                        danger
                        chevron={false}
                        onClick={async () => {
                            if (
                                !(await ui.confirm({
                                    title: t("boxes.removeBoxTitle", {
                                        name: box.boxName || box.ID,
                                    }),
                                    text: t("boxes.removeBoxHint"),
                                    confirm: t("common.remove"),
                                    danger: true,
                                }))
                            )
                                return;
                            if (
                                (await ui.run(() => tc.removeBox(id), t("boxes.boxRemoved"))) ===
                                undefined
                            )
                                return;
                            await qc.invalidateQueries({ queryKey: keys.boxes });
                            navigate("/");
                        }}
                    />
                </Section>
            )}

            <Section title={t("common.info")}>
                {battery && (
                    <Row
                        icon={battery.icon}
                        title={t("boxes.battery")}
                        value={
                            battery.percent !== undefined
                                ? `${battery.percent} % · ${battery.volts}`
                                : battery.station
                                  ? `${t("boxes.charging")} · ${battery.volts}`
                                  : battery.volts
                        }
                        sub={
                            battery.age
                                ? t("boxes.batteryAsOf", { when: battery.age })
                                : battery.station
                                  ? t("boxes.batteryCharging")
                                  : battery.remaining
                                    ? t("boxes.batteryRemaining", { time: battery.remaining })
                                    : battery.percent !== undefined && !battery.learned
                                      ? t("boxes.batteryLearning")
                                      : undefined
                        }
                    />
                )}
                <Row
                    icon={<Info size={17} />}
                    title={t("boxes.boxId")}
                    value={<span className="mono selectable">{box.ID}</span>}
                />
                <Row
                    icon={
                        img ? (
                            <img src={img} alt="" className="row-model-img" />
                        ) : (
                            <Radio size={17} />
                        )
                    }
                    title={t("boxes.boxModel")}
                    value={
                        models.data?.find((m) => m.id === box.boxModel)?.name ??
                        t("boxes.boxModelNone")
                    }
                    onClick={() => setModelOpen(true)}
                    chevron
                />
                {s?.ip && (
                    <Row
                        icon={<Settings2 size={17} />}
                        title={t("boxes.ipAddress")}
                        value={<span className="mono selectable">{s.ip}</span>}
                    />
                )}
                {hackiebox.data && (
                    <Row
                        icon={<ExternalLink size={17} />}
                        title={t("boxes.boxWebFrontend")}
                        sub={t("boxes.boxWebFrontendHint")}
                        onClick={() => window.open(`http://${ip}`, "_blank", "noopener")}
                        chevron
                    />
                )}
                {cfw?.isCfw && (
                    <Row
                        icon={<Cpu size={17} />}
                        title={t("boxes.cfwBuild")}
                        value={`${cfw.platform ?? "cc3200"} · ${dateTime(cfw.version * 1000)}`}
                    />
                )}
                {s?.lastSeen ? (
                    <Row
                        icon={<RefreshCw size={17} />}
                        title={t("boxes.lastContact")}
                        value={dateTime(s.lastSeen)}
                    />
                ) : null}
            </Section>
            <BoxModelSheet box={box} open={modelOpen} onClose={() => setModelOpen(false)} />
            <ShareSheet
                target={sharing ? { type: "box", id, title: box.boxName || box.ID } : null}
                onClose={() => setSharing(false)}
            />
        </Page>
    );
}
