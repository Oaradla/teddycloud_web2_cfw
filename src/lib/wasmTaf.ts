// TAF encoding in the browser with the WebAssembly toniefile encoder of the classic web UI
// (public/wasm). Only the finished TAF goes to the server, a fraction of the raw PCM.
import { toPcmSamples } from "./pcm";

interface TafEncoderModule {
    HEAP16: Int16Array;
    HEAPU8: Uint8Array;
    _malloc(size: number): number;
    _free(ptr: number): void;
    _taf_encoder_create(audioId: number, bitrate: number): number;
    _taf_encoder_encode(ctx: number, pcm: number, frames: number): number;
    _taf_encoder_new_chapter(ctx: number): number;
    _taf_encoder_finalize(ctx: number): number;
    _taf_encoder_get_buffer(ctx: number): number;
    _taf_encoder_get_size(ctx: number): number;
    _taf_encoder_free(ctx: number): void;
}

let loading: Promise<TafEncoderModule> | null = null;

const load = () => {
    if (!loading)
        loading = new Promise<void>((resolve, reject) => {
            const w = window as unknown as { createTafEncoder?: unknown };
            if (typeof w.createTafEncoder === "function") return resolve();
            const script = document.createElement("script");
            script.src = new URL("./wasm/taf_encoder.js", document.baseURI).href;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("could not load the browser encoder"));
            document.head.appendChild(script);
        })
            .then(() => (window as unknown as { createTafEncoder: () => Promise<TafEncoderModule> }).createTafEncoder())
            .catch((e) => {
                loading = null;
                throw e;
            });
    return loading;
};

/** one TAF of the files, each file a chapter */
export async function encodeTafInBrowser(
    files: File[],
    audioId: number,
    bitrate: number,
    onProgress?: (index: number, total: number) => void,
): Promise<Blob> {
    const m = await load();
    const ctx = m._taf_encoder_create(audioId, bitrate);
    if (!ctx) throw new Error("could not start the browser encoder");
    let done = false;
    try {
        for (let i = 0; i < files.length; i++) {
            onProgress?.(i, files.length);
            if (i > 0 && m._taf_encoder_new_chapter(ctx) !== 0) throw new Error("encoder: new chapter failed");
            const pcm = await toPcmSamples(files[i]);
            const chunk = 48000 * 2; // one second of stereo samples at a time
            for (let off = 0; off < pcm.length; off += chunk) {
                const part = pcm.subarray(off, Math.min(off + chunk, pcm.length));
                const ptr = m._malloc(part.length * 2);
                try {
                    m.HEAP16.set(part, ptr / 2);
                    if (m._taf_encoder_encode(ctx, ptr, part.length / 2) !== 0) throw new Error("encoder: encoding failed");
                } finally {
                    m._free(ptr);
                }
            }
        }
        onProgress?.(files.length, files.length);
        if (m._taf_encoder_finalize(ctx) !== 0) throw new Error("encoder: finalizing failed");
        const buf = m._taf_encoder_get_buffer(ctx);
        const size = m._taf_encoder_get_size(ctx);
        if (!buf || !size) throw new Error("encoder: no data");
        const data = m.HEAPU8.slice(buf, buf + size);
        m._taf_encoder_free(ctx);
        done = true;
        return new Blob([data], { type: "application/octet-stream" });
    } finally {
        if (!done) m._taf_encoder_free(ctx);
    }
}
