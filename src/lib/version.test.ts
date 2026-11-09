import { describe, expect, it } from "vitest";
import { buildUrl, GITHUB, newerRcTag, rcTag, versionKind } from "./version";

const ref = (tag: string, type = "commit") => ({ ref: "refs/tags/" + tag, object: { type } });

describe("version", () => {
    it("tells release candidates, develop and releases apart", () => {
        expect(versionKind("v0.7.1-rc2")).toBe("rc");
        expect(versionKind("v0.7.1-rc")).toBe("rc");
        expect(versionKind("vX.X.X")).toBe("develop");
        expect(versionKind("v0.7.0")).toBe("release");
    });

    it("maps a release-candidate id back to its tag", () => {
        expect(rcTag("v0.7.1-rc2")).toBe("rc_v0.7.1-2");
        expect(rcTag("v0.7.1-rc")).toBe("rc_v0.7.1");
    });

    it("links the build's tag, commit or release", () => {
        expect(buildUrl("v0.7.1-rc", "abc")).toBe(GITHUB + "tree/rc_v0.7.1");
        expect(buildUrl("v0.7.1-rc3", "abc")).toBe(GITHUB + "tree/rc_v0.7.1-3");
        expect(buildUrl("vX.X.X", "abc")).toBe(GITHUB + "tree/abc");
        expect(buildUrl("v0.7.0", "abc")).toBe(GITHUB + "releases/tag/tc_v0.7.0");
    });

    it("offers only a newer release candidate", () => {
        const refs = [
            ref("rc_v0.7.1"),
            ref("rc_v0.7.1-2"),
            ref("rc_v0.7.1-10"),
            ref("rc_v0.7.2", "tag"),
        ];
        expect(newerRcTag("v0.7.1-rc2", refs)).toBe("rc_v0.7.1-10");
        expect(newerRcTag("v0.7.1-rc10", refs)).toBeUndefined();
        expect(newerRcTag("v0.7.1-rc", [ref("rc_v0.7.1-1")])).toBe("rc_v0.7.1-1");
        expect(newerRcTag("v0.8.0-rc", refs)).toBeUndefined();
    });
});
