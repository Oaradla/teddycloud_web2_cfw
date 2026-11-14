import { describe, expect, it } from "vitest";
import { newAudioIds } from "./audioId";

describe("newAudioIds", () => {
    it("gives the ids of two uploads in the same second without overlap", () => {
        const first = newAudioIds(30);
        const second = newAudioIds(30);
        expect(second - 30).toBeGreaterThanOrEqual(first);
        expect(newAudioIds()).toBe(second + 1);
    });
});
