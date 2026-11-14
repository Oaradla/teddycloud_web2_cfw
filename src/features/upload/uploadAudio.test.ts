import { describe, expect, it, vi } from "vitest";

vi.mock("../../api/tc", () => ({ tc: {} }));
vi.mock("../../lib/i18n", () => ({ t: (key: string) => key }));
vi.stubGlobal("window", { location: { pathname: "/web/v2/index.html" } });
const { oldParts } = await import("./uploadAudio");

describe("oldParts", () => {
    it("names the TAFs of the old upload the new one does not have", () => {
        const names = ["01 - A.taf", "02 - Old.taf", "Album.tap", "cover.jpg", "Album.tap.taf"];
        expect(oldParts(names, ["01 - A.taf", "Album.tap.taf"])).toEqual(["02 - Old.taf"]);
    });
});
