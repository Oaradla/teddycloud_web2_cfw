// Turns audio files into tonie content in the library:
//   one TAF:     the files are encoded as parts (in parallel), teddyCloud joins them into one TAF
//                without re-encoding, the parts are removed again
//   split:       <folder>/<name>/NN - title.taf for every file plus <name>.tap there, whose
//                TAF teddyCloud puts together next to it as <name>.tap.taf (hidden in the library)
// Encoding happens in the browser (parallel web workers) or on the server (PCM upload per file).
// Servers without the playlist building get the old way: one TAF in one go.
import { tc } from "../../api/tc";
import type { Tap } from "../../api/types";
import { encodeFilesParallel } from "../../lib/encodePool";
import { joinPath } from "../../lib/format";
import { t } from "../../lib/i18n";
import { toPcm } from "../../lib/pcm";
import { encodeTafInBrowser } from "../../lib/wasmTaf";

export type Encoder = "browser" | "server";

export interface UploadJob {
    files: File[];
    titles: string[];
    name: string;
    folder: string;
    split: boolean;
    encoder: Encoder;
    bitrate: number;
}

export interface UploadResult {
    /** what to assign to a tonie: the TAF, or the TAP of a split upload */
    source: string;
    /** the TAF that plays (for the cover and chapter names) */
    taf: string;
    /** the folder to show afterwards */
    folder: string;
    /** audio id and hash of the TAF when the file lists do not show it (the TAF of a playlist) */
    header?: { audioId: number; sha1Hash: string };
}

type Step = (text: string, fraction: number) => void;

const pad = (n: number) => String(n).padStart(2, "0");
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").replace(/[. ]+$/g, "").trim() || "Titel";
const lib = (path: string) => "lib://" + path.replace(/^\/+/, "");
const audioIdNow = () => Math.floor(Date.now() / 1000) - 0x50000000;

/** a folder may exist already */
const ensureDir = (path: string) => tc.dirCreate(path).catch(() => undefined);

/** runs jobs with a limit of parallel ones */
async function limited<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const i = next++;
            await fn(items[i], i);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** encodes the files as single TAFs into dir, named partName(i) */
async function makeParts(job: UploadJob, dir: string, partName: (i: number) => string, step: Step) {
    const n = job.files.length;
    if (job.encoder === "browser") {
        const parts = await encodeFilesParallel(job.files, audioIdNow(), job.bitrate, (f, done) =>
            step(t("encodingProgress", { done, total: n }), f * 0.8),
        );
        let up = 0;
        await limited(parts, 3, async (taf, i) => {
            await tc.tafUpload(taf, partName(i), dir);
            step(t("uploadingN", { n: ++up, total: n }), 0.8 + (up / n) * 0.15);
        });
    } else {
        // the server encodes; a strong one handles a few files at the same time
        let up = 0;
        step(t("preparing", { n: 1, total: n }), 0.02);
        await limited(job.files, 2, async (file, i) => {
            const pcm = await toPcm(file);
            step(t("serverEncodingN", { n: up, total: n }), Math.max(0.02, (up / n) * 0.95));
            await tc.pcmUpload([{ title: job.titles[i], pcm }], partName(i), dir);
            step(t("serverEncodingN", { n: ++up, total: n }), (up / n) * 0.95);
        });
    }
}

const writeTap = async (dir: string, fileName: string, out: string, name: string, files: { path: string; title: string }[]) => {
    const tap: Tap = {
        type: "tap",
        audio_id: Math.floor(Date.now() / 1000),
        filepath: lib(out),
        name,
        files: files.map((f) => ({ filepath: lib(f.path), name: f.title })),
    };
    await tc.saveTap(tap, dir, fileName);
    return joinPath(dir, fileName);
};

export async function uploadAudio(job: UploadJob, step: Step): Promise<UploadResult> {
    const name = safe(job.name);
    const n = job.files.length;
    const canBuild = n > 1 ? await tc.hasTapBuild().catch(() => false) : false;

    if (job.split && n > 1) {
        const dir = joinPath(job.folder, name);
        await ensureDir(dir);
        const partName = (i: number) => `${pad(i + 1)} - ${safe(job.titles[i])}.taf`;
        await makeParts(job, dir, partName, step);
        const out = joinPath(dir, `${name}.tap.taf`);
        const tap = await writeTap(dir, `${name}.tap`, out, job.name.trim(), job.files.map((_, i) => ({ path: joinPath(dir, partName(i)), title: job.titles[i] })));
        let header: UploadResult["header"];
        if (canBuild) {
            step(t("joining"), 0.97);
            header = (await tc.buildTap(tap))?.tafHeader;
        }
        return { source: tap, taf: out, folder: dir, header };
    }

    const target = joinPath(job.folder, `${name}.taf`);
    if (n > 1 && canBuild) {
        // parts in a scratch folder, joined into the target, then removed
        const tmp = joinPath(job.folder, `_upload-${Date.now().toString(36)}`);
        await ensureDir(tmp);
        const partName = (i: number) => `${pad(i + 1)}.taf`;
        try {
            await makeParts(job, tmp, partName, step);
            const tap = await writeTap(tmp, "parts.tap", target, job.name.trim(), job.files.map((_, i) => ({ path: joinPath(tmp, partName(i)), title: job.titles[i] })));
            step(t("joining"), 0.97);
            const r = await tc.buildTap(tap);
            if (r && !r.built) throw new Error(r.error || t("joinFailed"));
        } finally {
            for (let i = 0; i < n; i++) await tc.fileDelete(joinPath(tmp, partName(i)), false).catch(() => undefined);
            await tc.fileDelete(joinPath(tmp, "parts.tap"), false).catch(() => undefined);
            await tc.fileDelete(tmp, true).catch(() => undefined);
        }
        return { source: target, taf: target, folder: job.folder };
    }

    // one file, or a server without playlist building: one TAF in one go
    if (job.encoder === "browser") {
        const taf =
            n === 1
                ? (await encodeFilesParallel(job.files, audioIdNow(), job.bitrate, (f) => step(t("encodingProgress", { done: 0, total: 1 }), f * 0.8)))[0]
                : await encodeTafInBrowser(job.files, audioIdNow(), job.bitrate, (i, total) => step(t("encodingN", { n: Math.min(i + 1, total), total }), (i / total) * 0.8));
        step(t("uploading"), 0.85);
        await tc.tafUpload(taf, `${name}.taf`, job.folder, (p) => step(t("uploading"), 0.85 + p * 0.15));
    } else {
        const chunks: { title: string; pcm: Blob }[] = [];
        for (let i = 0; i < n; i++) {
            step(t("preparing", { n: i + 1, total: n }), (i / n) * 0.3);
            chunks.push({ title: job.titles[i], pcm: await toPcm(job.files[i]) });
        }
        await tc.pcmUpload(chunks, `${name}.taf`, job.folder, (p) => step(p >= 0.999 ? t("encoding") : t("uploading"), 0.3 + p * 0.7));
    }
    return { source: target, taf: target, folder: job.folder };
}
