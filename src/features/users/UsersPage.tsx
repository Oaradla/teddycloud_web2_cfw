import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Disc3,
    FolderOpen,
    Image,
    KeyRound,
    Radio,
    Shapes,
    Lock,
    LogIn,
    Plus,
    ShieldAlert,
    ShieldCheck,
    Trash2,
    Unlock,
    UserPlus,
    Users,
    Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AclCatalog, AclGroup, auth, AuthUser } from "../../api/auth";
import { tc } from "../../api/tc";
import { useAccess } from "../../lib/access";
import { useNavigate } from "react-router-dom";
import { ago, dateTime, ruidPretty } from "../../lib/format";
import { useAllTags, useBoxes, useBoxModels, useCustomModels } from "../../lib/queries";
import { Fold } from "../../ui/Fold";
import { TonieImage } from "../../ui/TonieImage";
import { t } from "../../lib/i18n";
import { buildRightsTree, listToNodes } from "../../lib/rightsTree";
import { Sheet } from "../../ui/Sheet";
import {
    Empty,
    ErrorBox,
    Loading,
    Notice,
    Page,
    Row,
    Section,
    Segmented,
    SwitchRow,
    useUi,
} from "../../ui/kit";
import { levelName, PasswordSheet } from "../account/AccountPage";
import { rightName, RightsTree } from "./RightsTree";

const LEVELS = ["admin", "user", "guest"] as const;

/** users, their groups and rights, the web login itself and its security events */
export function UsersPage() {
    const access = useAccess();
    const qc = useQueryClient();
    const ui = useUi();
    const users = useQuery({
        queryKey: ["authUsers"],
        queryFn: auth.users,
        enabled: access.canManageUsers,
    });
    const catalog = useQuery({
        queryKey: ["aclCatalog"],
        queryFn: auth.catalog,
        enabled: access.canManageUsers,
        retry: false,
    });
    const events = useQuery({
        queryKey: ["authEvents"],
        queryFn: auth.events,
        enabled: access.admin,
        retry: false,
    });
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
    const groupName = (u: AuthUser) =>
        u.group ? (groups.find((g) => g.id === u.group)?.name ?? u.group) : levelName(u.level);
    /* users create users of the same or a lower level */
    const allowedLevels = LEVELS.slice(
        Math.max(0, LEVELS.indexOf(access.mine.level as (typeof LEVELS)[number])),
    );

    if (!access.canManageUsers)
        return (
            <Page title={t("common.usersAndRights")} back="/more" narrow>
                <Empty icon={<Lock size={28} />} title={t("users.noPermission")} />
            </Page>
        );

    const u = users.data;
    const client = access.status?.client;
    const hasAdmin = u?.users.some((x) => (x.level ?? "admin") === "admin");

    const toggleLogin = async (on: boolean) => {
        if (on && !hasAdmin) return ui.toast("error", t("users.needAdminFirst"));
        if (on) {
            const ok = await ui.confirm({
                title: t("users.loginOnTitle"),
                text: t("users.loginOnText"),
                confirm: t("users.switchOn"),
            });
            if (!ok) return;
        }
        await ui.run(
            () => auth.setEnabled(on),
            on ? t("users.loginOnDone") : t("users.loginOffDone"),
        );
        refresh();
    };

    return (
        <Page
            title={t("common.usersAndRights")}
            back="/more"
            narrow
            right={
                <button
                    className="icon-btn"
                    onClick={() => setCreate(true)}
                    aria-label={t("users.addUser")}
                >
                    <UserPlus size={21} />
                </button>
            }
        >
            {users.isLoading && <Loading />}
            {users.error && <ErrorBox error={users.error} retry={() => users.refetch()} />}
            {u && (
                <>
                    {access.admin && (
                        <Section
                            title={t("users.webLogin")}
                            footer={
                                u.envOverride
                                    ? t("users.envOverride")
                                    : u.enabled
                                      ? t("users.loginOnHint")
                                      : t("users.loginOffHint")
                            }
                        >
                            <SwitchRow
                                icon={<LogIn size={17} />}
                                title={t("users.loginRequired")}
                                checked={u.enabled}
                                disabled={u.envOverride}
                                onChange={toggleLogin}
                            />
                            <SwitchRow
                                icon={<ShieldCheck size={17} />}
                                title={t("users.require2faAll")}
                                sub={t("users.require2faAllHint")}
                                checked={u.require2faAll}
                                onChange={async (v) => {
                                    await ui.run(
                                        () => tc.setSetting("web_auth.require_2fa", v),
                                        t("common.saved"),
                                    );
                                    refresh();
                                }}
                            />
                        </Section>
                    )}

                    <Section
                        title={t("users.usersN", { n: u.users.length, max: u.maxUsers || "–" })}
                        right={
                            <button className="btn ghost small" onClick={() => setCreate(true)}>
                                <Plus size={16} />
                                {t("users.addUser")}
                            </button>
                        }
                    >
                        {u.users.length === 0 && (
                            <Row title={t("users.noUsers")} sub={t("users.noUsersHint")} />
                        )}
                        {u.users.map((x) => (
                            <Row
                                key={x.username}
                                leading={
                                    <span className="avatar">
                                        {x.username.slice(0, 1).toUpperCase()}
                                    </span>
                                }
                                title={
                                    <>
                                        {x.username}{" "}
                                        {x.username === access.status?.username && (
                                            <span className="badge">{t("users.you")}</span>
                                        )}
                                    </>
                                }
                                sub={
                                    <span
                                        className="row-gap"
                                        style={{ flexWrap: "wrap", gap: 4, marginTop: 3 }}
                                    >
                                        <span
                                            className={`badge ${(x.level ?? "admin") === "admin" ? "accent" : ""}`}
                                        >
                                            {groupName(x)}
                                        </span>
                                        {x.twoFactor && <span className="badge ok">2FA</span>}
                                        {(x.require2fa || u.require2faAll) && !x.twoFactor && (
                                            <span className="badge warn">
                                                {t("users.twoFactorPending")}
                                            </span>
                                        )}
                                        {x.mustChangePassword && (
                                            <span className="badge warn">
                                                {t("users.passwordChangePending")}
                                            </span>
                                        )}
                                        {x.lanOnly && (
                                            <span className="badge">{t("users.lanOnly")}</span>
                                        )}
                                        <span className="small muted">
                                            {x.lastLogin
                                                ? t("users.lastLogin", {
                                                      when: ago(x.lastLogin * 1000),
                                                  })
                                                : t("users.neverLoggedIn")}
                                        </span>
                                    </span>
                                }
                                onClick={() => setEdit(x)}
                            />
                        ))}
                    </Section>
                </>
            )}

            {catalog.data && access.admin && (
                <Section title={t("users.rightsAndGroups")} footer={t("users.rightsAndGroupsHint")}>
                    <Row
                        icon={<Users size={17} />}
                        title={t("users.whatUsersMay")}
                        sub={t("users.whatUsersMayHint")}
                        onClick={() => setLimits("user")}
                    />
                    <Row
                        icon={<Users size={17} />}
                        title={t("users.whatChildrenMay")}
                        sub={t("users.whatChildrenMayHint")}
                        onClick={() => setLimits("guest")}
                    />
                    {groups.map((g) => (
                        <Row
                            key={g.id}
                            icon={<Users size={17} />}
                            title={g.name}
                            sub={t("users.ownGroupOf", { base: levelName(g.base) })}
                            onClick={() => setGroup(g)}
                        />
                    ))}
                    <Row
                        icon={<Plus size={17} />}
                        title={t("users.newGroup")}
                        accent
                        onClick={() => setGroup("new")}
                        chevron={false}
                    />
                </Section>
            )}

            {/* not a group: what everyone may do with tonies nobody owns */}
            {catalog.data && access.admin && (
                <Section title={t("users.withoutOwner")}>
                    <Row
                        icon={<Disc3 size={17} />}
                        title={t("users.unownedTonies")}
                        sub={t("users.unownedToniesHint")}
                        onClick={() => setLimits("tonie")}
                    />
                </Section>
            )}

            {events.data && (
                <Section title={t("users.securityEvents")}>
                    {events.data.locked.map((l) => (
                        <Row
                            key={l.ip}
                            icon={<Lock size={17} />}
                            iconColor="var(--danger)"
                            title={t("users.lockedIp", { ip: l.ip })}
                            sub={t("users.lockedUntil", { when: dateTime(l.lockedUntil * 1000) })}
                            right={
                                <button
                                    className="btn small"
                                    onClick={async () => {
                                        await ui.run(
                                            () => auth.unlock({ ip: l.ip }),
                                            t("users.unlocked"),
                                        );
                                        events.refetch();
                                    }}
                                >
                                    <Unlock size={14} />
                                    {t("users.unlock")}
                                </button>
                            }
                        />
                    ))}
                    {events.data.events.length === 0 && <Row title={t("users.noEvents")} />}
                    {events.data.events
                        .slice()
                        .reverse()
                        .slice(0, 30)
                        .map((e, i) => (
                            <Row
                                key={i}
                                icon={
                                    e.type.includes("fail") || e.type.includes("lock") ? (
                                        <ShieldAlert size={17} />
                                    ) : (
                                        <ShieldCheck size={17} />
                                    )
                                }
                                iconColor={
                                    e.type.includes("fail") || e.type.includes("lock")
                                        ? "var(--warn)"
                                        : undefined
                                }
                                title={`${t(`users.event_${e.type}` as never, { defaultValue: e.type })}${e.username ? " · " + e.username : ""}`}
                                sub={`${e.ip} · ${dateTime(e.time * 1000)}${e.detail ? " · " + e.detail : ""}`}
                            />
                        ))}
                </Section>
            )}

            {client && access.admin && (
                <Section
                    title={t("users.externalAccess")}
                    footer={
                        <>
                            {t("users.externalAccessHint")}{" "}
                            <a href="#/settings">{t("users.openSettings")}</a>
                        </>
                    }
                >
                    {client.forwardedForIgnored && (
                        <Notice>{t("users.untrustedProxy", { ip: client.ip })}</Notice>
                    )}
                    <Row
                        icon={<Wifi size={17} />}
                        title={t("users.yourAddress")}
                        value={<span className="mono selectable">{client.ip}</span>}
                    />
                    <Row
                        title={t("users.network")}
                        value={t(client.lan ? "users.networkLan" : "users.networkRemote")}
                    />
                    <Row
                        title={t("users.connection")}
                        value={`${client.secure ? "HTTPS" : "HTTP"}${client.viaTrustedProxy ? " · " + t("users.viaProxy") : ""}`}
                    />
                </Section>
            )}

            <UserSheet
                user={edit}
                onClose={() => setEdit(null)}
                groups={groups}
                allowedLevels={[...allowedLevels]}
                minLength={u?.passwordMinLength ?? 10}
                self={edit?.username === access.status?.username}
                require2faAll={!!u?.require2faAll}
                onChanged={refresh}
            />
            <CreateUserSheet
                open={create}
                onClose={() => setCreate(false)}
                groups={groups}
                allowedLevels={[...allowedLevels]}
                minLength={u?.passwordMinLength ?? 10}
                first={(u?.users.length ?? 0) === 0}
                require2faAll={!!u?.require2faAll}
                onChanged={refresh}
            />
            {catalog.data && (
                <>
                    <LimitsSheet
                        which={limits}
                        catalog={catalog.data}
                        onClose={() => setLimits(null)}
                        onChanged={refresh}
                    />
                    <GroupSheet
                        group={group}
                        catalog={catalog.data}
                        onClose={() => setGroup(null)}
                        onChanged={refresh}
                    />
                </>
            )}
        </Page>
    );
}

/** "user", "guest" or "group:<id>" */
const groupOptions = (levels: string[], groups: AclGroup[]) => [
    ...levels.map((l) => ({ value: l, label: levelName(l) })),
    ...groups
        .filter((g) => levels.includes(g.base))
        .map((g) => ({ value: `group:${g.id}`, label: g.name })),
];
const groupChange = (value: string) =>
    value.startsWith("group:") ? { group: value.slice(6) } : { level: value, group: "" };

/** what the user owns or has shared, each list opens on a tap */
function OwnedSection({ username, onOpen }: { username: string; onOpen: () => void }) {
    const owned = useQuery({
        queryKey: ["aclOwned", username],
        queryFn: () => auth.owned(username),
    });
    const boxes = useBoxes();
    const tags = useAllTags();
    const boxModels = useBoxModels();
    const models = useCustomModels();
    const navigate = useNavigate();
    if (!owned.data) return null;
    const open = (to: string) => {
        onOpen();
        navigate(to);
    };
    const box = (id: string) => boxes.data?.find((b) => b.ID === id);
    const boxName = (id: string) => box(id)?.boxName || id;
    const boxPic = (id: string) => boxModels.data?.find((m) => m.id === box(id)?.boxModel)?.img_src;
    const tonieInfo = (ruid: string) =>
        tags.data?.find((x) => x.ruid.toUpperCase() === ruid)?.tonieInfo;
    const tonieName = (ruid: string) => {
        const info = tonieInfo(ruid);
        return info?.series
            ? `${info.series}${info.episode ? ` – ${info.episode}` : ""}`
            : ruidPretty(ruid);
    };
    const groups = [
        {
            key: "boxes",
            title: t("common.boxes"),
            icon: <Radio size={17} />,
            name: boxName,
            pic: boxPic,
            to: (id: string) => `/box/${id}`,
        },
        {
            key: "tonies",
            title: t("common.tonies"),
            icon: <Disc3 size={17} />,
            name: tonieName,
            pic: (id: string) => tonieInfo(id)?.picture,
            to: (id: string) => `/tonie/${id.toLowerCase()}`,
        },
        {
            key: "folders",
            title: t("common.library"),
            icon: <FolderOpen size={17} />,
            name: (id: string) => id,
            pic: undefined,
            to: (id: string) => `/library?path=${encodeURIComponent(id)}`,
        },
        {
            key: "models",
            title: t("common.customModels"),
            icon: <Shapes size={17} />,
            name: (id: string) => id,
            pic: (id: string) => models.data?.find((m) => m.model === id)?.pic,
            to: () => "/models",
        },
        {
            key: "images",
            title: t("common.pictures"),
            icon: <Image size={17} />,
            name: (id: string) => id,
            pic: (id: string) => `/custom_img/${id}`,
            to: () => "/models",
        },
    ] as const;
    return (
        <Section title={t("users.ownedBy", { name: username })}>
            {groups.map((g) => {
                const items = owned.data[g.key] ?? [];
                const mine = items.filter((x) => x.owner).length;
                return (
                    <Fold
                        key={g.key}
                        icon={g.icon}
                        title={g.title}
                        sub={t("users.ownedCount", { n: mine, shared: items.length - mine })}
                    >
                        {items.map((x) => (
                            <Row
                                key={x.id}
                                leading={g.pic && <TonieImage src={g.pic(x.id)} size={36} />}
                                title={g.name(x.id)}
                                sub={
                                    x.owner
                                        ? t("users.ownerOne")
                                        : t("users.sharedRights", {
                                              rights: listToNodes(x.granted)
                                                  .map((node) => rightName(node))
                                                  .join(", "),
                                          })
                                }
                                onClick={() => open(g.to(x.id))}
                                chevron
                            />
                        ))}
                    </Fold>
                );
            })}
        </Section>
    );
}

function UserSheet({
    user,
    onClose,
    groups,
    allowedLevels,
    minLength,
    self,
    require2faAll,
    onChanged,
}: {
    user: AuthUser | null;
    onClose: () => void;
    groups: AclGroup[];
    allowedLevels: string[];
    minLength: number;
    self: boolean;
    require2faAll: boolean;
    onChanged: () => void;
}) {
    const ui = useUi();
    const access = useAccess();
    // only admins change their own login rules
    const mayEdit = !self || access.admin;
    const [pw, setPw] = useState(false);
    const [u, setU] = useState<AuthUser | null>(user);
    useEffect(() => setU(user), [user]);
    if (!u)
        return (
            <Sheet open={false} onClose={onClose}>
                {null}
            </Sheet>
        );

    const update = async (
        changes: Parameters<typeof auth.updateUser>[1],
        ok = t("common.saved"),
    ) => {
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
                        {u.lastLogin
                            ? t("users.lastLogin", { when: ago(u.lastLogin * 1000) })
                            : t("users.neverLoggedIn")}
                        {u.createdBy ? ` · ${t("users.createdBy", { name: u.createdBy })}` : ""}
                    </p>
                </div>
                {u.legacyHash && <Notice>{t("users.legacyHash")}</Notice>}
                {!self && options.some((o) => o.value === value) && (
                    <div className="choice-group">
                        <div className="choice-label">{t("users.userGroup")}</div>
                        <select
                            className="select"
                            value={value}
                            // only a real choice: password managers set fields by script
                            onChange={(e) =>
                                e.nativeEvent.isTrusted && update(groupChange(e.target.value))
                            }
                        >
                            {options.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                {mayEdit && (
                    <Section>
                        {!require2faAll && (
                            <SwitchRow
                                icon={<ShieldCheck size={17} />}
                                title={t("users.require2fa")}
                                checked={u.require2fa}
                                onChange={(v) => update({ require2fa: v })}
                            />
                        )}
                        <SwitchRow
                            icon={<Wifi size={17} />}
                            title={t("users.lanOnly")}
                            sub={t("users.lanOnlyHint")}
                            checked={u.lanOnly}
                            disabled={self}
                            onChange={(v) => update({ lanOnly: v })}
                        />
                        {!self && (
                            <SwitchRow
                                icon={<KeyRound size={17} />}
                                title={t("common.mustChangePassword")}
                                sub={t("users.mustChangePasswordHint")}
                                checked={Boolean(u.mustChangePassword)}
                                onChange={(v) => update({ mustChangePassword: v })}
                            />
                        )}
                    </Section>
                )}
                <Section>
                    {!self && (
                        <Row
                            icon={<KeyRound size={17} />}
                            title={t("users.setPassword")}
                            onClick={() => setPw(true)}
                            chevron
                        />
                    )}
                    {u.twoFactor && !self && (
                        <Row
                            title={t("users.reset2fa")}
                            sub={t("users.reset2faHint")}
                            onClick={async () => {
                                if (
                                    await ui.confirm({
                                        title: t("users.reset2fa"),
                                        text: t("users.reset2faHint"),
                                        confirm: t("common.reset"),
                                        danger: true,
                                    })
                                )
                                    update({ reset2fa: true }, t("common.done"));
                            }}
                            chevron={false}
                        />
                    )}
                    {!self && (
                        <Row
                            title={t("users.endSessions")}
                            onClick={async () => {
                                const r = await update({ revokeSessions: true }, "");
                                if (r)
                                    ui.toast(
                                        "ok",
                                        t("common.sessionsEnded", { n: r.sessionsRevoked ?? 0 }),
                                    );
                            }}
                            chevron={false}
                        />
                    )}
                    {!self && (
                        <Row
                            icon={<Trash2 size={17} />}
                            title={t("users.deleteUser")}
                            danger
                            onClick={async () => {
                                if (
                                    !(await ui.confirm({
                                        title: t("users.deleteUserTitle", { name: u.username }),
                                        text: t("users.deleteUserText"),
                                        confirm: t("common.delete"),
                                        danger: true,
                                    }))
                                )
                                    return;
                                const r = await ui.run(
                                    () => auth.deleteUser(u.username),
                                    t("common.deleted"),
                                );
                                if (!r) return;
                                if (r.authDisabled) ui.toast("info", t("users.loginOffDone"));
                                onChanged();
                                onClose();
                            }}
                            chevron={false}
                        />
                    )}
                </Section>
                {self && <p className="small muted">{t("users.editYourselfHint")}</p>}
                <OwnedSection username={u.username} onOpen={onClose} />
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
    require2faAll,
    onChanged,
}: {
    open: boolean;
    onClose: () => void;
    groups: AclGroup[];
    allowedLevels: string[];
    minLength: number;
    first: boolean;
    require2faAll: boolean;
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
    const valid = /^[A-Za-z0-9_.-]{1,32}$/.test(name) && password.length >= minLength;

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={t("users.addUser")}
            footer={
                <>
                    <button className="btn" onClick={onClose}>
                        {t("common.cancel")}
                    </button>
                    <button
                        className="btn primary"
                        disabled={!valid}
                        onClick={async () => {
                            const r = await ui.run(
                                () =>
                                    auth.createUser({
                                        username: name,
                                        password,
                                        lanOnly,
                                        require2fa,
                                        mustChangePassword,
                                        ...groupChange(group),
                                    }),
                                t("users.userCreated"),
                            );
                            if (r) {
                                onChanged();
                                onClose();
                            }
                        }}
                    >
                        {t("users.createIt")}
                    </button>
                </>
            }
        >
            {first && <Notice info>{t("users.firstUserHint")}</Notice>}
            <div className="field">
                <label>{t("common.username")}</label>
                <input
                    className="input"
                    autoCapitalize="off"
                    autoCorrect="off"
                    autoComplete="off"
                    maxLength={32}
                    value={name}
                    onChange={(e) => setName(e.target.value.trim())}
                />
                <div className="hint">{t("users.usernameHint")}</div>
            </div>
            <div className="field">
                <label>{t("common.password")}</label>
                <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                <div className="hint">{t("common.passwordMin", { n: minLength })}</div>
            </div>
            <div className="field">
                <label>{t("users.userGroup")}</label>
                <select
                    className="select"
                    value={group}
                    // only a real choice: password managers set fields by script
                    onChange={(e) => e.nativeEvent.isTrusted && setGroup(e.target.value)}
                    disabled={first}
                >
                    {options.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
                <div className="hint">
                    {t(`users.groupHint_${group.startsWith("group:") ? "own" : group}` as never)}
                </div>
            </div>
            <div className="list">
                {!require2faAll && (
                    <SwitchRow
                        title={t("users.require2fa")}
                        checked={require2fa}
                        onChange={setRequire2fa}
                    />
                )}
                <SwitchRow
                    title={t("common.mustChangePassword")}
                    checked={mustChangePassword}
                    onChange={setMustChangePassword}
                />
                <SwitchRow
                    title={t("users.lanOnly")}
                    sub={t("users.lanOnlyHint")}
                    checked={lanOnly}
                    onChange={setLanOnly}
                />
            </div>
        </Sheet>
    );
}

/** what all users of a level may do at most, or what everyone may do with tonies nobody owns */
function LimitsSheet({
    which,
    catalog,
    onClose,
    onChanged,
}: {
    which: "user" | "guest" | "tonie" | "box" | null;
    catalog: AclCatalog;
    onClose: () => void;
    onChanged: () => void;
}) {
    const ui = useUi();
    const tree = useMemo(
        () =>
            which === "tonie"
                ? buildRightsTree(
                      catalog.rights.filter((r) => r.name !== "tonie.share"),
                      [],
                      ["tonie"],
                  )
                : buildRightsTree(
                      catalog.rights,
                      catalog.boxSettings ?? [],
                      undefined,
                      catalog.boxSettingGroups ?? {},
                  ),
        [which, catalog],
    );
    const current =
        which === "user"
            ? catalog.levelLimits.user
            : which === "guest"
              ? catalog.levelLimits.guest
              : which === "tonie"
                ? catalog.unassigned.tonie
                : catalog.unassigned.box;
    const [value, setValue] = useState(current ?? "");
    useEffect(() => setValue(current ?? ""), [current, which]);
    const save = async () => {
        const body =
            which === "user"
                ? { user: value }
                : which === "guest"
                  ? { guest: value }
                  : which === "tonie"
                    ? { unassignedTonie: value }
                    : { unassignedBox: value };
        if (await ui.run(() => auth.saveLevels(body), t("common.saved"))) {
            onChanged();
            onClose();
        }
    };
    const title =
        which === "user"
            ? t("users.whatUsersMay")
            : which === "guest"
              ? t("users.whatChildrenMay")
              : t("users.unownedTonies");
    return (
        <Sheet
            open={which !== null}
            onClose={onClose}
            title={title}
            full
            footer={
                <>
                    <button className="btn" onClick={onClose}>
                        {t("common.cancel")}
                    </button>
                    <button
                        className="btn primary"
                        disabled={value === (current ?? "")}
                        onClick={save}
                    >
                        {t("common.save")}
                    </button>
                </>
            }
        >
            <p className="small muted" style={{ marginTop: 0 }}>
                {which === "user"
                    ? t("users.whatUsersMayHint")
                    : which === "guest"
                      ? t("users.whatChildrenMayHint")
                      : t("users.unownedToniesHint")}
            </p>
            <RightsTree tree={tree} value={value} onChange={setValue} />
        </Sheet>
    );
}

function GroupSheet({
    group,
    catalog,
    onClose,
    onChanged,
}: {
    group: AclGroup | "new" | null;
    catalog: AclCatalog;
    onClose: () => void;
    onChanged: () => void;
}) {
    const ui = useUi();
    const tree = useMemo(
        () =>
            buildRightsTree(
                catalog.rights,
                catalog.boxSettings ?? [],
                undefined,
                catalog.boxSettingGroups ?? {},
            ),
        [catalog],
    );
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
            title={g ? g.name : t("users.newGroup")}
            full
            footer={
                <>
                    {g && (
                        <button
                            className="btn danger"
                            style={{ flex: "0 0 auto" }}
                            aria-label={t("common.delete")}
                            onClick={async () => {
                                if (
                                    !(await ui.confirm({
                                        title: t("users.deleteGroupTitle", { name: g.name }),
                                        text: t("users.deleteGroupText"),
                                        confirm: t("common.delete"),
                                        danger: true,
                                    }))
                                )
                                    return;
                                if (
                                    (await ui.run(
                                        () => auth.deleteGroup(g.id),
                                        t("common.deleted"),
                                    )) !== undefined
                                ) {
                                    onChanged();
                                    onClose();
                                }
                            }}
                        >
                            <Trash2 size={18} />
                        </button>
                    )}
                    <button className="btn" onClick={onClose}>
                        {t("common.cancel")}
                    </button>
                    <button
                        className="btn primary"
                        disabled={!name.trim()}
                        onClick={async () => {
                            if (
                                (await ui.run(
                                    () =>
                                        auth.saveGroup({
                                            id: g?.id,
                                            name: name.trim(),
                                            base,
                                            rights,
                                        }),
                                    t("common.saved"),
                                )) !== undefined
                            ) {
                                onChanged();
                                onClose();
                            }
                        }}
                    >
                        {t("common.save")}
                    </button>
                </>
            }
        >
            <div className="field">
                <label>{t("common.name")}</label>
                <input
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("users.groupNamePlaceholder")}
                />
            </div>
            <div className="choice-group">
                <div className="choice-label">{t("users.groupKind")}</div>
                <Segmented
                    value={base}
                    onChange={setBase}
                    options={[
                        { value: "user", label: levelName("user") },
                        { value: "guest", label: levelName("guest") },
                    ]}
                />
                <p className="small muted" style={{ margin: "6px 2px 0" }}>
                    {t(`users.groupHint_${base}` as never)}
                </p>
            </div>
            <div className="choice-label">{t("users.groupRights")}</div>
            <RightsTree tree={tree} value={rights} onChange={setRights} />
        </Sheet>
    );
}
