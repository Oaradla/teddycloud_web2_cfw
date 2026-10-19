import { useQuery } from "@tanstack/react-query";
import { ADMIN_MINE, AclMineEntry, AclScope, auth, listAllows } from "../api/auth";
import { tc } from "../api/tc";
import { keys } from "./queries";

/** the entry of a library folder itself or of its nearest parent */
function folderEntry(folders: Record<string, AclMineEntry>, path: string): AclMineEntry | undefined {
    let probe = path.replace(/^\/+|\/+$/g, "");
    for (;;) {
        if (folders[probe]) return folders[probe];
        if (probe === "") return undefined;
        const slash = probe.lastIndexOf("/");
        probe = slash < 0 ? "" : probe.slice(0, slash);
    }
}

export const useAuthStatus = () => useQuery({ queryKey: keys.auth, queryFn: tc.authStatus, staleTime: 60_000 });

/**
 * What the logged-in user may do. Without the web login everyone is admin (as in the classic
 * UI); a server without permissions too.
 */
export function useAccess() {
    const status = useAuthStatus();
    const active = Boolean(status.data?.enabled && status.data.loggedIn);
    const mine = useQuery({
        queryKey: ["aclMine", status.data?.username ?? ""],
        queryFn: auth.mine,
        enabled: active,
        staleTime: 60_000,
    });
    const m = active ? (mine.data ?? ADMIN_MINE) : ADMIN_MINE;

    const can = (scope: AclScope | "system", id: string, right: string) => {
        if (m.admin) return true;
        if (scope === "system") return m.system.includes(right);
        if (scope === "box") return Boolean(m.boxes[id]?.rights?.includes(right));
        const entry = scope === "tonie" ? m.tonies[id.toUpperCase()] : folderEntry(m.folders, id);
        if (entry?.owner) return !listAllows(m.deny, right);
        if (entry?.granted) return listAllows(entry.granted, right) && !listAllows(m.deny, right);
        if (scope === "tonie" && !entry) return listAllows(m.unassigned.tonie, right);
        return false;
    };
    const owns = (scope: AclScope, id: string) => {
        if (m.admin) return true;
        if (scope === "folder") return Boolean(folderEntry(m.folders, id)?.owner);
        const map = scope === "box" ? m.boxes : m.tonies;
        return Boolean(map[scope === "tonie" ? id.toUpperCase() : id]?.owner);
    };

    return {
        status: status.data,
        loginActive: active,
        mine: m,
        admin: m.admin,
        can,
        owns,
        canManageUsers: m.admin || m.system.includes("users.manage"),
        canServerSettings: m.admin || m.system.includes("system.settings"),
    };
}
