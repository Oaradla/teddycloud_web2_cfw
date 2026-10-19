// Pictures of figures and covers are shown at a few hundred pixels at most; photos straight from
// a phone are megabytes. They are scaled down in the browser before they go to teddyCloud.
import { backendUrl } from "../api/client";

export const MAX_EDGE = 512;

const hasAlpha = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4 * 7) if (data[i] < 250) return true;
    return false;
};

/**
 * A smaller copy of a picture: at most MAX_EDGE pixels on the long edge, PNG when it has
 * transparency (figures cut out), else JPEG. The original comes back when it is small already.
 */
export async function shrinkImage(input: Blob, name: string): Promise<File> {
    const bitmap = await createImageBitmap(input);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const png = hasAlpha(ctx, w, h);
    const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode the picture"))), png ? "image/png" : "image/jpeg", 0.86),
    );
    const base = name.replace(/\.[^.]+$/, "");
    if (scale === 1 && blob.size >= input.size) return new File([input], name, { type: input.type });
    return new File([blob], `${base}.${png ? "png" : "jpg"}`, { type: blob.type });
}

/** size of a file of teddyCloud from the response header, without loading it */
export async function remoteSize(path: string): Promise<number> {
    const ctrl = new AbortController();
    try {
        const r = await fetch(backendUrl(path), { signal: ctrl.signal, credentials: "same-origin" });
        if (!r.ok) return -1;
        const n = Number(r.headers.get("Content-Length") || 0);
        if (n > 0) {
            ctrl.abort();
            return n;
        }
        // no length in the header (a proxy may drop it): measure the file
        return (await r.blob()).size;
    } catch {
        return -1;
    }
}
