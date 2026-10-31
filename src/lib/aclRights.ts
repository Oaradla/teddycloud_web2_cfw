import type { AclMine, AclMineEntry, AclScope } from "../api/auth";

/** the entry of a library folder itself or of its nearest parent */
export function folderEntry(
    folders: Record<string, AclMineEntry>,
    path: string,
): AclMineEntry | undefined {
    let probe = path.replace(/^\/+|\/+$/g, "");
    for (;;) {
        if (folders[probe]) return folders[probe];
        if (probe === "") return undefined;
        const slash = probe.lastIndexOf("/");
        probe = slash < 0 ? "" : probe.slice(0, slash);
    }
}

/** the right on a box (overlay id), tonie (ruid) or library folder, as the server decided it in /api/acl/mine */
export function mineAllows(m: AclMine, scope: AclScope, id: string, right: string): boolean {
    if (m.admin) return true;
    if (scope === "box") return Boolean(m.boxes[id]?.rights?.includes(right));
    if (scope === "folder") return Boolean(folderEntry(m.folders, id)?.rights?.includes(right));
    const entry = m.tonies[id.toUpperCase()];
    return Boolean((entry ? entry.rights : m.unassignedRights?.tonie)?.includes(right));
}
