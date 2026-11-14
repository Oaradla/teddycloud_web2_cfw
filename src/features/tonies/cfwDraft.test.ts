import { describe, expect, it } from "vitest";
import type { CfwTag } from "../../api/types";
import { nextDraft, settingsOf } from "./cfwDraft";

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

describe("settingsOf", () => {
    it("ignores the fields another kind left in the draft", () => {
        const left = { ...tag(true, 1), kind: "none" } as CfwTag;
        expect(settingsOf(left)).toBe(settingsOf({ ruid: "e0", kind: "none" }));
    });
});

describe("nextDraft after a save", () => {
    it("takes the tag read again when the saved draft is the one shown before", () => {
        const saved = { ...tag(true, 1), kind: "none" } as CfwTag;
        const read = { ruid: "e0", kind: "none" } as CfwTag;
        expect(nextDraft(saved, saved, read)).toBe(read);
    });
});
