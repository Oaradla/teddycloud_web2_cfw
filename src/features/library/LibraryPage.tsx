import { useQuery, useQueryClient } from "@tanstack/react-query";
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
    FolderInput,
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
    Scissors,
    Share2,
    Wrench,
    FolderTree,
    Braces,
    Copy,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { backendUrl } from "../../api/client";
import { tc } from "../../api/tc";
import type { FileEntry } from "../../api/types";
import {
    ago,
    baseName,
    bytes,
    figureTitle,
    isAudio,
    isImage,
    isTaf,
    isTap,
    joinPath,
    lengthText,
    libPath,
    parentPath,
    stripExt,
} from "../../lib/format";
import { ShareSheet, useCanShare, type ShareTarget } from "../users/ShareSheet";
import { t } from "../../lib/i18n";
import { filePlayItem, libraryFileUrl } from "../../lib/play";
import { getPref, setPref } from "../../lib/prefs";
import { useAccess } from "../../lib/access";
import {
    keys,
    useAllTags,
    useFiles,
    useInvalidateTags,
    usePrefetchSubfolders,
} from "../../lib/queries";
import { usePlayer } from "../../player/Player";
import { Empty, ErrorBox, Loading, Page, Row, SearchField, Spinner, useUi } from "../../ui/kit";
import { ChoiceGroup, Popover } from "../../ui/Popover";
import { ModelEditor, ModelEditorStart } from "../models/ModelEditor";
import { TagPicker } from "../tonies/TagPicker";
import { DownloadSheet } from "./DownloadSheet";
import { FileDetailsSheet } from "./FileDetailsSheet";
import { PlaylistEditor, PlaylistStart } from "./PlaylistEditor";
import { Lightbox, LightboxItem } from "../../ui/Lightbox";
import { useSelection } from "../../ui/useSelection";
import { confirmReplace } from "../upload/confirmReplace";
import { LibraryPicker } from "./LibraryPicker";
import { UnusedTafsSheet } from "./UnusedTafsSheet";
import { useDeepSearch } from "../../lib/deepSearch";
import { DeepResults } from "./DeepResults";
import { TextSheet } from "../../ui/TextSheet";

/** entries for tonies.custom.json from the TAF headers, to fill in and paste */
const customJsonSnippet = (files: FileEntry[]) =>
    files
        .filter((f) => isTaf(f.name) && f.tafHeader?.audioId && f.tafHeader.sha1Hash)
        .map((f, i) =>
            JSON.stringify({
                no: String(i + 1),
                model: f.tonieInfo?.model || "CUST-",
                audio_id: [String(f.tafHeader!.audioId)],
                hash: [f.tafHeader!.sha1Hash],
                title: stripExt(f.name),
                series: f.tonieInfo?.series || "",
                episodes: f.tonieInfo?.episode || "",
                tracks: f.tonieInfo?.tracks || [],
                release: "",
                language: f.tonieInfo?.language || "",
                category: "",
                pic: f.tonieInfo?.picture || "",
            }),
        )
        .join(",\n");

type Sort = "name" | "date" | "size" | "length";
type Dir = "asc" | "desc";
type View = "list" | "grid";
type Show = "all" | "tonie" | "audio" | "unheard";

const cmp = (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** the title shown for a file: what the server knows about it, else the file name */
const fileTitle = (x: FileEntry, names: boolean) =>
    !names && x.tonieInfo?.series
        ? `${x.tonieInfo.series}${x.tonieInfo.episode ? " – " + x.tonieInfo.episode : ""}`
        : x.name;

export function LibraryPage() {
    const [params, setParams] = useSearchParams();
    const path = params.get("path") || "/";
    const files = useFiles(path);
    usePrefetchSubfolders(path, files.data);
    const [filter, setFilter] = useState("");
    const [sort, setSort] = useState<Sort>(() => getPref("lib.sort", "name") as Sort);
    const [zoom, setZoom] = useState<LightboxItem | null>(null);
    const canSplit = useQuery({
        queryKey: ["hasTapBuild"],
        queryFn: tc.hasTapBuild,
        staleTime: Infinity,
    });
    const [dir, setDir] = useState<Dir>(() => getPref("lib.dir", "asc") as Dir);
    const [view, setView] = useState<View>(() => getPref("lib.view", "list") as View);
    const [show, setShow] = useState<Show>("all");
    const [names, setNames] = useState(() => getPref("lib.names", "") === "1");
    const [deep, setDeep] = useState(() => getPref("lib.deep", "") === "1");
    const deepSearch = useDeepSearch(path, filter, deep);
    const [menu, setMenu] = useState(false);
    const menuBtn = useRef<HTMLButtonElement>(null);
    const [assignFor, setAssignFor] = useState<string | null>(null);
    const [moveFor, setMoveFor] = useState<FileEntry[] | null>(null);
    const [splitFor, setSplitFor] = useState<FileEntry | null>(null);
    const [coverFor, setCoverFor] = useState<ModelEditorStart | null>(null);
    const [details, setDetails] = useState<FileEntry | null>(null);
    /** the search a hit was opened from, to return to when its details are closed */
    const [searchBack, setSearchBack] = useState<{ path: string; filter: string } | null>(null);
    const [oggFor, setOggFor] = useState<FileEntry | null>(null);
    const [playlist, setPlaylist] = useState<PlaylistStart | null>(null);
    const [text, setText] = useState<{ title: string; text: string; hint?: string } | null>(null);
    const [unusedOpen, setUnusedOpen] = useState(false);
    /** a move or delete runs: no second one on the same items */
    const [busy, setBusy] = useState(false);
    const ui = useUi();
    const access = useAccess();
    const qc = useQueryClient();
    const canShare = useCanShare();
    const [shareFor, setShareFor] = useState<ShareTarget | null>(null);
    const player = usePlayer();
    const navigate = useNavigate();
    const invalidateTags = useInvalidateTags();
    const allTags = useAllTags();
    const writable = access.can("folder", path, "folder.write");
    const mayWrite = (folder: string) => access.can("folder", folder, "folder.write");
    const trimSlashes = (folder: string) => folder.replace(/^\/+|\/+$/g, "");
    // a TAF is split into any folder the user may write
    const anyFolderWritable =
        access.admin ||
        Object.values(access.mine.folders).some((f) => f.rights?.includes("folder.write"));

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
    const prefetch = (p: string) =>
        qc.prefetchQuery({
            queryKey: keys.files(p),
            queryFn: () => tc.files(p),
            staleTime: 30_000,
        });
    const refresh = () => {
        qc.invalidateQueries({ queryKey: ["files"] });
        qc.invalidateQueries({ queryKey: ["walkTree"] });
    };

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
            .filter(
                (x) =>
                    !f ||
                    `${x.name} ${x.tonieInfo?.series ?? ""} ${x.tonieInfo?.episode ?? ""}`
                        .toLowerCase()
                        .includes(f),
            )
            .sort((a, b) => {
                // playlists first (a folder's playlist is what one looks for), then folders, then files
                const rank = (x: FileEntry) => (!x.isDir && isTap(x.name) ? 0 : x.isDir ? 1 : 2);
                if (rank(a) !== rank(b)) return rank(a) - rank(b);
                let r = 0;
                if (sort === "date") r = a.date - b.date;
                else if (sort === "size") r = a.size - b.size;
                else if (sort === "length")
                    r = (a.tafHeader?.lengthSeconds ?? 0) - (b.tafHeader?.lengthSeconds ?? 0);
                return sign * (r || cmp(fileTitle(a, names), fileTitle(b, names)));
            });
    }, [files.data, filter, sort, dir, show, names]);

    const crumbs = path.split("/").filter(Boolean);

    /** a name within this folder: no slashes, not "." or ".." */
    const entryName = (s: string | null) =>
        (s ?? "")
            .replace(/[\\/]+/g, "_")
            .replace(/^\.+$/, "")
            .trim();

    const newFolder = async () => {
        const name = entryName(
            await ui.prompt({ title: t("library.newFolder"), label: t("common.name") }),
        );
        if (!name) return;
        await ui.run(() => tc.dirCreate(joinPath(path, name)), t("library.folderCreated"));
        refresh();
    };

    const rename = async (x: FileEntry) => {
        const name = entryName(
            await ui.prompt({
                title: t("library.rename"),
                label: t("common.name"),
                value: x.name,
            }),
        );
        if (!name || name === x.name) return;
        await ui.run(
            () => tc.fileMove(joinPath(path, x.name), joinPath(path, name)),
            t("library.renamed"),
        );
        refresh();
    };

    /** deletes files and folders (with content), asking for the custom tonies used only by them */
    const removeMany = async (xs: FileEntry[]) => {
        if (busy) return;
        let count = 0;
        for (const x of xs)
            if (x.isDir)
                count += (await tc.walkTree(joinPath(path, x.name)).catch(() => [])).length;
        const models = await tc
            .orphanModels(xs.map((x) => joinPath(path, x.name)))
            .catch(() => [] as string[]);
        const one = xs.length === 1 ? xs[0] : null;
        const gone = xs.map((x) => joinPath(path, x.name).replace(/^\//, ""));
        const users = new Set(
            (allTags.data ?? [])
                .filter((x) => {
                    const lib = libPath(x.source);
                    return gone.some((g) => lib === g || lib.startsWith(g + "/"));
                })
                .map(figureTitle),
        );
        const { ok, checked } = await ui.confirmCheck({
            title: one
                ? one.isDir
                    ? t("library.deleteFolder")
                    : t("library.deleteFile")
                : t("library.deleteN", { n: xs.length }),
            text:
                (one
                    ? count
                        ? t("library.deleteFolderText", { name: one.name, n: count })
                        : t("common.deleteText", { name: one.name })
                    : t("library.deleteNText")) +
                (users.size
                    ? " " + t("library.deleteUsedBy", { names: [...users].join(", ") })
                    : ""),
            confirm: t("common.delete"),
            danger: true,
            check: models.length
                ? { label: t("library.deleteModelsToo", { n: models.length }), value: true }
                : undefined,
        });
        if (!ok) return;
        setBusy(true);
        let failed = 0;
        for (const x of xs) {
            const p = joinPath(path, x.name);
            await (
                x.isDir
                    ? tc.deleteTree(p, "library", checked)
                    : tc.fileDelete(p, false, "library", undefined, checked)
            ).catch(() => failed++);
        }
        setBusy(false);
        if (checked && models.length) {
            qc.invalidateQueries({ queryKey: ["customModels"] });
            qc.invalidateQueries({ queryKey: ["aclMine"] });
        }
        invalidateTags();
        if (failed) ui.toast("error", t("library.failedN", { count: failed }));
        else ui.toast("ok", t("common.deleted"));
        refresh();
    };
    const remove = (x: FileEntry) => removeMany([x]);

    /** moves the items; the ones that failed stay selected, each with the server's reason */
    const move = async (target: string) => {
        if (!moveFor || busy) return;
        if (joinPath(target) === joinPath(path))
            return ui.toast("info", t("library.alreadyInFolder"));
        const into = (x: FileEntry) =>
            `${joinPath(target)}/`.startsWith(`${joinPath(path, x.name)}/`);
        if (moveFor.some((x) => x.isDir && into(x)))
            return ui.toast("error", t("library.moveIntoItself"));
        const fileNames = new Set(moveFor.filter((x) => !x.isDir).map((x) => x.name));
        // the server moves a file's "<file>.json" along with it
        const items = moveFor.filter(
            (x) => !(x.name.endsWith(".json") && fileNames.has(x.name.slice(0, -5))),
        );
        const failed: { name: string; reason: string }[] = [];
        setBusy(true);
        for (const x of items)
            await tc
                .fileMove(joinPath(path, x.name), joinPath(target, x.name))
                .catch((e) => failed.push({ name: x.name, reason: String(e?.message ?? e) }));
        setBusy(false);
        refresh();
        if (failed.length && sel.selecting) sel.setSelected(new Set(failed.map((f) => f.name)));
        else sel.clear();
        if (!failed.length) ui.toast("ok", t("library.moved"));
        else if (items.length === 1) ui.toast("error", t("common.actionFailed"), failed[0].reason);
        else
            ui.toast(
                "error",
                t("library.failedN", { count: failed.length }),
                failed.map((f) => `${f.name}: ${f.reason}`).join("\n"),
            );
    };

    const download = (x: FileEntry) => {
        const a = document.createElement("a");
        a.href = backendUrl(libraryFileUrl(joinPath(path, x.name), false));
        a.download = x.name;
        a.click();
    };

    const encode = async (x: FileEntry) => {
        const name = await ui.prompt({
            title: t("library.convertToTaf"),
            label: t("library.targetFile"),
            value: stripExt(x.name) + ".taf",
        });
        if (!name) return;
        ui.toast("info", t("library.converting"));
        await ui.run(
            () =>
                tc.encodeFiles(
                    [joinPath(path, x.name)],
                    joinPath(path, name.endsWith(".taf") ? name : name + ".taf"),
                ),
            t("library.converted"),
        );
        refresh();
    };

    const open = (x: FileEntry) => {
        const p = joinPath(path, x.name);
        if (x.isDir) return go(p);
        if (isImage(x.name))
            return setZoom({ src: backendUrl(libraryFileUrl(p, false)), alt: x.name });
        if (isTap(x.name)) return setPlaylist({ edit: p });
        setDetails(x);
    };

    /** every chapter as a TAF of its own and a playlist, in a folder named like the TAF: next to
     *  the TAF, which moves there too, or in a chosen folder, and the TAF stays where it is */
    const split = async (x: FileEntry) => {
        const n = x.tafHeader?.trackSeconds?.length ?? 0;
        const dialog = { title: t("library.splitTaf"), confirm: t("library.splitTafRun") };
        const { ok, checked: elsewhere } = writable
            ? await ui.confirmCheck({
                  ...dialog,
                  text: t("library.splitTafText", { n }),
                  check: { label: t("library.splitElsewhere"), value: false },
              })
            : {
                  ok: await ui.confirm({ ...dialog, text: t("library.splitTafTextKeep", { n }) }),
                  checked: true,
              };
        if (!ok) return;
        if (elsewhere) setSplitFor(x);
        else runSplit(x);
    };

    const runSplit = async (x: FileEntry, target?: string) => {
        ui.toast("info", t("library.splitting"));
        const r = await ui.run(
            () => tc.splitTaf(joinPath(path, x.name), [], target),
            t("library.splitDone"),
        );
        refresh();
        if (r) go("/" + r.folder);
    };

    const showJson = async (x: FileEntry) => {
        const data = await ui.run(() => tc.readTap(joinPath(path, x.name)));
        if (data) setText({ title: x.name, text: JSON.stringify(data, null, 2) });
    };

    /** a copy of a playlist; it builds a TAF of its own */
    const duplicateTap = async (x: FileEntry) => {
        const name = await ui.prompt({
            title: t("library.duplicatePlaylist"),
            label: t("common.name"),
            value: `${stripExt(x.name)} (2).tap`,
        });
        if (!name) return;
        const fileName = name.endsWith(".tap") ? name : name + ".tap";
        if (!(await confirmReplace(ui, path, [fileName]))) return;
        await ui.run(async () => {
            const tap = await tc.readTap(joinPath(path, x.name));
            const copy = {
                ...tap,
                audio_id: Math.floor(Date.now() / 1000),
                filepath: "lib://" + joinPath(path, fileName + ".taf").replace(/^\//, ""),
            };
            await tc.saveTap(copy, path, fileName);
        }, t("library.duplicated"));
        refresh();
    };

    const snippet = (xs: FileEntry[]) =>
        setText({
            title: t("library.customJsonSnippet"),
            text: customJsonSnippet(xs),
            hint: t("library.customJsonSnippetHint"),
        });

    const actions = (x: FileEntry) => {
        const p = joinPath(path, x.name);
        const playable = isTaf(x.name) || isAudio(x.name);
        const tonieFile = isTaf(x.name) || isTap(x.name);
        ui.actions(x.name, [
            {
                label: t("library.details"),
                icon: <Info size={17} />,
                onSelect: () => setDetails(x),
                hidden: x.isDir,
            },
            {
                label: t("common.play"),
                icon: <Play size={17} />,
                onSelect: () => player.play(filePlayItem(p, x)),
                hidden: !playable,
            },
            {
                label: t("common.assignToTonie"),
                icon: <Disc3 size={17} />,
                onSelect: () => setAssignFor(p),
                hidden: !tonieFile,
            },
            {
                label: t("library.editPlaylist"),
                icon: <ListMusic size={17} />,
                onSelect: () => setPlaylist({ edit: p }),
                hidden: !isTap(x.name) || !writable,
            },
            {
                label: t("library.duplicatePlaylist"),
                icon: <Copy size={17} />,
                onSelect: () => duplicateTap(x),
                hidden: !isTap(x.name) || !writable,
            },
            {
                label: t("library.showJson"),
                icon: <Braces size={17} />,
                onSelect: () => showJson(x),
                hidden: !isTap(x.name) && !/\.json$/i.test(x.name),
            },
            {
                label: t("library.showTafHeader"),
                icon: <Braces size={17} />,
                onSelect: () =>
                    setText({ title: x.name, text: JSON.stringify(x.tafHeader, null, 2) }),
                hidden: !x.tafHeader,
            },
            {
                label: t("library.splitTaf"),
                icon: <Scissors size={17} />,
                onSelect: () => split(x),
                hidden:
                    !anyFolderWritable ||
                    !isTaf(x.name) ||
                    !canSplit.data ||
                    (x.tafHeader?.trackSeconds?.length ?? 0) < 2,
            },
            {
                label: x.tonieInfo?.series ? t("library.changeCover") : t("library.setCover"),
                icon: <ImagePlus size={17} />,
                onSelect: () => setCoverFor({ mode: "cover", file: p }),
                hidden: !tonieFile,
            },
            {
                label: t("library.convertToTaf"),
                icon: <Wand2 size={17} />,
                onSelect: () => encode(x),
                hidden: !isAudio(x.name) || !writable,
            },
            {
                label: t("common.share"),
                icon: <Share2 size={17} />,
                onSelect: () =>
                    setShareFor({ type: "folder", id: p.replace(/^\/+/, ""), title: x.name }),
                hidden: !x.isDir || !canShare("folder", p.replace(/^\/+/, "")),
            },
            {
                label: t("library.rename"),
                icon: <Pencil size={17} />,
                onSelect: () => rename(x),
                hidden: !writable,
            },
            {
                label: t("library.move"),
                icon: <ArrowRightLeft size={17} />,
                onSelect: () => setMoveFor([x]),
                hidden: !writable,
            },
            {
                label: t("common.download"),
                icon: <Download size={17} />,
                onSelect: () => download(x),
                hidden: x.isDir,
            },
            {
                label: t("common.downloadOgg"),
                icon: <Download size={17} />,
                onSelect: () => setOggFor(x),
                hidden: !isTaf(x.name),
            },
            {
                label: t("common.delete"),
                icon: <Trash2 size={17} />,
                danger: true,
                onSelect: () => remove(x),
                hidden: !writable,
            },
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
    /** the cover of a file, or the one picture of what is in a folder */
    const picture = (x: FileEntry) => x.tonieInfo?.picture || x.folderPicture;
    const kind = (x: FileEntry) =>
        x.isDir ? "folder" : isTaf(x.name) || isTap(x.name) ? "taf" : "";
    const sub = (x: FileEntry) =>
        x.isDir
            ? ago(x.date * 1000)
            : [
                  lengthText(x.tafHeader?.lengthSeconds),
                  bytes(x.size),
                  sort === "date" ? ago(x.date * 1000) : "",
              ]
                  .filter(Boolean)
                  .join(" · ");
    const dirProps = (x: FileEntry) =>
        x.isDir
            ? {
                  onPointerEnter: () => prefetch(joinPath(path, x.name)),
                  onTouchStart: () => prefetch(joinPath(path, x.name)),
              }
            : {};
    const moreBtn = (x: FileEntry, className: string, size: number) => (
        <button
            className={className}
            aria-label={t("common.more")}
            onClick={(e) => {
                e.stopPropagation();
                actions(x);
            }}
        >
            <MoreHorizontal size={size} />
        </button>
    );

    const byName = new Map(list.map((x) => [x.name, x]));
    const sel = useSelection(
        (name) => {
            const x = byName.get(name);
            if (x) open(x);
        },
        list.map((x) => x.name),
    );
    // names are only unique in one folder: another folder starts without a selection
    const clearSelection = sel.clear;
    useEffect(() => clearSelection(), [path, clearSelection]);
    const selectedFiles = list.filter((x) => sel.selected.has(x.name));
    const playlistFiles = selectedFiles.filter((x) => isTaf(x.name) || isAudio(x.name));
    const checkbox = (name: string) => (
        <button
            type="button"
            className={`select-box ${sel.selected.has(name) ? "checked" : ""}`}
            aria-label={t("common.select")}
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

    const showLabels: Record<Show, string> = {
        all: t("common.all"),
        tonie: t("library.tonieFiles"),
        audio: t("library.audioFiles"),
        unheard: t("library.unheard"),
    };
    const active = show !== "all" ? [{ label: showLabels[show], clear: () => setShow("all") }] : [];

    return (
        <Page
            title={path === "/" ? t("common.library") : baseName(path)}
            back={path === "/" ? undefined : true}
            right={
                <>
                    {files.isFetching && files.data && (
                        <span className="refreshing" title={t("library.refreshing")}>
                            <Spinner small />
                        </span>
                    )}
                    {sel.selecting ? (
                        <button className="btn ghost" onClick={sel.clear}>
                            {t("common.done")}
                        </button>
                    ) : (
                        <>
                            <button
                                className="icon-btn"
                                onClick={() => sel.setSelecting(true)}
                                aria-label={t("common.select")}
                                title={t("common.selectHint")}
                            >
                                <CheckSquare size={20} />
                            </button>
                            {writable && (
                                <button
                                    className="icon-btn"
                                    aria-label={t("library.create")}
                                    onClick={() =>
                                        ui.actions(t("library.create"), [
                                            {
                                                label: t("library.newFolder"),
                                                icon: <FolderPlus size={17} />,
                                                onSelect: newFolder,
                                            },
                                            {
                                                label: t("library.newPlaylist"),
                                                icon: <ListMusic size={17} />,
                                                onSelect: () => setPlaylist({ dir: path }),
                                            },
                                        ])
                                    }
                                >
                                    <Plus size={22} />
                                </button>
                            )}
                        </>
                    )}
                    <button
                        className="icon-btn"
                        aria-label={t("common.tools")}
                        onClick={() =>
                            ui.actions(t("common.tools"), [
                                // only an admin sees every tonie and playlist that uses a TAF
                                ...(access.admin
                                    ? [
                                          {
                                              label: t("library.unusedTafs"),
                                              icon: <FileAudio size={17} />,
                                              onSelect: () => setUnusedOpen(true),
                                          },
                                      ]
                                    : []),
                                {
                                    label: selectedFiles.length
                                        ? t("library.customJsonSnippetSelected", {
                                              n: selectedFiles.length,
                                          })
                                        : t("library.customJsonSnippet"),
                                    icon: <Braces size={17} />,
                                    onSelect: () =>
                                        snippet(selectedFiles.length ? selectedFiles : list),
                                },
                            ])
                        }
                    >
                        <Wrench size={20} />
                    </button>
                    {writable && (
                        <button
                            className="icon-btn"
                            onClick={() => navigate(`/upload?path=${encodeURIComponent(path)}`)}
                            aria-label={t("common.upload")}
                        >
                            <Upload size={21} />
                        </button>
                    )}
                </>
            }
        >
            <div className="sticky-tools">
                {path !== "/" && (
                    <div className="breadcrumbs">
                        <button onClick={() => go("/")}>{t("common.library")}</button>
                        {crumbs.map((c, i) => (
                            <span key={i} className="row-gap" style={{ gap: 2 }}>
                                <span className="sep">/</span>
                                <button onClick={() => go("/" + crumbs.slice(0, i + 1).join("/"))}>
                                    {c}
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <div className="toolbar">
                    <SearchField
                        value={filter}
                        onChange={setFilter}
                        placeholder={
                            deep
                                ? t("library.searchSubfoldersPlaceholder")
                                : t("library.filterFolder")
                        }
                    />
                    <button
                        className={`icon-btn filled ${deep ? "on" : ""}`}
                        onClick={() => {
                            setDeep(!deep);
                            setPref("lib.deep", deep ? "" : "1");
                        }}
                        aria-pressed={deep}
                        aria-label={t("library.searchSubfolders")}
                        title={t("library.searchSubfolders")}
                    >
                        <FolderTree size={19} />
                    </button>
                    <button
                        className="icon-btn filled"
                        onClick={() =>
                            pref<View>("lib.view", setView)(view === "list" ? "grid" : "list")
                        }
                        aria-label={view === "list" ? t("common.viewGrid") : t("common.viewList")}
                    >
                        {view === "list" ? <LayoutGrid size={19} /> : <List size={19} />}
                    </button>
                    <button
                        ref={menuBtn}
                        className="icon-btn filled filter-btn"
                        onClick={() => setMenu((v) => !v)}
                        aria-label={t("common.filterAndView")}
                    >
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
                title={t("common.filterAndView")}
                footer={
                    <button className="btn primary" onClick={() => setMenu(false)}>
                        {t("common.showN", { n: list.length })}
                    </button>
                }
            >
                <ChoiceGroup
                    label={t("common.view")}
                    value={view}
                    onChange={pref<View>("lib.view", setView)}
                    options={[
                        {
                            value: "list",
                            label: (
                                <>
                                    <List size={15} /> {t("common.viewList")}
                                </>
                            ),
                        },
                        {
                            value: "grid",
                            label: (
                                <>
                                    <LayoutGrid size={15} /> {t("common.viewGrid")}
                                </>
                            ),
                        },
                    ]}
                />
                <ChoiceGroup
                    label={t("common.sortBy")}
                    value={sort}
                    onChange={pref<Sort>("lib.sort", setSort)}
                    options={[
                        { value: "name", label: t("common.name") },
                        { value: "date", label: t("library.date") },
                        { value: "size", label: t("library.size") },
                        { value: "length", label: t("common.length") },
                    ]}
                />
                <ChoiceGroup
                    label={t("library.order")}
                    value={dir}
                    onChange={pref<Dir>("lib.dir", setDir)}
                    options={[
                        { value: "asc", label: sort === "name" ? "A–Z" : t("library.ascending") },
                        { value: "desc", label: sort === "name" ? "Z–A" : t("library.descending") },
                    ]}
                />
                <ChoiceGroup
                    label={t("library.showFiles")}
                    value={show}
                    onChange={setShow}
                    options={(Object.keys(showLabels) as Show[]).map((k) => ({
                        value: k,
                        label: showLabels[k],
                    }))}
                />
                <ChoiceGroup
                    label={t("library.titles")}
                    value={names ? "1" : ""}
                    onChange={(v) => {
                        setNames(v === "1");
                        setPref("lib.names", v);
                    }}
                    options={[
                        { value: "", label: t("library.titlesFromTonie") },
                        { value: "1", label: t("library.titlesFileNames") },
                    ]}
                />
            </Popover>

            {deepSearch.active && (
                <DeepResults
                    loading={deepSearch.loading}
                    hits={deepSearch.hits}
                    root={path}
                    grid={view === "grid"}
                    onOpen={(p, entry) => {
                        go(entry.isDir ? p : parentPath(p));
                        if (entry.isDir) return;
                        setDetails(entry);
                        setSearchBack({ path, filter });
                    }}
                />
            )}
            {!deepSearch.active && files.isLoading && <Loading />}
            {!deepSearch.active && files.error && !files.data && (
                <ErrorBox error={files.error} retry={() => files.refetch()} />
            )}
            {!deepSearch.active && files.data && list.length === 0 && (
                <Empty
                    icon={<Folder size={28} />}
                    title={
                        filter || show !== "all"
                            ? t("common.nothingFound")
                            : t("library.folderEmpty")
                    }
                    action={
                        !filter &&
                        show === "all" &&
                        writable && (
                            <button
                                className="btn primary"
                                onClick={() => navigate(`/upload?path=${encodeURIComponent(path)}`)}
                            >
                                <Upload size={18} />
                                {t("library.uploadHere")}
                            </button>
                        )
                    }
                />
            )}
            {!deepSearch.active && list.length > 0 && view === "list" && (
                <div className="list">
                    {list.map((x) => (
                        <div
                            key={x.name}
                            className="row-wrap"
                            role="button"
                            tabIndex={0}
                            {...sel.itemProps(x.name)}
                            {...dirProps(x)}
                        >
                            <Row
                                className={sel.selected.has(x.name) ? "checked" : ""}
                                leading={
                                    <>
                                        {sel.selecting && checkbox(x.name)}
                                        {picture(x) ? (
                                            <span
                                                className={`file-icon ${x.isDir ? "folder-pic" : ""}`}
                                            >
                                                <img
                                                    src={backendUrl(picture(x)!)}
                                                    alt=""
                                                    loading="lazy"
                                                />
                                                {x.isDir && (
                                                    <Folder size={13} className="folder-badge" />
                                                )}
                                            </span>
                                        ) : (
                                            <span className={`file-icon ${kind(x)}`}>
                                                {icon(x)}
                                            </span>
                                        )}
                                    </>
                                }
                                title={fileTitle(x, names)}
                                sub={sub(x)}
                                chevron={x.isDir && !sel.selecting}
                                right={
                                    sel.selecting ? undefined : (
                                        <>
                                            {(isTaf(x.name) || isAudio(x.name)) && (
                                                <button
                                                    className="icon-btn"
                                                    aria-label={t("common.play")}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        player.play(
                                                            filePlayItem(joinPath(path, x.name), x),
                                                        );
                                                    }}
                                                >
                                                    <Play size={19} fill="currentColor" />
                                                </button>
                                            )}
                                            {moreBtn(x, "icon-btn muted", 20)}
                                        </>
                                    )
                                }
                            />
                        </div>
                    ))}
                </div>
            )}
            {!deepSearch.active && list.length > 0 && view === "grid" && (
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
                                {picture(x) ? (
                                    <img src={backendUrl(picture(x)!)} alt="" loading="lazy" />
                                ) : (
                                    icon(x, 44)
                                )}
                                {x.isDir && picture(x) && (
                                    <Folder size={16} className="folder-badge" />
                                )}
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
                    <button
                        className="icon-btn"
                        onClick={sel.clear}
                        aria-label={t("common.cancel")}
                    >
                        <X size={20} />
                    </button>
                    <span className="count">
                        {selectedFiles.length
                            ? t("common.nSelected", { n: selectedFiles.length })
                            : t("library.selectFiles")}
                    </span>
                    <button
                        className="icon-btn"
                        disabled={!selectedFiles.length || busy || !writable}
                        onClick={deleteSelected}
                        aria-label={t("common.delete")}
                    >
                        <Trash2 size={19} />
                    </button>
                    <button
                        className="icon-btn"
                        disabled={!selectedFiles.length || busy || !writable}
                        onClick={() => setMoveFor(selectedFiles)}
                        aria-label={t("library.move")}
                    >
                        <FolderInput size={19} />
                    </button>
                    <button
                        className="btn primary small"
                        disabled={!playlistFiles.length || !writable}
                        onClick={() => {
                            setPlaylist({
                                dir: path,
                                files: playlistFiles.map((x) => ({
                                    path: joinPath(path, x.name),
                                    entry: x,
                                })),
                            });
                            sel.clear();
                        }}
                    >
                        <ListMusic size={15} />
                        {t("library.toPlaylist")}
                    </button>
                </div>
            )}
            <PlaylistEditor start={playlist} onClose={() => setPlaylist(null)} />
            <TextSheet
                title={text?.title ?? ""}
                text={text?.text ?? null}
                hint={text?.hint}
                onClose={() => setText(null)}
            />
            <UnusedTafsSheet open={unusedOpen} onClose={() => setUnusedOpen(false)} />
            {zoom && <Lightbox items={[zoom]} index={0} onClose={() => setZoom(null)} />}
            <TagPicker
                open={assignFor !== null}
                onClose={() => setAssignFor(null)}
                title={t("common.assignToTonie")}
                right="tonie.assign"
                onPick={async (tag) => {
                    const source = "lib://" + (assignFor ?? "").replace(/^\//, "");
                    await ui.run(
                        () =>
                            tc.assignSource(
                                tag,
                                source,
                                tag.overlay || undefined,
                                access.can("tonie", tag.ruid, "tonie.edit"),
                            ),
                        t("common.contentAssigned"),
                    );
                    invalidateTags();
                }}
            />
            <ShareSheet target={shareFor} onClose={() => setShareFor(null)} />
            <LibraryPicker
                open={moveFor !== null}
                onClose={() => setMoveFor(null)}
                folderMode
                startPath={path}
                title={t("library.moveTo")}
                onPick={move}
            />
            <LibraryPicker
                open={splitFor !== null}
                onClose={() => setSplitFor(null)}
                folderMode
                // "elsewhere" keeps the TAF; its own folder is the split without that choice
                canPick={(folder) => mayWrite(folder) && trimSlashes(folder) !== trimSlashes(path)}
                startPath={path}
                title={t("library.splitTafInto")}
                onPick={(folder) => splitFor && runSplit(splitFor, folder)}
            />
            <ModelEditor start={coverFor} onClose={() => setCoverFor(null)} onSaved={refresh} />
            <DownloadSheet
                open={oggFor !== null}
                onClose={() => setOggFor(null)}
                title={oggFor ? fileTitle(oggFor, false).replace(/\.taf$/i, "") : ""}
                wholeUrl={oggFor ? libraryFileUrl(joinPath(path, oggFor.name), true) : ""}
                trackUrl={
                    oggFor
                        ? (n) => `${libraryFileUrl(joinPath(path, oggFor.name), true)}&tracks=${n}`
                        : undefined
                }
                chapters={oggFor?.tafHeader?.trackSeconds ?? []}
                chapterTitles={oggFor?.tonieInfo?.tracks ?? []}
            />
            <FileDetailsSheet
                path={path}
                file={details}
                onClose={(forAction) => {
                    setDetails(null);
                    setSearchBack(null);
                    if (!searchBack || forAction) return;
                    go(searchBack.path);
                    setFilter(searchBack.filter);
                }}
                actions={{
                    assign: () => details && setAssignFor(joinPath(path, details.name)),
                    cover: () =>
                        details &&
                        setCoverFor({ mode: "cover", file: joinPath(path, details.name) }),
                    rename: () => details && rename(details),
                    move: () => details && setMoveFor([details]),
                    download: () => details && download(details),
                    downloadOgg: () => details && setOggFor(details),
                    editPlaylist: () =>
                        details && setPlaylist({ edit: joinPath(path, details.name) }),
                    remove: () => details && remove(details),
                }}
            />
        </Page>
    );
}
