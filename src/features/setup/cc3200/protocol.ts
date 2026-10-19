// The serial protocol of the CC3200's ROM bootloader, over Web Serial: a port of cc3200tool
// (https://github.com/toniebox-reverse-engineering/cc3200tool, revision c233289, GPL-2.0-or-later,
// Copyright (C) 2016-2020 Allterco Robotics) to TypeScript. Only what setting up a Toniebox needs:
// connect, flash dump, file list, reading and writing files, through a UART adapter or g3gg0's
// ESP32-C3 UART gateway.

const BAUD = 921600;
const TIMEOUT = 5000;

const OP = {
    startUpload: 0x21,
    finishUpload: 0x22,
    getLastStatus: 0x23,
    fileChunk: 0x24,
    getStorageList: 0x27,
    getFileInfo: 0x2a,
    readFileChunk: 0x2b,
    rawStorageRead: 0x2c,
    rawStorageWrite: 0x2d,
    eraseFile: 0x2e,
    getVersionInfo: 0x2f,
    getStorageInfo: 0x31,
    execFromRam: 0x32,
    switchToApps: 0x33,
} as const;

const STORAGE_SRAM = 0x0;
const STORAGE_SFLASH = 0x2;
const FLASH_BLOCK_SIZES = [0x100, 0x400, 0x1000, 0x4000, 0x10000];
const SLFS_BLOCK_SIZE = 4096;
const SLFS_MODE_OPEN_WRITE_CREATE_IF_NOT_EXIST = 3;
const STATUS_OK = 0x40;
/* where the file table keeps the file names, on the CC3200 */
const FAT_META2_OFFSET = 0x774;
const FAT_PART_OFFSET = 0x1000;
const FAT_META2_LENGTH = 0x1000;
const FAT_NAME_ARRAY_OFFSET = 0x200;
const SYSTEM_FILES_SKIPPED = ["/sys/servicepack.ucf"];

export class Cc3200Error extends Error {}

const sleep = (ms: number) => new Promise((r) => globalThis.setTimeout(r, ms));
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

export type Log = (line: string) => void;

/* ---------- byte transport ---------- */

/** bytes to and from the box, with the reset line and the break condition */
export interface Link {
    write(data: Uint8Array): Promise<void>;
    /** up to n bytes; fewer when timeoutMs passes first */
    read(n: number, timeoutMs: number): Promise<Uint8Array>;
    flushInput(): void;
    sendBreak(ms: number): Promise<void>;
    /** true: the box held in reset */
    setReset(active: boolean): Promise<void>;
    close(): Promise<void>;
}

/** what the port delivers, collected in the background, for reads with a timeout */
class Receiver {
    private buffer: number[] = [];
    private waiter: (() => void) | null = null;
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private stopped = false;

    constructor(private readonly port: SerialPort, private readonly onData: (chunk: Uint8Array) => void = (c) => this.push(c)) {}

    start() {
        void (async () => {
            while (!this.stopped && this.port.readable) {
                this.reader = this.port.readable.getReader();
                try {
                    for (;;) {
                        const { value, done } = await this.reader.read();
                        if (done) break;
                        if (value) this.onData(value);
                    }
                } catch {
                    /* a break or a framing error ends the stream; it is opened again */
                } finally {
                    this.reader.releaseLock();
                }
            }
        })();
    }

    push(chunk: Uint8Array) {
        for (const b of chunk) this.buffer.push(b);
        this.waiter?.();
    }

    async take(n: number, timeoutMs: number): Promise<Uint8Array> {
        const deadline = Date.now() + timeoutMs;
        while (this.buffer.length < n && Date.now() < deadline) {
            await new Promise<void>((resolve) => {
                const timer = globalThis.setTimeout(resolve, Math.max(1, deadline - Date.now()));
                this.waiter = () => {
                    globalThis.clearTimeout(timer);
                    resolve();
                };
            });
            this.waiter = null;
        }
        return Uint8Array.from(this.buffer.splice(0, Math.min(n, this.buffer.length)));
    }

    clear() {
        this.buffer = [];
    }

    async stop() {
        this.stopped = true;
        await this.reader?.cancel().catch(() => undefined);
    }
}

/** a UART adapter: reset over DTR, or by hand */
class DirectLink implements Link {
    private rx: Receiver;
    constructor(private readonly port: SerialPort) {
        this.rx = new Receiver(port);
        this.rx.start();
    }
    async write(data: Uint8Array) {
        const writer = this.port.writable!.getWriter();
        try {
            await writer.write(data);
        } finally {
            writer.releaseLock();
        }
    }
    read(n: number, timeoutMs: number) {
        return this.rx.take(n, timeoutMs);
    }
    flushInput() {
        this.rx.clear();
    }
    async sendBreak(ms: number) {
        await this.port.setSignals({ break: true });
        await sleep(ms);
        await this.port.setSignals({ break: false });
    }
    async setReset(active: boolean) {
        await this.port.setSignals({ dataTerminalReady: active });
    }
    async close() {
        await this.rx.stop();
        await this.port.close().catch(() => undefined);
    }
}

/** g3gg0's ESP32-C3 UART gateway in its extended mode: data, configuration and control in frames */
class GatewayLink implements Link {
    private rx: Receiver;
    private frame: number[] = [];
    constructor(private readonly port: SerialPort, private readonly log: Log) {
        this.rx = new Receiver(port, (chunk) => this.parse(chunk));
        this.rx.start();
    }

    static async open(port: SerialPort, log: Log) {
        await port.setSignals({ dataTerminalReady: false, requestToSend: false });
        const link = new GatewayLink(port, log);
        // extended mode: length 12, type 0x0A, "UARTGWEX"
        await link.raw(Uint8Array.from([0x0c, 0x00, 0x0a, 0x00, ...ascii("UARTGWEX")]));
        await sleep(500);
        await link.raw(GatewayLink.packet(new Uint8Array(12), 1)); // ask for the configuration
        await sleep(100);
        const config = new Uint8Array(12);
        config.set([BAUD & 0xff, (BAUD >> 8) & 0xff, (BAUD >> 16) & 0xff, (BAUD >>> 24) & 0xff], 0);
        config[11] = 1; // extended mode
        await link.raw(GatewayLink.packet(config, 1));
        await sleep(100);
        return link;
    }

    private static packet(payload: Uint8Array, type: number) {
        const length = payload.length + 4;
        const out = new Uint8Array(length);
        out.set([length & 0xff, length >> 8, type & 0xff, type >> 8], 0);
        out.set(payload, 4);
        return out;
    }

    private parse(chunk: Uint8Array) {
        for (const b of chunk) this.frame.push(b);
        while (this.frame.length >= 4) {
            const length = this.frame[0] | (this.frame[1] << 8);
            const type = this.frame[2] | (this.frame[3] << 8);
            if (length < 4) {
                this.frame.shift(); // out of step: look for the next frame
                continue;
            }
            if (this.frame.length < length) return;
            const payload = Uint8Array.from(this.frame.splice(0, length).slice(4));
            if (type === 3) this.log(`[ESP32-C3] ${new TextDecoder().decode(payload).trim()}`);
            else if (type !== 1) this.rx.push(payload);
        }
    }

    private async raw(data: Uint8Array) {
        const writer = this.port.writable!.getWriter();
        try {
            await writer.write(data);
        } finally {
            writer.releaseLock();
        }
    }

    private control(command: string) {
        const payload = new Uint8Array(16);
        payload.set(ascii(command).slice(0, 16), 0);
        return this.raw(GatewayLink.packet(payload, 2));
    }

    async write(data: Uint8Array) {
        for (let pos = 0; pos < data.length; pos += 65530) await this.raw(GatewayLink.packet(data.subarray(pos, pos + 65530), 0));
    }
    read(n: number, timeoutMs: number) {
        return this.rx.take(n, timeoutMs);
    }
    flushInput() {
        this.rx.clear();
    }
    async sendBreak(ms: number) {
        await this.control(`B:${ms}`);
        await sleep(ms);
    }
    async setReset(active: boolean) {
        // reset is active low: R:0 holds the box in reset
        await this.control(active ? "R:0" : "R:1");
    }
    async close() {
        await this.rx.stop();
        await this.port.close().catch(() => undefined);
    }
}

/* ---------- the file table ---------- */

export interface Cc3200File {
    index: number;
    name: string;
    startBlock: number;
    sizeBlocks: number;
    mirrored: boolean;
}

/** the files of the serial flash, from the newer of its two file tables */
export function parseFat(table: Uint8Array, meta2: Uint8Array): Cc3200File[] {
    const files: Cc3200File[] = [];
    for (let i = 0; i < 128; i++) {
        const m = table.subarray((i + 1) * 4, (i + 2) * 4);
        if ((m[0] === 0xff && m[1] === 0xff && m[2] === 0xff && m[3] === 0xff) || (m[0] === 0xff && m[1] === i && m[2] === 0xff && m[3] === 0x7f)) continue;
        if (m[0] !== i) throw new Cc3200Error(`incorrect FAT entry (index ${m[0]} != ${i})`);
        const flags = m[3] >> 4;
        const startBlock = ((m[3] & 0xf) << 8) + m[2];
        const nameOffset = meta2[i * 4] | (meta2[i * 4 + 1] << 8);
        const nameLength = meta2[i * 4 + 2] | (meta2[i * 4 + 3] << 8);
        const at = FAT_NAME_ARRAY_OFFSET + nameOffset;
        const raw = meta2.subarray(at, at + nameLength);
        const name = raw.every((c) => c < 0x80) ? String.fromCharCode(...raw) : "<invalid>";
        files.push({ index: i, name, startBlock, sizeBlocks: m[1], mirrored: (flags & 0x4) === 0 });
    }
    return files;
}

/* ---------- the bootloader ---------- */

export interface VersionInfo {
    bootloader: number[];
    chipType: number[];
    isCc3200: boolean;
}

export type ResetMode = "dtr" | "manual";

export interface ConnectOptions {
    gateway: boolean;
    reset: ResetMode;
    log: Log;
    /** called when the box is reset by hand (RST briefly to GND, SOP2 bridged) */
    askReset: () => Promise<void>;
    /** TI's NWP bootloader (rbtl3100s.dll) that the ROM bootloader starts from the SRAM */
    loadNwpBootloader: () => Promise<Uint8Array>;
}
export type Progress = (done: number, total: number) => void;

export class Cc3200 {
    private constructor(
        private readonly link: Link,
        private readonly log: Log,
        private readonly resetLine: boolean,
        private readonly loadNwpBootloader: () => Promise<Uint8Array>,
    ) {}

    /**
     * Opens the port and gets the box's ROM bootloader to listen (reset with SOP2 asserted, then a
     * break); askReset is called when the reset is done by hand.
     */
    static async connect(port: SerialPort, opts: ConnectOptions): Promise<Cc3200> {
        await port.open({ baudRate: BAUD, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none", bufferSize: 65536 });
        const link = opts.gateway ? await GatewayLink.open(port, opts.log) : new DirectLink(port);
        return Cc3200.start(link, opts);
    }

    /** the handshake on an open link (also what the tests drive) */
    static async start(link: Link, opts: ConnectOptions): Promise<Cc3200> {
        const cc = new Cc3200(link, opts.log, opts.gateway || opts.reset === "dtr", opts.loadNwpBootloader);
        try {
            link.flushInput();
            if (opts.gateway || opts.reset === "dtr") {
                await link.setReset(true);
                await sleep(100);
                await link.setReset(false);
            } else {
                await opts.askReset();
            }
            await sleep(1000);
            await cc.tryBreaking();
            const version = await cc.getVersion();
            opts.log(`bootloader ${version.bootloader.join(".")}, chip ${version.chipType.map((x) => x.toString(16)).join(" ")}`);
            if (version.isCc3200) await cc.switchToNwpBootloader(version);
            return cc;
        } catch (e) {
            await link.close();
            throw e;
        }
    }

    async close(reboot = true) {
        if (reboot && this.resetLine) {
            // out of reset with SOP2 released: the box starts its firmware
            await this.link.setReset(true).catch(() => undefined);
            await sleep(100);
            await this.link.setReset(false).catch(() => undefined);
        }
        await this.link.close();
    }

    /* packets: big-endian length (counting the checksum and itself), a checksum byte, the data; answered by 00 CC */

    private async readAck(timeoutMs = TIMEOUT): Promise<boolean> {
        let last = -1;
        for (;;) {
            const b = await this.link.read(1, timeoutMs);
            if (b.length === 0) return false;
            if (last === 0x00 && b[0] === 0xcc) return true;
            last = b[0];
        }
    }

    private async sendPacket(data: number[] | Uint8Array, timeoutMs = TIMEOUT) {
        const bytes = Uint8Array.from(data);
        const sum = bytes.reduce((s, b) => (s + b) & 0xff, 0);
        const length = bytes.length + 2;
        const out = new Uint8Array(bytes.length + 3);
        out.set([length >> 8, length & 0xff, sum], 0);
        out.set(bytes, 3);
        await this.link.write(out);
        if (!(await this.readAck(timeoutMs))) throw new Cc3200Error(`no ACK for opcode 0x${bytes[0].toString(16)}`);
    }

    private async readPacket(timeoutMs = TIMEOUT): Promise<Uint8Array> {
        const header = await this.link.read(3, timeoutMs);
        if (header.length !== 3) throw new Cc3200Error("timeout waiting for a packet");
        const length = ((header[0] << 8) | header[1]) - 2;
        const data = await this.link.read(length, timeoutMs);
        if (data.length !== length) throw new Cc3200Error("packet incomplete");
        if ((data.reduce((s, b) => s + b, 0) & 0xff) !== header[2]) throw new Cc3200Error("packet checksum wrong");
        await this.link.write(Uint8Array.from([0x00, 0xcc]));
        return data;
    }

    private async lastStatus(): Promise<number> {
        await this.sendPacket([OP.getLastStatus]);
        return (await this.readPacket())[0];
    }

    private async tryBreaking(tries = 5) {
        for (let i = 0; i < tries; i++) {
            await this.link.sendBreak(200);
            if (await this.readAck(1000)) return;
        }
        throw new Cc3200Error("no ACK on the break condition: is the box in its bootloader (SOP2, reset)?");
    }

    async getVersion(): Promise<VersionInfo> {
        await this.sendPacket([OP.getVersionInfo]);
        const d = await this.readPacket();
        if (d.length !== 28) throw new Cc3200Error(`version info should be 28 bytes, got ${d.length}`);
        const chipType = [...d.subarray(16, 20)];
        return { bootloader: [...d.subarray(0, 4)], chipType, isCc3200: (chipType[0] & 0x10) !== 0 };
    }

    private async switchToNwpBootloader(version: VersionInfo) {
        if (version.bootloader[1] < 4) throw new Cc3200Error(`bootloader ${version.bootloader.join(".")} is not supported`);
        this.log("switching to the NWP bootloader");
        await this.getVersion(); // asked again, as cc3200tool does
        await this.sendPacket([OP.switchToApps, ...be32(26666667)]);
        await sleep(1000);
        await this.tryBreaking();
        await this.getVersion();
        const dll = await this.loadNwpBootloader();
        await this.rawWrite(0, dll, STORAGE_SRAM);
        await this.sendPacket([OP.execFromRam]);
        if (!(await this.readAck())) throw new Cc3200Error("no ACK after starting the NWP bootloader");
    }

    private async storageList(): Promise<number> {
        await this.sendPacket([OP.getStorageList]);
        const b = await this.link.read(1, 500);
        if (b.length !== 1) throw new Cc3200Error("no storage list");
        return b[0];
    }

    private async storageInfo(storage: number) {
        await this.sendPacket([OP.getStorageInfo, ...be32(storage)]);
        const d = await this.readPacket();
        if (d.length < 4) throw new Cc3200Error("storage info too short");
        return { blockSize: (d[0] << 8) | d[1], blockCount: (d[2] << 8) | d[3] };
    }

    private async checkStorage(storage: number) {
        const list = await this.storageList();
        if (storage === STORAGE_SFLASH && !(list & 0x04)) throw new Cc3200Error("no serial flash");
        if (storage === STORAGE_SRAM && !(list & 0x80)) throw new Cc3200Error("no SRAM");
    }

    private async rawWrite(offset: number, data: Uint8Array, storage: number) {
        await this.checkStorage(storage);
        for (let sent = 0; sent < data.length; sent += 4080) {
            const chunk = data.subarray(sent, sent + 4080);
            await this.sendPacket([OP.rawStorageWrite, ...be32(storage), ...be32(offset + sent), ...be32(chunk.length), ...chunk]);
        }
    }

    private async rawRead(offset: number, size: number, storage: number, progress?: Progress): Promise<Uint8Array> {
        await this.checkStorage(storage);
        const info = await this.storageInfo(storage);
        const total = info.blockCount * info.blockSize;
        if (size < 1) size = total - offset;
        if (offset + size > total) throw new Cc3200Error(`${size} bytes at ${offset} are beyond the ${total} bytes of the storage`);
        const out = new Uint8Array(size);
        for (let done = 0; done < size; ) {
            const n = Math.min(4096, size - done);
            await this.sendPacket([OP.rawStorageRead, ...be32(storage), ...be32(offset + done), ...be32(n)]);
            const chunk = await this.readPacket();
            if (chunk.length !== n) throw new Cc3200Error(`got ${chunk.length} bytes, asked for ${n}`);
            out.set(chunk, done);
            done += n;
            progress?.(done, size);
        }
        return out;
    }

    /** the whole serial flash, read twice and compared */
    async readFlash(progress?: Progress): Promise<Uint8Array> {
        const first = await this.rawRead(0, 0, STORAGE_SFLASH, (d, t) => progress?.(d, 2 * t));
        const second = await this.rawRead(0, 0, STORAGE_SFLASH, (d, t) => progress?.(t + d, 2 * t));
        if (!equal(first, second)) throw new Cc3200Error("the two reads of the flash differ; check the wiring and read again");
        return first;
    }

    async listFiles(): Promise<Cc3200File[]> {
        const info = await this.storageInfo(STORAGE_SFLASH);
        const tables = await this.rawRead(0, 2 * info.blockSize, STORAGE_SFLASH);
        const header = (t: Uint8Array) => {
            const revision = t[0] | (t[1] << 8);
            const signature = t[2] | (t[3] << 8);
            return revision !== 0xffff && signature === 0x534c ? revision : -1;
        };
        const t1 = tables.subarray(0, info.blockSize);
        const t2 = tables.subarray(info.blockSize);
        const r1 = header(t1);
        const r2 = header(t2);
        if (r1 < 0 && r2 < 0) throw new Cc3200Error("no valid file table");
        const meta2Offset = FAT_META2_OFFSET + (r2 >= 0 ? FAT_PART_OFFSET : 0);
        // as cc3200tool reads it: from the offset, offset + length bytes
        const meta2 = await this.rawRead(meta2Offset, meta2Offset + FAT_META2_LENGTH, STORAGE_SFLASH);
        return parseFat(r2 > r1 ? t2 : t1, meta2);
    }

    private async fileInfo(name: string) {
        await this.sendPacket([OP.getFileInfo, ...be32(name.length), ...ascii(name)]);
        const d = await this.readPacket();
        if (d.length < 5) throw new Cc3200Error("file info too short");
        return { exists: d[0] === 1, size: ((d[4] << 24) | (d[5] << 16) | (d[6] << 8) | d[7]) >>> 0 };
    }

    private async openFile(name: string, flags: number, timeoutMs = TIMEOUT) {
        await this.sendPacket([OP.startUpload, ...be32(flags), ...be32(0), ...ascii(name), 0, 0], timeoutMs);
        const token = await this.link.read(4, timeoutMs);
        if (token.length !== 4) throw new Cc3200Error(`opening ${name} failed`);
    }

    private async closeFile() {
        await this.sendPacket([OP.finishUpload, ...new Array(63).fill(0), ...new Array(256).fill(0x46), 0]);
        const status = await this.lastStatus();
        if (status !== STATUS_OK) throw new Cc3200Error(`closing the file failed (0x${status.toString(16)})`);
    }

    private async readFileOnce(name: string): Promise<Uint8Array> {
        const info = await this.fileInfo(name);
        if (!info.exists) throw new Cc3200Error(`${name} does not exist on the box`);
        await this.openFile(name, 0);
        const out = new Uint8Array(info.size);
        for (let pos = 0; pos < info.size; ) {
            const n = Math.min(info.size - pos, SLFS_BLOCK_SIZE);
            await this.sendPacket([OP.readFileChunk, ...be32(pos), ...be32(n)]);
            const chunk = await this.readPacket();
            if (chunk.length !== n) throw new Cc3200Error(`reading ${name} failed`);
            out.set(chunk, pos);
            pos += n;
        }
        await this.closeFile();
        return out;
    }

    /** a file of the box, read twice and compared */
    async readFile(name: string): Promise<Uint8Array> {
        const first = await this.readFileOnce(name);
        if (!equal(first, await this.readFileOnce(name))) throw new Cc3200Error(`the two reads of ${name} differ`);
        return first;
    }

    async exists(name: string) {
        return (await this.fileInfo(name)).exists;
    }

    /** all files of the box (except the service pack), each read twice; the ones that failed are named */
    async readAllFiles(progress?: (name: string, i: number, total: number) => void) {
        const files = (await this.listFiles()).filter((f) => f.name && !SYSTEM_FILES_SKIPPED.includes(f.name.startsWith("/") ? f.name : "/" + f.name));
        const out = new Map<string, Uint8Array>();
        const failed: string[] = [];
        for (const [i, f] of files.entries()) {
            progress?.(f.name, i, files.length);
            try {
                out.set(f.name, await this.readFile(f.name));
            } catch (e) {
                failed.push(`${f.name}: ${(e as Error).message}`);
                this.log(`${f.name}: ${(e as Error).message}`);
            }
        }
        return { files: out, failed };
    }

    /** writes a file (an existing one is erased first) and reads it back to compare */
    async writeFile(name: string, data: Uint8Array) {
        if (!data.length) throw new Cc3200Error(`${name}: nothing to write`);
        if ((await this.fileInfo(name)).exists) {
            // asked once more before erasing, as cc3200tool does
            await this.fileInfo(name);
            await this.sendPacket([OP.eraseFile, ...be32(0), ...ascii(name), 0]);
            const status = await this.lastStatus();
            if (status !== STATUS_OK) throw new Cc3200Error(`erasing ${name} failed (0x${status.toString(16)})`);
        }
        const index = FLASH_BLOCK_SIZES.findIndex((b) => b * 255 >= data.length);
        if (index < 0) throw new Cc3200Error(`${name} is too big`);
        const blocks = Math.ceil(data.length / FLASH_BLOCK_SIZES[index]);
        const flags = ((SLFS_MODE_OPEN_WRITE_CREATE_IF_NOT_EXIST & 0xf) << 12) | ((index & 0xf) << 8) | (blocks & 0xff);
        const timeout = data.length > 200000 ? Math.max(TIMEOUT, 5000 * (data.length / 200000 + 1)) : TIMEOUT;
        await this.openFile(name, flags, timeout);
        for (let pos = 0; pos < data.length; pos += SLFS_BLOCK_SIZE) {
            await this.sendPacket([OP.fileChunk, ...be32(pos), ...data.subarray(pos, pos + SLFS_BLOCK_SIZE)]);
            const status = await this.lastStatus();
            if (status !== STATUS_OK) throw new Cc3200Error(`writing ${name} at ${pos} failed`);
        }
        await this.closeFile();
        if (!equal(await this.readFileOnce(name), data)) throw new Cc3200Error(`${name} reads back different from what was written`);
    }
}
