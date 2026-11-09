import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    ArrowDown,
    ArrowUp,
    CheckCircle2,
    Disc3,
    FileAudio,
    Link2,
    ListMusic,
    Plus,
    Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { tc } from "../../api/tc";
import type { FileEntry, Tap } from "../../api/types";
import { baseName, isAudio, parentPath, stripExt } from "../../lib/format";
import { useAccess } from "../../lib/access";
import { t } from "../../lib/i18n";
import { useInvalidateTags } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { Empty, Loading, Notice, useUi } from "../../ui/kit";
import { TagPicker } from "../tonies/TagPicker";
import { confirmReplace } from "../upload/confirmReplace";
import { LibraryPicker } from "./LibraryPicker";

/** how the editor starts: a new playlist in a folder (maybe with files), or an existing TAP */
export type PlaylistStart =
    { dir: string; files?: { path: string; entry?: FileEntry }[] } | { edit: string };

interface Item {
    id: number;
    filepath: string;
    name: string;
}

const safeName = (s: string) =>
    s
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
        .replace(/[. ]+$/g, "")
        .trim();
const toLib = (path: string) => "lib://" + path.replace(/^\/+/, "");
const fromLib = (fp: string) => "/" + fp.replace(/^lib:\/\//, "");

/** title of a file in a playlist: its tonie title, else the file name */
const itemName = (path: string, entry?: FileEntry) =>
    entry?.tonieInfo?.episode || entry?.tonieInfo?.series || stripExt(baseName(path));

/**
 * Creates or edits a playlist (TAP): an ordered list of library files that teddyCloud puts
 * together into one TAF. TAF files are joined without encoding, other audio is encoded.
 */
export function PlaylistEditor({
    start,
    onClose,
}: {
    start: PlaylistStart | null;
    onClose: () => void;
}) {
    const ui = useUi();
    const access = useAccess();
    const qc = useQueryClient();
    const invalidateTags = useInvalidateTags();
    const [name, setName] = useState("");
    const [items, setItems] = useState<Item[]>([]);
    const [tapPath, setTapPath] = useState<string | null>(null);
    const [dir, setDir] = useState("/");
    const [existing, setExisting] = useState<Tap | null>(null);
    const [loading, setLoading] = useState(false);
    const [picking, setPicking] = useState(false);
    const [saving, setSaving] = useState(false);
    const [done, setDone] = useState<{
        tap: string;
        built: boolean | null;
        failed?: boolean;
    } | null>(null);
    const [assign, setAssign] = useState(false);
    const [expert, setExpert] = useState(false);
    const [audioId, setAudioId] = useState("");
    const [tafPath, setTafPath] = useState("");
    const nextId = useRef(1);
    // a server that builds playlists takes only library files and content (lib://, content://)
    const canBuild = useQuery({
        queryKey: ["hasTapBuild"],
        queryFn: tc.hasTapBuild,
        staleTime: Infinity,
    }).data;

    const toItems = (list: { filepath: string; name: string }[]) =>
        list.map((x) => ({ id: nextId.current++, ...x }));

    useEffect(() => {
        if (!start) return;
        setDone(null);
        setSaving(false);
        setExpert(false);
        if ("edit" in start) {
            let stale = false;
            setTapPath(start.edit);
            setDir(parentPath(start.edit));
            setExisting(null);
            setAudioId("");
            setTafPath("");
            setName("");
            setItems([]);
            setLoading(true);
            tc.readTap(start.edit)
                .then((tap) => {
                    if (stale) return;
                    setExisting(tap);
                    setAudioId(String(tap.audio_id ?? ""));
                    setTafPath(tap.filepath ?? "");
                    setName(tap.name || stripExt(baseName(start.edit)));
                    setItems(toItems(tap.files ?? []));
                })
                .catch((e) => {
                    if (stale) return;
                    ui.toast("error", t("common.loadFailed"), String((e as Error).message));
                    onClose();
                })
                .finally(() => {
                    if (!stale) setLoading(false);
                });
            return () => {
                stale = true;
            };
        } else {
            setTapPath(null);
            setExisting(null);
            setAudioId("");
            setTafPath("");
            setDir(start.dir);
            const files = start.files ?? [];
            setItems(
                toItems(
                    files.map((f) => ({
                        filepath: toLib(f.path),
                        name: itemName(f.path, f.entry),
                    })),
                ),
            );
            setName(files.length ? baseName(start.dir) || "" : "");
        }
    }, [start]); // eslint-disable-line react-hooks/exhaustive-deps

    const move = (i: number, d: number) =>
        setItems((cur) => {
            const j = i + d;
            if (j < 0 || j >= cur.length) return cur;
            const next = [...cur];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });

    const encodes = items.some((x) => isAudio(x.filepath) || !x.filepath.startsWith("lib://"));

    /** any source ffmpeg on the server can read: a path on the server or a URL */
    const addPath = async () => {
        const filepath = await ui.prompt({
            title: t("library.addPath"),
            label: t("library.addPathHint"),
            placeholder: "https://… / /path/file.mp3",
        });
        if (filepath)
            setItems((cur) => [
                ...cur,
                ...toItems([{ filepath, name: stripExt(baseName(filepath)) }]),
            ]);
    };

    const save = async () => {
        const clean = safeName(name);
        if (!clean) return ui.toast("error", t("common.nameRequired"));
        if (!items.length) return ui.toast("error", t("library.playlistEmpty"));
        if (canBuild && tafPath.trim() && !/^lib:\/\/.+\.taf$/i.test(tafPath.trim()))
            return ui.toast("error", t("library.tapTafPathHint"));
        const fileName = tapPath ? baseName(tapPath) : `${clean}.tap`;
        if (!tapPath && !(await confirmReplace(ui, dir, [fileName]))) return;
        setSaving(true);
        const target = tapPath ?? `${dir.replace(/\/$/, "")}/${fileName}`;
        const tap: Tap = {
            type: "tap",
            audio_id: Number(audioId) || existing?.audio_id || Math.floor(Date.now() / 1000),
            // the TAF it builds lies next to it, named after it; the library does not list it
            filepath:
                tafPath.trim() ||
                existing?.filepath ||
                toLib(`${dir.replace(/\/$/, "")}/${fileName}.taf`),
            name: name.trim(),
            files: items.map(({ filepath, name }) => ({
                filepath,
                name: name.trim() || stripExt(baseName(filepath)),
            })),
        };
        try {
            await tc.saveTap(tap, dir, fileName);
            let built: boolean | null = null;
            let failed = false;
            try {
                const r = await tc.buildTap(target);
                built = r ? r.built : null;
            } catch (e) {
                failed = true;
                ui.toast("error", t("library.playlistBuildFailed"), String((e as Error).message));
            }
            qc.invalidateQueries({ queryKey: ["files"] });
            invalidateTags();
            setDone({ tap: target, built, failed });
        } catch (e) {
            ui.toast("error", t("common.saveFailed"), String((e as Error).message));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Sheet
                open={!!start}
                onClose={onClose}
                title={
                    done
                        ? t("library.playlistSaved")
                        : tapPath
                          ? t("library.editPlaylist")
                          : t("library.newPlaylist")
                }
                full
                footer={
                    done ? (
                        <>
                            <button className="btn" onClick={onClose}>
                                {t("common.done")}
                            </button>
                            <button className="btn primary" onClick={() => setAssign(true)}>
                                <Disc3 size={18} />
                                {t("common.assignToTonie")}
                            </button>
                        </>
                    ) : (
                        <>
                            <button className="btn" onClick={onClose}>
                                {t("common.cancel")}
                            </button>
                            <button
                                className="btn primary"
                                disabled={saving || loading || !items.length || !name.trim()}
                                onClick={save}
                            >
                                {saving ? <span className="spinner small" /> : t("common.save")}
                            </button>
                        </>
                    )
                }
            >
                {done ? (
                    <div style={{ textAlign: "center", padding: "24px 0" }}>
                        <CheckCircle2
                            size={44}
                            color="var(--ok)"
                            style={{ margin: "0 auto 10px" }}
                        />
                        <div style={{ fontWeight: 700, fontSize: 19 }}>{name}</div>
                        <div
                            className="small muted mono"
                            style={{ marginTop: 4, wordBreak: "break-all" }}
                        >
                            {done.tap}
                        </div>
                        <p className="muted small" style={{ maxWidth: 360, margin: "14px auto 0" }}>
                            {done.failed
                                ? t("library.playlistBuildFailed")
                                : done.built === true
                                  ? t("library.playlistBuilt")
                                  : t("library.playlistEncodedOnPlayback")}
                        </p>
                    </div>
                ) : loading ? (
                    <Loading />
                ) : (
                    <>
                        <p className="small muted" style={{ margin: "0 2px 14px" }}>
                            {t("library.playlistIntro")}
                        </p>
                        <div className="field">
                            <label>{t("library.playlistName")}</label>
                            <input
                                className="input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t("library.playlistNamePlaceholder")}
                                autoFocus={!tapPath}
                            />
                            <div className="hint">
                                {tapPath
                                    ? tapPath
                                    : t("library.playlistSavedIn", {
                                          dir: dir === "/" ? t("common.library") : dir,
                                      })}
                            </div>
                        </div>
                        <button
                            className="btn ghost small"
                            style={{ paddingLeft: 2, marginBottom: 10 }}
                            onClick={() => setExpert(!expert)}
                        >
                            {expert ? t("common.hideExpert") : t("common.showExpert")}
                        </button>
                        {expert && (
                            <>
                                <div className="field">
                                    <label>{t("library.audioId")}</label>
                                    <input
                                        className="input mono"
                                        inputMode="numeric"
                                        value={audioId}
                                        onChange={(e) =>
                                            setAudioId(e.target.value.replace(/\D/g, ""))
                                        }
                                        placeholder={t("common.automatic")}
                                    />
                                    <div className="hint">{t("library.tapAudioIdHint")}</div>
                                </div>
                                <div className="field">
                                    <label>{t("library.tapTafPath")}</label>
                                    <input
                                        className="input mono"
                                        value={tafPath}
                                        onChange={(e) => setTafPath(e.target.value)}
                                        placeholder={t("common.automatic")}
                                    />
                                    <div className="hint">{t("library.tapTafPathHint")}</div>
                                </div>
                            </>
                        )}

                        <div className="section-head">
                            <h2 className="section-title">
                                {t("library.titlesInOrder")} ({items.length})
                            </h2>
                            <span className="row-gap" style={{ gap: 4 }}>
                                {canBuild === false && (
                                    <button
                                        className="btn ghost small"
                                        onClick={addPath}
                                        title={t("library.addPathHint")}
                                    >
                                        <Link2 size={16} />
                                        {t("library.addPath")}
                                    </button>
                                )}
                                <button
                                    className="btn ghost small"
                                    onClick={() => setPicking(true)}
                                >
                                    <Plus size={16} />
                                    {t("library.addTitles")}
                                </button>
                            </span>
                        </div>
                        {items.length === 0 ? (
                            <Empty
                                icon={<ListMusic size={28} />}
                                title={t("library.playlistEmpty")}
                                action={
                                    <button
                                        className="btn primary"
                                        onClick={() => setPicking(true)}
                                    >
                                        <Plus size={18} />
                                        {t("library.addTitles")}
                                    </button>
                                }
                            />
                        ) : (
                            <div className="list">
                                {items.map((it, i) => (
                                    <div key={it.id} className="row">
                                        <span className="track-no">{i + 1}</span>
                                        <div className="row-body">
                                            <input
                                                className="input inline"
                                                style={{
                                                    textAlign: "left",
                                                    color: "var(--fg)",
                                                    fontWeight: 500,
                                                }}
                                                value={it.name}
                                                onChange={(e) =>
                                                    setItems((cur) =>
                                                        cur.map((x) =>
                                                            x.id === it.id
                                                                ? { ...x, name: e.target.value }
                                                                : x,
                                                        ),
                                                    )
                                                }
                                            />
                                            <div
                                                className="row-sub"
                                                style={{ whiteSpace: "nowrap" }}
                                            >
                                                {isAudio(it.filepath) ? (
                                                    <FileAudio
                                                        size={12}
                                                        style={{ verticalAlign: -1 }}
                                                    />
                                                ) : null}{" "}
                                                {it.filepath.startsWith("lib://")
                                                    ? baseName(fromLib(it.filepath))
                                                    : it.filepath}
                                            </div>
                                        </div>
                                        <button
                                            className="icon-btn muted"
                                            onClick={() => move(i, -1)}
                                            disabled={i === 0}
                                            aria-label={t("common.moveUp")}
                                        >
                                            <ArrowUp size={18} />
                                        </button>
                                        <button
                                            className="icon-btn muted"
                                            onClick={() => move(i, 1)}
                                            disabled={i === items.length - 1}
                                            aria-label={t("common.moveDown")}
                                        >
                                            <ArrowDown size={18} />
                                        </button>
                                        <button
                                            className="icon-btn muted"
                                            onClick={() =>
                                                setItems((cur) => cur.filter((x) => x.id !== it.id))
                                            }
                                            aria-label={t("common.remove")}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {encodes && (
                            <div className="mt">
                                <Notice info>{t("library.playlistEncodeHint")}</Notice>
                            </div>
                        )}
                    </>
                )}
            </Sheet>

            <LibraryPicker
                open={picking}
                onClose={() => setPicking(false)}
                multi
                startPath={dir}
                title={t("library.addTitles")}
                onPickMany={(files) =>
                    setItems((cur) => [
                        ...cur,
                        ...toItems(
                            files.map((f) => ({
                                filepath: toLib(f.path),
                                name: itemName(f.path, f.entry),
                            })),
                        ),
                    ])
                }
            />
            <TagPicker
                open={assign}
                onClose={() => setAssign(false)}
                title={t("common.assignToTonie")}
                right="tonie.assign"
                onPick={async (tag) => {
                    if (!done) return;
                    await ui.run(
                        () =>
                            tc.assignSource(
                                tag,
                                toLib(done.tap),
                                tag.overlay || undefined,
                                access.can("tonie", tag.ruid, "tonie.edit"),
                            ),
                        t("common.contentAssigned"),
                    );
                    invalidateTags();
                    onClose();
                }}
            />
        </>
    );
}
