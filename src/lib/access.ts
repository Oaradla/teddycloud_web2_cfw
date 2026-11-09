import { useCallback } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
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

/** admins, when there are other users: the users to filter by, and whether an id belongs to one of `users` */
export function useOwnerFilter(kind: "boxes" | "tonies", users: string[]) {
    const access = useAccess();
    const enabled = access.admin && access.loginActive;
    const all = useQuery({ queryKey: ["aclUsers"], queryFn: auth.aclUsers, enabled });
    const combine = useCallback(
        (results: { data?: Awaited<ReturnType<typeof auth.owned>> }[]) =>
            new Set(
                results.flatMap(
                    (r) =>
                        r.data?.[kind].filter((x) => x.owner).map((x) => x.id.toUpperCase()) ?? [],
                ),
            ),
        [kind],
    );
    const ids = useQueries({
        queries: users.map((user) => ({
            queryKey: ["aclOwned", user],
            queryFn: () => auth.owned(user),
            enabled,
        })),
        combine,
    });
    const names = (all.data ?? []).map((u) => u.username);
    const filtered = enabled && users.length > 0;
    return {
        users: enabled && names.some((n) => n !== access.mine.username) ? names : [],
        keep: useCallback((id: string) => !filtered || ids.has(id.toUpperCase()), [filtered, ids]),
    };
}
