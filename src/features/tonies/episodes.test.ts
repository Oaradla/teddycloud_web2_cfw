import { describe, expect, it } from "vitest";
import { siblingEpisodes } from "./episodes";

const files = [
    { name: "01.taf", listened: true },
    { name: "02.taf" },
    { name: "03.taf", listened: true },
    { name: "04.taf" },
];

describe("siblingEpisodes", () => {
    it("offers the unheard files after and before the current one", () => {
        const { next, prev } = siblingEpisodes(files, "03.taf");
        expect([next?.name, prev?.name]).toEqual(["04.taf", "02.taf"]);
    });

    it("offers the first unheard file when the current one is not in the list", () => {
        const { next, prev } = siblingEpisodes(files, "gone.taf");
        expect([next?.name, prev]).toEqual(["02.taf", undefined]);
    });
});
