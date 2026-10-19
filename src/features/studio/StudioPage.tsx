import { useQuery } from "@tanstack/react-query";
import { strToU8, zipSync } from "fflate";
import { ListPlus, Pencil, Plus, Printer, Scissors, Trash2 } from "lucide-react";
import { CSSProperties, useEffect, useState } from "react";
import { tc } from "../../api/tc";
import type { TonieInfo } from "../../api/types";
import { picUrl, tagInfo } from "../../lib/format";
import { t } from "../../lib/i18n";
import { getPref, setPref } from "../../lib/prefs";
import { useAllTags } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { TonieImage } from "../../ui/TonieImage";
import { Empty, Page, Row, SearchField, Section, Segmented, SwitchRow, useUi } from "../../ui/kit";

/*
 * TeddyStudio: labels for tonies, a picture label and a text label per tonie, laid out on a
 * sheet of paper and printed by the browser. Items and settings stay on this device.
 */

export interface StudioItem {
    id: string;
    title: string;
    episode: string;
    pic: string;
    tracks: string[];
    model: string;
}

interface StudioSettings {
    shape: "round" | "square";
    diameter: number;
    width: number;
    height: number;
    mode: "both" | "image" | "text";
    text: "title" | "tracks";
    paper: "A4" | "A5" | "Letter";
    marginTop: number;
    marginLeft: number;
    gapX: number;
    gapY: number;
    bleed: number;
    fontSize: number;
    background: string;
    imageScale: number;
    border: boolean;
    showModel: boolean;
}

const DEFAULTS: StudioSettings = {
    shape: "round",
    diameter: 40,
    width: 50,
    height: 30,
    mode: "both",
    text: "title",
    paper: "A4",
    marginTop: 10,
    marginLeft: 10,
    gapX: 5,
    gapY: 5,
    bleed: 0,
    fontSize: 11,
    background: "#ffffff",
    imageScale: 100,
    border: true,
    showModel: false,
};

/** label sheets with their layout (the same presets as the classic UI) */
const PRESETS: Record<string, { label: string; settings: Partial<StudioSettings> }> = {
    avery5080: { label: "Avery 5080", settings: { shape: "round", paper: "A4", marginTop: 5, marginLeft: 8, bleed: 1, gapX: 10, gapY: 7, border: false } },
    averyl3415: { label: "Avery L3415 / L7105 / L7780", settings: { shape: "round", paper: "A4", marginTop: 13, marginLeft: 15, bleed: 1, gapX: 6, gapY: 6, border: false } },
    avery40rnd: { label: "Avery 40-RND", settings: { shape: "round", paper: "A4", marginTop: 13, marginLeft: 15, bleed: 1, gapX: 6, gapY: 6, border: false } },
    avery5160: { label: "Avery 5160", settings: { shape: "square", paper: "A4", marginTop: 5, marginLeft: 8, bleed: 1, gapX: 12, gapY: 8, border: false } },
};

const PAPER_MM = { A4: [210, 297], A5: [148, 210], Letter: [216, 279] } as const;

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
});

/** the styles of the printed sheet, also used by the preview (styles.css repeats them for the screen) */
const PRINT_CSS = `
body { margin: 0; font-family: system-ui, sans-serif; }
.studio-paper { display: grid; align-content: start; justify-content: start; box-sizing: border-box; overflow: hidden; background: #fff; color: #000; break-after: page; page-break-after: always; }
.studio-paper:last-child { break-after: auto; page-break-after: auto; }
.studio-label { display: flex; align-items: center; justify-content: center; flex-direction: column; overflow: hidden; box-sizing: border-box; text-align: center; line-height: 1.2; padding: 2mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.studio-label:not(.text) { padding: 0; }
.studio-label img { object-fit: cover; flex-shrink: 0; }
.studio-label ol { margin: 0; padding-left: 1.4em; text-align: left; font-size: 0.8em; }
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
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>@page { size: ${paper} portrait; margin: 0; }${PRINT_CSS}</style></head><body>${pages.map((p) => p.outerHTML).join("")}</body></html>`);
    doc.close();
    const images = [...doc.images];
    Promise.all(images.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => (img.onload = img.onerror = r))))).then(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(() => frame.remove(), 1000);
    });
};

/** labels per item: picture and/or text */
const labelsPerItem = (s: StudioSettings) => (s.mode === "both" ? 2 : 1);

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

/** the cut lines of every sheet: one SVG, or a zip with one per sheet */
const downloadCut = (s: StudioSettings, items: number) => {
    const { cols, rows } = sheetGrid(s);
    const per = cols * rows;
    const total = items * labelsPerItem(s);
    const sheets = Array.from({ length: Math.max(1, Math.ceil(total / per)) }, (_, i) => cutSvg(s, Math.min(per, total - i * per)));
    const name = `teddystudio-${s.paper.toLowerCase()}-${s.shape === "round" ? `${s.diameter}mm` : `${s.width}x${s.height}mm`}`;
    const blob =
        sheets.length === 1
            ? new Blob([sheets[0]], { type: "image/svg+xml" })
            : new Blob([zipSync(Object.fromEntries(sheets.map((svg, i) => [`${name}-blatt${i + 1}.svg`, strToU8(svg)])), { level: 6 }) as BlobPart], { type: "application/zip" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = sheets.length === 1 ? `${name}.svg` : `${name}.zip`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

/** black or white, whichever reads better on the background */
const textOn = (hex: string) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return "#000";
    const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
    return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000" : "#fff";
};

export function StudioPage() {
    const ui = useUi();
    const tags = useAllTags();
    const [items, setItems] = useState<StudioItem[]>(loadItems);
    const [s, setS] = useState<StudioSettings>(() => load("studio.settings", DEFAULTS));
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState<StudioItem | null>(null);

    useEffect(() => setPref("studio.items", JSON.stringify(items)), [items]);
    useEffect(() => setPref("studio.settings", JSON.stringify(s)), [s]);
    const set = (patch: Partial<StudioSettings>) => setS((prev) => ({ ...prev, ...patch }));

    const addMine = () => {
        const known = new Set(items.map((i) => i.model || i.title + i.episode));
        const mine = (tags.data ?? [])
            .filter((tag) => tag.type !== "system")
            .map((tag) => tagInfo(tag))
            .filter((info) => (info.series || info.episode) && !known.has(info.model || info.series + info.episode))
            .filter((info, i, list) => list.findIndex((x) => (x.model || x.series + x.episode) === (info.model || info.series + info.episode)) === i);
        setItems((prev) => [...prev, ...mine.map((info) => itemOf(info))]);
        ui.toast("ok", t("studioAdded", { n: mine.length }));
    };

    return (
        <Page
            title={t("teddyStudio")}
            subtitle={t("teddyStudioHint")}
            back="/more"
            right={
                <>
                    <button className="icon-btn" onClick={() => downloadCut(s, items.length)} disabled={!items.length} aria-label={t("studioCutSvg")} title={t("studioCutSvg")}>
                        <Scissors size={20} />
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
            <AddSheet open={adding} onClose={() => setAdding(false)} onAdd={(info) => setItems((prev) => [...prev, itemOf(info)])} />
            <EditSheet
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

function StudioSettingsSection({ s, set }: { s: StudioSettings; set: (p: Partial<StudioSettings>) => void }) {
    return (
        <Section title={t("studioLabels")}>
            <div className="studio-settings">
                <label className="studio-field wide">
                    <span>{t("studioPreset")}</span>
                    <select
                        className="select"
                        value=""
                        onChange={(e) => {
                            const p = PRESETS[e.target.value];
                            if (p) set(p.settings);
                        }}
                    >
                        <option value="">{t("studioPresetPick")}</option>
                        {Object.entries(PRESETS).map(([id, p]) => (
                            <option key={id} value={id}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                </label>
                <Segmented value={s.shape} onChange={(shape) => set({ shape })} options={[{ value: "round", label: t("studioRound") }, { value: "square", label: t("studioSquare") }]} />
                <Segmented
                    value={s.mode}
                    onChange={(mode) => set({ mode })}
                    options={[
                        { value: "both", label: t("studioBoth") },
                        { value: "image", label: t("studioImage") },
                        { value: "text", label: t("studioText") },
                    ]}
                />
                <Segmented value={s.text} onChange={(text) => set({ text })} options={[{ value: "title", label: t("studioTitle") }, { value: "tracks", label: t("studioTracks") }]} />
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
                <NumberField label={t("studioFontSize")} value={s.fontSize} onChange={(fontSize) => set({ fontSize })} unit="pt" />
                <NumberField label={t("studioImageScale")} value={s.imageScale} onChange={(imageScale) => set({ imageScale })} unit="%" step={5} />
                <label className="studio-field">
                    <span>{t("studioBackground")}</span>
                    <input type="color" value={s.background} onChange={(e) => set({ background: e.target.value })} />
                </label>
            </div>
            <SwitchRow title={t("studioBorder")} sub={t("studioBorderHint")} checked={s.border} onChange={(border) => set({ border })} />
            <SwitchRow title={t("studioShowModel")} checked={s.showModel} onChange={(showModel) => set({ showModel })} />
            <Row title={t("studioReset")} onClick={() => set(DEFAULTS)} chevron={false} />
        </Section>
    );
}

/**
 * how many labels fit on a sheet: columns and rows between the margins (the right and bottom
 * margin taken as the left and top one), at least one of each
 */
const sheetGrid = (s: StudioSettings) => {
    const [pw, ph] = PAPER_MM[s.paper];
    const w = s.shape === "round" ? s.diameter : s.width;
    const h = s.shape === "round" ? s.diameter : s.height;
    const cols = Math.max(1, Math.floor((pw - 2 * s.marginLeft + s.gapX + 0.01) / (w + s.gapX)));
    const rows = Math.max(1, Math.floor((ph - 2 * s.marginTop + s.gapY + 0.01) / (h + s.gapY)));
    return { pw, ph, w, h, cols, rows };
};

/** the printed sheets, one per page of the paper size; on screen a scaled preview of each */
function Sheet_({ items, s }: { items: StudioItem[]; s: StudioSettings }) {
    const { pw, ph, w, h, cols, rows } = sheetGrid(s);
    const label: CSSProperties = {
        width: `${w}mm`,
        height: `${h}mm`,
        borderRadius: s.shape === "round" ? "50%" : "2mm",
        background: s.background,
        color: textOn(s.background),
        border: s.border ? "0.2mm solid #999" : "none",
        fontSize: `${s.fontSize}pt`,
    };
    const labels = items.flatMap((item) => [
        s.mode !== "text" && (
            <div key={`${item.id}-i`} className="studio-label" style={label}>
                <img
                    src={picUrl(item.pic)}
                    alt=""
                    style={{ width: `calc(100% + ${2 * s.bleed}mm)`, height: `calc(100% + ${2 * s.bleed}mm)`, margin: `-${s.bleed}mm`, transform: `scale(${s.imageScale / 100})` }}
                />
            </div>
        ),
        s.mode !== "image" && (
            <div key={`${item.id}-t`} className="studio-label text" style={label}>
                {s.text === "tracks" && item.tracks.length ? (
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
                {s.showModel && item.model && <small>{item.model}</small>}
            </div>
        ),
    ]).filter(Boolean);
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

function AddSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (info: TonieInfo) => void }) {
    const ui = useUi();
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [query]);
    const search = useQuery({ queryKey: ["tonieSearch", debounced], queryFn: () => tc.searchTonies(debounced), enabled: open && debounced.length >= 2 });
    return (
        <Sheet open={open} onClose={onClose} title={t("studioAdd")} full>
            <SearchField value={query} onChange={setQuery} placeholder={t("studioSearch")} autoFocus />
            <div className="list mt">
                {(search.data ?? []).slice(0, 60).map((info, i) => (
                    <Row
                        key={`${info.model}-${i}`}
                        leading={<TonieImage src={info.picture} size={40} />}
                        title={info.series}
                        sub={[info.episode, info.model].filter(Boolean).join(" · ")}
                        onClick={() => {
                            onAdd(info);
                            ui.toast("ok", t("studioAdded", { n: 1 }));
                        }}
                        chevron={false}
                        right={<Plus size={18} />}
                    />
                ))}
            </div>
        </Sheet>
    );
}

function EditSheet({ item, onClose, onSave }: { item: StudioItem | null; onClose: () => void; onSave: (item: StudioItem) => void }) {
    const [draft, setDraft] = useState<StudioItem | null>(item);
    useEffect(() => setDraft(item), [item]);
    if (!draft) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
    const field = (key: "title" | "episode" | "pic", label: string) => (
        <div className="field">
            <label>{label}</label>
            <input className="input" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
        </div>
    );
    return (
        <Sheet
            open={!!item}
            onClose={onClose}
            title={t("studioEdit")}
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
            {field("pic", t("studioPicture"))}
            <div className="field">
                <label>{t("studioTracks")}</label>
                <textarea className="input" rows={6} value={draft.tracks.join("\n")} onChange={(e) => setDraft({ ...draft, tracks: e.target.value.split("\n") })} />
            </div>
        </Sheet>
    );
}
