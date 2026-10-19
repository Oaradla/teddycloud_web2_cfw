import { useQueryClient } from "@tanstack/react-query";
import {
    ArrowRightLeft,
    Check,
    CheckSquare,
    Disc3,
    Download,
    File as FileIcon,
    FileAudio,
    Folder,
    FolderPlus,
    Image as ImageIcon,
    Info,
    ImagePlus,
    LayoutGrid,
    List,
    ListMusic,
    MoreHorizontal,
    Pencil,
    Play,
    Plus,
    SlidersHorizontal,
    Trash2,
    Upload,
    Wand2,
    X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { backendUrl } from "../../api/client";
import { tc } from "../../api/tc";
import type { FileEntry } from "../../api/types";
import { ago, baseName, bytes, isAudio, isImage, isTaf, isTap, joinPath, lengthText, stripExt } from "../../lib/format";
import { t } from "../../lib/i18n";
import { filePlayItem, libraryFileUrl } from "../../lib/play";
import { getPref, setPref } from "../../lib/prefs";
import { keys, useFiles, useInvalidateTags, usePrefetchSubfolders } from "../../lib/queries";
import { usePlayer } from "../../player/Player";
import { Empty, ErrorBox, Loading, Page, Row, SearchField, Spinner, useUi } from "../../ui/kit";
import { ChoiceGroup, Popover } from "../../ui/Popover";
import { ModelEditor, ModelEditorStart } from "../models/ModelEditor";
import { TagPicker } from "../tonies/TagPicker";
import { DownloadSheet } from "./DownloadSheet";
import { FileDetailsSheet } from "./FileDetailsSheet";
import { PlaylistEditor, PlaylistStart } from "./PlaylistEditor";
import { useSelection } from "../../ui/useSelection";
import { LibraryPicker } from "./LibraryPicker";

type Sort = "name" | "date" | "size" | "length";
type Dir = "asc" | "desc";
type View = "list" | "grid";
type Show = "all" | "tonie" | "audio" | "unheard";

const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** the title shown for a file: what the server knows about it, else the file name */
const fileTitle = (x: FileEntry, names: boolean) =>
    !names && x.tonieInfo?.series ? `${x.tonieInfo.series}${x.tonieInfo.episode ? " – " + x.tonieInfo.episode : ""}` : x.name;

export function LibraryPage() {
    const [params, setParams] = useSearchParams();
    const path = params.get("path") || "/";
    const files = useFiles(path);
    usePrefetchSubfolders(path, files.data);
    const [filter, setFilter] = useState("");
    const [sort, setSort] = useState<Sort>(() => getPref("lib.sort", "name") as Sort);
    const [dir, setDir] = useState<Dir>(() => getPref("lib.dir", "asc") as Dir);
    const [view, setView] = useState<View>(() => getPref("lib.view", "list") as View);
    const [show, setShow] = useState<Show>("all");
    const [names, setNames] = useState(() => getPref("lib.names", "") === "1");
    const [menu, setMenu] = useState(false);
    const menuBtn = useRef<HTMLButtonElement>(null);
    const [assignFor, setAssignFor] = useState<string | null>(null);
    const [moveFor, setMoveFor] = useState<FileEntry | null>(null);
    const [coverFor, setCoverFor] = useState<ModelEditorStart | null>(null);
    const [details, setDetails] = useState<FileEntry | null>(null);
    const [oggFor, setOggFor] = useState<FileEntry | null>(null);
    const [playlist, setPlaylist] = useState<PlaylistStart | null>(null);
    const ui = useUi();
    const qc = useQueryClient();
    const player = usePlayer();
    const navigate = useNavigate();
    const invalidateTags = useInvalidateTags();

    const pref =
        <T extends string>(key: string, set: (v: T) => void) =>
        (v: T) => {
            set(v);
            setPref(key, v);
        };

    const go = (p: string) => {
        setFilter("");
        setParams(p === "/" ? {} : { path: p });
    };
    const prefetch = (p: string) => qc.prefetchQuery({ queryKey: keys.files(p), queryFn: () => tc.files(p), staleTime: 30_000 });
    const refresh = () => qc.invalidateQueries({ queryKey: ["files"] });

    const list = useMemo(() => {
        const f = filter.trim().toLowerCase();
        const sign = dir === "asc" ? 1 : -1;
        return (files.data ?? [])
            .filter((x) => x.name !== "." && x.name !== "..")
            .filter((x) => {
                if (show === "tonie") return x.isDir || isTaf(x.name) || isTap(x.name);
                if (show === "audio") return x.isDir || isAudio(x.name);
                if (show === "unheard") return x.isDir || (isTaf(x.name) && !x.listened);
                return true;
            })
            .filter((x) => !f || `${x.name} ${x.tonieInfo?.series ?? ""} ${x.tonieInfo?.episode ?? ""}`.toLowerCase().includes(f))
            .sort((a, b) => {
                if (a.isDir !== b.isDir) return Number(b.isDir) - Number(a.isDir);
                let r = 0;
                if (sort === "date") r = a.date - b.date;
                else if (sort === "size") r = a.size - b.size;
                else if (sort === "length") r = (a.tafHeader?.lengthSeconds ?? 0) - (b.tafHeader?.lengthSeconds ?? 0);
                return sign * (r || cmp(fileTitle(a, names), fileTitle(b, names)));
            });
    }, [files.data, filter, sort, dir, show, names]);

    const crumbs = path.split("/").filter(Boolean);

    const newFolder = async () => {
        const name = await ui.prompt({ title: t("newFolder"), label: t("name") });
        if (!name) return;
        await ui.run(() => tc.dirCreate(joinPath(path, name)), t("folderCreated"));
        refresh();
    };

    const rename = async (x: FileEntry) => {
        const name = await ui.prompt({ title: t("rename"), label: t("name"), value: x.name });
        if (!name || name === x.name) return;
        await ui.run(() => tc.fileMove(joinPath(path, x.name), joinPath(path, name)), t("renamed"));
        refresh();
    };

    /** custom models whose audio id belongs to one of these TAFs */
    const modelsOf = async (entries: FileEntry[]) => {
        const ids = new Set(entries.map((e) => e.tafHeader?.audioId).filter(Boolean).map(String));
        if (!ids.size) return [];
        const models = await tc.customModels().catch(() => []);
        return models.filter((m) => m.audio_id.some((id) => ids.has(String(id))));
    };

    /** deletes files and folders (with content), asking for the custom models that belong to them */
    const removeMany = async (xs: FileEntry[]) => {
        const all: FileEntry[] = [];
        let count = 0;
        for (const x of xs) {
            all.push(x);
            if (x.isDir) {
                const inside = await tc.walkTree(joinPath(path, x.name)).catch(() => []);
                count += inside.length;
                all.push(...inside.map((i) => i.entry));
            }
        }
        const models = await modelsOf(all);
        const one = xs.length === 1 ? xs[0] : null;
        const { ok, checked } = await ui.confirmCheck({
            title: one ? (one.isDir ? t("deleteFolder") : t("deleteFile")) : t("deleteN", { n: xs.length }),
            text: one ? (count ? t("deleteFolderText", { name: one.name, n: count }) : t("deleteText", { name: one.name })) : t("deleteNText"),
            confirm: t("delete"),
            danger: true,
            check: models.length ? { label: t("deleteModelsToo", { n: models.length }), value: true } : undefined,
        });
        if (!ok) return;
        let failed = 0;
        for (const x of xs) {
            const p = joinPath(path, x.name);
            await (x.isDir ? tc.deleteTree(p) : tc.fileDelete(p, false)).catch(() => failed++);
        }
        if (checked && models.length) {
            for (const m of models) await tc.deleteModel(m.model).catch(() => failed++);
            qc.invalidateQueries({ queryKey: ["customModels"] });
            invalidateTags();
        }
        if (failed) ui.toast("error", t("bulkFailed", { n: failed }));
        else ui.toast("ok", t("deleted"));
        refresh();
    };
    const remove = (x: FileEntry) => removeMany([x]);

    const move = async (target: string) => {
        if (!moveFor) return;
        const from = joinPath(path, moveFor.name);
        const to = joinPath(target, moveFor.name);
        if (from === to) return;
        await ui.run(() => tc.fileMove(from, to), t("moved"));
        refresh();
    };

    const download = (x: FileEntry) => {
        const a = document.createElement("a");
        a.href = backendUrl(libraryFileUrl(joinPath(path, x.name), false));
        a.download = x.name;
        a.click();
    };

    const encode = async (x: FileEntry) => {
        const name = await ui.prompt({ title: t("convertToTaf"), label: t("targetFile"), value: stripExt(x.name) + ".taf" });
        if (!name) return;
        ui.toast("info", t("converting"));
        await ui.run(() => tc.encodeFiles([joinPath(path, x.name)], joinPath(path, name.endsWith(".taf") ? name : name + ".taf")), t("converted"));
        refresh();
    };

    const open = (x: FileEntry) => {
        const p = joinPath(path, x.name);
        if (x.isDir) return go(p);
        if (isImage(x.name)) return window.open(backendUrl(libraryFileUrl(p, false)), "_blank");
        setDetails(x);
    };

    const actions = (x: FileEntry) => {
        const p = joinPath(path, x.name);
        const playable = isTaf(x.name) || isAudio(x.name);
        const tonieFile = isTaf(x.name) || isTap(x.name);
        ui.actions(x.name, [
            { label: t("details"), icon: <Info size={17} />, onSelect: () => setDetails(x), hidden: x.isDir },
            { label: t("play"), icon: <Play size={17} />, onSelect: () => player.play(filePlayItem(p, x)), hidden: !playable },
            { label: t("assignToTonie"), icon: <Disc3 size={17} />, onSelect: () => setAssignFor(p), hidden: !tonieFile },
            { label: t("editPlaylist"), icon: <ListMusic size={17} />, onSelect: () => setPlaylist({ edit: p }), hidden: !isTap(x.name) },
            {
                label: x.tonieInfo?.series ? t("changeCover") : t("setCover"),
                icon: <ImagePlus size={17} />,
                onSelect: () => setCoverFor({ mode: "cover", file: p }),
                hidden: !tonieFile,
            },
            { label: t("convertToTaf"), icon: <Wand2 size={17} />, onSelect: () => encode(x), hidden: !isAudio(x.name) },
            { label: t("rename"), icon: <Pencil size={17} />, onSelect: () => rename(x) },
            { label: t("move"), icon: <ArrowRightLeft size={17} />, onSelect: () => setMoveFor(x) },
            { label: t("download"), icon: <Download size={17} />, onSelect: () => download(x), hidden: x.isDir },
            { label: t("downloadOgg"), icon: <Download size={17} />, onSelect: () => setOggFor(x), hidden: !isTaf(x.name) },
            { label: t("delete"), icon: <Trash2 size={17} />, danger: true, onSelect: () => remove(x) },
        ]);
    };

    const icon = (x: FileEntry, size = 20) => {
        if (x.isDir) return <Folder size={size} />;
        if (isTaf(x.name)) return <FileAudio size={size} />;
        if (isTap(x.name)) return <ListMusic size={size} />;
        if (isImage(x.name)) return <ImageIcon size={size} />;
        if (isAudio(x.name)) return <FileAudio size={size} />;
        return <FileIcon size={size} />;
    };
    const kind = (x: FileEntry) => (x.isDir ? "folder" : isTaf(x.name) || isTap(x.name) ? "taf" : "");
    const sub = (x: FileEntry) =>
        x.isDir
            ? ago(x.date * 1000)
            : [lengthText(x.tafHeader?.lengthSeconds), bytes(x.size), sort === "date" ? ago(x.date * 1000) : ""].filter(Boolean).join(" · ");
    const dirProps = (x: FileEntry) =>
        x.isDir ? { onPointerEnter: () => prefetch(joinPath(path, x.name)), onTouchStart: () => prefetch(joinPath(path, x.name)) } : {};
    const moreBtn = (x: FileEntry, className: string, size: number) => (
        <button
            className={className}
            aria-label={t("more")}
            onClick={(e) => {
                e.stopPropagation();
                actions(x);
            }}
        >
            <MoreHorizontal size={size} />
        </button>
    );

    const byName = new Map(list.map((x) => [x.name, x]));
    const sel = useSelection((name) => {
        const x = byName.get(name);
        if (x) open(x);
    }, list.map((x) => x.name));
    const selectedFiles = list.filter((x) => sel.selected.has(x.name));
    const playlistFiles = selectedFiles.filter((x) => isTaf(x.name) || isAudio(x.name));
    const checkbox = (name: string) => (
        <button
            type="button"
            className={`select-box ${sel.selected.has(name) ? "checked" : ""}`}
            aria-label={t("select")}
            onClick={(e) => {
                e.stopPropagation();
                sel.toggle(name, e.shiftKey);
            }}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {sel.selected.has(name) && <Check size={15} strokeWidth={3} />}
        </button>
    );
    const deleteSelected = async () => {
        await removeMany(selectedFiles);
        sel.clear();
    };

    const showLabels: Record<Show, string> = { all: t("all"), tonie: t("tonieFiles"), audio: t("audioFiles"), unheard: t("unheard") };
    const active = show !== "all" ? [{ label: showLabels[show], clear: () => setShow("all") }] : [];

    return (
        <Page
            title={path === "/" ? t("library") : baseName(path)}
            back={path === "/" ? undefined : true}
            right={
                <>
                    {files.isFetching && files.data && (
                        <span className="refreshing" title={t("refreshing")}>
                            <Spinner small />
                        </span>
                    )}
                    {sel.selecting ? (
                        <button className="btn ghost" onClick={sel.clear}>
                            {t("done")}
                        </button>
                    ) : (
                        <>
                            <button className="icon-btn" onClick={() => sel.setSelecting(true)} aria-label={t("select")} title={t("selectHint")}>
                                <CheckSquare size={20} />
                            </button>
                            <button
                                className="icon-btn"
                                aria-label={t("create")}
                                onClick={() =>
                                    ui.actions(t("create"), [
                                        { label: t("newFolder"), icon: <FolderPlus size={17} />, onSelect: newFolder },
                                        { label: t("newPlaylist"), icon: <ListMusic size={17} />, onSelect: () => setPlaylist({ dir: path }) },
                                    ])
                                }
                            >
                                <Plus size={22} />
                            </button>
                        </>
                    )}
                    <button className="icon-btn" onClick={() => navigate(`/upload?path=${encodeURIComponent(path)}`)} aria-label={t("upload")}>
                        <Upload size={21} />
                    </button>
                </>
            }
        >
            <div className="sticky-tools">
                {path !== "/" && (
                    <div className="breadcrumbs">
                        <button onClick={() => go("/")}>{t("library")}</button>
                        {crumbs.map((c, i) => (
                            <span key={i} className="row-gap" style={{ gap: 2 }}>
                                <span className="sep">/</span>
                                <button onClick={() => go("/" + crumbs.slice(0, i + 1).join("/"))}>{c}</button>
                            </span>
                        ))}
                    </div>
                )}
                <div className="toolbar">
                    <SearchField value={filter} onChange={setFilter} placeholder={t("filterFolder")} />
                    <button
                        className="icon-btn filled"
                        onClick={() => pref<View>("lib.view", setView)(view === "list" ? "grid" : "list")}
                        aria-label={view === "list" ? t("viewGrid") : t("viewList")}
                    >
                        {view === "list" ? <LayoutGrid size={19} /> : <List size={19} />}
                    </button>
                    <button ref={menuBtn} className="icon-btn filled filter-btn" onClick={() => setMenu((v) => !v)} aria-label={t("filterAndView")}>
                        <SlidersHorizontal size={19} />
                        {active.length > 0 && <span className="count">{active.length}</span>}
                    </button>
                </div>
                {active.length > 0 && (
                    <div className="active-filters">
                        {active.map((a) => (
                            <button key={a.label} className="chip" onClick={a.clear}>
                                {a.label}
                                <X size={14} />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <Popover
                open={menu}
                onClose={() => setMenu(false)}
                anchor={menuBtn}
                title={t("filterAndView")}
                footer={
                    <button className="btn primary" onClick={() => setMenu(false)}>
                        {t("showN", { n: list.length })}
                    </button>
                }
            >
                <ChoiceGroup
                    label={t("view")}
                    value={view}
                    onChange={pref<View>("lib.view", setView)}
                    options={[
                        { value: "list", label: <><List size={15} /> {t("viewList")}</> },
                        { value: "grid", label: <><LayoutGrid size={15} /> {t("viewGrid")}</> },
                    ]}
                />
                <ChoiceGroup
                    label={t("sortBy")}
                    value={sort}
                    onChange={pref<Sort>("lib.sort", setSort)}
                    options={[
                        { value: "name", label: t("name") },
                        { value: "date", label: t("date") },
                        { value: "size", label: t("size") },
                        { value: "length", label: t("length") },
                    ]}
                />
                <ChoiceGroup
                    label={t("order")}
                    value={dir}
                    onChange={pref<Dir>("lib.dir", setDir)}
                    options={[
                        { value: "asc", label: sort === "name" ? "A–Z" : t("ascending") },
                        { value: "desc", label: sort === "name" ? "Z–A" : t("descending") },
                    ]}
                />
                <ChoiceGroup
                    label={t("showFiles")}
                    value={show}
                    onChange={setShow}
                    options={(Object.keys(showLabels) as Show[]).map((k) => ({ value: k, label: showLabels[k] }))}
                />
                <ChoiceGroup
                    label={t("titles")}
                    value={names ? "1" : ""}
                    onChange={(v) => {
                        setNames(v === "1");
                        setPref("lib.names", v);
                    }}
                    options={[
                        { value: "", label: t("titlesFromTonie") },
                        { value: "1", label: t("titlesFileNames") },
                    ]}
                />
            </Popover>

            {files.isLoading && <Loading />}
            {files.error && !files.data && <ErrorBox error={files.error} retry={() => files.refetch()} />}
            {files.data && list.length === 0 && (
                <Empty
                    icon={<Folder size={28} />}
                    title={filter || show !== "all" ? t("nothingFound") : t("folderEmpty")}
                    action={
                        !filter &&
                        show === "all" && (
                            <button className="btn primary" onClick={() => navigate(`/upload?path=${encodeURIComponent(path)}`)}>
                                <Upload size={18} />
                                {t("uploadHere")}
                            </button>
                        )
                    }
                />
            )}
            {list.length > 0 && view === "list" && (
                <div className="list">
                    {list.map((x) => (
                        <div key={x.name} className="row-wrap" role="button" tabIndex={0} {...sel.itemProps(x.name)} {...dirProps(x)}>
                            <Row
                                className={sel.selected.has(x.name) ? "checked" : ""}
                                leading={
                                    <>
                                    {sel.selecting && checkbox(x.name)}
                                    {x.tonieInfo?.picture ? (
                                        <span className="file-icon">
                                            <img src={backendUrl(x.tonieInfo.picture)} alt="" loading="lazy" />
                                        </span>
                                    ) : (
                                        <span className={`file-icon ${kind(x)}`}>{icon(x)}</span>
                                    )}
                                    </>
                                }
                                title={fileTitle(x, names)}
                                sub={sub(x)}
                                chevron={x.isDir && !sel.selecting}
                                right={
                                    sel.selecting ? undefined : <>
                                        {(isTaf(x.name) || isAudio(x.name)) && (
                                            <button
                                                className="icon-btn"
                                                aria-label={t("play")}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    player.play(filePlayItem(joinPath(path, x.name), x));
                                                }}
                                            >
                                                <Play size={19} fill="currentColor" />
                                            </button>
                                        )}
                                        {moreBtn(x, "icon-btn muted", 20)}
                                    </>
                                }
                            />
                        </div>
                    ))}
                </div>
            )}
            {list.length > 0 && view === "grid" && (
                <div className={`grid-files ${sel.selecting ? "selecting" : ""}`}>
                    {list.map((x) => (
                        <div
                            key={x.name}
                            className={`file-tile ${sel.selected.has(x.name) ? "checked" : ""}`}
                            role="button"
                            tabIndex={0}
                            {...sel.itemProps(x.name)}
                            {...dirProps(x)}
                        >
                            {checkbox(x.name)}
                            <div className={`pic ${kind(x)}`}>
                                {x.tonieInfo?.picture ? <img src={backendUrl(x.tonieInfo.picture)} alt="" loading="lazy" /> : icon(x, 44)}
                            </div>
                            <div className="meta">
                                <div className="name">{fileTitle(x, names)}</div>
                                <div className="sub">{sub(x)}</div>
                            </div>
                            {!sel.selecting && moreBtn(x, "icon-btn more", 18)}
                        </div>
                    ))}
                </div>
            )}

            {sel.selecting && (
                <div className="select-bar" role="toolbar">
                    <button className="icon-btn" onClick={sel.clear} aria-label={t("cancel")}>
                        <X size={20} />
                    </button>
                    <span className="count">{selectedFiles.length ? t("nSelected", { n: selectedFiles.length }) : t("selectFiles")}</span>
                    <button className="icon-btn" disabled={!selectedFiles.length} onClick={deleteSelected} aria-label={t("delete")}>
                        <Trash2 size={19} />
                    </button>
                    <button
                        className="btn primary small"
                        disabled={!playlistFiles.length}
                        onClick={() => {
                            setPlaylist({ dir: path, files: playlistFiles.map((x) => ({ path: joinPath(path, x.name), entry: x })) });
                            sel.clear();
                        }}
                    >
                        <ListMusic size={15} />
                        {t("toPlaylist")}
                    </button>
                </div>
            )}
            <PlaylistEditor start={playlist} onClose={() => setPlaylist(null)} />
            <TagPicker
                open={assignFor !== null}
                onClose={() => setAssignFor(null)}
                title={t("assignToTonie")}
                onPick={async (tag) => {
                    const source = "lib://" + (assignFor ?? "").replace(/^\//, "");
                    await ui.run(() => tc.assignSource(tag, source, tag.overlay || undefined), t("contentAssigned"));
                    invalidateTags();
                }}
            />
            <LibraryPicker open={moveFor !== null} onClose={() => setMoveFor(null)} folderMode startPath={path} title={t("moveTo")} onPick={move} />
            <ModelEditor start={coverFor} onClose={() => setCoverFor(null)} onSaved={refresh} />
            <DownloadSheet
                open={oggFor !== null}
                onClose={() => setOggFor(null)}
                title={oggFor ? fileTitle(oggFor, false).replace(/\.taf$/i, "") : ""}
                wholeUrl={oggFor ? libraryFileUrl(joinPath(path, oggFor.name), true) : ""}
                trackUrl={oggFor ? (n) => `${libraryFileUrl(joinPath(path, oggFor.name), true)}&tracks=${n}` : undefined}
                chapters={oggFor?.tafHeader?.trackSeconds ?? []}
                chapterTitles={oggFor?.tonieInfo?.tracks ?? []}
            />
            <FileDetailsSheet
                path={path}
                file={details}
                onClose={() => setDetails(null)}
                actions={{
                    assign: () => details && setAssignFor(joinPath(path, details.name)),
                    cover: () => details && setCoverFor({ mode: "cover", file: joinPath(path, details.name) }),
                    rename: () => details && rename(details),
                    move: () => details && setMoveFor(details),
                    download: () => details && download(details),
                    downloadOgg: () => details && setOggFor(details),
                    editPlaylist: () => details && setPlaylist({ edit: joinPath(path, details.name) }),
                    remove: () => details && remove(details),
                }}
            />
        </Page>
    );
}
