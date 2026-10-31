import { describe, expect, it } from "vitest";
import type { AclMine } from "../api/auth";
import { mineAllows } from "./aclRights";

describe("mineAllows", () => {
    const mine: AclMine = {
        loginActive: true,
        username: "bob",
        level: "user",
        admin: false,
        deny: "",
        system: [],
        boxes: {},
        unassigned: {},
        tonies: { E00401020304050A: { owner: true, rights: ["tonie.view"] } },
        folders: { "private/bob": { owner: true, rights: ["folder.read", "folder.write"] } },
        unassignedRights: { tonie: ["tonie.view", "tonie.assign"] },
    };

    it("takes the rights the server decided", () => {
        expect(mineAllows(mine, "tonie", "e00401020304050a", "tonie.view")).toBe(true);
        expect(mineAllows(mine, "tonie", "e00401020304050a", "tonie.edit")).toBe(false);
        expect(mineAllows(mine, "tonie", "E00401020304050B", "tonie.assign")).toBe(true);
        expect(mineAllows(mine, "tonie", "E00401020304050B", "tonie.edit")).toBe(false);
        expect(mineAllows(mine, "folder", "/private/bob/sub/", "folder.write")).toBe(true);
        expect(mineAllows(mine, "folder", "private/alice", "folder.read")).toBe(false);
        expect(
            mineAllows(
                { ...mine, unassignedRights: undefined },
                "tonie",
                "E00401020304050B",
                "tonie.view",
            ),
        ).toBe(false);
    });
});
