// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Tag } from "../api/types";
import { compileFilter, FilterError } from "./tagFilter";

const tag = (ruid: string, series: string, tracks: string[], live = false) =>
    ({
        ruid,
        live,
        valid: true,
        tonieInfo: { series, episode: "", model: "", picture: "", tracks },
    }) as unknown as Tag;

const all = [
    tag("1", "Pixi", ["Lied", "Zwei"]),
    tag("2", "Pixi", ["Eins"], true),
    tag("3", "Bibi", []),
];
const match = (query: string) => all.filter(compileFilter(query, all)).map((x) => x.ruid);

describe("compileFilter", () => {
    it("compares fields, case-insensitive", () => {
        expect(match('series = "pixi"')).toEqual(["1", "2"]);
        expect(match("series != Pixi")).toEqual(["3"]);
    });

    it("combines conditions with and, or, not and brackets", () => {
        expect(match("series = Pixi and !live")).toEqual(["1"]);
        expect(match("live || (trackcount = 0)")).toEqual(["2", "3"]);
    });

    it("knows lists, regular expressions, numbers and unique()", () => {
        expect(match("series in (bibi, foo)")).toEqual(["3"]);
        expect(match("tracks ~ lied")).toEqual(["1"]);
        expect(match("trackcount > 1")).toEqual(["1"]);
        expect(match("unique(series)")).toEqual(["3"]);
    });

    it("matches everything for an empty query", () => {
        expect(match("")).toEqual(["1", "2", "3"]);
    });

    it("names the token that does not fit", () => {
        expect(() => match("colour = red")).toThrow(FilterError);
        expect(() => match("series = Pixi )")).toThrow(")");
    });
});
