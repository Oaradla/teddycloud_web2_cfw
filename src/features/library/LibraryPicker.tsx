import { Check, ChevronLeft, FileAudio, Folder, FolderPlus, FolderTree, ListMusic } from "lucide-react";
import { useEffect, useState } from "react";
import { backendUrl } from "../../api/client";
import type { FileEntry } from "../../api/types";
import { isAudio, bytes, isTaf, isTap, joinPath, lengthText, parentPath } from "../../lib/format";
import { t } from "../../lib/i18n";
import { keys, useFiles, usePrefetchSubfolders } from "../../lib/queries";
import { tc } from "../../api/tc";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet } from "../../ui/Sheet";
import { Empty, ErrorBox, Loading, Row, SearchField, useUi } from "../../ui/kit";
import { getPref, setPref } from "../../lib/prefs";
import { useDeepSearch } from "../../lib/deepSearch";
import { DeepResults } from "./DeepResults";

/** picks a TAF or TAP file of the library; returns "lib://<path>" */
export function LibraryPicker({
    open,
    onClose,
    onPick,
    startPath = "/",
    title,
    folderMode,
    multi,
    onPickMany,
}: {
    /** several files (TAF and audio, for a playlist); onPickMany gets them in the order picked */
    multi?: boolean;
    onPickMany?: (files: { path: string; entry: FileEntry }[]) => void;
    /** picks a folder instead of a file (onPick gets the folder path) */
    folderMode?: boolean;
    open: boolean;
    onClose: () => void;
    onPick?: (source: string) => void;
    startPath?: string;
    title?: string;
}) {
    const [path, setPath] = useState(startPath);
    const [filter, setFilter] = useState("");
    const [picked, setPicked] = useState<{ path: string; entry: FileEntry }[]>([]);
    const [deep, setDeep] = useState(() => getPref("lib.deep", "") === "1");
    useEffect(() => {
        if (open) {
            setPath(startPath);
            setFilter("");
            setPicked([]);
        }
    }, [open, startPath]);
    const ui = useUi();
    const newFolder = async () => {
        const name = await ui.prompt({ title: t("newFolder"), label: t("name") });
        if (!name) return;
        const target = joinPath(path, name.replace(/[\\/]+/g, "_"));
        const ok = await ui.run(() => tc.dirCreate(target), t("folderCreated"));
        if (ok === undefined) return;
        await qc.invalidateQueries({ queryKey: keys.files(path) });
        setPath(target);
    };
    const isPicked = (p: string) => picked.some((x) => x.path === p);
    const togglePick = (p: string, entry: FileEntry) =>
        setPicked((cur) => (cur.some((x) => x.path === p) ? cur.filter((x) => x.path !== p) : [...cur, { path: p, entry }]));
    const files = useFiles(path);
    const qc = useQueryClient();
    usePrefetchSubfolders(path, open ? files.data : undefined);
    const prefetch = (p: string) => qc.prefetchQuery({ queryKey: keys.files(p), queryFn: () => tc.files(p), staleTime: 30_000 });
    const pickable = (x: FileEntry) => x.isDir || (!folderMode && (multi ? isTaf(x.name) || isAudio(x.name) : isTaf(x.name) || isTap(x.name)));
    const deepSearch = useDeepSearch(path, filter, deep);
    const pick = (p: string, x: FileEntry) => {
        if (multi) return togglePick(p, x);
        onPick?.("lib://" + p.replace(/^\//, ""));
        onClose();
    };
    const f = filter.trim().toLowerCase();
    const list = (files.data ?? [])
        .filter((x) => x.name !== "." && x.name !== "..")
        .filter(pickable)
        .filter((x) => !f || x.name.toLowerCase().includes(f))
        .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, undefined, { numeric: true }));

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={title ?? t(folderMode ? "chooseFolder" : "chooseContent")}
            full
            footer={
                multi ? (
                    <button
                        className="btn primary"
                        disabled={!picked.length}
                        onClick={() => {
                            onPickMany?.(picked);
                            onClose();
                        }}
                    >
                        {picked.length ? t("addN", { n: picked.length }) : t("chooseFiles")}
                    </button>
                ) : folderMode ? (
                    <button
                        className="btn primary"
                        onClick={() => {
                            onPick?.(path);
                            onClose();
                        }}
                    >
                        {t("chooseThisFolder")}
                    </button>
                ) : undefined
            }
        >
            <div className="row-gap" style={{ marginBottom: 10 }}>
                {path !== "/" && (
                    <button className="icon-btn filled" onClick={() => setPath(parentPath(path))} aria-label={t("back")}>
                        <ChevronLeft size={20} />
                    </button>
                )}
                <div className="grow mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t("library")}
                    {path === "/" ? "" : path}
                </div>
                {folderMode && (
                    <button className="btn small soft" onClick={newFolder}>
                        <FolderPlus size={16} />
                        {t("newFolder")}
                    </button>
                )}
            </div>
            <div className="toolbar" style={{ marginBottom: 12 }}>
                <SearchField value={filter} onChange={setFilter} placeholder={deep ? t("searchSubfoldersPlaceholder") : t("filterFolder")} />
                <button
                    className={`icon-btn filled ${deep ? "on" : ""}`}
                    onClick={() => {
                        setDeep(!deep);
                        setPref("lib.deep", deep ? "" : "1");
                    }}
                    aria-pressed={deep}
                    aria-label={t("searchSubfolders")}
                    title={t("searchSubfolders")}
                >
                    <FolderTree size={19} />
                </button>
            </div>
            {deepSearch.active && (
                <DeepResults
                    loading={deepSearch.loading}
                    hits={deepSearch.hits.filter(({ entry }) => pickable(entry))}
                    root={path}
                    onOpen={(p, x) => {
                        if (!x.isDir) return pick(p, x);
                        setFilter("");
                        setPath(p);
                    }}
                    right={(p, x) =>
                        multi && !x.isDir ? (
                            <span className={`select-box ${isPicked(p) ? "checked" : ""}`} style={{ position: "static", opacity: 1 }}>
                                {isPicked(p) && <Check size={15} strokeWidth={3} />}
                            </span>
                        ) : undefined
                    }
                />
            )}
            {!deepSearch.active && files.isLoading && <Loading />}
            {!deepSearch.active && files.error && <ErrorBox error={files.error} retry={() => files.refetch()} />}
            {!deepSearch.active && files.data && list.length === 0 && <Empty icon={<Folder size={28} />} title={t("folderEmpty")} />}
            {!deepSearch.active && list.length > 0 && (
                <div className="list">
                    {list.map((x) => {
                        const p = joinPath(path, x.name);
                        return x.isDir ? (
                            <div key={x.name} className="row-wrap" onPointerEnter={() => prefetch(p)} onTouchStart={() => prefetch(p)}>
                                <Row
                                    leading={
                                        <span className="file-icon folder">
                                            <Folder size={20} />
                                        </span>
                                    }
                                    title={x.name}
                                    onClick={() => {
                                        setFilter("");
                                        setPath(p);
                                    }}
                                    chevron
                                />
                            </div>
                        ) : (
                            <Row
                                key={x.name}
                                leading={
                                    x.tonieInfo?.picture ? (
                                        <span className="file-icon" style={{ width: 48, height: 48 }}>
                                            <img src={backendUrl(x.tonieInfo.picture)} alt="" loading="lazy" />
                                        </span>
                                    ) : (
                                        <span className="file-icon taf">
                                            {isTap(x.name) ? <ListMusic size={20} /> : <FileAudio size={20} />}
                                        </span>
                                    )
                                }
                                title={x.tonieInfo?.series ? `${x.tonieInfo.series}${x.tonieInfo.episode ? " – " + x.tonieInfo.episode : ""}` : x.name}
                                sub={[lengthText(x.tafHeader?.lengthSeconds), bytes(x.size)].filter(Boolean).join(" · ")}
                                onClick={() => pick(p, x)}
                                chevron={false}
                                right={
                                    multi ? (
                                        <span className={`select-box ${isPicked(p) ? "checked" : ""}`} style={{ position: "static", opacity: 1 }}>
                                            {isPicked(p) && <Check size={15} strokeWidth={3} />}
                                        </span>
                                    ) : undefined
                                }
                            />
                        );
                    })}
                </div>
            )}
        </Sheet>
    );
}
