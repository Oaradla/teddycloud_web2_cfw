import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CheckCircle2, Disc3, FileAudio, Link2, ListMusic, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { tc } from "../../api/tc";
import type { FileEntry, Tap } from "../../api/types";
import { baseName, isAudio, parentPath, stripExt } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useInvalidateTags } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { Empty, Loading, Notice, useUi } from "../../ui/kit";
import { TagPicker } from "../tonies/TagPicker";
import { LibraryPicker } from "./LibraryPicker";

/** how the editor starts: a new playlist in a folder (maybe with files), or an existing TAP */
export type PlaylistStart = { dir: string; files?: { path: string; entry?: FileEntry }[] } | { edit: string };

interface Item {
    id: number;
    filepath: string;
    name: string;
}

const safeName = (s: string) => s.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/[. ]+$/g, "").trim();
const toLib = (path: string) => "lib://" + path.replace(/^\/+/, "");
const fromLib = (fp: string) => "/" + fp.replace(/^lib:\/\//, "");

/** title of a file in a playlist: its tonie title, else the file name */
const itemName = (path: string, entry?: FileEntry) =>
    entry?.tonieInfo?.episode || entry?.tonieInfo?.series || stripExt(baseName(path));

/**
 * Creates or edits a playlist (TAP): an ordered list of library files that teddyCloud puts
 * together into one TAF. TAF files are joined without encoding, other audio is encoded.
 */
export function PlaylistEditor({ start, onClose }: { start: PlaylistStart | null; onClose: () => void }) {
    const ui = useUi();
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
    const [done, setDone] = useState<{ tap: string; built: boolean | null } | null>(null);
    const [assign, setAssign] = useState(false);
    const [expert, setExpert] = useState(false);
    const [audioId, setAudioId] = useState("");
    const [tafPath, setTafPath] = useState("");
    const nextId = useRef(1);

    const toItems = (list: { filepath: string; name: string }[]) => list.map((x) => ({ id: nextId.current++, ...x }));

    useEffect(() => {
        if (!start) return;
        setDone(null);
        setSaving(false);
        setExpert(false);
        if ("edit" in start) {
            setTapPath(start.edit);
            setDir(parentPath(start.edit));
            setLoading(true);
            tc.readTap(start.edit)
                .then((tap) => {
                    setExisting(tap);
                    setAudioId(String(tap.audio_id ?? ""));
                    setTafPath(tap.filepath ?? "");
                    setName(tap.name || stripExt(baseName(start.edit)));
                    setItems(toItems(tap.files ?? []));
                })
                .catch((e) => ui.toast("error", t("loadFailed"), String((e as Error).message)))
                .finally(() => setLoading(false));
        } else {
            setTapPath(null);
            setExisting(null);
            setAudioId("");
            setTafPath("");
            setDir(start.dir);
            const files = start.files ?? [];
            setItems(toItems(files.map((f) => ({ filepath: toLib(f.path), name: itemName(f.path, f.entry) }))));
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
        const filepath = await ui.prompt({ title: t("addPath"), label: t("addPathHint"), placeholder: "https://… / /path/file.mp3" });
        if (filepath) setItems((cur) => [...cur, ...toItems([{ filepath, name: stripExt(baseName(filepath)) }])]);
    };

    const save = async () => {
        const clean = safeName(name);
        if (!clean) return ui.toast("error", t("nameRequired"));
        if (!items.length) return ui.toast("error", t("playlistEmpty"));
        setSaving(true);
        const fileName = tapPath ? baseName(tapPath) : `${clean}.tap`;
        const target = tapPath ?? `${dir.replace(/\/$/, "")}/${fileName}`;
        const tap: Tap = {
            type: "tap",
            audio_id: Number(audioId) || existing?.audio_id || Math.floor(Date.now() / 1000),
            // the TAF it builds lies next to it, named after it; the library does not list it
            filepath: tafPath.trim() || existing?.filepath || toLib(`${dir.replace(/\/$/, "")}/${fileName}.taf`),
            name: name.trim(),
            files: items.map(({ filepath, name }) => ({ filepath, name: name.trim() || stripExt(baseName(filepath)) })),
        };
        try {
            await tc.saveTap(tap, dir, fileName);
            let built: boolean | null = null;
            try {
                const r = await tc.buildTap(target);
                built = r ? r.built : null;
            } catch (e) {
                ui.toast("error", t("playlistBuildFailed"), String((e as Error).message));
            }
            qc.invalidateQueries({ queryKey: ["files"] });
            invalidateTags();
            setDone({ tap: target, built });
        } catch (e) {
            ui.toast("error", t("saveFailed"), String((e as Error).message));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Sheet
                open={!!start}
                onClose={onClose}
                title={done ? t("playlistSaved") : tapPath ? t("editPlaylist") : t("newPlaylist")}
                full
                footer={
                    done ? (
                        <>
                            <button className="btn" onClick={onClose}>
                                {t("done")}
                            </button>
                            <button className="btn primary" onClick={() => setAssign(true)}>
                                <Disc3 size={18} />
                                {t("assignToTonie")}
                            </button>
                        </>
                    ) : (
                        <>
                            <button className="btn" onClick={onClose}>
                                {t("cancel")}
                            </button>
                            <button className="btn primary" disabled={saving || loading || !items.length || !name.trim()} onClick={save}>
                                {saving ? <span className="spinner small" /> : t("save")}
                            </button>
                        </>
                    )
                }
            >
                {done ? (
                    <div style={{ textAlign: "center", padding: "24px 0" }}>
                        <CheckCircle2 size={44} color="var(--ok)" style={{ margin: "0 auto 10px" }} />
                        <div style={{ fontWeight: 700, fontSize: 19 }}>{name}</div>
                        <div className="small muted mono" style={{ marginTop: 4, wordBreak: "break-all" }}>
                            {done.tap}
                        </div>
                        <p className="muted small" style={{ maxWidth: 360, margin: "14px auto 0" }}>
                            {done.built === true ? t("playlistBuilt") : t("playlistEncodedOnPlayback")}
                        </p>
                    </div>
                ) : loading ? (
                    <Loading />
                ) : (
                    <>
                        <p className="small muted" style={{ margin: "0 2px 14px" }}>
                            {t("playlistIntro")}
                        </p>
                        <div className="field">
                            <label>{t("playlistName")}</label>
                            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("playlistNamePlaceholder")} autoFocus={!tapPath} />
                            <div className="hint">{tapPath ? tapPath : t("playlistSavedIn", { dir: dir === "/" ? t("library") : dir })}</div>
                        </div>
                        <button className="btn ghost small" style={{ paddingLeft: 2, marginBottom: 10 }} onClick={() => setExpert(!expert)}>
                            {expert ? t("hideExpert") : t("showExpert")}
                        </button>
                        {expert && (
                            <>
                                <div className="field">
                                    <label>{t("audioId")}</label>
                                    <input className="input mono" inputMode="numeric" value={audioId} onChange={(e) => setAudioId(e.target.value.replace(/\D/g, ""))} placeholder={t("automatic")} />
                                    <div className="hint">{t("tapAudioIdHint")}</div>
                                </div>
                                <div className="field">
                                    <label>{t("tapTafPath")}</label>
                                    <input className="input mono" value={tafPath} onChange={(e) => setTafPath(e.target.value)} placeholder={t("automatic")} />
                                    <div className="hint">{t("tapTafPathHint")}</div>
                                </div>
                            </>
                        )}

                        <div className="section-head">
                            <h2 className="section-title">
                                {t("titlesInOrder")} ({items.length})
                            </h2>
                            <span className="row-gap" style={{ gap: 4 }}>
                                <button className="btn ghost small" onClick={addPath} title={t("addPathHint")}>
                                    <Link2 size={16} />
                                    {t("addPath")}
                                </button>
                                <button className="btn ghost small" onClick={() => setPicking(true)}>
                                    <Plus size={16} />
                                    {t("addTitles")}
                                </button>
                            </span>
                        </div>
                        {items.length === 0 ? (
                            <Empty
                                icon={<ListMusic size={28} />}
                                title={t("playlistEmpty")}
                                action={
                                    <button className="btn primary" onClick={() => setPicking(true)}>
                                        <Plus size={18} />
                                        {t("addTitles")}
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
                                                style={{ textAlign: "left", color: "var(--fg)", fontWeight: 500 }}
                                                value={it.name}
                                                onChange={(e) => setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)))}
                                            />
                                            <div className="row-sub" style={{ whiteSpace: "nowrap" }}>
                                                {isAudio(it.filepath) ? <FileAudio size={12} style={{ verticalAlign: -1 }} /> : null}{" "}
                                                {it.filepath.startsWith("lib://") ? baseName(fromLib(it.filepath)) : it.filepath}
                                            </div>
                                        </div>
                                        <button className="icon-btn muted" onClick={() => move(i, -1)} disabled={i === 0} aria-label="up">
                                            <ArrowUp size={18} />
                                        </button>
                                        <button className="icon-btn muted" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="down">
                                            <ArrowDown size={18} />
                                        </button>
                                        <button className="icon-btn muted" onClick={() => setItems((cur) => cur.filter((x) => x.id !== it.id))} aria-label={t("remove")}>
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {encodes && (
                            <div className="mt">
                                <Notice info>{t("playlistEncodeHint")}</Notice>
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
                title={t("addTitles")}
                onPickMany={(files) =>
                    setItems((cur) => [...cur, ...toItems(files.map((f) => ({ filepath: toLib(f.path), name: itemName(f.path, f.entry) })))])
                }
            />
            <TagPicker
                open={assign}
                onClose={() => setAssign(false)}
                title={t("assignToTonie")}
                onPick={async (tag) => {
                    if (!done) return;
                    await ui.run(() => tc.assignSource(tag, toLib(done.tap), tag.overlay || undefined), t("contentAssigned"));
                    invalidateTags();
                    onClose();
                }}
            />
        </>
    );
}
