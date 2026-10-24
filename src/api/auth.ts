// Web login, users and permissions of teddyCloud (/api/auth/*, /api/acl/*). Servers without
// them answer 404; the UI then treats everyone as admin, like the classic UI.
import { getJson, postJson, q, request } from "./client";

export type Level = "admin" | "user" | "guest";

export interface AuthUser {
    username: string;
    level?: Level;
    /** own group, empty for the built-in group of the level */
    group?: string;
    createdBy?: string;
    twoFactor: boolean;
    require2fa: boolean;
    mustChangePassword?: boolean;
    lanOnly: boolean;
    recoveryCodesLeft: number;
    created: number;
    passwordChanged: number;
    lastLogin: number;
    legacyHash: boolean;
}

export interface AuthUsers {
    users: AuthUser[];
    enabled: boolean;
    envOverride: boolean;
    require2faAll: boolean;
    maxUsers: number;
    passwordMinLength: number;
}

export interface AuthSession {
    id: string;
    username: string;
    created: number;
    lastSeen: number;
    expires: number;
    ip: string;
    userAgent: string;
    current: boolean;
}

export interface AuthEvent {
    time: number;
    type: string;
    username: string;
    ip: string;
    detail: string;
}

export interface AclMineEntry {
    owner?: boolean;
    granted?: string;
    rights?: string[];
}

export interface AclMine {
    loginActive: boolean;
    username: string;
    level: Level;
    group?: string;
    admin: boolean;
    deny: string;
    system: string[];
    boxes: Record<string, AclMineEntry>;
    tonies: Record<string, AclMineEntry>;
    folders: Record<string, AclMineEntry>;
    /** custom tonies by lower case model id; only the own ones */
    models?: Record<string, AclMineEntry>;
    images?: Record<string, AclMineEntry>;
    unassigned: { tonie?: string; box?: string };
}

export interface AclRight {
    name: string;
    scope: string;
    adminOnly: boolean;
}

/** an own group of users: kind "user" (owns and shares) or "guest" (gets what is shared) */
export interface AclGroup {
    id: string;
    name: string;
    base: "user" | "guest";
    rights: string;
}

export interface AclCatalog {
    rights: AclRight[];
    levels: string[];
    levelLimits: { user?: string; guest?: string };
    groups?: AclGroup[];
    unassigned: { tonie?: string; box?: string };
    boxSettings?: { id: string; label?: string }[];
    boxSettingGroups?: Record<string, string>;
}

export type AclScope = "box" | "tonie" | "folder";

export interface AclEntry {
    type: AclScope;
    id: string;
    owners: string[];
    shares: Record<string, string>;
    inheritedFrom?: string;
}

export const ADMIN_MINE: AclMine = {
    loginActive: false,
    username: "",
    level: "admin",
    admin: true,
    deny: "",
    system: [],
    boxes: {},
    tonies: {},
    folders: {},
    unassigned: {},
};

/** true if a comma separated list of patterns covers the right (same rules as the server) */
export function listAllows(list: string | undefined, right: string): boolean {
    if (!list) return false;
    return list
        .split(/[,\s]+/)
        .filter(Boolean)
        .some((p) => p === "*" || (p === "box.settings" && right.startsWith("box.setting:")) || (p.endsWith("*") ? right.startsWith(p.slice(0, -1)) : p === right));
}

/** a 6 digit value is a TOTP code, anything else a recovery code */
const codeBody = (password: string, code: string) => {
    const c = code.replace(/\s/g, "");
    return /^\d{6}$/.test(c) ? { password, code: c } : { password, recoveryCode: code.trim() };
};

export const auth = {
    users: async (): Promise<AuthUsers> => {
        const d = await getJson<{ users?: string[]; userDetails?: AuthUser[] } & Partial<AuthUsers>>("/api/auth/users/get");
        return {
            users: d.userDetails ?? (d.users as unknown as string[] | undefined)?.map((username) => ({ username }) as AuthUser) ?? [],
            enabled: Boolean(d.enabled),
            envOverride: Boolean(d.envOverride),
            require2faAll: Boolean(d.require2faAll),
            maxUsers: Number(d.maxUsers || 0),
            passwordMinLength: Number(d.passwordMinLength || 10),
        };
    },
    createUser: (body: { username: string; password: string; level?: string; group?: string; lanOnly?: boolean; require2fa?: boolean; mustChangePassword?: boolean }) =>
        postJson("/api/auth/users/create", body),
    updateUser: (
        username: string,
        changes: { lanOnly?: boolean; require2fa?: boolean; mustChangePassword?: boolean; reset2fa?: boolean; revokeSessions?: boolean; level?: string; group?: string },
    ) => postJson<{ user: AuthUser; sessionsRevoked?: number }>("/api/auth/users/update", { username, ...changes }),
    deleteUser: (username: string) => postJson<{ authDisabled?: boolean }>("/api/auth/users/delete", { username }),
    /** currentPassword for the own password; mustChangePassword makes another user choose a new one at the next login */
    setPassword: (username: string, password: string, currentPassword?: string, mustChangePassword?: boolean) =>
        postJson<{ sessionsRevoked?: number }>("/api/auth/users/updatePassword", {
            username,
            password,
            ...(currentPassword === undefined ? {} : { currentPassword }),
            ...(mustChangePassword ? { mustChangePassword } : {}),
        }),
    setEnabled: (enabled: boolean) => postJson("/api/auth/enabled", { enabled }),

    setup2fa: (password: string) => postJson<{ secret: string; otpauthUri: string; expiresIn: number }>("/api/auth/2fa/setup", { password }),
    enable2fa: (code: string) => postJson<{ recoveryCodes?: string[] }>("/api/auth/2fa/enable", { code }).then((d) => d.recoveryCodes ?? []),
    disable2fa: (password: string, code: string) => postJson("/api/auth/2fa/disable", codeBody(password, code)),
    renewRecoveryCodes: (password: string, code: string) =>
        postJson<{ recoveryCodes?: string[] }>("/api/auth/2fa/recoveryCodes", codeBody(password, code)).then((d) => d.recoveryCodes ?? []),

    sessions: (all = false) => getJson<{ sessions?: AuthSession[] }>(`/api/auth/sessions/get${all ? "?all=1" : ""}`).then((d) => d.sessions ?? []),
    revokeSession: (id: string) => postJson<{ revoked?: number }>("/api/auth/sessions/revoke", { id }),
    revokeOtherSessions: () => postJson<{ revoked?: number }>("/api/auth/sessions/revoke", { others: true }),
    events: () =>
        getJson<{ events?: AuthEvent[]; lockedAddresses?: { ip: string; lockedUntil: number }[] }>("/api/auth/events/get").then((d) => ({
            events: d.events ?? [],
            locked: d.lockedAddresses ?? [],
        })),
    unlock: (target: { ip?: string; username?: string }) => postJson("/api/auth/unlock", target),

    /* permissions */
    mine: async (): Promise<AclMine> => {
        const r = await request("/api/acl/mine");
        if (!r.ok) return ADMIN_MINE; // no permissions on this server: everyone is admin
        return { ...ADMIN_MINE, ...(await r.json()) };
    },
    catalog: () => getJson<AclCatalog>("/api/acl/catalog"),
    /** what a user owns or has shared (admins only) */
    owned: (user: string) => getJson<Record<"boxes" | "tonies" | "folders" | "models" | "images", { id: string; owner: boolean; granted?: string }[]>>(`/api/acl/owned${q({ user })}`),
    aclUsers: () => getJson<{ users?: { username: string; level: string; group?: string }[] }>("/api/acl/users").then((d) => d.users ?? []),
    entry: (type: AclScope, id: string) => getJson<AclEntry>(`/api/acl/get${q({ type, id })}`),
    saveEntry: (type: AclScope, id: string, changes: { owners?: string[]; shares?: Record<string, string> }) =>
        postJson<AclEntry>("/api/acl/set", { type, id, ...changes }),
    saveLevels: (limits: { user?: string; guest?: string; unassignedTonie?: string; unassignedBox?: string }) => postJson("/api/acl/levels/set", limits),
    saveGroup: (g: Omit<AclGroup, "id"> & { id?: string }) => postJson<{ id?: string }>("/api/acl/groups/set", g).then((d) => String(d.id ?? "")),
    deleteGroup: (id: string) => postJson("/api/acl/groups/delete", { id }),
};
