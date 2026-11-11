import { describe, expect, it } from "vitest";
import { CFW_CAP, type CfwBox, withoutCapability, withoutTemporary } from "./types";

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

describe("withoutCapability", () => {
    it("lists the custom firmware boxes without global resume", () => {
        const boxes = [
            { id: "old", isCfw: true, helloValid: true, capabilities: CFW_CAP.resume },
            { id: "new", isCfw: true, helloValid: true, capabilities: CFW_CAP.globalResume },
            { id: "off", isCfw: true, helloValid: false, capabilities: 0 },
        ].map((b) => ({ ...b, settings: { enabled: true } }) as CfwBox);
        expect(withoutCapability(boxes, CFW_CAP.globalResume).map((b) => b.id)).toEqual(["old"]);
    });
});
