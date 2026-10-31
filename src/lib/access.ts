import { useQuery } from "@tanstack/react-query";
import { ADMIN_MINE, AclScope, NO_RIGHTS, auth } from "../api/auth";
import { folderEntry, mineAllows } from "./aclRights";
import { tc } from "../api/tc";
import { keys } from "./queries";

export const useAuthStatus = () =>
    useQuery({ queryKey: keys.auth, queryFn: tc.authStatus, staleTime: 60_000 });

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
    const m = active ? (mine.data ?? NO_RIGHTS) : ADMIN_MINE;
    // also those used only where the user may change things (folders, tonies)
    const changeable = useQuery({
        queryKey: ["aclMine", status.data?.username ?? "", "models"],
        queryFn: tc.modelsChangeable,
        enabled: active && !m.admin && m.system.includes("model.create"),
        staleTime: 60_000,
    });

    const can = (scope: AclScope | "system", id: string, right: string) => {
        if (m.admin) return true;
        if (scope === "system") return m.system.includes(right);
        return mineAllows(m, scope, id, right);
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
        canCreateModels: m.admin || m.system.includes("model.create"),
        /** the box update page: the update right on at least one box */
        canUpdateBoxes:
            m.admin || Object.values(m.boxes).some((b) => b.rights?.includes("box.update")),
        /** custom tonies the user added, or used only where the user may change things */
        mayChangeModel: (model: string) =>
            m.admin ||
            Boolean(m.models?.[model.toLowerCase()]?.owner) ||
            Boolean(changeable.data?.models.some((x) => x.toLowerCase() === model.toLowerCase())),
        /** pictures in custom_img the user added, or shown only by custom tonies the user may change */
        mayDeleteImage: (name: string) =>
            m.admin ||
            Boolean(m.images?.[name]?.owner) ||
            Boolean(changeable.data?.images.includes(name)),
    };
}
