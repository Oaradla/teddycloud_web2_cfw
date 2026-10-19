// Parallel TAF encoding in the browser: every audio file becomes a TAF of its own, encoded by a
// pool of web workers (one WebAssembly encoder each). Decoding stays on the main thread, Web
// Audio is not available in workers. teddyCloud then joins the parts without re-encoding.
import { toPcmSamples } from "./pcm";

const WORKER = (base: string) => `
let M = null;
self.onmessage = async (e) => {
    const { id, pcm, audioId, bitrate } = e.data;
    try {
        if (!M) {
            importScripts(${JSON.stringify(base)} + "taf_encoder.js");
            M = await createTafEncoder({ locateFile: (p) => ${JSON.stringify(base)} + p, print: () => {}, printErr: () => {} });
        }
        const ctx = M._taf_encoder_create(audioId, bitrate);
        if (!ctx) throw new Error("could not start the encoder");
        try {
            const chunk = 48000 * 2;
            for (let off = 0; off < pcm.length; off += chunk) {
                const part = pcm.subarray(off, Math.min(off + chunk, pcm.length));
                const ptr = M._malloc(part.length * 2);
                try {
                    M.HEAP16.set(part, ptr / 2);
                    if (M._taf_encoder_encode(ctx, ptr, part.length / 2) !== 0) throw new Error("encoding failed");
                } finally {
                    M._free(ptr);
                }
                if ((off / chunk) % 30 === 0) self.postMessage({ id, progress: off / pcm.length });
            }
            if (M._taf_encoder_finalize(ctx) !== 0) throw new Error("finalizing failed");
            const buf = M._taf_encoder_get_buffer(ctx);
            const size = M._taf_encoder_get_size(ctx);
            const taf = M.HEAPU8.slice(buf, buf + size);
            self.postMessage({ id, taf }, [taf.buffer]);
        } finally {
            M._taf_encoder_free(ctx);
        }
    } catch (err) {
        self.postMessage({ id, error: String(err && err.message || err) });
    }
};`;

/** how many files are encoded at the same time: cores, fewer on phones (memory) */
export const poolSize = () => {
    const cores = navigator.hardwareConcurrency || 2;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    return Math.max(1, Math.min(cores - 1, touch ? 3 : 6));
};

/**
 * Encodes the files into one TAF each, in parallel. onProgress gets the overall fraction and
 * how many files are finished.
 */
export async function encodeFilesParallel(
    files: File[],
    baseAudioId: number,
    bitrate: number,
    onProgress?: (fraction: number, done: number) => void,
): Promise<Blob[]> {
    const base = new URL("./wasm/", document.baseURI).href;
    const url = URL.createObjectURL(new Blob([WORKER(base)], { type: "text/javascript" }));
    const size = Math.min(poolSize(), files.length);
    const workers = Array.from({ length: size }, () => new Worker(url));
    const results: Blob[] = new Array(files.length);
    const progress = new Array(files.length).fill(0);
    let done = 0;
    let next = 0;
    let failed: Error | null = null;
    const report = () => onProgress?.(progress.reduce((a, b) => a + b, 0) / files.length, done);

    const run = (w: Worker) =>
        new Promise<void>((resolve) => {
            const take = async () => {
                if (failed || next >= files.length) return resolve();
                const i = next++;
                try {
                    // decoding takes a little while too: count it as the first 10 %
                    const pcm = await toPcmSamples(files[i]);
                    progress[i] = 0.1;
                    report();
                    const taf = await new Promise<Uint8Array>((res, rej) => {
                        w.onmessage = (e) => {
                            const d = e.data;
                            if (d.id !== i) return;
                            if (d.error) rej(new Error(d.error));
                            else if (d.taf) res(d.taf);
                            else {
                                progress[i] = 0.1 + 0.9 * d.progress;
                                report();
                            }
                        };
                        w.onerror = (e) => rej(new Error(e.message || "worker failed"));
                        w.postMessage({ id: i, pcm, audioId: baseAudioId - i, bitrate }, [pcm.buffer]);
                    });
                    results[i] = new Blob([taf as Uint8Array<ArrayBuffer>], { type: "application/octet-stream" });
                    progress[i] = 1;
                    done++;
                    report();
                } catch (e) {
                    failed = e as Error;
                }
                take();
            };
            take();
        });

    try {
        await Promise.all(workers.map(run));
    } finally {
        workers.forEach((w) => w.terminate());
        URL.revokeObjectURL(url);
    }
    if (failed) throw failed;
    return results;
}
