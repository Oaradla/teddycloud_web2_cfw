// TeddyStudio as a PDF: every sheet drawn on a canvas at print resolution and put into a PDF as
// a JPEG page (the PDF writer follows the one of the classic UI). The drawing follows the preview.
import { picUrl } from "../../lib/format";
import { flagUrl } from "./flags";
import { loadFonts } from "./fonts";
import { ALIGN, labelList, sheetGrid, StudioSettings, StudioItem, textOn } from "./studio";

const DPI = 250;
const px = (mm: number) => (mm * DPI) / 25.4;
const ptPx = (pt: number) => (pt * DPI) / 72;

/* ------------------------------------------------------------------ PDF of JPEG pages */

const ascii = (s: string) => new TextEncoder().encode(s);

interface Page {
    jpeg: Uint8Array;
    width: number;
    height: number;
    widthPt: number;
    heightPt: number;
}

export function buildPdf(pages: Page[]): Uint8Array {
    const objects: Uint8Array[][] = [[], [ascii("<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>")]];
    objects[2] = [ascii(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`)];
    pages.forEach((p, i) => {
        const id = 3 + i * 3;
        const content = ascii(`q\n${p.widthPt} 0 0 ${p.heightPt} 0 0 cm\n/Im0 Do\nQ\n`);
        objects[id] = [ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.widthPt} ${p.heightPt}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`)];
        objects[id + 1] = [
            ascii(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`),
            p.jpeg,
            ascii("\nendstream"),
        ];
        objects[id + 2] = [ascii(`<< /Length ${content.length} >>\nstream\n`), content, ascii("endstream")];
    });
    const chunks: Uint8Array[] = [ascii("%PDF-1.4\n")];
    let offset = chunks[0].length;
    const offsets: number[] = [];
    for (let id = 1; id < objects.length; id++) {
        offsets[id] = offset;
        const parts = [ascii(`${id} 0 obj\n`), ...objects[id], ascii("\nendobj\n")];
        chunks.push(...parts);
        offset += parts.reduce((n, c) => n + c.length, 0);
    }
    const xref = ["xref", `0 ${objects.length}`, "0000000000 65535 f ", ...offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n `)];
    chunks.push(ascii(`${xref.join("\n")}\ntrailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of chunks) {
        out.set(c, at);
        at += c.length;
    }
    return out;
}

/* ------------------------------------------------------------------ drawing */

const images = new Map<string, Promise<HTMLImageElement | null>>();
/** a picture the canvas may use (CORS); null when it does not load */
const image = (url: string) => {
    if (!images.has(url))
        images.set(
            url,
            new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = url;
            }),
        );
    return images.get(url)!;
};

const labelPath = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, round: boolean) => {
    ctx.beginPath();
    if (round) ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    else ctx.roundRect(x, y, w, h, px(2));
};

const wrap = (ctx: CanvasRenderingContext2D, text: string, max: number) => {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > max && line) {
            lines.push(line);
            line = word;
        } else line = next;
    }
    if (line) lines.push(line);
    return lines;
};

/** text along the upper arc of a round label */
const arcText = (ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, r: number) => {
    const total = ctx.measureText(text).width / r;
    let angle = -Math.PI / 2 - total / 2;
    for (const ch of text) {
        const a = ctx.measureText(ch).width / r;
        ctx.save();
        ctx.translate(cx + r * Math.cos(angle + a / 2), cy + r * Math.sin(angle + a / 2));
        ctx.rotate(angle + a / 2 + Math.PI / 2);
        ctx.strokeText(ch, 0, 0);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        angle += a;
    }
};

type Label = ReturnType<typeof labelList>[number];

/** draws one label; a picture that does not load is noted in missing */
async function drawLabel(ctx: CanvasRenderingContext2D, { item, e, kind }: Label, s: StudioSettings, x: number, y: number, w: number, h: number) {
    const round = s.shape === "round";
    ctx.save();
    labelPath(ctx, x, y, w, h, round);
    ctx.clip();
    ctx.fillStyle = e.background;
    ctx.fillRect(x, y, w, h);
    const color = textOn(e.background);
    if (kind === "image") {
        const img = item.pic ? await image(picUrl(item.pic)) : null;
        if (item.pic && !img) missing.add(item.pic);
        if (img) {
            const b = px(s.bleed);
            const [bx, by, bw, bh] = [x - b, y - b, w + 2 * b, h + 2 * b];
            const k = Math.max(bw / img.width, bh / img.height);
            const [fx, fy] = ALIGN[e.imageAlign];
            const scale = e.imageScale / 100;
            const dw = img.width * k * scale;
            const dh = img.height * k * scale;
            const cx = bx + bw / 2 + (bx + (bw - img.width * k) * fx + (img.width * k) / 2 - (bx + bw / 2)) * scale;
            const cy = by + bh / 2 + (by + (bh - img.height * k) * fy + (img.height * k) / 2 - (by + bh / 2)) * scale;
            ctx.drawImage(img, cx - dw / 2 + px(e.imageOffsetX), cy - dh / 2 - px(e.imageOffsetY), dw, dh);
        }
        if (e.seriesOnImage && item.title) {
            ctx.font = `bold ${ptPx(e.seriesFontSize)}px ${e.font}`;
            ctx.fillStyle = "#fff";
            ctx.strokeStyle = "rgba(0,0,0,0.75)";
            ctx.lineWidth = ptPx(e.seriesFontSize) / 5;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            if (round && e.rotateSeries) arcText(ctx, item.title, x + w / 2, y + h / 2, w / 2 - ptPx(e.seriesFontSize) * 0.9);
            else {
                ctx.strokeText(item.title, x + w / 2, y + h * 0.12, w * 0.8);
                ctx.fillText(item.title, x + w / 2, y + h * 0.12, w * 0.8);
            }
        }
    } else {
        const pad = px(e.padding);
        const inner = (round ? w * 0.8 : w) - 2 * pad;
        const size = ptPx(e.fontSize);
        const blocks: { text: string; bold?: boolean; size: number }[] = [];
        if (e.text === "tracks" && item.tracks.length) item.tracks.forEach((tr, i) => blocks.push({ text: `${i + 1}. ${tr}`, size: size * 0.8 }));
        else {
            blocks.push({ text: item.title, bold: true, size });
            if (item.episode) blocks.push({ text: item.episode, size });
        }
        if (e.showModel && item.model) blocks.push({ text: item.model, size: size * 0.75 });
        const flag = e.flag && item.language ? await flagUrl(item.language).then((u) => (u ? image(u) : null)) : null;
        const flagH = flag ? px(4) : 0;
        // smaller until it fits (a round label is narrower at the top and bottom)
        const room = (round ? h * 0.85 : h) - 2 * pad - (flag ? flagH + px(1) : 0);
        let lines: { text: string; bold?: boolean; size: number }[] = [];
        for (let fit = 1; fit >= 0.4; fit -= 0.05) {
            lines = blocks.flatMap((b) => {
                ctx.font = `${b.bold ? "bold " : ""}${b.size * fit}px ${e.font}`;
                return wrap(ctx, b.text, inner).map((text) => ({ ...b, text, size: b.size * fit }));
            });
            if (lines.reduce((n, l) => n + l.size * 1.2, 0) <= room) break;
        }
        const height = lines.reduce((n, l) => n + l.size * 1.2, 0) + (flag ? flagH + px(1) : 0);
        let ty = y + (h - height) / 2;
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        for (const l of lines) {
            ctx.font = `${l.bold ? "bold " : ""}${l.size}px ${e.font}`;
            ctx.fillText(l.text, x + w / 2, ty, inner);
            ty += l.size * 1.2;
        }
        if (flag) ctx.drawImage(flag, x + w / 2 - flagH * 0.75, ty + px(1), flagH * 1.5, flagH);
    }
    ctx.restore();
    if (s.border) {
        labelPath(ctx, x, y, w, h, round);
        ctx.strokeStyle = "#999";
        ctx.lineWidth = px(0.2);
        ctx.stroke();
    }
}

let missing = new Set<string>();

/** the sheets as a PDF, and how many pictures it lacks (other servers that do not allow it, CORS) */
export async function studioPdf(items: StudioItem[], s: StudioSettings): Promise<{ blob: Blob; missing: number }> {
    missing = new Set();
    const labels = labelList(items, s);
    await loadFonts(labels.map((l) => l.e.font));
    const { pw, ph, w, h, cols, rows } = sheetGrid(s);
    const per = cols * rows;
    const pages: Page[] = [];
    for (let p = 0; p * per < Math.max(1, labels.length); p++) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(px(pw));
        canvas.height = Math.round(px(ph));
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const onPage = labels.slice(p * per, (p + 1) * per);
        for (let i = 0; i < onPage.length; i++) {
            const lx = px(s.marginLeft + (i % cols) * (w + s.gapX));
            const ly = px(s.marginTop + Math.floor(i / cols) * (h + s.gapY));
            await drawLabel(ctx, onPage[i], s, lx, ly, px(w), px(h));
        }
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
        if (!blob) throw new Error("canvas");
        pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height, widthPt: Math.round((pw * 72) / 25.4), heightPt: Math.round((ph * 72) / 25.4) });
    }
    return { blob: new Blob([buildPdf(pages) as BlobPart], { type: "application/pdf" }), missing: missing.size };
}
