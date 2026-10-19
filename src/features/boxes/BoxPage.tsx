import { useQueryClient } from "@tanstack/react-query";
import {
    Cpu,
    Disc3,
    Ear,
    Hand,
    Headphones,
    Info,
    Lightbulb,
    MoveDiagonal,
    Pencil,
    Play,
    Radio,
    RefreshCw,
    Settings2,
    SlidersHorizontal,
    Speaker,
    Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { tc } from "../../api/tc";
import type { SettingOption } from "../../api/types";
import { ago, contentTitle, dateTime, figureSubtitle, figureTitle, linkedContent } from "../../lib/format";
import { t } from "../../lib/i18n";
import { canPlayTag, tagPlayItem } from "../../lib/play";
import { keys, useAllTags, useBoxes, useBoxImage, useBoxModels, useBoxState, useBoxesDiffer, useCfwBox, useSettings } from "../../lib/queries";
import { BoxModelSheet } from "./BoxModelSheet";
import { usePlayer } from "../../player/Player";
import { ErrorBox, Loading, Page, Row, Section, useUi } from "../../ui/kit";
import { FigurePic } from "../../ui/FigurePic";
import { TonieImage } from "../../ui/TonieImage";
import { SettingRow } from "../settings/SettingControls";
import { cfwSettingsFor } from "../settings/visibility";
import { batteryInfo, remoteAvailable } from "./BoxesPage";
import { RemoteControl } from "./RemoteControl";

const pct15 = (v: number) => `${Math.round((v / 15) * 100)} %`;

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
    const tags = useAllTags();
    const settings = useSettings(id);
    const boxesDiffer = useBoxesDiffer();
    const player = usePlayer();
    const ui = useUi();
    const qc = useQueryClient();
    const settingsRef = useRef<HTMLDivElement>(null);
    const remoteRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = focus === "settings" ? settingsRef.current : focus === "remote" ? remoteRef.current : null;
        if (el && settings.data) window.setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    }, [focus, settings.data]);

    if (boxes.isLoading) return <Page title={t("box")} back="/"><Loading /></Page>;
    if (!box)
        return (
            <Page title={t("box")} back="/">
                <ErrorBox error={boxes.error ?? t("boxNotFound")} />
            </Page>
        );

    const s = state.data;
    const online = Boolean(s?.online || cfw?.online);
    const tag = s?.lastRuid ? tags.data?.find((x) => x.ruid === s.lastRuid) : undefined;
    const battery = batteryInfo(cfw);
    const opts = new Map<string, SettingOption>((settings.data ?? []).map((o) => [o.ID, o]));
    const opt = (k: string) => opts.get(k);
    const useCfwSettings = cfwSettingsFor({
        enabled: opt("cfw.enabled")?.value === true,
        isCfwBox: Boolean(cfw?.isCfw),
        forced: opt("cfw.force_box_settings")?.value === true,
    });
    const tb2 = Number(opt("toniebox.boxGeneration")?.value) === 2;
    const tagCount = tags.data?.filter((x) => x.boxIds.includes(id) && x.type !== "system").length;

    const rename = async () => {
        const name = await ui.prompt({ title: t("renameBox"), label: t("name"), value: box.boxName });
        if (!name) return;
        await ui.run(async () => {
            await tc.renameBox(id, name);
            await qc.invalidateQueries({ queryKey: keys.boxes });
        }, t("saved"));
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
                <button className="icon-btn" onClick={rename} aria-label={t("renameBox")}>
                    <Pencil size={19} />
                </button>
            }
        >
            <div className="hero side">
                {img ? (
                    <img className="hero-pic" src={img} alt="" style={{ width: 150, height: 150 }} />
                ) : (
                    <div className="tonie-pic-fallback" style={{ width: 120, height: 120 }}>
                        <Radio size={44} />
                    </div>
                )}
                <div>
                    <h1>{box.boxName || box.ID}</h1>
                    <p>
                        {online ? t("onlineNow") : s?.lastSeen ? t("lastSeen", { when: ago(s.lastSeen) }) : t("offline")}
                    </p>
                    <div className="badges">
                        <span className={`badge ${online ? "ok" : ""}`}>
                            <span className={`dot ${online ? "ok" : ""}`} />
                            {online ? t("online") : t("offline")}
                        </span>
                        {battery && (
                            <span className={`badge ${battery.cls}`}>
                                {battery.icon}
                                {battery.text}
                                {battery.station ? ` · ${t("charging")}` : ""}
                            </span>
                        )}
                        {cfw?.isCfw && <span className="badge accent">CFW</span>}
                    </div>
                </div>
            </div>

            {s?.lastRuid && (
                <Section title={online ? t("onTheBox") : t("lastTonie")}>
                    <Row
                        leading={tag ? <div style={{ width: 56, height: 56, flexShrink: 0 }}><FigurePic tag={tag} /></div> : <TonieImage size={56} />}
                        title={tag ? figureTitle(tag) : s.lastRuid.toUpperCase()}
                        sub={[tag ? (linkedContent(tag) ? "→ " + contentTitle(linkedContent(tag)!) : figureSubtitle(tag)) : "", s.lastRuidTime ? ago(s.lastRuidTime) : ""].filter(Boolean).join(" · ")}
                        to={`/tonie/${s.lastRuid}?box=${id}`}
                        right={
                            tag && canPlayTag(tag) ? (
                                <button
                                    className="icon-btn"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        player.play(tagPlayItem(tag));
                                    }}
                                    aria-label={t("play")}
                                >
                                    <Play size={22} fill="currentColor" />
                                </button>
                            ) : undefined
                        }
                    />
                </Section>
            )}

            {remoteAvailable(cfw) && (
                <div ref={remoteRef} className="section" style={{ scrollMarginTop: 70 }}>
                    <div className="section-head">
                        <h2 className="section-title">{t("remote")}</h2>
                    </div>
                    <RemoteControl boxId={id} />
                </div>
            )}

            <div ref={settingsRef} style={{ scrollMarginTop: 70 }}>
                {settings.isLoading && <Loading />}
                {settings.data && (
                    <Section title={t("boxSettings")} footer={t("boxSettingsHint")}>
                        {useCfwSettings ? (
                            <>
                                {row("cfw.box.speaker_limit", { label: t("speakerLimit"), icon: <Speaker size={17} />, format: pct15 })}
                                {row("cfw.box.headphone_limit", { label: t("headphoneLimit"), icon: <Headphones size={17} />, format: pct15 })}
                            </>
                        ) : (
                            <>
                                {row("toniebox.max_vol_spk", { label: t("speakerLimit"), icon: <Speaker size={17} /> })}
                                {row("toniebox.max_vol_hdp", { label: t("headphoneLimit"), icon: <Headphones size={17} /> })}
                            </>
                        )}
                        {tb2
                            ? row("toniebox2.lightring_brightness", { label: t("ledBrightness"), icon: <Lightbulb size={17} />, format: (v) => `${v} %` })
                            : row("toniebox.led", { label: t("led"), icon: <Lightbulb size={17} />, labels: { 0: t("ledOn"), 1: t("ledOff"), 2: t("ledDimmed") } })}
                        {useCfwSettings ? (
                            <>
                                {row("cfw.box.slap_lock", { label: t("slapLock"), sub: t("slapLockHint"), icon: <Hand size={17} /> })}
                                {row("cfw.box.tilt_lock", { label: t("tiltLock"), sub: t("tiltLockHint"), icon: <MoveDiagonal size={17} /> })}
                                {row("cfw.box.volume_lock", { label: t("volumeLock"), sub: t("volumeLockHint"), icon: <Volume2 size={17} /> })}
                                {row("cfw.box.both_ears_off", { label: t("bothEarsOff"), sub: t("bothEarsOffHint"), icon: <Ear size={17} /> })}
                            </>
                        ) : (
                            <>
                                {row("toniebox.slap_enabled", { label: t("slapToSkip"), icon: <Hand size={17} /> })}
                                {row("toniebox.slap_back_left", { label: t("slapDirection"), sub: t("slapDirectionHint"), icon: <MoveDiagonal size={17} /> })}
                            </>
                        )}
                        {tb2 && row("toniebox2.baby_mode", { label: t("babyMode"), icon: <Disc3 size={17} /> })}
                    </Section>
                )}
                {settings.error && <ErrorBox error={settings.error} retry={() => settings.refetch()} />}
            </div>

            <Section>
                {boxesDiffer && <Row icon={<Disc3 size={17} />} title={t("toniesOfBox")} value={tagCount ?? ""} to={`/tonies?box=${id}`} />}
                <Row icon={<SlidersHorizontal size={17} />} title={t("allBoxSettings")} sub={t("allBoxSettingsHint")} to={`/box/${id}/settings`} />
                {cfw?.isCfw && (
                    <Row
                        icon={<RefreshCw size={17} />}
                        title={t("firmwareUpdate")}
                        to="/boxupdate"
                    />
                )}
            </Section>

            <Section title={t("info")}>
                <Row icon={<Info size={17} />} title={t("boxId")} value={<span className="mono selectable">{box.ID}</span>} />
                <Row
                    icon={img ? <img src={img} alt="" className="row-model-img" /> : <Radio size={17} />}
                    title={t("boxModel")}
                    value={models.data?.find((m) => m.id === box.boxModel)?.name ?? t("boxModelNone")}
                    onClick={() => setModelOpen(true)}
                    chevron
                />
                {s?.ip && <Row icon={<Settings2 size={17} />} title={t("ipAddress")} value={<span className="mono selectable">{s.ip}</span>} />}
                {cfw?.isCfw && (
                    <Row
                        icon={<Cpu size={17} />}
                        title={t("cfwBuild")}
                        value={`${cfw.platform ?? "cc3200"} · ${dateTime(cfw.version * 1000)}`}
                    />
                )}
                {s?.lastSeen ? <Row icon={<RefreshCw size={17} />} title={t("lastContact")} value={dateTime(s.lastSeen)} /> : null}
            </Section>
            <BoxModelSheet box={box} open={modelOpen} onClose={() => setModelOpen(false)} />
        </Page>
    );
}
