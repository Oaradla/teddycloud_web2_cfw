import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Disc3, KeyRound, Lock, LogIn, Plus, ShieldAlert, ShieldCheck, Trash2, Unlock, UserPlus, Users, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AclCatalog, AclGroup, auth, AuthUser } from "../../api/auth";
import { tc } from "../../api/tc";
import { useAccess } from "../../lib/access";
import { ago, dateTime } from "../../lib/format";
import { t } from "../../lib/i18n";
import { buildRightsTree } from "../../lib/rightsTree";
import { Sheet } from "../../ui/Sheet";
import { Empty, ErrorBox, Loading, Notice, Page, Row, Section, Segmented, SwitchRow, useUi } from "../../ui/kit";
import { levelName, PasswordSheet } from "../account/AccountPage";
import { RightsTree } from "./RightsTree";

const LEVELS = ["admin", "user", "guest"] as const;

/** users, their groups and rights, the web login itself and its security events */
export function UsersPage() {
    const access = useAccess();
    const qc = useQueryClient();
    const ui = useUi();
    const users = useQuery({ queryKey: ["authUsers"], queryFn: auth.users, enabled: access.canManageUsers });
    const catalog = useQuery({ queryKey: ["aclCatalog"], queryFn: auth.catalog, enabled: access.canManageUsers, retry: false });
    const events = useQuery({ queryKey: ["authEvents"], queryFn: auth.events, enabled: access.admin, retry: false });
    const [edit, setEdit] = useState<AuthUser | null>(null);
    const [create, setCreate] = useState(false);
    const [group, setGroup] = useState<AclGroup | "new" | null>(null);
    const [limits, setLimits] = useState<"user" | "guest" | "tonie" | "box" | null>(null);
    const refresh = () => {
        qc.invalidateQueries({ queryKey: ["authUsers"] });
        qc.invalidateQueries({ queryKey: ["aclCatalog"] });
        qc.invalidateQueries({ queryKey: ["auth"] });
    };

    const groups = catalog.data?.groups ?? [];
    const groupName = (u: AuthUser) => (u.group ? (groups.find((g) => g.id === u.group)?.name ?? u.group) : levelName(u.level));
    /* users create users of the same or a lower level */
    const allowedLevels = LEVELS.slice(Math.max(0, LEVELS.indexOf(access.mine.level as (typeof LEVELS)[number])));

    if (!access.canManageUsers)
        return (
            <Page title={t("usersAndRights")} back="/more" narrow>
                <Empty icon={<Lock size={28} />} title={t("noPermission")} />
            </Page>
        );

    const u = users.data;
    const hasAdmin = u?.users.some((x) => (x.level ?? "admin") === "admin");

    const toggleLogin = async (on: boolean) => {
        if (on && !hasAdmin) return ui.toast("error", t("needAdminFirst"));
        if (on) {
            const ok = await ui.confirm({ title: t("loginOnTitle"), text: t("loginOnText"), confirm: t("switchOn") });
            if (!ok) return;
        }
        await ui.run(() => auth.setEnabled(on), on ? t("loginOnDone") : t("loginOffDone"));
        refresh();
    };

    return (
        <Page
            title={t("usersAndRights")}
            back="/more"
            narrow
            right={
                <button className="icon-btn" onClick={() => setCreate(true)} aria-label={t("addUser")}>
                    <UserPlus size={21} />
                </button>
            }
        >
            {users.isLoading && <Loading />}
            {users.error && <ErrorBox error={users.error} retry={() => users.refetch()} />}
            {u && (
                <>
                    {access.admin && (
                        <Section title={t("webLogin")} footer={u.envOverride ? t("envOverride") : u.enabled ? t("loginOnHint") : t("loginOffHint")}>
                            <SwitchRow icon={<LogIn size={17} />} title={t("loginRequired")} checked={u.enabled} disabled={u.envOverride} onChange={toggleLogin} />
                            <SwitchRow
                                icon={<ShieldCheck size={17} />}
                                title={t("require2faAll")}
                                sub={t("require2faAllHint")}
                                checked={u.require2faAll}
                                onChange={async (v) => {
                                    await ui.run(() => tc.setSetting("web_auth.require_2fa", v), t("saved"));
                                    refresh();
                                }}
                            />
                        </Section>
                    )}

                    <Section
                        title={t("usersN", { n: u.users.length, max: u.maxUsers || "–" })}
                        right={
                            <button className="btn ghost small" onClick={() => setCreate(true)}>
                                <Plus size={16} />
                                {t("addUser")}
                            </button>
                        }
                    >
                        {u.users.length === 0 && <Row title={t("noUsers")} sub={t("noUsersHint")} />}
                        {u.users.map((x) => (
                            <Row
                                key={x.username}
                                leading={<span className="avatar">{x.username.slice(0, 1).toUpperCase()}</span>}
                                title={
                                    <>
                                        {x.username} {x.username === access.status?.username && <span className="badge">{t("you")}</span>}
                                    </>
                                }
                                sub={
                                    <span className="row-gap" style={{ flexWrap: "wrap", gap: 4, marginTop: 3 }}>
                                        <span className={`badge ${(x.level ?? "admin") === "admin" ? "accent" : ""}`}>{groupName(x)}</span>
                                        {x.twoFactor && <span className="badge ok">2FA</span>}
                                        {x.require2fa && !x.twoFactor && <span className="badge warn">{t("twoFactorPending")}</span>}
                                        {x.mustChangePassword && <span className="badge warn">{t("passwordChangePending")}</span>}
                                        {x.lanOnly && <span className="badge">{t("lanOnly")}</span>}
                                        <span className="small muted">{x.lastLogin ? t("lastLogin", { when: ago(x.lastLogin * 1000) }) : t("neverLoggedIn")}</span>
                                    </span>
                                }
                                onClick={() => setEdit(x)}
                            />
                        ))}
                    </Section>
                </>
            )}

            {catalog.data && access.admin && (
                <Section title={t("rightsAndGroups")} footer={t("rightsAndGroupsHint")}>
                    <Row icon={<Users size={17} />} title={t("whatUsersMay")} sub={t("whatUsersMayHint")} onClick={() => setLimits("user")} />
                    <Row icon={<Users size={17} />} title={t("whatChildrenMay")} sub={t("whatChildrenMayHint")} onClick={() => setLimits("guest")} />
                    {groups.map((g) => (
                        <Row key={g.id} icon={<Users size={17} />} title={g.name} sub={t("ownGroupOf", { base: levelName(g.base) })} onClick={() => setGroup(g)} />
                    ))}
                    <Row icon={<Plus size={17} />} title={t("newGroup")} accent onClick={() => setGroup("new")} chevron={false} />
                </Section>
            )}

            {/* not a group: what everyone may do with tonies nobody owns */}
            {catalog.data && access.admin && (
                <Section title={t("withoutOwner")}>
                    <Row icon={<Disc3 size={17} />} title={t("unownedTonies")} sub={t("unownedToniesHint")} onClick={() => setLimits("tonie")} />
                </Section>
            )}

            {events.data && (
                <Section title={t("securityEvents")}>
                    {events.data.locked.map((l) => (
                        <Row
                            key={l.ip}
                            icon={<Lock size={17} />}
                            iconColor="var(--danger)"
                            title={t("lockedIp", { ip: l.ip })}
                            sub={t("lockedUntil", { when: dateTime(l.lockedUntil * 1000) })}
                            right={
                                <button
                                    className="btn small"
                                    onClick={async () => {
                                        await ui.run(() => auth.unlock({ ip: l.ip }), t("unlocked"));
                                        events.refetch();
                                    }}
                                >
                                    <Unlock size={14} />
                                    {t("unlock")}
                                </button>
                            }
                        />
                    ))}
                    {events.data.events.length === 0 && <Row title={t("noEvents")} />}
                    {events.data.events
                        .slice()
                        .reverse()
                        .slice(0, 30)
                        .map((e, i) => (
                            <Row
                                key={i}
                                icon={e.type.includes("fail") || e.type.includes("lock") ? <ShieldAlert size={17} /> : <ShieldCheck size={17} />}
                                iconColor={e.type.includes("fail") || e.type.includes("lock") ? "var(--warn)" : undefined}
                                title={`${t(`event_${e.type}` as never)}${e.username ? " · " + e.username : ""}`}
                                sub={`${e.ip} · ${dateTime(e.time * 1000)}${e.detail ? " · " + e.detail : ""}`}
                            />
                        ))}
                </Section>
            )}

            <UserSheet
                user={edit}
                onClose={() => setEdit(null)}
                groups={groups}
                allowedLevels={[...allowedLevels]}
                minLength={u?.passwordMinLength ?? 10}
                self={edit?.username === access.status?.username}
                onChanged={refresh}
            />
            <CreateUserSheet
                open={create}
                onClose={() => setCreate(false)}
                groups={groups}
                allowedLevels={[...allowedLevels]}
                minLength={u?.passwordMinLength ?? 10}
                first={(u?.users.length ?? 0) === 0}
                onChanged={refresh}
            />
            {catalog.data && (
                <>
                    <LimitsSheet which={limits} catalog={catalog.data} onClose={() => setLimits(null)} onChanged={refresh} />
                    <GroupSheet group={group} catalog={catalog.data} onClose={() => setGroup(null)} onChanged={refresh} />
                </>
            )}
        </Page>
    );
}

/** "user", "guest" or "group:<id>" */
const groupOptions = (levels: string[], groups: AclGroup[]) => [
    ...levels.map((l) => ({ value: l, label: levelName(l) })),
    ...groups.filter((g) => levels.includes(g.base)).map((g) => ({ value: `group:${g.id}`, label: g.name })),
];
const groupChange = (value: string) => (value.startsWith("group:") ? { group: value.slice(6) } : { level: value, group: "" });

function UserSheet({
    user,
    onClose,
    groups,
    allowedLevels,
    minLength,
    self,
    onChanged,
}: {
    user: AuthUser | null;
    onClose: () => void;
    groups: AclGroup[];
    allowedLevels: string[];
    minLength: number;
    self: boolean;
    onChanged: () => void;
}) {
    const ui = useUi();
    const [pw, setPw] = useState(false);
    const [u, setU] = useState<AuthUser | null>(user);
    useEffect(() => setU(user), [user]);
    if (!u) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

    const update = async (changes: Parameters<typeof auth.updateUser>[1], ok = t("saved")) => {
        const r = await ui.run(() => auth.updateUser(u.username, changes), ok);
        if (r?.user) setU(r.user);
        onChanged();
        return r;
    };
    const value = u.group ? `group:${u.group}` : (u.level ?? "admin");
    const options = groupOptions(allowedLevels, groups);

    return (
        <>
            <Sheet open={!!user} onClose={onClose} title={u.username} full>
                <div className="hero" style={{ paddingTop: 0 }}>
                    <span className="avatar big">{u.username.slice(0, 1).toUpperCase()}</span>
                    <p className="small" style={{ marginTop: 8 }}>
                        {u.lastLogin ? t("lastLogin", { when: ago(u.lastLogin * 1000) }) : t("neverLoggedIn")}
                        {u.createdBy ? ` · ${t("createdBy", { name: u.createdBy })}` : ""}
                    </p>
                </div>
                {u.legacyHash && <Notice>{t("legacyHash")}</Notice>}
                {!self && options.some((o) => o.value === value) && (
                    <div className="choice-group">
                        <div className="choice-label">{t("userGroup")}</div>
                        <select className="select" value={value} onChange={(e) => update(groupChange(e.target.value))}>
                            {options.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                <Section>
                    <SwitchRow icon={<ShieldCheck size={17} />} title={t("require2fa")} checked={u.require2fa} onChange={(v) => update({ require2fa: v })} />
                    <SwitchRow icon={<Wifi size={17} />} title={t("lanOnly")} sub={t("lanOnlyHint")} checked={u.lanOnly} disabled={self} onChange={(v) => update({ lanOnly: v })} />
                    {!self && (
                        <SwitchRow
                            icon={<KeyRound size={17} />}
                            title={t("mustChangePassword")}
                            sub={t("mustChangePasswordHint")}
                            checked={Boolean(u.mustChangePassword)}
                            onChange={(v) => update({ mustChangePassword: v })}
                        />
                    )}
                </Section>
                <Section>
                    {!self && <Row icon={<KeyRound size={17} />} title={t("setPassword")} onClick={() => setPw(true)} chevron />}
                    {u.twoFactor && !self && (
                        <Row
                            title={t("reset2fa")}
                            sub={t("reset2faHint")}
                            onClick={async () => {
                                if (await ui.confirm({ title: t("reset2fa"), text: t("reset2faHint"), confirm: t("reset"), danger: true })) update({ reset2fa: true }, t("done"));
                            }}
                            chevron={false}
                        />
                    )}
                    {!self && (
                        <Row
                            title={t("endSessions")}
                            onClick={async () => {
                                const r = await update({ revokeSessions: true }, "");
                                if (r) ui.toast("ok", t("sessionsEnded", { n: r.sessionsRevoked ?? 0 }));
                            }}
                            chevron={false}
                        />
                    )}
                    {!self && (
                        <Row
                            icon={<Trash2 size={17} />}
                            title={t("deleteUser")}
                            danger
                            onClick={async () => {
                                if (!(await ui.confirm({ title: t("deleteUserTitle", { name: u.username }), text: t("deleteUserText"), confirm: t("delete"), danger: true }))) return;
                                const r = await ui.run(() => auth.deleteUser(u.username), t("deleted"));
                                if (r?.authDisabled) ui.toast("info", t("loginOffDone"));
                                onChanged();
                                onClose();
                            }}
                            chevron={false}
                        />
                    )}
                </Section>
                {self && <p className="small muted">{t("editYourselfHint")}</p>}
            </Sheet>
            <PasswordSheet
                open={pw}
                onClose={() => setPw(false)}
                onSaved={(must) => {
                    setU({ ...u, mustChangePassword: must });
                    onChanged();
                }}
                username={u.username}
                minLength={minLength}
            />
        </>
    );
}

function CreateUserSheet({
    open,
    onClose,
    groups,
    allowedLevels,
    minLength,
    first,
    onChanged,
}: {
    open: boolean;
    onClose: () => void;
    groups: AclGroup[];
    allowedLevels: string[];
    minLength: number;
    first: boolean;
    onChanged: () => void;
}) {
    const ui = useUi();
    const options = groupOptions(allowedLevels, groups);
    const [name, setName] = useState("");
    const [password, setPassword] = useState("");
    const [group, setGroup] = useState("user");
    const [lanOnly, setLanOnly] = useState(false);
    const [require2fa, setRequire2fa] = useState(false);
    const [mustChangePassword, setMustChangePassword] = useState(false);
    useEffect(() => {
        if (!open) return;
        setName("");
        setPassword("");
        setGroup(first ? "admin" : allowedLevels.includes("user") ? "user" : allowedLevels[0]);
        setLanOnly(false);
        setRequire2fa(false);
        setMustChangePassword(false);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
    const valid = /^[A-Za-z0-9_.@-]{1,32}$/.test(name) && password.length >= minLength;

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={t("addUser")}
            footer={
                <>
                    <button className="btn" onClick={onClose}>
                        {t("cancel")}
                    </button>
                    <button
                        className="btn primary"
                        disabled={!valid}
                        onClick={async () => {
                            const r = await ui.run(() => auth.createUser({ username: name, password, lanOnly, require2fa, mustChangePassword, ...groupChange(group) }), t("userCreated"));
                            if (r) {
                                onChanged();
                                onClose();
                            }
                        }}
                    >
                        {t("createIt")}
                    </button>
                </>
            }
        >
            {first && <Notice info>{t("firstUserHint")}</Notice>}
            <div className="field">
                <label>{t("username")}</label>
                <input className="input" autoCapitalize="off" autoCorrect="off" autoComplete="off" value={name} onChange={(e) => setName(e.target.value.trim())} />
                <div className="hint">{t("usernameHint")}</div>
            </div>
            <div className="field">
                <label>{t("password")}</label>
                <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <div className="hint">{t("passwordMin", { n: minLength })}</div>
            </div>
            <div className="field">
                <label>{t("userGroup")}</label>
                <select className="select" value={group} onChange={(e) => setGroup(e.target.value)} disabled={first}>
                    {options.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
                <div className="hint">{t(`groupHint_${group.startsWith("group:") ? "own" : group}` as never)}</div>
            </div>
            <div className="list">
                <SwitchRow title={t("require2fa")} checked={require2fa} onChange={setRequire2fa} />
                <SwitchRow title={t("mustChangePassword")} checked={mustChangePassword} onChange={setMustChangePassword} />
                <SwitchRow title={t("lanOnly")} sub={t("lanOnlyHint")} checked={lanOnly} onChange={setLanOnly} />
            </div>
        </Sheet>
    );
}

/** what all users of a level may do at most, or what everyone may do with tonies nobody owns */
function LimitsSheet({ which, catalog, onClose, onChanged }: { which: "user" | "guest" | "tonie" | "box" | null; catalog: AclCatalog; onClose: () => void; onChanged: () => void }) {
    const ui = useUi();
    const tree = useMemo(
        () => (which === "tonie" ? buildRightsTree(catalog.rights, [], ["tonie"]) : buildRightsTree(catalog.rights, catalog.boxSettings ?? [], undefined, catalog.boxSettingGroups ?? {})),
        [which, catalog],
    );
    const current = which === "user" ? catalog.levelLimits.user : which === "guest" ? catalog.levelLimits.guest : which === "tonie" ? catalog.unassigned.tonie : catalog.unassigned.box;
    const [value, setValue] = useState(current ?? "");
    useEffect(() => setValue(current ?? ""), [current, which]);
    const save = async () => {
        const body = which === "user" ? { user: value } : which === "guest" ? { guest: value } : which === "tonie" ? { unassignedTonie: value } : { unassignedBox: value };
        if (await ui.run(() => auth.saveLevels(body), t("saved"))) {
            onChanged();
            onClose();
        }
    };
    const title = which === "user" ? t("whatUsersMay") : which === "guest" ? t("whatChildrenMay") : t("unownedTonies");
    return (
        <Sheet
            open={which !== null}
            onClose={onClose}
            title={title}
            full
            footer={
                <>
                    <button className="btn" onClick={onClose}>
                        {t("cancel")}
                    </button>
                    <button className="btn primary" disabled={value === (current ?? "")} onClick={save}>
                        {t("save")}
                    </button>
                </>
            }
        >
            <p className="small muted" style={{ marginTop: 0 }}>
                {which === "user" ? t("whatUsersMayHint") : which === "guest" ? t("whatChildrenMayHint") : t("unownedToniesHint")}
            </p>
            <RightsTree tree={tree} value={value} onChange={setValue} />
        </Sheet>
    );
}

function GroupSheet({ group, catalog, onClose, onChanged }: { group: AclGroup | "new" | null; catalog: AclCatalog; onClose: () => void; onChanged: () => void }) {
    const ui = useUi();
    const tree = useMemo(() => buildRightsTree(catalog.rights, catalog.boxSettings ?? [], undefined, catalog.boxSettingGroups ?? {}), [catalog]);
    const g = group === "new" ? null : group;
    const [name, setName] = useState("");
    const [base, setBase] = useState<"user" | "guest">("guest");
    const [rights, setRights] = useState("");
    useEffect(() => {
        setName(g?.name ?? "");
        setBase(g?.base ?? "guest");
        setRights(g?.rights ?? "");
    }, [group]); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <Sheet
            open={group !== null}
            onClose={onClose}
            title={g ? g.name : t("newGroup")}
            full
            footer={
                <>
                    {g && (
                        <button
                            className="btn danger"
                            style={{ flex: "0 0 auto" }}
                            aria-label={t("delete")}
                            onClick={async () => {
                                if (!(await ui.confirm({ title: t("deleteGroupTitle", { name: g.name }), text: t("deleteGroupText"), confirm: t("delete"), danger: true }))) return;
                                if ((await ui.run(() => auth.deleteGroup(g.id), t("deleted"))) !== undefined) {
                                    onChanged();
                                    onClose();
                                }
                            }}
                        >
                            <Trash2 size={18} />
                        </button>
                    )}
                    <button className="btn" onClick={onClose}>
                        {t("cancel")}
                    </button>
                    <button
                        className="btn primary"
                        disabled={!name.trim()}
                        onClick={async () => {
                            if ((await ui.run(() => auth.saveGroup({ id: g?.id, name: name.trim(), base, rights }), t("saved"))) !== undefined) {
                                onChanged();
                                onClose();
                            }
                        }}
                    >
                        {t("save")}
                    </button>
                </>
            }
        >
            <div className="field">
                <label>{t("name")}</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("groupNamePlaceholder")} />
            </div>
            <div className="choice-group">
                <div className="choice-label">{t("groupKind")}</div>
                <Segmented
                    value={base}
                    onChange={setBase}
                    options={[
                        { value: "user", label: levelName("user") },
                        { value: "guest", label: levelName("guest") },
                    ]}
                />
                <p className="small muted" style={{ margin: "6px 2px 0" }}>
                    {t(`groupHint_${base}` as never)}
                </p>
            </div>
            <div className="choice-label">{t("groupRights")}</div>
            <RightsTree tree={tree} value={rights} onChange={setRights} />
        </Sheet>
    );
}
