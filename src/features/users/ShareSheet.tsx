import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { auth, type AclScope } from "../../api/auth";
import { useAccess } from "../../lib/access";
import { t } from "../../lib/i18n";
import { buildRightsTree, leaves, listToChecked } from "../../lib/rightsTree";
import { Sheet } from "../../ui/Sheet";
import { ErrorBox, Loading, Row, Section, SwitchRow, useUi } from "../../ui/kit";
import { levelName } from "../account/AccountPage";
import { rightName, RightsTree } from "./RightsTree";

export type ShareTarget = { type: AclScope; id: string; title: string };

const EVERYONE = "*";

/** admins, and owners with the share right, may share; only with the web login */
export function useCanShare() {
    const access = useAccess();
    return (type: AclScope, id: string) =>
        access.loginActive &&
        (access.admin || (access.owns(type, id) && access.can(type, id, `${type}.share`)));
}

/** owners of a box or tonie (set by its owners and admins); owners (admins only) and shares of a library folder */
export function ShareSheet({
    target,
    onClose,
}: {
    target: ShareTarget | null;
    onClose: () => void;
}) {
    const access = useAccess();
    const ui = useUi();
    const qc = useQueryClient();
    const type = target?.type ?? "box";
    const ownersOnly = type !== "folder";
    const mayPickOwners = access.admin || ownersOnly;
    const entry = useQuery({
        queryKey: ["aclEntry", type, target?.id],
        queryFn: () => auth.entry(type, target!.id),
        enabled: target !== null,
        staleTime: 0,
    });
    const catalog = useQuery({
        queryKey: ["aclCatalog"],
        queryFn: auth.catalog,
        enabled: target !== null,
    });
    const users = useQuery({
        queryKey: ["aclUsers"],
        queryFn: auth.aclUsers,
        enabled: target !== null,
    });
    const [owners, setOwners] = useState<string[]>([]);
    const [shares, setShares] = useState<Record<string, string>>({});
    const [editing, setEditing] = useState<string | null>(null);

    useEffect(() => {
        setOwners(entry.data?.owners ?? []);
        setShares(entry.data?.shares ?? {});
    }, [entry.data]);

    /* the rights one can share: those of folders, without sharing itself */
    const tree = useMemo(
        () =>
            catalog.data &&
            buildRightsTree(
                catalog.data.rights.filter((r) => !r.name.endsWith(".share")),
                [],
                ["folder"],
            ),
        [catalog.data],
    );
    const summary = (list: string) => {
        if (!tree) return list;
        const { checked } = listToChecked(tree, list);
        const names = leaves(tree).filter((l) => checked.includes(l.key));
        return names.length === leaves(tree).length
            ? t("users.rightsAll")
            : names.map((l) => rightName(l)).join(", ") || t("users.sharedNothing");
    };
    const userName = (u: string) => (u === EVERYONE ? t("users.everyone") : u);
    const me = access.mine.username.toLowerCase();
    /* a non-admin adds owners and may leave; removing the others is the admin's */
    const keptOwner = (u: string) =>
        !access.admin && u.toLowerCase() !== me && (entry.data?.owners ?? []).includes(u);
    const candidates = (users.data ?? []).filter(
        (u) => u.username.toLowerCase() !== me && !(u.username in shares),
    );
    const inherited =
        entry.data?.inheritedFrom !== undefined && entry.data.inheritedFrom !== entry.data.id
            ? entry.data.inheritedFrom
            : undefined;

    // the server refuses an owner list without owners from a non-admin
    const ownerMissing = ownersOnly && !access.admin && owners.length === 0;

    const save = async () => {
        if (!target) return;
        const ok = await ui.run(
            () =>
                auth.saveEntry(
                    target.type,
                    target.id,
                    ownersOnly ? { owners } : access.admin ? { owners, shares } : { shares },
                ),
            t("common.saved"),
        );
        if (ok === undefined) return;
        qc.invalidateQueries({ queryKey: ["aclEntry"] });
        qc.invalidateQueries({ queryKey: ["aclMine"] });
        onClose();
    };
    const addShare = () =>
        ui.actions(t("users.shareWith"), [
            ...(EVERYONE in shares
                ? []
                : [{ label: t("users.everyone"), onSelect: () => startShare(EVERYONE) }]),
            ...candidates.map((u) => ({
                label: `${u.username} · ${levelName(u.level)}`,
                icon: <UserRound size={17} />,
                onSelect: () => startShare(u.username),
            })),
        ]);
    const startShare = (user: string) => {
        setShares((s) => ({ ...s, [user]: "folder.read" }));
        setEditing(user);
    };

    const loading = entry.isLoading || catalog.isLoading || users.isLoading;
    const error = entry.error || catalog.error || users.error;
    return (
        <Sheet
            open={target !== null}
            onClose={onClose}
            title={t(ownersOnly ? "users.ownersTitle" : "users.shareTitle", {
                name: target?.title ?? "",
            })}
            full
            footer={
                <>
                    <button className="btn" onClick={onClose}>
                        {t("common.cancel")}
                    </button>
                    <button
                        className="btn primary"
                        disabled={loading || Boolean(error) || ownerMissing}
                        onClick={save}
                    >
                        {t("common.save")}
                    </button>
                </>
            }
        >
            {loading && <Loading />}
            {error && (
                <ErrorBox
                    error={error}
                    retry={() => [entry, catalog, users].forEach((x) => x.refetch())}
                />
            )}
            {!loading && !error && (
                <>
                    {inherited !== undefined && (
                        <p className="small muted">
                            {t("users.shareInherited", { folder: inherited || "/" })}
                        </p>
                    )}
                    <Section
                        title={t("users.owners")}
                        footer={
                            ownerMissing
                                ? t("users.ownerRequired")
                                : ownersOnly
                                  ? access.admin
                                      ? t("users.ownersOnlyHint")
                                      : `${t("users.ownersOnlyHint")} ${t("users.ownersRemoveAdminOnly")}`
                                  : access.admin
                                    ? t("users.ownersHint")
                                    : t("users.ownersAdminOnly")
                        }
                    >
                        {mayPickOwners
                            ? (users.data ?? [])
                                  .filter((u) => ownersOnly || u.level !== "guest")
                                  .map((u) => (
                                      <SwitchRow
                                          key={u.username}
                                          title={u.username}
                                          sub={levelName(u.level)}
                                          checked={owners.includes(u.username)}
                                          disabled={keptOwner(u.username)}
                                          onChange={(on) =>
                                              setOwners((o) =>
                                                  on
                                                      ? [...o, u.username]
                                                      : o.filter((x) => x !== u.username),
                                              )
                                          }
                                      />
                                  ))
                            : owners.map((o) => (
                                  <Row key={o} icon={<UserRound size={17} />} title={o} />
                              ))}
                        {!mayPickOwners && owners.length === 0 && (
                            <Row title={t("users.withoutOwner")} />
                        )}
                    </Section>
                    {!ownersOnly && (
                        <Section title={t("users.sharedWith")}>
                            {Object.entries(shares).map(([user, list]) => (
                                <Row
                                    key={user}
                                    icon={<UserRound size={17} />}
                                    title={userName(user)}
                                    sub={summary(list)}
                                    onClick={() => setEditing(user)}
                                    chevron
                                />
                            ))}
                            <Row
                                icon={<Plus size={17} />}
                                title={t("users.shareAdd")}
                                accent
                                onClick={addShare}
                                disabled={candidates.length === 0 && EVERYONE in shares}
                            />
                        </Section>
                    )}
                </>
            )}
            <Sheet
                open={editing !== null && tree !== undefined}
                onClose={() => setEditing(null)}
                title={editing ? userName(editing) : ""}
                full
                footer={
                    <>
                        <button
                            className="btn danger"
                            style={{ flex: "0 0 auto" }}
                            aria-label={t("common.remove")}
                            onClick={() => {
                                setShares(({ [editing!]: _, ...rest }) => rest);
                                setEditing(null);
                            }}
                        >
                            <Trash2 size={18} />
                        </button>
                        <button className="btn primary" onClick={() => setEditing(null)}>
                            {t("common.done")}
                        </button>
                    </>
                }
            >
                {editing && tree && (
                    <RightsTree
                        tree={tree}
                        value={shares[editing] ?? ""}
                        onChange={(v) => setShares((s) => ({ ...s, [editing]: v }))}
                        boxScopes={false}
                    />
                )}
            </Sheet>
        </Sheet>
    );
}
