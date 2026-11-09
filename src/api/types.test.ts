import { describe, expect, it } from "vitest";
import { CFW_CAP, type CfwBox, withoutTemporary } from "./types";

describe("withoutTemporary", () => {
    const box = (id: string, isCfw: boolean, capabilities: number) =>
        ({ id, isCfw, helloValid: true, capabilities, settings: { enabled: true } }) as CfwBox;

    it("lists the custom firmware boxes without the until-switch-off capability", () => {
        const boxes = [
            box("old", true, CFW_CAP.eventTags),
            box("new", true, CFW_CAP.temporary),
            box("ofw", false, 0),
        ];
        expect(withoutTemporary(boxes).map((b) => b.id)).toEqual(["old"]);
    });
});
