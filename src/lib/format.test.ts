// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Tag } from "../api/types";
import {
    bytes,
    chapterLength,
    duration,
    joinPath,
    linkedContent,
    parentPath,
    ruidPretty,
} from "./format";

const info = (series: string, episode = "", picture = "") => ({
    tracks: [],
    model: "",
    series,
    episode,
    picture,
});

describe("format", () => {
    it("writes durations as m:ss or h:mm:ss", () => {
        expect(duration(65)).toBe("1:05");
        expect(duration(3725)).toBe("1:02:05");
        expect(duration(undefined)).toBe("–:–");
    });

    it("writes sizes in binary units", () => {
        expect(bytes(500)).toBe("500 B");
        expect(bytes(1536)).toBe("1.5 KB");
        expect(bytes(20 * 1024 * 1024)).toBe("20 MB");
    });

    it("joins and splits library paths", () => {
        expect(joinPath("/a/", "b", "/c")).toBe("/a/b/c");
        expect(parentPath("/a/b/c")).toBe("/a/b");
        expect(parentPath("/a")).toBe("/");
    });

    it("measures a chapter up to the next one, the last one up to the end", () => {
        expect(chapterLength([0, 10, 25], 1)).toBe(15);
        expect(chapterLength([0, 10, 25], 2, 40)).toBe(15);
        expect(chapterLength([0, 10, 25], 2)).toBeUndefined();
    });

    it("writes a ruid as bytes", () => {
        expect(ruidPretty("0a1b2c")).toBe("0A:1B:2C");
    });

    it("shows assigned content only when it differs from the figure", () => {
        const tag = { tonieInfo: info("Pixi"), sourceInfo: info("Pixi") } as unknown as Tag;
        expect(linkedContent(tag)).toBeNull();
        expect(linkedContent({ ...tag, sourceInfo: info("Bibi") })?.series).toBe("Bibi");
    });
});
