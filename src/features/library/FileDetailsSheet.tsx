import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, CheckCircle2, Disc3, Download, FileAudio, Headphones, ImagePlus, ListMusic, Pencil, Play, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { tc } from "../../api/tc";
import type { FileEntry } from "../../api/types";
import { baseName, bytes, dateTime, figureTitle, isAudio, isTaf, isTap, lengthText, parentPath } from "../../lib/format";
import { t } from "../../lib/i18n";
import { filePlayItem } from "../../lib/play";
import { useAllTags } from "../../lib/queries";
import { usePlayer } from "../../player/Player";
import { Sheet } from "../../ui/Sheet";
import { ChapterTime, Row, Section, SwitchRow, useUi } from "../../ui/kit";
import { FigurePic } from "../../ui/FigurePic";
import { TonieImage } from "../../ui/TonieImage";

export interface FileActions {
    assign: () => void;
    cover: () => void;
    rename: () => void;
    move: () => void;
    download: () => void;
    downloadOgg: () => void;
    editPlaylist: () => void;
    remove: () => void;
}

/** everything about one file of the library */
export function FileDetailsSheet({
    path,
    file,
    onClose,
    actions,
}: {
    path: string;
    file: FileEntry | null;
    onClose: () => void;
    actions: FileActions;
}) {
    const player = usePlayer();
    const tags = useAllTags();
    const qc = useQueryClient();
    const ui = useUi();
    const navigate = useNavigate();
    const full = file ? `${path.replace(/\/$/, "")}/${file.name}` : "";
    const source = "lib://" + full.replace(/^\//, "");
    const usedBy = (tags.data ?? []).filter((x) => x.source === source);
    const info = file?.tonieInfo;
    const header = file?.tafHeader;
    const chapters = header?.trackSeconds ?? [];
    const titles = info?.tracks ?? [];
    const playable = file ? isTaf(file.name) || isAudio(file.name) : false;
    const tonieFile = file ? isTaf(file.name) || isTap(file.name) : false;
    const isPlaying = player.item?.id === "lib:" + full;

    const later = (fn: () => void) => () => {
        onClose();
        window.setTimeout(fn, 250);
    };

    const setListened = async (v: boolean) => {
        await ui.run(() => tc.setListened(full, v));
        qc.invalidateQueries({ queryKey: ["files"] });
    };

    return (
        <Sheet open={!!file} onClose={onClose} title={file ? info?.series || file.name : ""} full>
            {file && (
                <>
                    <div className="hero">
                        {info?.picture ? (
                            <TonieImage src={info.picture} className="hero-pic" />
                        ) : (
                            <div className="file-icon taf" style={{ width: 120, height: 120, borderRadius: 28 }}>
                                {isTap(file.name) ? <ListMusic size={52} /> : <FileAudio size={52} />}
                            </div>
                        )}
                        <h1>{info?.series || file.name}</h1>
                        {info?.episode && <p>{info.episode}</p>}
                        <div className="badges">
                            {header?.lengthSeconds ? <span className="badge">{lengthText(header.lengthSeconds)}</span> : null}
                            {chapters.length > 1 && <span className="badge">{t("nChapters", { n: chapters.length })}</span>}
                            {header && !header.valid && <span className="badge danger">{t("invalidTaf")}</span>}
                            {file.listened && <span className="badge ok">{t("listened")}</span>}
                            {usedBy.length > 0 && <span className="badge accent">{t("onNTonies", { n: usedBy.length })}</span>}
                        </div>
                        <div className="btn-row">
                            {playable && (
                                <button className="btn primary" onClick={() => (isPlaying ? player.openFull() : player.play(filePlayItem(full, file)))}>
                                    <Play size={18} fill="currentColor" />
                                    {isPlaying ? t("nowPlaying") : t("listen")}
                                </button>
                            )}
                            {tonieFile && (
                                <button className="btn soft" onClick={later(actions.assign)}>
                                    <Disc3 size={18} />
                                    {t("assignToTonie")}
                                </button>
                            )}
                        </div>
                    </div>

                    {usedBy.length > 0 && (
                        <Section title={t("assignedTo")}>
                            {usedBy.map((x) => (
                                <Row
                                    key={x.ruid}
                                    leading={
                                        <div style={{ width: 44, height: 44, flexShrink: 0 }}>
                                            <FigurePic tag={x} />
                                        </div>
                                    }
                                    title={figureTitle(x)}
                                    sub={x.ruid.toUpperCase()}
                                    onClick={later(() => navigate(`/tonie/${x.ruid}${x.overlay ? `?box=${x.overlay}` : ""}`))}
                                    chevron
                                />
                            ))}
                        </Section>
                    )}

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
                                        right={<ChapterTime starts={chapters} i={i} total={header?.lengthSeconds} />}
                                        onClick={playable ? () => (isPlaying ? player.jumpChapter(i) : player.play(filePlayItem(full, file), start)) : undefined}
                                        chevron={false}
                                    />
                                ))}
                            </div>
                        </Section>
                    )}

                    <Section title={t("info")}>
                        <Row title={t("fileName")} sub={<span className="mono selectable" style={{ wordBreak: "break-all" }}>{file.name}</span>} />
                        <Row title={t("folder")} value={parentPath(full) === "/" ? t("library") : baseName(parentPath(full))} />
                        <Row title={t("size")} value={bytes(file.size)} />
                        <Row title={t("date")} value={dateTime(file.date * 1000)} />
                        {info?.model && <Row title={t("model")} value={<span className="mono">{info.model}</span>} />}
                        {header && <Row title="Audio-ID" value={<span className="mono selectable">{header.audioId}</span>} />}
                        {header && (
                            <Row
                                title="SHA1"
                                sub={<span className="mono selectable" style={{ wordBreak: "break-all" }}>{header.sha1Hash}</span>}
                                right={header.valid ? <CheckCircle2 size={18} color="var(--ok)" /> : undefined}
                            />
                        )}
                        {isTaf(file.name) && (
                            <SwitchRow icon={<Headphones size={17} />} title={t("listened")} sub={t("listenedHint")} checked={Boolean(file.listened)} onChange={setListened} />
                        )}
                    </Section>

                    <Section title={t("actions")}>
                        {isTap(file.name) && <Row icon={<ListMusic size={17} />} title={t("editPlaylist")} onClick={later(actions.editPlaylist)} chevron />}
                        {tonieFile && (
                            <Row icon={<ImagePlus size={17} />} title={info?.series ? t("changeCover") : t("setCover")} onClick={later(actions.cover)} chevron />
                        )}
                        <Row icon={<Pencil size={17} />} title={t("rename")} onClick={later(actions.rename)} chevron={false} />
                        <Row icon={<ArrowRightLeft size={17} />} title={t("move")} onClick={later(actions.move)} chevron={false} />
                        <Row icon={<Download size={17} />} title={t("download")} onClick={actions.download} chevron={false} />
                        {isTaf(file.name) && <Row icon={<Download size={17} />} title={t("downloadOgg")} sub={t("downloadOggHint")} onClick={later(actions.downloadOgg)} chevron />}
                        <Row icon={<Trash2 size={17} />} title={t("delete")} danger onClick={later(actions.remove)} chevron={false} />
                    </Section>
                </>
            )}
        </Sheet>
    );
}
