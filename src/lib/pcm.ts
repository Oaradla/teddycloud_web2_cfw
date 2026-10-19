// Decodes any audio file the browser understands into 48 kHz stereo 16 bit PCM, the input of
// teddyCloud's /api/pcmUpload (the server encodes it to Opus and writes a TAF).
const RATE = 48000;

type Ctx = typeof AudioContext;

/** 48 kHz stereo interleaved 16 bit samples of an audio file */
export async function toPcmSamples(file: File): Promise<Int16Array> {
    const w = window as unknown as { AudioContext: Ctx; webkitAudioContext?: Ctx; OfflineAudioContext: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext };
    const Audio = w.AudioContext || w.webkitAudioContext;
    const Offline = w.OfflineAudioContext || w.webkitOfflineAudioContext;
    if (!Audio || !Offline) throw new Error("Web Audio API not available");
    const ctx = new Audio();
    try {
        const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
        const length = Math.round((decoded.length * RATE) / decoded.sampleRate);
        const offline = new Offline(decoded.numberOfChannels > 1 ? 2 : 1, length, RATE);
        const src = offline.createBufferSource();
        src.buffer = decoded;
        src.connect(offline.destination);
        src.start();
        const rendered = await offline.startRendering();
        const left = rendered.getChannelData(0);
        const right = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : left;
        const out = new Int16Array(left.length * 2);
        for (let i = 0; i < left.length; i++) {
            const l = Math.max(-1, Math.min(1, left[i]));
            const r = Math.max(-1, Math.min(1, right[i]));
            out[i * 2] = l < 0 ? l * 0x8000 : l * 0x7fff;
            out[i * 2 + 1] = r < 0 ? r * 0x8000 : r * 0x7fff;
        }
        return out;
    } finally {
        ctx.close().catch(() => undefined);
    }
}

export async function toPcm(file: File): Promise<Blob> {
    const samples = await toPcmSamples(file);
    return new Blob([samples.buffer as ArrayBuffer], { type: "audio/pcm" });
}
