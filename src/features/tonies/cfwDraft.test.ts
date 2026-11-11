import { describe, expect, it } from "vitest";
import type { CfwTag } from "../../api/types";
import { nextDraft } from "./cfwDraft";

const tag = (resume: boolean | null, position: number) =>
    ({
        ruid: "e0",
        kind: "profile",
        profile: { resume },
        resume: { last: { position } },
    }) as unknown as CfwTag;

describe("nextDraft", () => {
    it("takes the tag read again when nothing was edited", () => {
        const read = tag(null, 2);
        expect(nextDraft(tag(null, 1), tag(null, 1), read)).toBe(read);
    });

    it("keeps an unsaved edit when only the position changed", () => {
        const edited = tag(true, 1);
        expect(nextDraft(edited, tag(null, 1), tag(null, 2))).toBe(edited);
    });

    it("takes the first tag read", () => {
        const read = tag(null, 1);
        expect(nextDraft(null, undefined, read)).toBe(read);
    });
});
