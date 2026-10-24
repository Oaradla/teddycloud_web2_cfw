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
}: {
    hits: { path: string; entry: FileEntry }[];
    root: string;
    loading: boolean;
    onOpen: (path: string, entry: FileEntry) => void;
    right?: (path: string, entry: FileEntry) => ReactNode;
}) {
    if (loading) return <Loading />;
    if (!hits.length) return <Empty icon={<SearchX size={28} />} title={t("nothingFound")} />;
    const folder = (p: string) => parentPath(p).slice(root.replace(/\/$/, "").length) || "/";
    return (
        <div className="list">
            {hits.map(({ path, entry }) => (
                <Row
                    key={path}
                    leading={
                        entry.tonieInfo?.picture ? (
                            <span className="file-icon">
                                <img src={backendUrl(entry.tonieInfo.picture)} alt="" loading="lazy" />
                            </span>
                        ) : (
                            <span className={`file-icon ${entry.isDir ? "folder" : isTaf(entry.name) || isTap(entry.name) ? "taf" : ""}`}>
                                {entry.isDir ? <Folder size={20} /> : isTap(entry.name) ? <ListMusic size={20} /> : isTaf(entry.name) || isAudio(entry.name) ? <FileAudio size={20} /> : <FileIcon size={20} />}
                            </span>
                        )
                    }
                    title={entry.tonieInfo?.series ? `${entry.tonieInfo.series}${entry.tonieInfo.episode ? " – " + entry.tonieInfo.episode : ""}` : entry.name}
                    sub={
                        <>
                            <span className="deep-path">{folder(path)}</span>
                            {!entry.isDir && ` · ${[lengthText(entry.tafHeader?.lengthSeconds), bytes(entry.size)].filter(Boolean).join(" · ")}`}
                        </>
                    }
                    onClick={() => onOpen(path, entry)}
                    right={right?.(path, entry)}
                    chevron={entry.isDir}
                />
            ))}
        </div>
    );
}
