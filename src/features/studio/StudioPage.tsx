import { useQuery, useQueryClient } from "@tanstack/react-query";
import { strToU8, zipSync } from "fflate";
import { CheckSquare, ExternalLink, FileDown, Share2, FolderPlus, ImagePlus, ListPlus, Pencil, Plus, Printer, RotateCcw, Save, Scissors, Square, Trash2 } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { tc } from "../../api/tc";
import type { TonieInfo } from "../../api/types";
import { isTaf, isTap, picUrl, tagInfo } from "../../lib/format";
import { t } from "../../lib/i18n";
import { getPref, setPref } from "../../lib/prefs";
import { saveFile } from "../../lib/download";
import { shrinkImage } from "../../lib/image";
import { keys, useAllTags } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { useSelection } from "../../ui/useSelection";
import { LibraryPicker } from "../library/LibraryPicker";
import { TonieImage } from "../../ui/TonieImage";
import { Empty, Notice, Page, Row, SearchField, Section, Segmented, SwitchRow, useUi } from "../../ui/kit";
import { useAccess } from "../../lib/access";
import { flagUrl } from "./flags";
import { FONTS, fontFaces } from "./fonts";
import { studioPdf } from "./pdf";
import { ALIGN, DEFAULTS, effective, labelList, PAPER_MM, sheetGrid, textOn, type LabelSettings, type StudioItem, type StudioSettings } from "./studio";

/*
 * TeddyStudio: labels for tonies, a picture label and a text label per tonie, laid out on a
 * sheet of paper and printed by the browser or saved as a PDF. Items and settings stay on this device.
 */

/** label sheets with their layout (the same presets as the classic UI) */
const PRESETS: Record<string, { label: string; settings: Partial<StudioSettings> }> = {
    avery5080: { label: "Avery 5080", settings: { shape: "round", paper: "A4", marginTop: 5, marginLeft: 8, bleed: 1, gapX: 10, gapY: 7, border: false } },
    averyl3415: { label: "Avery L3415 / L7105 / L7780", settings: { shape: "round", paper: "A4", marginTop: 13, marginLeft: 15, bleed: 1, gapX: 6, gapY: 6, border: false } },
    avery40rnd: { label: "Avery 40-RND", settings: { shape: "round", paper: "A4", marginTop: 13, marginLeft: 15, bleed: 1, gapX: 6, gapY: 6, border: false } },
    avery5160: { label: "Avery 5160", settings: { shape: "square", paper: "A4", marginTop: 5, marginLeft: 8, bleed: 1, gapX: 12, gapY: 8, border: false } },
};

const load = <T,>(key: string, fallback: T): T => {
    try {
        return { ...fallback, ...JSON.parse(getPref(key, "")) };
    } catch {
        return fallback;
    }
};

const loadItems = (): StudioItem[] => {
    try {
        const v = JSON.parse(getPref("studio.items", "[]"));
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
};

const itemOf = (info: TonieInfo, id = `${info.model || info.series}-${Date.now()}-${Math.random()}`): StudioItem => ({
    id,
    title: info.series || "",
    episode: info.episode || "",
    pic: info.picture || "",
    tracks: info.tracks ?? [],
    model: info.model || "",
    language: info.language,
});

/** the styles of the printed sheet, also used by the preview (styles.css repeats them for the screen) */
const PRINT_CSS = `
body { margin: 0; font-family: system-ui, sans-serif; }
.studio-paper { display: grid; align-content: start; justify-content: start; box-sizing: border-box; overflow: hidden; background: #fff; color: #000; break-after: page; page-break-after: always; }
.studio-paper:last-child { break-after: auto; page-break-after: auto; }
.studio-label { position: relative; display: flex; align-items: center; justify-content: center; flex-direction: column; overflow: hidden; box-sizing: border-box; text-align: center; line-height: 1.2; padding: 2mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.studio-label:not(.text) { padding: 0; }
.studio-label img { object-fit: cover; flex-shrink: 0; }
.studio-label ol { margin: 0; padding-left: 1.4em; text-align: left; font-size: 0.8em; }
.studio-series { position: absolute; top: 12%; left: 10%; right: 10%; transform: translateY(-50%); font-weight: 700; color: #fff; text-shadow: 0 0 0.6mm #000, 0 0 0.6mm #000; white-space: nowrap; overflow: hidden; }
.studio-arc { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.studio-flag { width: 6mm !important; height: 4mm !important; margin-top: 1mm; object-fit: contain !important; }
`;

/** prints the sheet alone in a hidden frame, so nothing else of the page takes room on paper */
const printSheet = (paper: StudioSettings["paper"]) => {
    const pages = [...document.querySelectorAll(".studio-paper")];
    if (!pages.length) return;
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>@page { size: ${paper} portrait; margin: 0; }${PRINT_CSS}${fontFaces()}</style></head><body>${pages.map((p) => p.outerHTML).join("")}</body></html>`);
    doc.close();
    const images = [...doc.images];
    Promise.all(images.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => (img.onload = img.onerror = r))))).then(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(() => frame.remove(), 1000);
    });
};

const fmt = (n: number) => Number(n.toFixed(3)).toString();

/**
 * the cut lines of one sheet for a laser cutter, in millimetres: layer "Blatt" with the outline of
 * the paper to place it, layer "Schnitt" with a circle or rounded rectangle at every printed label
 */
const cutSvg = (s: StudioSettings, count: number) => {
    const { pw, ph, w, h, cols } = sheetGrid(s);
    const shapes = Array.from({ length: count }, (_, i) => {
        const x = s.marginLeft + (i % cols) * (w + s.gapX);
        const y = s.marginTop + Math.floor(i / cols) * (h + s.gapY);
        return s.shape === "round"
            ? `<circle cx="${fmt(x + w / 2)}" cy="${fmt(y + h / 2)}" r="${fmt(w / 2)}"/>`
            : `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="2" ry="2"/>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${pw}mm" height="${ph}mm" viewBox="0 0 ${pw} ${ph}">
  <g id="blatt" inkscape:groupmode="layer" inkscape:label="Blatt" fill="none" stroke="#0000ff" stroke-width="0.1">
    <rect x="0" y="0" width="${pw}" height="${ph}"/>
  </g>
  <g id="schnitt" inkscape:groupmode="layer" inkscape:label="Schnitt" fill="none" stroke="#ff0000" stroke-width="0.1">
    ${shapes.join("\n    ")}
  </g>
</svg>
`;
};

/**
 * the cut lines: one SVG for a full sheet (the same for all full ones) and, when the last sheet is
 * not full, one for it; both together as a zip
 */
const downloadCut = (s: StudioSettings, total: number) => {
    const { cols, rows } = sheetGrid(s);
    const per = cols * rows;
    const full = Math.floor(total / per);
    const rest = total % per;
    const name = `teddystudio-${s.paper.toLowerCase()}-${s.shape === "round" ? `${s.diameter}mm` : `${s.width}x${s.height}mm`}`;
    const files: Record<string, string> = {};
    if (full) files[`${name}-voll-${full}x.svg`] = cutSvg(s, per);
    if (rest) files[`${name}-rest-${rest}.svg`] = cutSvg(s, rest);
    const names = Object.keys(files);
    const blob =
        names.length === 1
            ? new Blob([files[names[0]]], { type: "image/svg+xml" })
            : new Blob([zipSync(Object.fromEntries(names.map((n) => [n, strToU8(files[n])])), { level: 6 }) as BlobPart], { type: "application/zip" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = names.length === 1 ? names[0] : `${name}.zip`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

export function StudioPage() {
    const ui = useUi();
    const tags = useAllTags();
    const [items, setItems] = useState<StudioItem[]>(loadItems);
    const [s, setS] = useState<StudioSettings>(() => load("studio.settings", DEFAULTS));
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState<StudioItem | null>(null);

    const imageInput = useRef<HTMLInputElement>(null);
    const qc = useQueryClient();

    // the bundled fonts for the preview
    useEffect(() => {
        if (document.getElementById("studio-fonts")) return;
        const style = document.createElement("style");
        style.id = "studio-fonts";
        style.textContent = fontFaces();
        document.head.appendChild(style);
    }, []);
    useEffect(() => setPref("studio.items", JSON.stringify(items)), [items]);
    useEffect(() => setPref("studio.settings", JSON.stringify(s)), [s]);
    const set = (patch: Partial<StudioSettings>) => setS((prev) => ({ ...prev, ...patch }));

    /** adds pictures and titles not in the list yet (one per model, or per title without one) */
    const [pickFolder, setPickFolder] = useState(false);
    const addInfos = (infos: TonieInfo[]) => {
        const key = (x: { model?: string; series?: string; episode?: string }) => x.model || `${x.series}${x.episode}`;
        const known = new Set(items.map((i) => i.model || i.title + i.episode));
        const fresh = infos
            .filter((info) => (info.series || info.episode) && !known.has(key(info)))
            .filter((info, i, list) => list.findIndex((x) => key(x) === key(info)) === i);
        setItems((prev) => [...prev, ...fresh.map((info) => itemOf(info))]);
        ui.toast(fresh.length ? "ok" : "info", t("studioAdded", { n: fresh.length }));
    };

    /** my tonies, without system ones and those hidden */
    const addMine = () => addInfos((tags.data ?? []).filter((tag) => tag.type !== "system" && !tag.hide).map((tag) => tagInfo(tag)));

    /** every TAF and playlist with a title in a library folder and the folders below, hidden ones left out */
    const addFolder = async (folder: string) => {
        const files = await ui.run(() => tc.walkTree(folder));
        if (!files) return;
        addInfos(
            files
                .filter(({ entry }) => !entry.isDir && !entry.hide && (isTaf(entry.name) || isTap(entry.name)) && entry.tonieInfo)
                .map(({ entry }) => entry.tonieInfo!),
        );
    };

    /** pictures of this device, only for this print: they stay in the list, not in the library */
    const addImages = async (files: FileList) => {
        const added: StudioItem[] = [];
        for (const file of [...files]) {
            const small = await shrinkImage(file, file.name).catch(() => file);
            const pic = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(small);
            });
            added.push(itemOf({ series: file.name.replace(/\.[^.]+$/, ""), episode: "", picture: pic, tracks: [], model: "" }));
        }
        setItems((prev) => [...prev, ...added]);
    };

    // making the PDF takes a while; phones hand out a file only on a tap, so it is offered afterwards
    const [made, setMade] = useState<{ file: File; missing: number } | null>(null);
    const pdf = async (list = items) => {
        ui.toast("info", t("studioPdfMaking"));
        const r = await ui.run(() => studioPdf(list, s));
        if (r) setMade({ file: new File([r.blob], `teddystudio-${new Date().toISOString().slice(0, 10)}.pdf`, { type: "application/pdf" }), missing: r.missing });
    };

    /**
     * teddyCloud keeps the pictures of tonies.json itself from now on (/cache/…, loadable for the PDF);
     * the labels get these addresses and the PDF is made again
     */
    const cachePictures = async () => {
        const list = await ui.run(async () => {
            await tc.setSetting("tonie_json.cache_images", true);
            await tc.reloadToniesJson();
            return Promise.all(
                items.map(async (item) => {
                    if (!/^https?:/.test(item.pic) || !item.model) return item;
                    const hit = (await tc.searchTonies(item.model).catch(() => [])).find((x) => x.model === item.model);
                    return hit?.picture && !/^https?:/.test(hit.picture) ? { ...item, pic: hit.picture } : item;
                }),
            );
        });
        if (!list) return;
        setItems(list);
        qc.invalidateQueries({ queryKey: keys.allTags });
        setMade(null);
        ui.toast("ok", t("studioCacheOn"));
        await pdf(list);
    };

    return (
        <Page
            title={t("teddyStudio")}
            subtitle={t("teddyStudioHint")}
            back="/more"
            right={
                <>
                    <button className="icon-btn" onClick={() => downloadCut(s, labelList(items, s).length)} disabled={!items.length} aria-label={t("studioCutSvg")} title={t("studioCutSvg")}>
                        <Scissors size={20} />
                    </button>
                    <button className="icon-btn" onClick={() => pdf()} disabled={!items.length} aria-label={t("studioPdf")} title={t("studioPdf")}>
                        <FileDown size={20} />
                    </button>
                    <button className="icon-btn" onClick={() => printSheet(s.paper)} disabled={!items.length} aria-label={t("studioPrint")} title={t("studioPrint")}>
                        <Printer size={20} />
                    </button>
                </>
            }
        >
            <div className="studio">
                <div className="studio-side">
                    <Section
                        title={t("studioTonies", { n: items.length })}
                        right={
                            items.length > 0 && (
                                <button className="btn ghost small" onClick={() => setItems([])}>
                                    {t("clear")}
                                </button>
                            )
                        }
                    >
                        <Row icon={<Plus size={17} />} title={t("studioAdd")} accent onClick={() => setAdding(true)} chevron={false} />
                        <Row icon={<ListPlus size={17} />} title={t("studioAddMine")} onClick={addMine} chevron={false} disabled={!tags.data} />
                        <Row icon={<FolderPlus size={17} />} title={t("studioAddFolder")} onClick={() => setPickFolder(true)} chevron={false} />
                        <Row icon={<ImagePlus size={17} />} title={t("studioAddImage")} sub={t("studioAddImageHint")} onClick={() => imageInput.current?.click()} chevron={false} />
                        <input
                            ref={imageInput}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden-input"
                            onChange={(e) => {
                                if (e.target.files?.length) addImages(e.target.files);
                                e.target.value = "";
                            }}
                        />
                        {items.map((item) => (
                            <Row
                                key={item.id}
                                leading={<TonieImage src={item.pic} size={36} />}
                                title={item.title || item.episode || "–"}
                                sub={item.title ? item.episode : undefined}
                                onClick={() => setEditing(item)}
                                chevron={false}
                                right={
                                    <span className="row-gap">
                                        <Pencil size={16} className="muted" />
                                        <button
                                            className="icon-btn"
                                            aria-label={t("delete")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setItems((prev) => prev.filter((x) => x.id !== item.id));
                                            }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </span>
                                }
                            />
                        ))}
                    </Section>
                    <StudioSettingsSection s={s} set={set} />
                </div>
                <div className="studio-preview">
                    {items.length === 0 ? (
                        <Empty icon={<Printer size={28} />} title={t("studioEmpty")} text={t("studioEmptyText")} />
                    ) : (
                        <Sheet_ items={items} s={s} />
                    )}
                </div>
            </div>
            <PdfSheet made={made} onClose={() => setMade(null)} onCachePictures={cachePictures} />
            <AddSheet open={adding} onClose={() => setAdding(false)} onAdd={addInfos} />
            <LibraryPicker
                open={pickFolder}
                onClose={() => setPickFolder(false)}
                folderMode
                title={t("studioAddFolder")}
                onPick={(folder) => {
                    setPickFolder(false);
                    addFolder(folder);
                }}
            />
            <EditSheet
                s={s}
                item={editing}
                onClose={() => setEditing(null)}
                onSave={(item) => setItems((prev) => prev.map((x) => (x.id === item.id ? item : x)))}
            />
        </Page>
    );
}

function NumberField({ label, value, onChange, unit = "mm", step = 1 }: { label: string; value: number; onChange: (v: number) => void; unit?: string; step?: number }) {
    return (
        <label className="studio-field">
            <span>{label}</span>
            <input className="input" type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
            <span className="muted small">{unit}</span>
        </label>
    );
}

/** the settings a label may have of its own; the sheet has them too */
const LABEL_FIELDS: {
    key: keyof LabelSettings;
    label: () => string;
    kind: "number" | "select" | "color" | "bool";
    unit?: string;
    step?: number;
    options?: () => { value: string; label: string }[];
}[] = [
    { key: "mode", label: () => t("studioMode"), kind: "select", options: () => [{ value: "both", label: t("studioBoth") }, { value: "image", label: t("studioImage") }, { value: "text", label: t("studioText") }] },
    { key: "text", label: () => t("studioTextLabel"), kind: "select", options: () => [{ value: "title", label: t("studioTitle") }, { value: "tracks", label: t("studioTracks") }] },
    { key: "font", label: () => t("studioFont"), kind: "select", options: () => FONTS.map((f) => ({ value: f.css, label: f.label })) },
    { key: "fontSize", label: () => t("studioFontSize"), kind: "number", unit: "pt" },
    { key: "padding", label: () => t("studioPadding"), kind: "number", unit: "mm", step: 0.5 },
    { key: "background", label: () => t("studioBackground"), kind: "color" },
    { key: "imageScale", label: () => t("studioImageScale"), kind: "number", unit: "%", step: 5 },
    {
        key: "imageAlign",
        label: () => t("studioImageAlign"),
        kind: "select",
        options: () => (["center", "top", "bottom", "left", "right"] as const).map((v) => ({ value: v, label: t(`studioAlign_${v}`) })),
    },
    { key: "imageOffsetX", label: () => t("studioImageOffsetX"), kind: "number", unit: "mm", step: 0.5 },
    { key: "imageOffsetY", label: () => t("studioImageOffsetY"), kind: "number", unit: "mm", step: 0.5 },
    { key: "seriesFontSize", label: () => t("studioSeriesFontSize"), kind: "number", unit: "pt" },
    { key: "seriesOnImage", label: () => t("studioSeriesOnImage"), kind: "bool" },
    { key: "rotateSeries", label: () => t("studioRotateSeries"), kind: "bool" },
    { key: "showModel", label: () => t("studioShowModel"), kind: "bool" },
    { key: "flag", label: () => t("studioFlag"), kind: "bool" },
];

/** the label settings; with changed/reset the fields that differ from the sheet get a reset button */
function LabelFields({
    value,
    onChange,
    changed,
    onReset,
}: {
    value: LabelSettings;
    onChange: (patch: Partial<LabelSettings>) => void;
    changed?: (key: keyof LabelSettings) => boolean;
    onReset?: (key: keyof LabelSettings) => void;
}) {
    const reset = (key: keyof LabelSettings) =>
        changed?.(key) && (
            <button type="button" className="btn ghost small" style={{ padding: 0, height: "auto" }} onClick={() => onReset?.(key)} aria-label={t("reset")} title={t("reset")}>
                <RotateCcw size={13} />
            </button>
        );
    const field = (f: (typeof LABEL_FIELDS)[number]) => {
        const v = value[f.key];
        return (
            <label key={f.key} className="studio-field">
                <span>
                    {f.label()} {reset(f.key)}
                </span>
                {f.kind === "select" ? (
                    <select className="select" value={String(v)} onChange={(e) => onChange({ [f.key]: e.target.value })}>
                        {f.options!().map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                ) : f.kind === "color" ? (
                    <input type="color" value={String(v)} onChange={(e) => onChange({ [f.key]: e.target.value })} />
                ) : (
                    <input className="input" type="number" step={f.step ?? 1} value={Number(v)} onChange={(e) => onChange({ [f.key]: Number(e.target.value) || 0 })} />
                )}
                {f.unit && <span className="muted small">{f.unit}</span>}
            </label>
        );
    };
    return (
        <>
            <div className="studio-settings">{LABEL_FIELDS.filter((f) => f.kind !== "bool").map(field)}</div>
            {LABEL_FIELDS.filter((f) => f.kind === "bool").map((f) => (
                <SwitchRow
                    key={f.key}
                    title={
                        <>
                            {f.label()} {reset(f.key)}
                        </>
                    }
                    checked={Boolean(value[f.key])}
                    onChange={(on) => onChange({ [f.key]: on })}
                />
            ))}
        </>
    );
}

/** templates of the user: whole settings under a name */
const loadTemplates = (): Record<string, StudioSettings> => {
    try {
        return JSON.parse(getPref("studio.templates", "{}"));
    } catch {
        return {};
    }
};

function StudioSettingsSection({ s, set }: { s: StudioSettings; set: (p: Partial<StudioSettings>) => void }) {
    const ui = useUi();
    const [templates, setTemplates] = useState(loadTemplates);
    const store = (next: Record<string, StudioSettings>) => {
        setTemplates(next);
        setPref("studio.templates", JSON.stringify(next));
    };
    const saveTemplate = async () => {
        const name = await ui.prompt({ title: t("studioSaveTemplate"), label: t("name") });
        if (name) store({ ...templates, [name]: s });
    };
    const deleteTemplate = () =>
        ui.actions(
            t("studioDeleteTemplate"),
            Object.keys(templates).map((name) => ({
                label: name,
                icon: <Trash2 size={17} />,
                danger: true,
                onSelect: () => {
                    const { [name]: _, ...rest } = templates;
                    store(rest);
                },
            })),
        );
    return (
        <Section title={t("studioLabels")}>
            <div className="studio-settings">
                <label className="studio-field wide">
                    <span>{t("studioPreset")}</span>
                    <select
                        className="select"
                        value=""
                        onChange={(e) => {
                            const [kind, id] = e.target.value.split(":", 2);
                            if (kind === "preset") set(PRESETS[id].settings);
                            if (kind === "own") set(templates[id]);
                        }}
                    >
                        <option value="">{t("studioPresetPick")}</option>
                        {Object.entries(PRESETS).map(([id, p]) => (
                            <option key={id} value={`preset:${id}`}>
                                {p.label}
                            </option>
                        ))}
                        {Object.keys(templates).map((name) => (
                            <option key={name} value={`own:${name}`}>
                                {name}
                            </option>
                        ))}
                    </select>
                </label>
                <Segmented value={s.shape} onChange={(shape) => set({ shape })} options={[{ value: "round", label: t("studioRound") }, { value: "square", label: t("studioSquare") }]} />
                {s.shape === "round" ? (
                    <NumberField label={t("studioDiameter")} value={s.diameter} onChange={(diameter) => set({ diameter })} />
                ) : (
                    <>
                        <NumberField label={t("studioWidth")} value={s.width} onChange={(width) => set({ width })} />
                        <NumberField label={t("studioHeight")} value={s.height} onChange={(height) => set({ height })} />
                    </>
                )}
                <label className="studio-field">
                    <span>{t("studioPaper")}</span>
                    <select className="select" value={s.paper} onChange={(e) => set({ paper: e.target.value as StudioSettings["paper"] })}>
                        {Object.keys(PAPER_MM).map((p) => (
                            <option key={p}>{p}</option>
                        ))}
                    </select>
                </label>
                <NumberField label={t("studioMarginTop")} value={s.marginTop} onChange={(marginTop) => set({ marginTop })} />
                <NumberField label={t("studioMarginLeft")} value={s.marginLeft} onChange={(marginLeft) => set({ marginLeft })} />
                <NumberField label={t("studioGapX")} value={s.gapX} onChange={(gapX) => set({ gapX })} />
                <NumberField label={t("studioGapY")} value={s.gapY} onChange={(gapY) => set({ gapY })} />
                <NumberField label={t("studioBleed")} value={s.bleed} onChange={(bleed) => set({ bleed })} step={0.5} />
            </div>
            <SwitchRow title={t("studioBorder")} sub={t("studioBorderHint")} checked={s.border} onChange={(border) => set({ border })} />
            <LabelFields value={s} onChange={set} />
            <Row icon={<Save size={17} />} title={t("studioSaveTemplate")} onClick={saveTemplate} chevron={false} />
            {Object.keys(templates).length > 0 && <Row icon={<Trash2 size={17} />} title={t("studioDeleteTemplate")} onClick={deleteTemplate} chevron={false} />}
            <Row icon={<RotateCcw size={17} />} title={t("studioReset")} onClick={() => set(DEFAULTS)} chevron={false} />
        </Section>
    );
}

/** the picture of a flag, loaded when needed */
const useFlag = (language?: string) => useQuery({ queryKey: ["flag", language], queryFn: () => flagUrl(language), enabled: Boolean(language), staleTime: Infinity }).data;

/** text along the upper arc of a round label, as the PDF draws it */
function ArcText({ id, text, e, w }: { id: string; text: string; e: StudioSettings; w: number }) {
    const size = (e.seriesFontSize * 0.3528 * 100) / w;
    const r = 50 - size * 0.9;
    return (
        <svg className="studio-arc" viewBox="0 0 100 100">
            <path id={id} d={`M ${50 - r},50 A ${r},${r} 0 0,1 ${50 + r},50`} fill="none" />
            <text fontSize={size} fontWeight={700} fontFamily={e.font} fill="#fff" stroke="rgba(0,0,0,0.75)" strokeWidth={size / 5} paintOrder="stroke" dominantBaseline="middle">
                <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
                    {text}
                </textPath>
            </text>
        </svg>
    );
}

function LabelView({ label: { item, e, kind }, s, index }: { label: ReturnType<typeof labelList>[number]; s: StudioSettings; index: number }) {
    const { w, h } = sheetGrid(s);
    const round = s.shape === "round";
    const flag = useFlag(kind === "text" && e.flag ? item.language : undefined);
    const style: CSSProperties = {
        width: `${w}mm`,
        height: `${h}mm`,
        borderRadius: round ? "50%" : "2mm",
        background: e.background,
        color: textOn(e.background),
        border: s.border ? "0.2mm solid #999" : "none",
        fontSize: `${e.fontSize}pt`,
        fontFamily: e.font,
        padding: kind === "text" ? (round ? `${e.padding}mm calc(10% + ${e.padding}mm)` : `${e.padding}mm`) : 0,
    };
    if (kind === "image") {
        const [fx, fy] = ALIGN[e.imageAlign];
        return (
            <div className="studio-label" style={style}>
                {item.pic && (
                    <img
                        src={picUrl(item.pic)}
                        alt=""
                        style={{
                            width: `calc(100% + ${2 * s.bleed}mm)`,
                            height: `calc(100% + ${2 * s.bleed}mm)`,
                            margin: `-${s.bleed}mm`,
                            objectPosition: `${fx * 100}% ${fy * 100}%`,
                            transform: `translate(${e.imageOffsetX}mm, ${-e.imageOffsetY}mm) scale(${e.imageScale / 100})`,
                        }}
                    />
                )}
                {e.seriesOnImage &&
                    item.title &&
                    (round && e.rotateSeries ? (
                        <ArcText id={`arc-${index}`} text={item.title} e={e} w={w} />
                    ) : (
                        <div className="studio-series" style={{ fontSize: `${e.seriesFontSize}pt` }}>
                            {item.title}
                        </div>
                    ))}
            </div>
        );
    }
    return (
        <div className="studio-label text" style={style}>
            {e.text === "tracks" && item.tracks.length ? (
                <ol>
                    {item.tracks.map((tr, i) => (
                        <li key={i}>{tr}</li>
                    ))}
                </ol>
            ) : (
                <div>
                    <strong>{item.title}</strong>
                    {item.episode && <div>{item.episode}</div>}
                </div>
            )}
            {e.showModel && item.model && <small>{item.model}</small>}
            {flag && <img className="studio-flag" src={flag} alt="" />}
        </div>
    );
}

/** the printed sheets, one per page of the paper size; on screen a scaled preview of each */
function Sheet_({ items, s }: { items: StudioItem[]; s: StudioSettings }) {
    const { pw, ph, w, h, cols, rows } = sheetGrid(s);
    const labels = labelList(items, s).map((l, i) => <LabelView key={`${l.item.id}-${l.kind}`} label={l} s={s} index={i} />);
    const perPage = cols * rows;
    const pages = Array.from({ length: Math.max(1, Math.ceil(labels.length / perPage)) }, (_, i) => labels.slice(i * perPage, (i + 1) * perPage));
    return (
        <div className="studio-pages">
            {pages.map((page, i) => (
                <div key={i} className="studio-page">
                    <div
                        className="studio-paper"
                        style={{
                            width: `${pw}mm`,
                            height: `${ph}mm`,
                            padding: `${s.marginTop}mm 0 0 ${s.marginLeft}mm`,
                            gridTemplateColumns: `repeat(${cols}, ${w}mm)`,
                            gridAutoRows: `${h}mm`,
                            gap: `${s.gapY}mm ${s.gapX}mm`,
                        }}
                    >
                        {page}
                    </div>
                    <div className="studio-page-no small muted">
                        {t("studioPage", { n: i + 1, of: pages.length, per: perPage })}
                    </div>
                </div>
            ))}
        </div>
    );
}

function AddSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (infos: TonieInfo[]) => void }) {
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [query]);
    const search = useQuery({ queryKey: ["tonieSearch", debounced], queryFn: () => tc.searchTonies(debounced), enabled: open && debounced.length >= 2 });
    const results = (search.data ?? []).slice(0, 60);
    const ids = results.map((_, i) => String(i));
    // a click adds one; Shift (range) or Ctrl/Cmd (single) selects several, a long press on touch screens too
    const sel = useSelection((id) => onAdd([results[Number(id)]]), ids);
    useEffect(() => sel.clear(), [debounced, open]);
    const addSelected = () => {
        onAdd(ids.filter((id) => sel.selected.has(id)).map((id) => results[Number(id)]));
        sel.clear();
    };
    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={t("studioAdd")}
            full
            footer={
                sel.selected.size > 0 ? (
                    <>
                        <button className="btn" onClick={sel.clear}>
                            {t("cancel")}
                        </button>
                        <button className="btn primary" onClick={addSelected}>
                            {t("studioAddSelected", { n: sel.selected.size })}
                        </button>
                    </>
                ) : undefined
            }
        >
            <SearchField value={query} onChange={setQuery} placeholder={t("studioSearch")} autoFocus />
            {results.length > 0 && <div className="small muted mt">{t("studioMultiHint")}</div>}
            <div className="list mt">
                {results.map((info, i) => (
                    <div key={`${info.model}-${i}`} className="row-wrap" role="button" tabIndex={0} {...sel.itemProps(String(i))}>
                        <Row
                            className={sel.selected.has(String(i)) ? "checked" : ""}
                            leading={<TonieImage src={info.picture} size={40} />}
                            title={info.series}
                            sub={[info.episode, info.model].filter(Boolean).join(" · ")}
                            chevron={false}
                            right={sel.selected.has(String(i)) ? <CheckSquare size={18} /> : sel.selecting ? <Square size={18} /> : <Plus size={18} />}
                        />
                    </div>
                ))}
            </div>
        </Sheet>
    );
}

function EditSheet({ s, item, onClose, onSave }: { s: StudioSettings; item: StudioItem | null; onClose: () => void; onSave: (item: StudioItem) => void }) {
    const [draft, setDraft] = useState<StudioItem | null>(item);
    useEffect(() => setDraft(item), [item]);
    if (!draft) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
    const field = (key: "title" | "episode" | "pic", label: string) => (
        <div className="field">
            <label>{label}</label>
            <input className="input" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
        </div>
    );
    const overrides = draft.overrides ?? {};
    return (
        <Sheet
            open={!!item}
            onClose={onClose}
            title={t("studioEdit")}
            full
            footer={
                <>
                    <button className="btn" onClick={onClose}>
                        {t("cancel")}
                    </button>
                    <button
                        className="btn primary"
                        onClick={() => {
                            onSave(draft);
                            onClose();
                        }}
                    >
                        {t("save")}
                    </button>
                </>
            }
        >
            {field("title", t("studioTitle"))}
            {field("episode", t("studioEpisode"))}
            {!draft.pic.startsWith("data:") && field("pic", t("studioPicture"))}
            <div className="field">
                <label>{t("studioTracks")}</label>
                <textarea className="input" rows={6} value={draft.tracks.join("\n")} onChange={(e) => setDraft({ ...draft, tracks: e.target.value.split("\n") })} />
            </div>
            <Section
                title={t("studioThisLabel")}
                footer={t("studioThisLabelHint")}
                right={
                    Object.keys(overrides).length > 0 && (
                        <button className="btn ghost small" onClick={() => setDraft({ ...draft, overrides: undefined })}>
                            {t("reset")}
                        </button>
                    )
                }
            >
                <LabelFields
                    value={effective(s, draft)}
                    onChange={(patch) => setDraft({ ...draft, overrides: { ...overrides, ...patch } })}
                    changed={(key) => key in overrides}
                    onReset={(key) => {
                        const { [key]: _, ...rest } = overrides;
                        setDraft({ ...draft, overrides: rest });
                    }}
                />
            </Section>
        </Sheet>
    );
}

/** the finished PDF: share (phones), save or open it */
function PdfSheet({ made, onClose, onCachePictures }: { made: { file: File; missing: number } | null; onClose: () => void; onCachePictures: () => Promise<void> }) {
    const access = useAccess();
    const [busy, setBusy] = useState(false);
    const canShare = made !== null && typeof navigator.canShare === "function" && navigator.canShare({ files: [made.file] });
    const cacheImages = async () => {
        setBusy(true);
        await onCachePictures();
        setBusy(false);
    };
    return (
        <Sheet open={made !== null} onClose={onClose} title={t("studioPdfReady")}>
            {made && made.missing > 0 && (
                <Notice>
                    {t("studioPdfMissing", { n: made.missing })}. {t("studioPdfMissingHint")}
                    {access.canServerSettings && (
                        <div className="mt">
                            <button className="btn soft small" onClick={cacheImages} disabled={busy}>
                                {busy ? <span className="spinner small" /> : null}
                                {t("studioCacheTurnOn")}
                            </button>
                            <div className="small muted" style={{ marginTop: 6 }}>
                                {t("studioCacheTurnOnHint")}
                            </div>
                        </div>
                    )}
                </Notice>
            )}
            <div className="list mt">
                {canShare && (
                    <Row
                        icon={<Share2 size={17} />}
                        title={t("studioPdfShare")}
                        sub={t("studioPdfShareHint")}
                        onClick={() => navigator.share({ files: [made!.file], title: made!.file.name }).then(onClose, () => undefined)}
                        chevron={false}
                    />
                )}
                <Row icon={<FileDown size={17} />} title={t("studioPdf")} sub={made?.file.name} onClick={() => {
                        if (made) saveFile(made.file.name, made.file, "application/pdf");
                        onClose();
                    }} chevron={false} />
                <Row
                    icon={<ExternalLink size={17} />}
                    title={t("studioPdfOpen")}
                    onClick={() => {
                        if (made) window.open(URL.createObjectURL(made.file), "_blank");
                        onClose();
                    }}
                    chevron={false}
                />
            </div>
        </Sheet>
    );
}
