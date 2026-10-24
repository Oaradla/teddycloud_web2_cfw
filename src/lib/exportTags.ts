// The tonie list as a file: CSV and JSON for a spreadsheet or a script, HTML to print or keep.
import type { Tag } from "../api/types";
import { saveFile } from "./download";
import { picUrl, tagInfo } from "./format";
import { t } from "./i18n";

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "_");

const row = (x: Tag) => {
    const i = tagInfo(x);
    return { ruid: x.ruid, series: i.series, episode: i.episode, model: i.model, language: i.language ?? "", source: x.source, tracks: i.tracks ?? [] };
};

export const exportCsv = (tags: Tag[]) => {
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = tags.map(row).map((r) => [r.ruid, r.series, r.episode, r.model, r.language, r.source, r.tracks.length].map(cell).join(","));
    saveFile(`${stamp()}_tonies.csv`, ["ruid,series,episode,model,language,source,tracks", ...lines].join("\n"), "text/csv;charset=utf-8");
};

/** all fields the server knows of each tag */
export const exportJson = (tags: Tag[]) => saveFile(`${stamp()}_tonies.json`, JSON.stringify(tags, null, 2), "application/json");

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** the pictures go into the file when they can be loaded, so it works offline */
const inline = async (url: string) => {
    try {
        const blob = await (await fetch(picUrl(url))).blob();
        return await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    } catch {
        return new URL(picUrl(url), window.location.href).href;
    }
};

export const exportHtml = async (tags: Tag[]) => {
    const items = await Promise.all(
        tags.map(async (x) => {
            const r = row(x);
            const pic = tagInfo(x).picture ? await inline(tagInfo(x).picture) : "";
            return `<li>${pic ? `<img src="${esc(pic)}" alt="">` : ""}<div>${esc(r.series || r.ruid)}${r.episode ? ` – ${esc(r.episode)}` : ""}<small>${esc(r.model)}</small></div></li>`;
        }),
    );
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(t("tonies"))}</title>
<style>body{font-family:system-ui,sans-serif;margin:24px}ul{list-style:none;padding:0}li{display:flex;align-items:center;gap:12px;margin-bottom:10px}img{width:120px;height:120px;object-fit:contain}small{display:block;color:#666;font-family:monospace}</style>
</head><body><h1>${esc(t("tonies"))} (${tags.length})</h1><ul>${items.join("")}</ul><p><small>${esc(new Date().toLocaleString())}</small></p></body></html>`;
    saveFile(`${stamp()}_tonies.html`, html, "text/html");
};
