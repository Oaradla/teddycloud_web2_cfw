import {
    Cloud,
    CloudOff,
    Download,
    EyeOff,
    FileAudio,
    Gamepad2,
    Globe,
    Link2,
    Play,
    Radio,
    Shapes,
    Trash2,
    UserRound,
} from "lucide-react";
import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { backendUrl } from "../../api/client";
import { tc } from "../../api/tc";
import type { Tag } from "../../api/types";
import { contentTitle, figureSubtitle, figureTitle, lengthText, libPath, linkedContent, parentPath, ruidPretty, sourceLabel, tagInfo } from "../../lib/format";
import { t } from "../../lib/i18n";
import { canPlayTag, libraryFileUrl, tagPlayItem } from "../../lib/play";
import { useAllTags, useBoxes, useCfwBoxes, useInvalidateTags, useSettings, useTag } from "../../lib/queries";
import { usePlayer } from "../../player/Player";
import { ChapterTime, ErrorBox, Loading, Page, Row, Section, SwitchRow, useUi } from "../../ui/kit";
import { FigurePic } from "../../ui/FigurePic";
import { TonieImage } from "../../ui/TonieImage";
import { remoteAvailable } from "../boxes/BoxesPage";
import { DownloadSheet } from "../library/DownloadSheet";
import { LibraryPicker } from "../library/LibraryPicker";
import { CfwTagSettings } from "./CfwTagSettings";
import { ModelPicker } from "./ModelPicker";
import { StreamPicker } from "./StreamPicker";

export function ToniePage() {
    const { ruid = "" } = useParams();
    const [params] = useSearchParams();
    const all = useAllTags();
    const known = all.data?.find((x) => x.ruid === ruid);
    const overlay = params.get("box") ?? known?.overlay ?? "";
    const tag = useTag(ruid, overlay);
    const data = tag.data ?? known;

    return (
        <Page title={data ? figureTitle(data) : t("tonie")} back={true} compact>
            {!data && tag.isLoading && <Loading />}
            {!data && tag.error && <ErrorBox error={tag.error} retry={() => tag.refetch()} />}
            {data && <TonieDetail tag={data} overlay={overlay} boxIds={known?.boxIds ?? []} />}
        </Page>
    );
}

function TonieDetail({ tag, overlay, boxIds }: { tag: Tag; overlay: string; boxIds: string[] }) {
    const ui = useUi();
    const player = usePlayer();
    const invalidate = useInvalidateTags();
    const boxes = useBoxes();
    const cfwBoxes = useCfwBoxes();
    const globalSettings = useSettings("");
    const [pickContent, setPickContent] = useState(false);
    const [pickModel, setPickModel] = useState(false);
    const [pickStream, setPickStream] = useState(false);
    const [ogg, setOgg] = useState(false);
    const info = tagInfo(tag);
    const linked = linkedContent(tag);
    const playable = canPlayTag(tag);
    const isPlaying = player.item?.id === tag.ruid;
    const chapters = tag.trackSeconds ?? [];
    const titles = info.tracks ?? [];
    const showCfw =
        cfwBoxes.data != null &&
        globalSettings.data?.find((o) => o.ID === "cfw.show_tag_settings")?.value === true;
    const remoteBoxes = (cfwBoxes.data ?? []).filter((b) => remoteAvailable(b) && b.online);

    const change = async (key: string, value: string | boolean, ok?: string) => {
        await ui.run(() => tc.setContent(tag.ruid, key, value, overlay || undefined), ok ?? t("saved"));
        invalidate();
    };

    const assign = async (source: string) => {
        await ui.run(() => tc.assignSource(tag, source, overlay || undefined), t("contentAssigned"));
        invalidate();
    };

    const removeContent = async () => {
        const ok = await ui.confirm({
            title: t("removeContent"),
            text: t("removeContentText"),
            confirm: t("remove"),
            danger: true,
        });
        if (!ok) return;
        await ui.run(async () => {
            await tc.setContent(tag.ruid, "source", "", overlay || undefined);
            if (tag.live) await tc.setContent(tag.ruid, "live", false, overlay || undefined);
        }, t("contentRemoved"));
        invalidate();
    };

    const playOnBox = () => {
        const send = (id: string) =>
            ui.run(() => tc.cfwRemote(id, "play", { ruid: tag.ruid }), t("commandSent"));
        if (remoteBoxes.length === 1) send(remoteBoxes[0].id);
        else
            ui.actions(
                t("playOnBox"),
                remoteBoxes.map((b) => ({ label: b.boxName || b.id, icon: <Radio size={17} />, onSelect: () => send(b.id) })),
            );
    };

    const boxName = (id: string) => boxes.data?.find((b) => b.ID === id)?.boxName || id;
    const lib = libPath(tag.source);

    return (
        <>
            <div className="hero side">
                <div className="hero-pic" style={{ width: 190, height: 190, flexShrink: 0 }}>
                    <FigurePic tag={tag} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h1>{figureTitle(tag)}</h1>
                    {figureSubtitle(tag) && <p>{figureSubtitle(tag)}</p>}
                    {linked && <p style={{ color: "var(--accent)", marginTop: 4 }}>→ {contentTitle(linked)}</p>}
                    <div className="badges">
                        {tag.source ? (
                            <span className="badge ok">{t("ownContent")}</span>
                        ) : tag.valid ? (
                            <span className="badge">{t("original")}</span>
                        ) : (
                            <span className="badge warn">{t("noContent")}</span>
                        )}
                        {tag.live && <span className="badge accent">{t("live")}</span>}
                        {tag.nocloud && <span className="badge">{t("cloudOff")}</span>}
                        {tag.hide && <span className="badge">{t("hidden")}</span>}
                        {tag.lengthSeconds ? <span className="badge">{lengthText(tag.lengthSeconds)}</span> : null}
                    </div>
                    <div className="btn-row">
                        <button
                            className="btn primary"
                            disabled={!playable}
                            onClick={() => (isPlaying ? player.openFull() : player.play(tagPlayItem(tag)))}
                        >
                            <Play size={18} fill="currentColor" />
                            {isPlaying ? t("nowPlaying") : t("listen")}
                        </button>
                        {remoteBoxes.length > 0 && playable && (
                            <button className="btn soft" onClick={playOnBox}>
                                <Gamepad2 size={18} />
                                {t("playOnBox")}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <Section title={t("content")} footer={t("contentHint")}>
                <Row
                    icon={linked?.picture ? undefined : <FileAudio size={17} />}
                    leading={linked?.picture ? <TonieImage src={linked.picture} size={44} /> : undefined}
                    title={linked ? contentTitle(linked) : tag.source ? sourceLabel(tag.source) : tag.valid ? t("originalContent") : t("noContentYet")}
                    sub={tag.source ? (lib ? `${t("library")}: ${parentPath("/" + lib)}` : t("stream")) : t("tapToChoose")}
                    onClick={() => setPickContent(true)}
                    chevron
                />
                <Row icon={<Link2 size={17} />} title={t("assignStream")} sub={t("assignStreamHint")} onClick={() => setPickStream(true)} chevron />
                {tag.source && <Row icon={<Trash2 size={17} />} title={t("removeContent")} danger onClick={removeContent} chevron={false} />}
            </Section>

            <Section title={t("figure")}>
                <Row
                    leading={<TonieImage src={tag.tonieInfo?.picture} size={40} />}
                    title={tag.tonieInfo?.series || t("unknownFigure")}
                    sub={[tag.tonieInfo?.episode, tag.tonieInfo?.model].filter(Boolean).join(" · ")}
                    onClick={() => setPickModel(true)}
                    chevron
                />
            </Section>

            {chapters.length > 0 && (
                <Section title={t("chapters")} right={<span className="small muted">{chapters.length}</span>}>
                    <div className="tracks">
                        {chapters.map((start, i) => (
                            <Row
                                key={i}
                                className={isPlaying && player.chapter === i ? "playing" : ""}
                                leading={<span className="track-no">{i + 1}</span>}
                                title={titles[i] ?? t("chapterN", { n: i + 1 })}
                                nowrap
                                right={<ChapterTime starts={chapters} i={i} total={tag.lengthSeconds} />}
                                onClick={
                                    playable
                                        ? () => (isPlaying ? player.jumpChapter(i) : player.play(tagPlayItem(tag), start))
                                        : undefined
                                }
                                chevron={false}
                            />
                        ))}
                    </div>
                </Section>
            )}

            <Section title={t("options")}>
                <SwitchRow
                    icon={<Globe size={17} />}
                    title={t("live")}
                    sub={t("liveHint")}
                    checked={tag.live}
                    onChange={(v) => change("live", v)}
                />
                <SwitchRow
                    icon={tag.nocloud ? <CloudOff size={17} /> : <Cloud size={17} />}
                    title={t("cloudOff")}
                    sub={t("cloudOffHint")}
                    checked={tag.nocloud}
                    onChange={(v) => change("nocloud", v)}
                />
                <SwitchRow
                    icon={<EyeOff size={17} />}
                    title={t("hide")}
                    sub={t("hideHint")}
                    checked={tag.hide}
                    onChange={(v) => change("hide", v)}
                />
            </Section>

            {showCfw && <CfwTagSettings ruid={tag.ruid} />}

            <Section title={t("info")}>
                <Row icon={<Shapes size={17} />} title="RUID" value={<span className="mono selectable">{tag.ruid.toUpperCase()}</span>} />
                {tag.uid && <Row icon={<Shapes size={17} />} title="UID" value={<span className="mono selectable">{tag.uid}</span>} />}
                {!tag.uid && <Row icon={<Shapes size={17} />} title="UID" value={<span className="mono">{ruidPretty(tag.ruid)}</span>} />}
                {boxIds.length > 0 && (
                    <Row icon={<UserRound size={17} />} title={t("knownBy")} value={boxIds.map(boxName).join(", ")} />
                )}
                {playable && (
                    <Row icon={<Download size={17} />} title={t("downloadOgg")} sub={t("downloadOggHint")} onClick={() => setOgg(true)} chevron />
                )}
                {playable && (
                    <Row
                        icon={<Download size={17} />}
                        title={t("downloadTaf")}
                        onClick={() => {
                            const a = document.createElement("a");
                            a.href = backendUrl(tag.audioUrl.replace(/[?&]skip_header=true/, ""));
                            a.download = `${tag.ruid}.taf`;
                            a.click();
                        }}
                        chevron={false}
                    />
                )}
            </Section>

            <LibraryPicker
                open={pickContent}
                onClose={() => setPickContent(false)}
                onPick={assign}
                startPath={lib ? parentPath("/" + lib) : "/"}
            />
            <DownloadSheet
                open={ogg}
                onClose={() => setOgg(false)}
                title={linked ? contentTitle(linked) : figureTitle(tag)}
                wholeUrl={lib ? libraryFileUrl("/" + lib, true) : tag.audioUrl}
                trackUrl={lib ? (n) => `${libraryFileUrl("/" + lib, true)}&tracks=${n}` : undefined}
                chapters={chapters}
                chapterTitles={titles}
            />
            <StreamPicker open={pickStream} onClose={() => setPickStream(false)} onPick={assign} current={tag.source} />
            <ModelPicker
                open={pickModel}
                onClose={() => setPickModel(false)}
                current={tag.tonieInfo?.model}
                onPick={(model) => change("tonie_model", model, t("figureSet"))}
            />
        </>
    );
}
