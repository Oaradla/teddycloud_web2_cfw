import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, Copy, Disc3, FileAudio, Link2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getJson, q } from "../../api/client";
import { shrinkImage } from "../../lib/image";
import { tc } from "../../api/tc";
import type { CustomModel, FileEntry, TonieInfo } from "../../api/types";
import { baseName, isTap, parentPath, stripExt } from "../../lib/format";
import { useAccess } from "../../lib/access";
import { t } from "../../lib/i18n";
import { keys, useCustomModels, useFetchFiles, useInvalidateTags } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { Notice, Row, Section, useUi } from "../../ui/kit";
import { TonieImage } from "../../ui/TonieImage";
import { LibraryPicker } from "../library/LibraryPicker";
import { TagPicker } from "../tonies/TagPicker";

/**
 * How the editor starts:
 * - figure: a figure of its own (picture + name) to give to a tonie later
 * - cover: picture and titles for a TAF/TAP of the library (matched by its audio id and hash)
 * - edit: an existing custom model
 * - override: a custom model with the number of an official figure, which replaces its data everywhere
 */
export type ModelEditorStart =
    | { mode: "figure" }
    | { mode: "cover"; file?: string }
    | { mode: "edit"; model: CustomModel }
    | { mode: "override"; info: TonieInfo };

const blank = (): CustomModel => ({
    model: "",
    audio_id: [],
    hash: [],
    title: "",
    series: "",
    episodes: "",
    tracks: [],
    language: "de-de",
    category: "audio-play",
    pic: "",
});

const slug = (s: string) =>
    s
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/ß/g, "ss")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);

/** a model number nobody has to think about */
export const newModelId = (name: string, taken: Set<string>) => {
    const base = `eigene-${slug(name) || "figur"}`;
    let id = base;
    for (let i = 2; taken.has(id.toLowerCase()); i++) id = `${base}-${i}`;
    return id;
};

type FetchFiles = (path: string) => Promise<FileEntry[]>;

/** finds the library entry of a file (with its TAF header) */
const fileEntry = async (fetchFiles: FetchFiles, path: string): Promise<FileEntry | undefined> =>
    (await fetchFiles(parentPath(path))).find((f) => f.name === baseName(path));

interface Linked {
    path: string;
    entry?: FileEntry;
    audioIds: string[];
    hashes: string[];
    chapterNames: string[];
}

/** audio id and hash of a TAF, or of the TAF a TAP builds */
async function linkFile(fetchFiles: FetchFiles, path: string): Promise<Linked> {
    if (isTap(path)) {
        const tap = await getJson<{ filepath?: string; audio_id?: number; files?: { name?: string }[] }>(
            `/content/${path.replace(/^\//, "").split("/").map(encodeURIComponent).join("/")}${q({ special: "library" })}`,
        );
        const out = tap.filepath?.startsWith("lib://") ? "/" + tap.filepath.slice(6) : "";
        const outEntry = out ? await fileEntry(fetchFiles, out).catch(() => undefined) : undefined;
        const entry = await fileEntry(fetchFiles, path).catch(() => undefined);
        const ids = [outEntry?.tafHeader?.audioId, tap.audio_id].filter((x): x is number => Boolean(x)).map(String);
        return {
            path,
            entry: entry ?? outEntry,
            audioIds: [...new Set(ids)],
            hashes: outEntry?.tafHeader?.sha1Hash ? [outEntry.tafHeader.sha1Hash] : [],
            chapterNames: (tap.files ?? []).map((f) => f.name ?? "").filter(Boolean),
        };
    }
    const entry = await fileEntry(fetchFiles, path);
    return {
        path,
        entry,
        audioIds: entry?.tafHeader?.audioId ? [String(entry.tafHeader.audioId)] : [],
        hashes: entry?.tafHeader?.sha1Hash ? [entry.tafHeader.sha1Hash] : [],
        chapterNames: entry?.tonieInfo?.tracks ?? [],
    };
}

export function ModelEditor({
    start,
    onClose,
    onSaved,
}: {
    start: ModelEditorStart | null;
    onClose: () => void;
    onSaved?: (model: CustomModel) => void;
}) {
    const ui = useUi();
    const qc = useQueryClient();
    const invalidateTags = useInvalidateTags();
    const models = useCustomModels();
    const fetchFiles = useFetchFiles();
    const [draft, setDraft] = useState<CustomModel>(blank());
    const [kind, setKind] = useState<"figure" | "cover">("figure");
    const [original, setOriginal] = useState<string | null>(null);
    const [linked, setLinked] = useState<Linked | null>(null);
    const [linking, setLinking] = useState(false);
    const [pickFile, setPickFile] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState<CustomModel | null>(null);
    const [assign, setAssign] = useState(false);
    const [expert, setExpert] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const access = useAccess();
    const mayEdit = original ? access.mayChangeModel(original) : access.canCreateModels;

    const set = <K extends keyof CustomModel>(k: K, v: CustomModel[K]) => setDraft((d) => ({ ...d, [k]: v }));

    const link = async (path: string) => {
        setLinking(true);
        try {
            const l = await linkFile(fetchFiles, path);
            setLinked(l);
            const info = l.entry?.tonieInfo;
            // the file has a custom model already: edit that one instead of making a second
            const existing = models.data?.find((m) => l.audioIds.some((id) => m.audio_id.map(String).includes(id)));
            if (existing && !original) {
                setOriginal(existing.model);
                setDraft(structuredClone(existing));
                return;
            }
            setDraft((d) => ({
                ...d,
                audio_id: l.audioIds,
                hash: l.hashes,
                series: d.series || info?.series || stripExt(baseName(path)),
                episodes: d.episodes || info?.episode || "",
                pic: d.pic || info?.picture || "",
                tracks: d.tracks.length ? d.tracks : l.chapterNames,
            }));
            if (!l.audioIds.length) ui.toast("error", t("noAudioId"));
        } catch (e) {
            ui.toast("error", t("loadFailed"), String((e as Error).message));
        } finally {
            setLinking(false);
        }
    };

    useEffect(() => {
        if (!start) return;
        setSaved(null);
        setLinked(null);
        setExpert(false);
        if (start.mode === "edit") {
            setDraft(structuredClone(start.model));
            setOriginal(start.model.model);
            setKind(start.model.audio_id.length ? "cover" : "figure");
        } else if (start.mode === "override") {
            const i = start.info;
            setDraft({ ...blank(), model: i.model, series: i.series, episodes: i.episode, pic: i.picture, tracks: i.tracks ?? [], language: i.language || "de-de" });
            setOriginal(null);
            setKind("figure");
            setExpert(true);
        } else {
            setDraft(blank());
            setOriginal(null);
            setKind(start.mode);
            if (start.mode === "cover" && start.file) link(start.file);
        }
    }, [start]); // eslint-disable-line react-hooks/exhaustive-deps

    const modelId = draft.model.trim();
    /** an official figure with this number: the custom model replaces its data */
    const official = useQuery({
        queryKey: ["officialModel", modelId],
        queryFn: () => tc.searchTonies(modelId).then((list) => list.find((x) => x.model === modelId) ?? null),
        enabled: Boolean(start) && modelId.length >= 2,
    });

    /** what another custom model has already: its number, or the same audio id with the same hash */
    const duplicate = () => {
        const others = (models.data ?? []).filter((m) => m.model !== original);
        if (modelId && others.some((m) => m.model.toLowerCase() === modelId.toLowerCase())) return t("modelIdTaken", { model: modelId });
        const pairs = draft.audio_id.map((id, i) => `${id}/${(draft.hash[i] ?? "").toLowerCase()}`);
        const twin = others.find((m) => m.audio_id.some((id, i) => pairs.includes(`${id}/${(m.hash[i] ?? "").toLowerCase()}`)));
        return twin ? t("audioTaken", { model: twin.series || twin.model }) : "";
    };

    /** the same data as a new custom model with a number of its own */
    const copy = () => {
        setOriginal(null);
        setDraft((d) => ({ ...d, model: "", audio_id: [], hash: [], series: `${d.series} (${t("copyNoun")})` }));
        setLinked(null);
        ui.toast("info", t("copyCreated"));
    };

    const save = async () => {
        if (!draft.series.trim()) return ui.toast("error", t("nameRequired"));
        if (kind === "cover" && !draft.audio_id.length) return ui.toast("error", t("chooseFileFirst"));
        const dup = duplicate();
        if (dup) return ui.toast("error", dup);
        setSaving(true);
        const taken = new Set((models.data ?? []).map((m) => m.model.toLowerCase()));
        const model: CustomModel = {
            ...draft,
            series: draft.series.trim(),
            episodes: draft.episodes.trim(),
            tracks: draft.tracks.map((x) => x.trim()).filter(Boolean),
            model: draft.model.trim() || newModelId([draft.series, draft.episodes].filter(Boolean).join(" "), taken),
        };
        model.title = [model.series, model.episodes].filter(Boolean).join(" - ");
        const ok = await ui.run(async () => {
            if (original && original !== model.model) await tc.renameModel(original, model.model);
            await tc.upsertModel(model);
            return true;
        }, t("saved"));
        setSaving(false);
        if (!ok) return;
        qc.invalidateQueries({ queryKey: keys.customModels });
        qc.invalidateQueries({ queryKey: ["aclMine"] });
        qc.invalidateQueries({ queryKey: ["files"] });
        invalidateTags();
        onSaved?.(model);
        if (start?.mode === "figure") setSaved(model);
        else onClose();
    };

    const remove = async () => {
        if (!original) return;
        // the picture can go along when no other custom tonie shows it
        const pic = models.data?.find((m) => m.model === original)?.pic ?? "";
        const lastOfPic = pic.startsWith("/custom_img/") && !models.data?.some((m) => m.model !== original && m.pic === pic);
        const { ok: yes, checked } = await ui.confirmCheck({
            title: t("deleteModel"),
            text: t("deleteModelText", { name: draft.series || draft.model }),
            confirm: t("delete"),
            danger: true,
            check: lastOfPic ? { label: t("deletePictureToo"), value: true } : undefined,
        });
        if (!yes) return;
        const ok = await ui.run(() => tc.deleteModel(original, checked), t("deleted"));
        if (ok !== undefined) {
            qc.invalidateQueries({ queryKey: keys.customModels });
            invalidateTags();
            onClose();
        }
    };

    const uploadPic = async (file: File) => {
        // phone photos are megabytes: scale them down first
        const small = await shrinkImage(file, file.name).catch(() => file);
        const name = `${Date.now().toString(36)}-${small.name.replace(/[^\w.-]+/g, "_")}`;
        const renamed = new File([small], name, { type: small.type });
        const ok = await ui.run(() => tc.uploadCustomImage(renamed), t("imageUploaded"));
        if (ok !== undefined) set("pic", `/custom_img/${name}`);
    };

    const title = saved
        ? t("figureCreated")
        : original
          ? draft.series || draft.model
          : kind === "figure"
            ? t("newFigure")
            : t("newCover");

    return (
        <>
            <Sheet
                open={!!start}
                onClose={onClose}
                title={title}
                full
                footer={
                    saved ? (
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
                            {original && mayEdit && (
                                <button className="btn danger" style={{ flex: "0 0 auto" }} onClick={remove} aria-label={t("delete")}>
                                    <Trash2 size={18} />
                                </button>
                            )}
                            {original && access.canCreateModels && (
                                <button className="btn" style={{ flex: "0 0 auto" }} onClick={copy} aria-label={t("copyModel")} title={t("copyModel")}>
                                    <Copy size={18} />
                                </button>
                            )}
                            <button className="btn" onClick={onClose}>
                                {t("cancel")}
                            </button>
                            {mayEdit && (
                                <button className="btn primary" onClick={save} disabled={saving || linking}>
                                    {t("save")}
                                </button>
                            )}
                        </>
                    )
                }
            >
                {saved ? (
                    <div style={{ textAlign: "center", padding: "20px 0" }}>
                        <TonieImage src={saved.pic} size={140} />
                        <CheckCircle2 size={34} color="var(--ok)" style={{ margin: "14px auto 6px" }} />
                        <div style={{ fontWeight: 700, fontSize: 19 }}>{saved.series}</div>
                        {saved.episodes && <div className="muted">{saved.episodes}</div>}
                        <p className="muted small" style={{ maxWidth: 340, margin: "14px auto 0" }}>
                            {t("figureCreatedText")}
                        </p>
                    </div>
                ) : (
                    <fieldset disabled={!mayEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                        {!mayEdit && <Notice info>{t("modelNotYours")}</Notice>}
                        {official.data && <Notice info>{t("overridesOriginal", { model: official.data.model, name: [official.data.series, official.data.episode].filter(Boolean).join(" – ") })}</Notice>}
                        <p className="muted small" style={{ margin: "0 2px 14px" }}>
                            {kind === "figure" ? t("figureIntro") : t("coverIntro")}
                        </p>

                        {kind === "cover" && (
                            <Section title={t("audioFile")}>
                                <Row
                                    icon={linked?.entry?.tonieInfo?.picture ? undefined : <FileAudio size={17} />}
                                    leading={linked?.entry?.tonieInfo?.picture ? <TonieImage src={linked.entry.tonieInfo.picture} size={40} /> : undefined}
                                    title={linking ? t("loading") : linked ? baseName(linked.path) : draft.audio_id.length ? t("linkedAudioIds", { n: draft.audio_id.length }) : t("chooseFile")}
                                    sub={linked ? parentPath(linked.path) : draft.audio_id.length ? t("tapToRelink") : t("chooseFileHint")}
                                    onClick={() => setPickFile(true)}
                                    chevron
                                />
                            </Section>
                        )}

                        <div style={{ display: "flex", justifyContent: "center", margin: "6px 0 18px" }}>
                            <button
                                type="button"
                                className="no-drag"
                                style={{ border: "none", background: "none", padding: 0, position: "relative" }}
                                onClick={() => fileInput.current?.click()}
                                aria-label={t("picture")}
                            >
                                {draft.pic ? (
                                    <TonieImage src={draft.pic} size={150} />
                                ) : (
                                    <div className="tonie-pic-fallback" style={{ width: 150, height: 150, flexDirection: "column", gap: 6 }}>
                                        <Camera size={34} />
                                        <span className="small">{t("addPicture")}</span>
                                    </div>
                                )}
                                {draft.pic && (
                                    <span
                                        className="icon-btn"
                                        style={{ position: "absolute", right: -4, bottom: -4, width: 40, height: 40, background: "var(--accent)", color: "#fff" }}
                                    >
                                        <Camera size={18} />
                                    </span>
                                )}
                            </button>
                            <input
                                ref={fileInput}
                                type="file"
                                accept="image/*"
                                className="hidden-input"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) uploadPic(f);
                                    e.target.value = "";
                                }}
                            />
                        </div>

                        <div className="field">
                            <label>{kind === "figure" ? t("figureName") : t("albumTitle")}</label>
                            <input
                                className="input"
                                value={draft.series}
                                onChange={(e) => set("series", e.target.value)}
                                placeholder={kind === "figure" ? t("figureNamePlaceholder") : t("albumTitlePlaceholder")}
                            />
                        </div>
                        <div className="field">
                            <label>{t("subtitleOptional")}</label>
                            <input className="input" value={draft.episodes} onChange={(e) => set("episodes", e.target.value)} placeholder={t("subtitlePlaceholder")} />
                        </div>
                        <div className="field">
                            <label>{t("tracks")}</label>
                            <textarea
                                className="textarea"
                                rows={5}
                                value={draft.tracks.join("\n")}
                                onChange={(e) => set("tracks", e.target.value.split("\n"))}
                                placeholder={t("tracksPlaceholder")}
                            />
                            <div className="hint">{t("tracksHint")}</div>
                        </div>
                        {kind === "cover" && linked && linked.path && isTap(linked.path) && <Notice info>{t("tapCoverHint")}</Notice>}

                        <button type="button" className="btn ghost small" style={{ padding: "0 4px" }} onClick={() => setExpert((v) => !v)}>
                            <Link2 size={15} />
                            {expert ? t("hideExpert") : t("showExpert")}
                        </button>
                        {expert && (
                            <div className="mt">
                                <div className="field">
                                    <label>{t("modelId")}</label>
                                    <input className="input mono" value={draft.model} onChange={(e) => set("model", e.target.value)} placeholder={t("automatic")} />
                                    <div className="hint">{original ? t("modelIdRenameHint") : t("modelIdAutoHint")}</div>
                                </div>
                                <div className="field">
                                    <label>Audio-IDs</label>
                                    <input className="input mono" value={draft.audio_id.join(", ")} onChange={(e) => set("audio_id", e.target.value.split(/[,\s]+/).filter(Boolean))} />
                                </div>
                                <div className="field">
                                    <label>SHA1-Hashes</label>
                                    <input className="input mono" value={draft.hash.join(", ")} onChange={(e) => set("hash", e.target.value.split(/[,\s]+/).filter(Boolean))} />
                                </div>
                                <div className="field">
                                    <label>{t("picture")} (URL)</label>
                                    <input className="input mono" value={draft.pic} onChange={(e) => set("pic", e.target.value)} />
                                </div>
                                <div className="field">
                                    <label>{t("language")}</label>
                                    <input className="input" value={draft.language} onChange={(e) => set("language", e.target.value)} />
                                </div>
                                <div className="field">
                                    <label>{t("category")}</label>
                                    <input className="input" value={draft.category ?? ""} onChange={(e) => set("category", e.target.value)} />
                                </div>
                            </div>
                        )}
                    </fieldset>
                )}
            </Sheet>

            <LibraryPicker
                open={pickFile}
                onClose={() => setPickFile(false)}
                onPick={(source) => link("/" + source.replace(/^lib:\/\//, ""))}
                startPath={linked ? parentPath(linked.path) : "/"}
                title={t("chooseFile")}
            />
            <TagPicker
                open={assign}
                onClose={() => setAssign(false)}
                title={t("assignToTonie")}
                onPick={async (tag) => {
                    if (!saved) return;
                    await ui.run(() => tc.setContent(tag.ruid, "tonie_model", saved.model, tag.overlay || undefined), t("figureSet"));
                    invalidateTags();
                    onClose();
                }}
            />
        </>
    );
}

