import { describe, expect, it } from "vitest";

import { esp32Releases, withCfw } from "./cfwInstall";
import type { CfwImage } from "../../../api/types";

const OTADATA = 0x16f000;
const SLOTS = [0x180000, 0x3a0000, 0x5c0000];
const SLOT_SIZE = 0x220000;

function dump(selected: number[]) {
    const flash = new Uint8Array(0x800000).fill(0xff);
    const view = new DataView(flash.buffer);
    const entries = [
        [1, 0, OTADATA, 0x2000],
        ...SLOTS.map((offset, n) => [0, 0x10 + n, offset, SLOT_SIZE]),
    ];
    entries.forEach(([type, subtype, offset, size], n) => {
        const p = 0x9000 + 32 * n;
        flash.set([0xaa, 0x50, type, subtype], p);
        view.setUint32(p + 4, offset, true);
        view.setUint32(p + 8, size, true);
    });
    // known entries of the ESP-IDF boot selection: sequence number and its CRC
    const crc: Record<number, number> = { 1: 0x4743989a, 2: 0x55f63774 };
    selected.forEach((seq, sector) => {
        view.setUint32(OTADATA + sector * 0x1000, seq, true);
        view.setUint32(OTADATA + sector * 0x1000 + 28, crc[seq], true);
    });
    return flash;
}

const image = (length = 1000) => {
    const data = new Uint8Array(length).fill(0x5a);
    data[0] = 0xe9;
    data[12] = 9;
    return data;
};

describe("withCfw", () => {
    it("writes the image into the slot after the one the box boots and selects it", () => {
        const { flash, slot } = withCfw(dump([1]), image());
        expect(slot).toBe(1);
        expect(flash.slice(SLOTS[1], SLOTS[1] + 1000)).toEqual(image());
        expect(flash[SLOTS[1] + 1000]).toBe(0xff);
        // sequence 2 with its CRC in the other sector, the first one unchanged
        const view = new DataView(flash.buffer);
        expect(view.getUint32(OTADATA + 0x1000, true)).toBe(2);
        expect(view.getUint32(OTADATA + 0x1000 + 28, true)).toBe(0x55f63774);
        expect(view.getUint32(OTADATA, true)).toBe(1);
    });

    it("leaves the slot of the original firmware alone", () => {
        const original = dump([1, 2]);
        original.fill(0x11, SLOTS[1], SLOTS[1] + 100);
        const { flash, slot } = withCfw(original, image());
        expect(slot).toBe(2);
        expect(flash.slice(SLOTS[1], SLOTS[1] + 100)).toEqual(new Uint8Array(100).fill(0x11));
        expect(new DataView(flash.buffer).getUint32(OTADATA, true)).toBe(3);
    });

    it("takes the second slot when the box has no boot selection yet", () => {
        expect(withCfw(dump([]), image()).slot).toBe(1);
    });

    it("refuses what does not fit", () => {
        expect(() => withCfw(new Uint8Array(0x800000), image())).toThrow();
        expect(() => withCfw(dump([1]), new Uint8Array(1000))).toThrow();
        expect(() => withCfw(dump([1]), image(SLOT_SIZE + 1))).toThrow();
    });
});

describe("esp32Releases", () => {
    it("lists only custom firmware for the ESP32 box, newest first", () => {
        const images = [
            { build: 1, platform: "esp32" },
            { build: 3, platform: "esp32" },
            { build: 2, platform: "esp32", original: true },
            { build: 4, platform: "cc3200" },
        ] as CfwImage[];
        expect(esp32Releases(images).map((i) => i.build)).toEqual([3, 1]);
    });
});
