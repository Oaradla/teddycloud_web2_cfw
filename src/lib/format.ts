import { backendUrl } from "../api/client";
import type { Tag, TonieInfo } from "../api/types";
import { lang } from "./i18n";

export const duration = (seconds?: number) => {
    if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "–:–";
    const s = Math.floor(seconds % 60);
    const m = Math.floor(seconds / 60) % 60;
    const h = Math.floor(seconds / 3600);
    const ss = String(s).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

/** "1 h 23 min" style length */
export const lengthText = (seconds?: number) => {
    if (!seconds) return "";
    const m = Math.round(seconds / 60);
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} h ${m % 60} min`;
};

export const bytes = (n?: number) => {
    if (n === undefined) return "";
    if (n < 1024) return `${n} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let v = n / 1024;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
    }
    return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
};

const rtf = () => new Intl.RelativeTimeFormat(lang(), { numeric: "auto" });

/** "vor 5 Minuten" */
export const ago = (ms?: number) => {
    if (!ms) return "";
    const diff = (ms - Date.now()) / 1000;
    const abs = Math.abs(diff);
    if (abs < 45) return rtf().format(Math.round(diff), "second");
    if (abs < 3600) return rtf().format(Math.round(diff / 60), "minute");
    if (abs < 86400) return rtf().format(Math.round(diff / 3600), "hour");
    if (abs < 86400 * 30) return rtf().format(Math.round(diff / 86400), "day");
    return new Date(ms).toLocaleDateString(lang());
};

export const dateTime = (ms?: number) => (ms ? new Date(ms).toLocaleString(lang()) : "");

export const picUrl = (pic?: string) => backendUrl(pic || "");

/** the info shown for a tag: what is assigned (source) wins over the figure itself */
export const tagInfo = (tag: Tag): TonieInfo => {
    const s = tag.sourceInfo;
    if (s && (s.series || s.episode)) return { ...tag.tonieInfo, ...s, picture: s.picture || tag.tonieInfo?.picture };
    return tag.tonieInfo ?? { tracks: [], model: "", series: "", episode: "", picture: "" };
};

export const tagTitle = (tag: Tag) => {
    const i = tagInfo(tag);
    return i.series || i.episode || tag.ruid.toUpperCase();
};

export const tagSubtitle = (tag: Tag) => {
    const i = tagInfo(tag);
    return i.series && i.episode ? i.episode : "";
};

export const isSystemTag = (tag: Tag) => tag.type === "system";

/** "lib://folder/file.taf" -> "folder/file.taf" */
export const libPath = (source?: string) =>
    source && source.startsWith("lib://") ? source.slice("lib://".length) : "";

export const sourceLabel = (source?: string) => {
    if (!source) return "";
    if (source.startsWith("lib://")) return source.slice(6).split("/").pop() || source;
    return source;
};

export const ruidPretty = (ruid: string) => ruid.toUpperCase().match(/.{1,2}/g)?.join(":") ?? ruid;

export const joinPath = (...parts: string[]) =>
    "/" +
    parts
        .join("/")
        .split("/")
        .filter(Boolean)
        .join("/");

export const parentPath = (path: string) => {
    const p = path.split("/").filter(Boolean);
    p.pop();
    return "/" + p.join("/");
};

export const baseName = (path: string) => path.split("/").filter(Boolean).pop() ?? "";
export const stripExt = (name: string) => name.replace(/\.[^/.]+$/, "");
export const isTaf = (name: string) => /\.taf$/i.test(name);
export const isTap = (name: string) => /\.tap$/i.test(name);
export const isAudio = (name: string) => /\.(mp3|m4a|m4b|aac|ogg|opus|oga|flac|wav|wma|webm)$/i.test(name);
export const isImage = (name: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(name);

const infoTitle = (i?: TonieInfo) => (i ? [i.series, i.episode].filter(Boolean).join(" - ") : "");

/** the figure itself (tonies.json / custom model of the tag) */
export const figureInfo = (tag: Tag): TonieInfo =>
    tag.tonieInfo ?? { tracks: [], model: "", series: "", episode: "", picture: "" };

/** what is assigned to the tag when it is something else than the figure, else null */
export const linkedContent = (tag: Tag): TonieInfo | null => {
    const s = tag.sourceInfo;
    if (!s || !(s.series || s.episode || s.picture)) return null;
    const f = figureInfo(tag);
    if (infoTitle(s) === infoTitle(f) && (s.picture || "") === (f.picture || "")) return null;
    return s;
};

/** title of the figure, its episode as subtitle; the ruid when the figure is unknown */
export const figureTitle = (tag: Tag) => {
    const f = figureInfo(tag);
    return f.series || f.episode || tag.ruid.toUpperCase();
};
export const figureSubtitle = (tag: Tag) => {
    const f = figureInfo(tag);
    return f.series && f.episode ? f.episode : "";
};
export const contentTitle = (i: TonieInfo) => infoTitle(i);

/** length of chapter i: up to the next one, the last one up to the end (undefined when unknown) */
export const chapterLength = (starts: number[], i: number, total?: number) => {
    const end = i + 1 < starts.length ? starts[i + 1] : total;
    return end !== undefined && end > starts[i] ? end - starts[i] : undefined;
};
