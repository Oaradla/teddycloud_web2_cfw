import { FileAudio, FileIcon, Folder, ListMusic, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { backendUrl } from "../../api/client";
import type { FileEntry } from "../../api/types";
import { bytes, isAudio, isTaf, isTap, lengthText, parentPath } from "../../lib/format";
import { t } from "../../lib/i18n";
import { Empty, Loading, Row } from "../../ui/kit";

/** the hits of a search through the subfolders, each with the folder it is in */
export function DeepResults({
    hits,
    root,
    loading,
    onOpen,
    right,
    grid,
}: {
    hits: { path: string; entry: FileEntry }[];
    root: string;
    loading: boolean;
    onOpen: (path: string, entry: FileEntry) => void;
    right?: (path: string, entry: FileEntry) => ReactNode;
    grid?: boolean;
}) {
    if (loading) return <Loading />;
    if (!hits.length)
        return <Empty icon={<SearchX size={28} />} title={t("common.nothingFound")} />;
    const folder = (p: string) => parentPath(p).slice(root.replace(/\/$/, "").length) || "/";
    const kind = (entry: FileEntry) =>
        entry.isDir ? "folder" : isTaf(entry.name) || isTap(entry.name) ? "taf" : "";
    const icon = (entry: FileEntry, size: number) =>
        entry.isDir ? (
            <Folder size={size} />
        ) : isTap(entry.name) ? (
            <ListMusic size={size} />
        ) : isTaf(entry.name) || isAudio(entry.name) ? (
            <FileAudio size={size} />
        ) : (
            <FileIcon size={size} />
        );
    const title = (entry: FileEntry) =>
        entry.tonieInfo?.series
            ? `${entry.tonieInfo.series}${entry.tonieInfo.episode ? " – " + entry.tonieInfo.episode : ""}`
            : entry.name;
    const sub = (path: string, entry: FileEntry) => (
        <>
            <span className="deep-path">{folder(path)}</span>
            {!entry.isDir &&
                ` · ${[lengthText(entry.tafHeader?.lengthSeconds), bytes(entry.size)].filter(Boolean).join(" · ")}`}
        </>
    );

    if (grid)
        return (
            <div className="grid-files">
                {hits.map(({ path, entry }) => (
                    <div
                        key={path}
                        className="file-tile"
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpen(path, entry)}
                    >
                        <div className={`pic ${kind(entry)}`}>
                            {entry.tonieInfo?.picture ? (
                                <img
                                    src={backendUrl(entry.tonieInfo.picture)}
                                    alt=""
                                    loading="lazy"
                                />
                            ) : (
                                icon(entry, 44)
                            )}
                        </div>
                        <div className="meta">
                            <div className="name">{title(entry)}</div>
                            <div className="sub">{sub(path, entry)}</div>
                        </div>
                    </div>
                ))}
            </div>
        );
    return (
        <div className="list">
            {hits.map(({ path, entry }) => (
                <Row
                    key={path}
                    leading={
                        entry.tonieInfo?.picture ? (
                            <span className="file-icon">
                                <img
                                    src={backendUrl(entry.tonieInfo.picture)}
                                    alt=""
                                    loading="lazy"
                                />
                            </span>
                        ) : (
                            <span className={`file-icon ${kind(entry)}`}>{icon(entry, 20)}</span>
                        )
                    }
                    title={title(entry)}
                    sub={sub(path, entry)}
                    onClick={() => onOpen(path, entry)}
                    right={right?.(path, entry)}
                    chevron={entry.isDir}
                />
            ))}
        </div>
    );
}
