// Drives the CC3200 protocol (src/features/setup/cc3200/protocol.ts) against a simulated ROM
// bootloader with a made-up serial flash and file table: handshake, file list, reading all files,
// flash dump, writing a new and an existing file.
//   node --experimental-transform-types scripts/test-cc3200.ts
import { Cc3200, type Link } from "../src/features/setup/cc3200/protocol.ts";

const BLOCK = 4096;
const BLOCKS = 64;

/** a serial flash with an SFFS file table that lists the given files (their content is served through the file API) */
function makeFlash(names: string[]): Uint8Array {
    const flash = new Uint8Array(BLOCK * BLOCKS).fill(0xff);
    const view = new DataView(flash.buffer);
    view.setUint16(0, 1, true); // table revision
    view.setUint16(2, 0x534c, true); // signature
    const meta2 = 0x774;
    let nameAt = 0;
    names.forEach((name, i) => {
        flash.set([i, 1, 10 + i, 0x80], (i + 1) * 4); // index, size in blocks, start block, flags: not mirrored
        view.setUint16(meta2 + i * 4, nameAt, true);
        view.setUint16(meta2 + i * 4 + 2, name.length, true);
        flash.set([...name].map((c) => c.charCodeAt(0)), meta2 + 0x200 + nameAt);
        nameAt += name.length;
    });
    return flash;
}

class SimulatedBootloader implements Link {
    private input: number[] = [];
    private output: number[] = [];
    private expectAck = false;
    private sram = new Uint8Array(0x10000);
    private status = 0x40;
    private open: { name: string; write: boolean; data: number[] } | null = null;
    readonly packets: number[] = [];

    constructor(public files: Map<string, Uint8Array>, public flash: Uint8Array) {}

    private send(bytes: number[]) {
        this.output.push(...bytes);
    }
    private packet(data: number[]) {
        const sum = data.reduce((s, b) => (s + b) & 0xff, 0);
        this.send([(data.length + 2) >> 8, (data.length + 2) & 0xff, sum, ...data]);
        this.expectAck = true;
    }

    async write(data: Uint8Array) {
        this.input.push(...data);
        for (;;) {
            if (this.expectAck) {
                if (this.input.length < 2) return;
                const ack = this.input.splice(0, 2);
                if (ack[0] !== 0 || ack[1] !== 0xcc) throw new Error(`host sent ${ack} instead of an ACK`);
                this.expectAck = false;
                continue;
            }
            if (this.input.length < 3) return;
            const length = (this.input[0] << 8) | this.input[1];
            if (this.input.length < length + 1) return;
            const frame = this.input.splice(0, length + 1);
            const body = frame.slice(3);
            if ((body.reduce((s, b) => s + b, 0) & 0xff) !== frame[2]) throw new Error("bad checksum from host");
            this.send([0x00, 0xcc]);
            this.handle(body);
        }
    }

    private u32(b: number[], at: number) {
        return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
    }
    private be32(n: number) {
        return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
    }
    private name(b: number[], at: number) {
        let end = at;
        while (end < b.length && b[end] !== 0) end++;
        return String.fromCharCode(...b.slice(at, end));
    }

    private handle(b: number[]) {
        const op = b[0];
        this.packets.push(op);
        switch (op) {
            case 0x2f: // version: bootloader 0.4.1.2, a CC3200
                this.packet([0, 4, 1, 2, ...new Array(12).fill(0), 0x10, 0, 0, 0, ...new Array(8).fill(0)]);
                break;
            case 0x33: // switch to the APPS processor
                break;
            case 0x27: // storage list: serial flash and SRAM
                this.send([0x86]);
                break;
            case 0x31: {
                const storage = this.u32(b, 1);
                this.packet(storage === 2 ? [BLOCK >> 8, BLOCK & 0xff, 0, BLOCKS] : [0x01, 0x00, 0x01, 0x00]);
                break;
            }
            case 0x2d: {
                const [storage, offset, length] = [this.u32(b, 1), this.u32(b, 5), this.u32(b, 9)];
                (storage === 2 ? this.flash : this.sram).set(b.slice(13, 13 + length), offset);
                break;
            }
            case 0x32: // start what is in the SRAM: it answers with one more ACK
                this.send([0x00, 0xcc]);
                break;
            case 0x2c: {
                const [, offset, length] = [this.u32(b, 1), this.u32(b, 5), this.u32(b, 9)];
                this.packet([...this.flash.subarray(offset, offset + length)]);
                break;
            }
            case 0x2a: {
                const name = String.fromCharCode(...b.slice(5, 5 + this.u32(b, 1)));
                const file = this.files.get(name);
                this.packet([file ? 1 : 0, 0, 0, 0, ...this.be32(file?.length ?? 0)]);
                break;
            }
            case 0x21: {
                const flags = this.u32(b, 1);
                this.open = { name: this.name(b, 9), write: flags !== 0, data: [] };
                this.send([1, 2, 3, 4]);
                break;
            }
            case 0x2b: {
                const [pos, length] = [this.u32(b, 1), this.u32(b, 5)];
                this.packet([...this.files.get(this.open!.name)!.subarray(pos, pos + length)]);
                break;
            }
            case 0x24: {
                const pos = this.u32(b, 1);
                b.slice(5).forEach((x, i) => (this.open!.data[pos + i] = x));
                this.status = 0x40;
                break;
            }
            case 0x22:
                if (this.open?.write) this.files.set(this.open.name, Uint8Array.from(this.open.data));
                this.open = null;
                this.status = 0x40;
                break;
            case 0x23:
                this.packet([this.status]);
                break;
            case 0x2e:
                this.files.delete(this.name(b, 5));
                this.status = 0x40;
                break;
            default:
                throw new Error(`unexpected opcode 0x${op.toString(16)}`);
        }
    }

    async read(n: number, timeoutMs: number) {
        const deadline = Date.now() + timeoutMs;
        while (this.output.length < n && Date.now() < deadline) await new Promise((r) => setTimeout(r, 1));
        return Uint8Array.from(this.output.splice(0, Math.min(n, this.output.length)));
    }
    flushInput() {
        this.output = [];
    }
    async sendBreak() {
        this.send([0x00, 0xcc]);
    }
    async setReset() {}
    async close() {}
}

const assert = (ok: unknown, what: string) => {
    if (!ok) throw new Error(`FAILED: ${what}`);
    console.log(`ok   ${what}`);
};
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

const files = new Map<string, Uint8Array>([
    ["/cert/ca.der", Uint8Array.from({ length: 900 }, (_, i) => i & 0xff)],
    ["/cert/client.der", Uint8Array.from({ length: 1200 }, (_, i) => (i * 7) & 0xff)],
    ["/sys/mcuimg.bin", Uint8Array.from({ length: 9000 }, (_, i) => (i * 13) & 0xff)],
    ["/sys/servicepack.ucf", new Uint8Array(100)],
]);
const sim = new SimulatedBootloader(files, makeFlash([...files.keys()]));
const nwp = Uint8Array.from({ length: 5000 }, (_, i) => i & 0xff);
const cc = await Cc3200.start(sim, { gateway: false, reset: "dtr", log: () => undefined, askReset: async () => undefined, loadNwpBootloader: async () => nwp });
assert(sim.packets.includes(0x33) && sim.packets.includes(0x32), "switched to the NWP bootloader");

const list = await cc.listFiles();
assert(list.map((f) => f.name).join(",") === [...files.keys()].join(","), "file list from the file table");

const all = await cc.readAllFiles();
assert(all.failed.length === 0 && all.files.size === 3 && !all.files.has("/sys/servicepack.ucf"), "all files read, the service pack skipped");
assert([...all.files].every(([name, data]) => equal(data, files.get(name)!)), "file contents equal");

const dump = await cc.readFlash();
assert(equal(dump, sim.flash), "flash dump equals the flash");

const preImg = files.get("/sys/mcuimg.bin")!;
await cc.writeFile("/sys/pre-img.bin", preImg);
assert(equal(sim.files.get("/sys/pre-img.bin")!, preImg), "new file written");
const preloader = Uint8Array.from({ length: 15783 }, (_, i) => (i * 3) & 0xff);
await cc.writeFile("/sys/mcuimg.bin", preloader);
assert(equal(sim.files.get("/sys/mcuimg.bin")!, preloader), "existing file replaced");
assert(await cc.exists("/cert/ca.der"), "file info");
await cc.close();
console.log("all passed");
