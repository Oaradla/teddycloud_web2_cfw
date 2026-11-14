import type { CfwImage } from "../../../api/types";

const PARTITION_TABLE = 0x9000;
const SECTOR = 0x1000;
const OTA_SUBTYPE_0 = 0x10;
const OTA_SLOTS = 3;
const SEQ_NONE = 0xffffffff;

/** the custom firmware images for the ESP32 box in the library, newest first */
export const esp32Releases = (images: CfwImage[] = []) =>
    images.filter((i) => i.platform === "esp32" && !i.original).sort((a, b) => b.build - a.build);

const u32 = (data: Uint8Array, offset: number) =>
    new DataView(data.buffer, data.byteOffset).getUint32(offset, true);

/** CRC-32 as the ESP-IDF boot selection takes it (esp_rom_crc32_le with UINT32_MAX) */
function crc32(data: Uint8Array, crc = SEQ_NONE) {
    crc = ~crc;
    for (const byte of data) {
        crc ^= byte;
        for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return ~crc >>> 0;
}

function partitions(flash: Uint8Array) {
    const found: { type: number; subtype: number; offset: number; size: number }[] = [];
    for (let p = PARTITION_TABLE; flash[p] === 0xaa && flash[p + 1] === 0x50; p += 32) {
        found.push({
            type: flash[p + 2],
            subtype: flash[p + 3],
            offset: u32(flash, p + 4),
            size: u32(flash, p + 8),
        });
    }
    return found;
}

/** the sequence number of an otadata sector, SEQ_NONE when it holds no valid entry */
function sequence(flash: Uint8Array, offset: number) {
    const seq = u32(flash, offset);
    return seq !== SEQ_NONE && u32(flash, offset + 28) === crc32(flash.slice(offset, offset + 4))
        ? seq
        : SEQ_NONE;
}

/**
 * The flash dump with the custom firmware's app image in the app slot after the one the box boots
 * (where an update of the original firmware would go) and the boot selection set to it; the
 * original firmware stays in its slot, which the custom firmware finds and falls back to.
 */
export function withCfw(flash: Uint8Array, image: Uint8Array) {
    const table = partitions(flash);
    const otadata = table.find((p) => p.type === 1 && p.subtype === 0);
    const slots = [0, 1, 2].map((n) =>
        table.find((p) => p.type === 0 && p.subtype === OTA_SUBTYPE_0 + n),
    );
    if (!otadata || slots.some((s) => !s))
        throw new Error("no ESP32 partition table with three app slots");
    if (image[0] !== 0xe9 || image[12] !== 9) throw new Error("not an app image for the ESP32-S3");

    const seqs = [0, 1].map((n) => sequence(flash, otadata.offset + n * SECTOR));
    const valid = seqs.filter((s) => s !== SEQ_NONE);
    // without a valid selection the box boots the first app slot
    const current = valid.length ? Math.max(...valid) : 1;
    const seq = current + 1;
    const slot = slots[(seq - 1) % OTA_SLOTS]!;
    if (image.length > slot.size) throw new Error("the image is larger than the app slot");

    const result = flash.slice();
    result.fill(0xff, slot.offset, slot.offset + slot.size).set(image, slot.offset);
    // the sector not holding the current selection, as the update interface writes it
    const sector = otadata.offset + (valid.length && seqs[0] === current ? SECTOR : 0);
    const entry = new Uint8Array(32).fill(0xff);
    new DataView(entry.buffer).setUint32(0, seq, true);
    new DataView(entry.buffer).setUint32(28, crc32(entry.slice(0, 4)), true);
    result.fill(0xff, sector, sector + SECTOR).set(entry, sector);
    return { flash: result, slot: (seq - 1) % OTA_SLOTS };
}
