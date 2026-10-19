import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CheckCircle2, Disc3, FileAudio, Folder, FolderOpen, ImagePlus, Trash2, UploadCloud } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { tc } from "../../api/tc";
import { baseName, bytes, isAudio, joinPath, parentPath, stripExt } from "../../lib/format";
import { t } from "../../lib/i18n";
import { ApiError } from "../../api/client";
import { shrinkImage } from "../../lib/image";
import { newModelId } from "../models/ModelEditor";
import { uploadAudio } from "./uploadAudio";
import { useInvalidateTags, useSettings } from "../../lib/queries";
import { Notice, Page, Row, Section, Segmented, useUi } from "../../ui/kit";
import { LibraryPicker } from "../library/LibraryPicker";
import { TagPicker } from "../tonies/TagPicker";

interface Item {
    id: number;
    file: File;
    title: string;
}

type Mode = "taf" | "split";
type Encoder = "browser" | "server";

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim();

export function UploadPage() {
    const [params] = useSearchParams();
    const [folder, setFolder] = useState(params.get("path") || "/");
    const [items, setItems] = useState<Item[]>([]);
    const [name, setName] = useState("");
    const [mode, setMode] = useState<Mode>("taf");
    const settings = useSettings("");
    const settingValue = (k: string) => settings.data?.find((o) => o.ID === k)?.value;
    const [encoderChoice, setEncoder] = useState<Encoder | null>(null);
    // what the server suggests (encode.use_frontend) until the user picks
    const encoder: Encoder = encoderChoice ?? (settingValue("encode.use_frontend") === false ? "server" : "browser");
    const [over, setOver] = useState(false);
    const [busy, setBusy] = useState<{ step: string; progress: number } | null>(null);
    const [done, setDone] = useState<string | null>(null);
    const [pickFolder, setPickFolder] = useState(false);
    const [assign, setAssign] = useState(false);
    const [doneFolder, setDoneFolder] = useState<string | null>(null);
    const [cover, setCover] = useState<File | null>(null);
    const coverUrl = useMemo(() => (cover ? URL.createObjectURL(cover) : ""), [cover]);
    const coverInput = useRef<HTMLInputElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const nextId = useRef(1);
    const running = useRef(false);
    const ui = useUi();
    const qc = useQueryClient();
    const navigate = useNavigate();
    const invalidateTags = useInvalidateTags();

    const audioCount = items.filter((i) => isAudio(i.file.name)).length;
    const canTaf = items.length > 0 && audioCount === items.length;
    const plain = !canTaf;

    const add = (files: FileList | File[]) => {
        const list = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        setDone(null);
        setItems((cur) => {
            const next = [...cur, ...list.map((file) => ({ id: nextId.current++, file, title: stripExt(file.name) }))];
            if (!name && next.length) setName(next.length === 1 ? stripExt(next[0].file.name) : safeName(next[0].file.webkitRelativePath.split("/")[0] || stripExt(next[0].file.name)));
            return next;
        });
    };

    const saveAlbum = async (tafPath: string, title: string, titles: string[], picture: File | null) => {
        const dir = parentPath(tafPath);
        await qc.invalidateQueries({ queryKey: ["files", dir] });
        const entry = (await tc.files(dir)).find((f) => f.name === baseName(tafPath));
        const header = entry?.tafHeader;
        if (!header) throw new Error(t("noAudioId"));
        let pic = "";
        if (picture) {
            try {
                const small = await shrinkImage(picture, picture.name).catch(() => picture);
                const fileName = `${Date.now().toString(36)}-${small.name.replace(/[^\w.-]+/g, "_")}`;
                await tc.uploadCustomImage(new File([small], fileName, { type: small.type }));
                pic = `/custom_img/${fileName}`;
            } catch {
                // the chapter names are saved anyway
                ui.toast("error", t("coverNotSaved"), t("imageFolderReadOnly"));
            }
        }
        const models = await tc.customModels().catch(() => []);
        const model = newModelId(title, new Set(models.map((m) => m.model.toLowerCase())));
        await tc.upsertModel({
            model,
            audio_id: [String(header.audioId)],
            hash: [header.sha1Hash],
            title: title.trim(),
            series: title.trim(),
            episodes: "",
            tracks: titles,
            language: "de-de",
            category: "audio-play",
            pic,
        });
        qc.invalidateQueries({ queryKey: ["customModels"] });
        invalidateTags();
    };

    const moveItem = (i: number, d: number) =>
        setItems((cur) => {
            const next = [...cur];
            const j = i + d;
            if (j < 0 || j >= next.length) return cur;
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });

    const start = async () => {
        // the state updates later: a ref stops a second click at once
        if (running.current) return;
        running.current = true;
        // show at once: preparing the first file takes a moment
        setBusy({ step: t("starting"), progress: 0 });
        try {
            if (plain) {
                setBusy({ step: t("uploading"), progress: 0 });
                await tc.uploadFiles(items.map((i) => i.file), folder, (p) => setBusy({ step: t("uploading"), progress: p }));
                setDone(items.length === 1 ? joinPath(folder, items[0].file.name) : "");
            } else {
                const titles = items.map((i) => i.title.trim() || stripExt(i.file.name));
                const job = {
                    files: items.map((i) => i.file),
                    titles,
                    name: name.trim() || "Upload",
                    folder,
                    split: mode === "split",
                    encoder,
                    bitrate: Number(settingValue("encode.bitrate")) || 96,
                };
                const step = (text: string, progress: number) => setBusy({ step: text, progress });
                let result;
                try {
                    result = await uploadAudio(job, step);
                } catch (e) {
                    if (e instanceof ApiError || encoder === "server") throw e;
                    // the browser could not encode (old browser, no memory): let the server do it
                    ui.toast("info", t("browserEncodeFailed"), String((e as Error).message));
                    result = await uploadAudio({ ...job, encoder: "server" }, step);
                }
                // picture and chapter names: an album cover model linked to the TAF
                if (cover || items.length > 1) {
                    step(t("savingCover"), 1);
                    try {
                        await saveAlbum(result.taf, job.name, titles, cover);
                    } catch (e) {
                        ui.toast("error", t("coverFailed"), String((e as Error).message));
                    }
                }
                setDone(result.source);
                setDoneFolder(result.folder);
            }
            setItems([]);
            setName("");
            setCover(null);
            qc.invalidateQueries({ queryKey: ["files"] });
        } catch (e) {
            ui.toast("error", t("uploadFailed"), String((e as Error).message));
        } finally {
            setBusy(null);
            running.current = false;
        }
    };

    return (
        <Page title={t("upload")} back={params.get("path") ? true : undefined} narrow>
            {done !== null && (
                <div className="card" style={{ padding: 18, marginBottom: 20, textAlign: "center" }}>
                    <CheckCircle2 size={40} color="var(--ok)" style={{ margin: "0 auto 8px" }} />
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{t("uploadDone")}</div>
                    {done && <div className="small muted mono" style={{ marginTop: 4, wordBreak: "break-all" }}>{done}</div>}
                    <div className="btn-row mt">
                        {done && /\.ta[fp]$/i.test(done) && (
                            <button className="btn primary" onClick={() => setAssign(true)}>
                                <Disc3 size={18} />
                                {t("assignToTonie")}
                            </button>
                        )}
                        <button className="btn" onClick={() => navigate(`/library?path=${encodeURIComponent(doneFolder ?? folder)}`)}>
                            <FolderOpen size={18} />
                            {t("openFolder")}
                        </button>
                    </div>
                </div>
            )}

            <Section title={t("targetFolder")}>
                <Row
                    leading={
                        <span className="file-icon folder">
                            <Folder size={20} />
                        </span>
                    }
                    title={folder === "/" ? t("library") : folder}
                    sub={t("tapToChange")}
                    onClick={() => setPickFolder(true)}
                    chevron
                />
            </Section>

            <div
                className={`drop-zone ${over ? "over" : ""}`}
                onClick={() => input.current?.click()}
                onDragOver={(e) => {
                    e.preventDefault();
                    setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setOver(false);
                    if (e.dataTransfer.files.length) add(e.dataTransfer.files);
                }}
            >
                <div className="dz-icon">
                    <UploadCloud size={28} />
                </div>
                <div style={{ fontWeight: 650, color: "var(--fg)" }}>{t("chooseFiles")}</div>
                <div className="small">{t("chooseFilesHint")}</div>
                <input
                    ref={input}
                    type="file"
                    multiple
                    className="hidden-input"
                    accept="audio/*,.taf,.tap,.mp3,.m4a,.m4b,.ogg,.opus,.flac,.wav"
                    onChange={(e) => {
                        if (e.target.files?.length) add(e.target.files);
                        e.target.value = "";
                    }}
                />
            </div>

            {items.length > 0 && (
                <>
                    <div className="section mt">
                        {canTaf && (
                            <div style={{ marginBottom: 14 }}>
                                <Segmented
                                    value={mode}
                                    onChange={setMode}
                                    options={[
                                        { value: "taf", label: t("modeTaf") },
                                        { value: "split", label: t("modeSplit") },
                                    ]}
                                />
                                <p className="small muted" style={{ margin: "8px 4px 12px" }}>
                                    {mode === "taf" ? t("modeTafHint") : t("splitToPlaylistHint")}
                                </p>
                                <div className="choice-label">{t("encodingWhere")}</div>
                                <Segmented
                                    value={encoder}
                                    onChange={setEncoder}
                                    options={[
                                        { value: "browser", label: t("encodeBrowser") },
                                        { value: "server", label: t("encodeServer") },
                                    ]}
                                />
                                <p className="small muted" style={{ margin: "8px 4px 0" }}>
                                    {encoder === "browser" ? t("encodeBrowserHint") : t("encodeServerHint")}
                                </p>
                            </div>
                        )}
                        {!plain && (
                            <div className="field">
                                <label>{t("tafName")}</label>
                                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("tafNamePlaceholder")} />
                                <div className="hint">{mode === "split" ? t("splitNameHint") : t("tafNameHint")}</div>
                            </div>
                        )}
                        {!plain && (
                            <div className="list" style={{ marginBottom: 14 }}>
                                <Row
                                    leading={
                                        cover ? (
                                            <img src={coverUrl} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 10 }} />
                                        ) : (
                                            <span className="file-icon">
                                                <ImagePlus size={20} />
                                            </span>
                                        )
                                    }
                                    title={cover ? t("coverChosen") : t("addCover")}
                                    sub={cover ? cover.name : t("addCoverHint")}
                                    onClick={() => coverInput.current?.click()}
                                    right={
                                        cover ? (
                                            <button
                                                className="icon-btn muted"
                                                aria-label={t("remove")}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setCover(null);
                                                }}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        ) : undefined
                                    }
                                    chevron={!cover}
                                />
                                <input
                                    ref={coverInput}
                                    type="file"
                                    accept="image/*"
                                    className="hidden-input"
                                    onChange={(e) => {
                                        setCover(e.target.files?.[0] ?? null);
                                        e.target.value = "";
                                    }}
                                />
                            </div>
                        )}
                        <div className="section-head">
                            <h2 className="section-title">
                                {!plain ? t("chaptersInOrder") : t("files")} ({items.length})
                            </h2>
                            <button className="btn ghost small" onClick={() => setItems([])}>
                                {t("clear")}
                            </button>
                        </div>
                        <div className="list">
                            {items.map((it, i) => (
                                <div key={it.id} className="row">
                                    {!plain ? <span className="track-no">{i + 1}</span> : <FileAudio size={18} color="var(--fg-3)" />}
                                    <div className="row-body">
                                        {!plain ? (
                                            <input
                                                className="input inline"
                                                style={{ textAlign: "left", color: "var(--fg)", fontWeight: 500 }}
                                                value={it.title}
                                                onChange={(e) =>
                                                    setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x)))
                                                }
                                            />
                                        ) : (
                                            <div className="row-title nowrap">{it.file.name}</div>
                                        )}
                                        <div className="row-sub">{bytes(it.file.size)}</div>
                                    </div>
                                    {!plain && (
                                        <>
                                            <button className="icon-btn muted" onClick={() => moveItem(i, -1)} disabled={i === 0} aria-label="up">
                                                <ArrowUp size={18} />
                                            </button>
                                            <button className="icon-btn muted" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1} aria-label="down">
                                                <ArrowDown size={18} />
                                            </button>
                                        </>
                                    )}
                                    <button className="icon-btn muted" onClick={() => setItems((cur) => cur.filter((x) => x.id !== it.id))} aria-label={t("remove")}>
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                    {!plain && encoder === "server" && items.reduce((n, i) => n + i.file.size, 0) > 400 * 1024 * 1024 && (
                        <Notice>{t("bigUploadHint")}</Notice>
                    )}
                    {busy ? (
                        <div className="card" style={{ padding: 16 }}>
                            <div className="row-gap" style={{ marginBottom: 10 }}>
                                <span className="spinner small" />
                                <span>{busy.step}</span>
                            </div>
                            <div className="progressbar">
                                <div style={{ width: `${Math.round(busy.progress * 100)}%` }} />
                            </div>
                        </div>
                    ) : (
                        <button className="btn primary block" onClick={start} disabled={!plain && !name.trim()}>
                            <UploadCloud size={19} />
                            {!plain ? t("createTaf") : t("uploadFiles")}
                        </button>
                    )}
                </>
            )}

            <LibraryPicker open={pickFolder} onClose={() => setPickFolder(false)} folderMode startPath={folder} onPick={setFolder} />
            <TagPicker
                open={assign}
                onClose={() => setAssign(false)}
                title={t("assignToTonie")}
                onPick={async (tag) => {
                    if (!done) return;
                    await ui.run(() => tc.assignSource(tag, "lib://" + done.replace(/^\//, ""), tag.overlay || undefined), t("contentAssigned"));
                    invalidateTags();
                }}
            />
        </Page>
    );
}
