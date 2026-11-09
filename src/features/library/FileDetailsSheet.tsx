import { useQueryClient } from "@tanstack/react-query";
import {
    ArrowRightLeft,
    CheckCircle2,
    Disc3,
    Download,
    FileAudio,
    Headphones,
    ImagePlus,
    ListMusic,
    Pencil,
    Play,
    Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { tc } from "../../api/tc";
import type { FileEntry } from "../../api/types";
import {
    baseName,
    bytes,
    dateTime,
    figureTitle,
    isAudio,
    isTaf,
    isTap,
    lengthText,
    parentPath,
} from "../../lib/format";
import { useAccess } from "../../lib/access";
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
    /** forAction: closed to run one of the actions */
    onClose: (forAction?: boolean) => void;
    actions: FileActions;
}) {
    const player = usePlayer();
    const tags = useAllTags();
    const qc = useQueryClient();
    const ui = useUi();
    const navigate = useNavigate();
    const full = file ? `${path.replace(/\/$/, "")}/${file.name}` : "";
    const access = useAccess();
    const writable = access.can("folder", path, "folder.write");
    // a guest marks files as listened in its own folder too
    const markable = writable || access.owns("folder", path);
    const source = "lib://" + full.replace(/^\//, "");
    const usedBy = (tags.data ?? []).filter((x) => x.source === source);
    const info = file?.tonieInfo;
    const header = file?.tafHeader;
    const chapters = header?.trackSeconds ?? [];
    const titles = info?.tracks?.length === chapters.length ? info.tracks : [];
    const playable = file ? isTaf(file.name) || isAudio(file.name) : false;
    const tonieFile = file ? isTaf(file.name) || isTap(file.name) : false;
    const isPlaying = player.item?.id === "lib:" + full;

    const later = (fn: () => void) => () => {
        onClose(true);
        window.setTimeout(fn, 250);
    };

    // file is a snapshot taken when the sheet opened
    const [listened, setListenedShown] = useState(false);
    useEffect(() => setListenedShown(Boolean(file?.listened)), [file]);
    const setListened = async (v: boolean) => {
        if (await ui.run(() => tc.setListened(full, v).then(() => true))) setListenedShown(v);
        qc.invalidateQueries({ queryKey: ["files"] });
    };

    return (
        <Sheet
            open={!!file}
            onClose={() => onClose()}
            title={file ? info?.series || file.name : ""}
            full
        >
            {file && (
                <>
                    <div className="hero">
                        {info?.picture ? (
                            <TonieImage src={info.picture} className="hero-pic" />
                        ) : (
                            <div
                                className="file-icon taf"
                                style={{ width: 120, height: 120, borderRadius: 28 }}
                            >
                                {isTap(file.name) ? (
                                    <ListMusic size={52} />
                                ) : (
                                    <FileAudio size={52} />
                                )}
                            </div>
                        )}
                        <h1>{info?.series || file.name}</h1>
                        {info?.episode && <p>{info.episode}</p>}
                        <div className="badges">
                            {header?.lengthSeconds ? (
                                <span className="badge">{lengthText(header.lengthSeconds)}</span>
                            ) : null}
                            {chapters.length > 1 && (
                                <span className="badge">
                                    {t("library.nChapters", { n: chapters.length })}
                                </span>
                            )}
                            {header && !header.valid && (
                                <span className="badge danger">{t("library.invalidTaf")}</span>
                            )}
                            {file.listened && (
                                <span className="badge ok">{t("library.listened")}</span>
                            )}
                            {usedBy.length > 0 && (
                                <span className="badge accent">
                                    {t("library.onNTonies", { n: usedBy.length })}
                                </span>
                            )}
                        </div>
                        <div className="btn-row">
                            {playable && (
                                <button
                                    className="btn primary"
                                    onClick={() =>
                                        isPlaying
                                            ? player.openFull()
                                            : player.play(filePlayItem(full, file))
                                    }
                                >
                                    <Play size={18} fill="currentColor" />
                                    {isPlaying ? t("common.nowPlaying") : t("common.listen")}
                                </button>
                            )}
                            {tonieFile && (
                                <button className="btn soft" onClick={later(actions.assign)}>
                                    <Disc3 size={18} />
                                    {t("common.assignToTonie")}
                                </button>
                            )}
                        </div>
                    </div>

                    {usedBy.length > 0 && (
                        <Section title={t("library.assignedTo")}>
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
                                    onClick={later(() =>
                                        navigate(
                                            `/tonie/${x.ruid}${x.overlay ? `?box=${x.overlay}` : ""}`,
                                        ),
                                    )}
                                    chevron
                                />
                            ))}
                        </Section>
                    )}

                    {chapters.length > 0 && (
                        <Section
                            title={t("common.chapters")}
                            right={<span className="small muted">{chapters.length}</span>}
                        >
                            <div className="tracks">
                                {chapters.map((start, i) => (
                                    <Row
                                        key={i}
                                        className={
                                            isPlaying && player.chapter === i ? "playing" : ""
                                        }
                                        leading={<span className="track-no">{i + 1}</span>}
                                        title={titles[i] ?? t("common.chapterN", { n: i + 1 })}
                                        nowrap
                                        right={
                                            <ChapterTime
                                                starts={chapters}
                                                i={i}
                                                total={header?.lengthSeconds}
                                            />
                                        }
                                        onClick={
                                            playable
                                                ? () =>
                                                      isPlaying
                                                          ? player.jumpChapter(i)
                                                          : player.play(
                                                                filePlayItem(full, file),
                                                                start,
                                                            )
                                                : undefined
                                        }
                                        chevron={false}
                                    />
                                ))}
                            </div>
                        </Section>
                    )}

                    <Section title={t("common.info")}>
                        <Row
                            title={t("library.fileName")}
                            sub={
                                <span
                                    className="mono selectable"
                                    style={{ wordBreak: "break-all" }}
                                >
                                    {file.name}
                                </span>
                            }
                        />
                        <Row
                            title={t("library.folder")}
                            value={
                                parentPath(full) === "/"
                                    ? t("common.library")
                                    : baseName(parentPath(full))
                            }
                        />
                        <Row title={t("library.size")} value={bytes(file.size)} />
                        <Row title={t("library.date")} value={dateTime(file.date * 1000)} />
                        {info?.model && (
                            <Row
                                title={t("library.model")}
                                value={<span className="mono">{info.model}</span>}
                            />
                        )}
                        {header && (
                            <Row
                                title="Audio-ID"
                                value={<span className="mono selectable">{header.audioId}</span>}
                            />
                        )}
                        {header && (
                            <Row
                                title="SHA1"
                                sub={
                                    <span
                                        className="mono selectable"
                                        style={{ wordBreak: "break-all" }}
                                    >
                                        {header.sha1Hash}
                                    </span>
                                }
                                right={
                                    header.valid ? (
                                        <CheckCircle2 size={18} color="var(--ok)" />
                                    ) : undefined
                                }
                            />
                        )}
                        {isTaf(file.name) && (
                            <SwitchRow
                                icon={<Headphones size={17} />}
                                title={t("library.listened")}
                                sub={t("library.listenedHint")}
                                checked={listened}
                                onChange={setListened}
                                disabled={!markable}
                            />
                        )}
                    </Section>

                    <Section title={t("common.actions")}>
                        {isTap(file.name) && writable && (
                            <Row
                                icon={<ListMusic size={17} />}
                                title={t("library.editPlaylist")}
                                onClick={later(actions.editPlaylist)}
                                chevron
                            />
                        )}
                        {tonieFile && (
                            <Row
                                icon={<ImagePlus size={17} />}
                                title={
                                    info?.series ? t("library.changeCover") : t("library.setCover")
                                }
                                onClick={later(actions.cover)}
                                chevron
                            />
                        )}
                        {writable && (
                            <Row
                                icon={<Pencil size={17} />}
                                title={t("library.rename")}
                                onClick={later(actions.rename)}
                                chevron={false}
                            />
                        )}
                        {writable && (
                            <Row
                                icon={<ArrowRightLeft size={17} />}
                                title={t("library.move")}
                                onClick={later(actions.move)}
                                chevron={false}
                            />
                        )}
                        <Row
                            icon={<Download size={17} />}
                            title={t("common.download")}
                            onClick={actions.download}
                            chevron={false}
                        />
                        {isTaf(file.name) && (
                            <Row
                                icon={<Download size={17} />}
                                title={t("common.downloadOgg")}
                                sub={t("common.downloadOggHint")}
                                onClick={later(actions.downloadOgg)}
                                chevron
                            />
                        )}
                        {writable && (
                            <Row
                                icon={<Trash2 size={17} />}
                                title={t("common.delete")}
                                danger
                                onClick={later(actions.remove)}
                                chevron={false}
                            />
                        )}
                    </Section>
                </>
            )}
        </Sheet>
    );
}
