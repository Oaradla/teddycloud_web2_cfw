import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudOff, EyeOff, Globe, Sparkles } from "lucide-react";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { tc } from "../../api/tc";
import type { CfwProfile, CfwTag } from "../../api/types";
import { t } from "../../lib/i18n";
import { TagWithBox, useCfwBoxes, useInvalidateTags, useSetting } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { Loading, Notice, Row, Section, Segmented, useUi } from "../../ui/kit";
import { EMPTY_EVENT } from "./CfwEventFields";
import {
    CfwProfileFields,
    EMPTY_PROFILE,
    FieldState,
    MIXED,
    Mixed,
    PROFILE_KEYS,
    ProfileValues,
} from "./CfwProfileFields";

type OptionKey = "live" | "nocloud" | "hide";
type Kind = CfwTag["kind"];

/** one value for all, or MIXED when they differ */
const common = <T,>(values: T[]): T | Mixed => {
    if (!values.length) return MIXED;
    const first = JSON.stringify(values[0]);
    return values.every((v) => JSON.stringify(v) === first) ? values[0] : MIXED;
};

/**
 * Settings of several tonies at once. Fields that differ show as "different"; only fields the
 * user changes are written, each tonie keeps its own value in all others.
 */
export function BulkEditSheet({
    open,
    onClose,
    tags,
}: {
    open: boolean;
    onClose: () => void;
    tags: TagWithBox[];
}) {
    const ui = useUi();
    const qc = useQueryClient();
    const invalidateTags = useInvalidateTags();
    const cfwBoxes = useCfwBoxes();
    const showTagSettings = useSetting("cfw.show_tag_settings");
    const showCfw = cfwBoxes.data != null && showTagSettings.data === "true";
    const ruids = useMemo(() => tags.map((x) => x.ruid).sort(), [tags]);
    const cfwTags = useQuery({
        queryKey: ["cfwTags", ruids],
        queryFn: async () => {
            // a tag whose settings could not be read stays out: its kind is unknown
            const list = await Promise.all(ruids.map((r) => tc.cfwTag(r).catch(() => null)));
            return new Map(list.filter((x) => x !== null).map((x) => [x.ruid, x]));
        },
        enabled: open && showCfw && ruids.length > 0,
    });

    const [options, setOptions] = useState<Partial<Record<OptionKey, boolean>>>({});
    const [kind, setKind] = useState<Kind | undefined>();
    const [profile, setProfile] = useState<Partial<CfwProfile>>({});
    const [busy, setBusy] = useState<number | null>(null);

    useEffect(() => {
        if (open) {
            setOptions({});
            setKind(undefined);
            setProfile({});
        }
    }, [open]);

    const optionValue = (k: OptionKey) =>
        k in options ? options[k]! : common(tags.map((x) => Boolean(x[k])));

    const cfwList = tags.map(
        (x) => cfwTags.data?.get(x.ruid) ?? ({ ruid: x.ruid, kind: "none" } as CfwTag),
    );
    const kindValue: Kind | Mixed = kind ?? common(cfwList.map((x) => x.kind));
    const eventCount = cfwList.filter((x) => x.kind === "event").length;
    // profile changes apply to tonies with a profile or nothing; event tags only change when the kind is set
    const profileTargets = kind
        ? kind === "profile"
            ? cfwList
            : []
        : cfwList.filter((x) => x.kind !== "event");
    const showProfile = kind
        ? kind === "profile"
        : kindValue === "profile" ||
          (kindValue === MIXED && profileTargets.length > 0) ||
          kindValue === "none";
    const profileValues = Object.fromEntries(
        PROFILE_KEYS.map((k) => [
            k,
            k in profile
                ? profile[k]
                : common(profileTargets.map((x) => (x.profile ?? EMPTY_PROFILE)[k])),
        ]),
    ) as ProfileValues;
    const changedProfile = new Set(Object.keys(profile) as (keyof CfwProfile)[]);
    const changes = Object.keys(options).length + (kind ? 1 : 0) + changedProfile.size;

    const apply = async () => {
        const converting = kind && kind !== "event" ? eventCount : 0;
        if (converting) {
            const ok = await ui.confirm({
                title: t("tonies.bulkConvertTitle"),
                text: t("tonies.bulkConvertText", { n: converting }),
                confirm: t("tonies.apply"),
                danger: true,
            });
            if (!ok) return;
        }
        let failed = 0;
        setBusy(0);
        for (let i = 0; i < tags.length; i++) {
            const tag = tags[i];
            try {
                for (const k of Object.keys(options) as OptionKey[]) {
                    if (Boolean(tag[k]) !== options[k])
                        await tc.setContent(tag.ruid, k, options[k]!, tag.overlay || undefined);
                }
                if (showCfw && (kind || changedProfile.size)) {
                    const cur = cfwTags.data?.get(tag.ruid);
                    if (!cur) throw new Error("tag settings unknown");
                    const next: Kind =
                        kind ??
                        (cur.kind === "event"
                            ? "event"
                            : changedProfile.size
                              ? "profile"
                              : cur.kind);
                    if (next === "profile" && (kind || cur.kind !== "event")) {
                        await tc.cfwSetTag(tag.ruid, {
                            kind: "profile",
                            profile: {
                                ...EMPTY_PROFILE,
                                ...(cur.kind === "profile" ? cur.profile : {}),
                                ...profile,
                            },
                        });
                    } else if (kind === "none" && cur.kind !== "none") {
                        await tc.cfwSetTag(tag.ruid, { kind: "none" });
                    } else if (kind === "event" && cur.kind !== "event") {
                        await tc.cfwSetTag(tag.ruid, {
                            kind: "event",
                            event: EMPTY_EVENT,
                        });
                    }
                }
            } catch {
                failed++;
            }
            setBusy(i + 1);
        }
        setBusy(null);
        invalidateTags();
        qc.invalidateQueries({ queryKey: ["cfwTag"] });
        qc.invalidateQueries({ queryKey: ["cfwTags"] });
        if (failed) ui.toast("error", t("common.bulkFailed", { n: failed }));
        else ui.toast("ok", t("tonies.bulkDone", { n: tags.length }));
        onClose();
    };

    const optionRow = (k: OptionKey, icon: ReactNode, title: string, sub: string) => {
        const v = optionValue(k);
        return (
            <div className="row-wrap" key={k}>
                <Row
                    icon={icon}
                    title={title}
                    sub={sub}
                    right={<FieldState mixed={v === MIXED} changed={k in options} />}
                />
                <div style={{ padding: "0 16px 12px" }}>
                    <Segmented
                        value={v === MIXED ? MIXED : v ? "on" : "off"}
                        onChange={(n) => setOptions((o) => ({ ...o, [k]: n === "on" }))}
                        options={[
                            { value: "off", label: t("tonies.off") },
                            { value: "on", label: t("tonies.on") },
                        ]}
                    />
                </div>
            </div>
        );
    };

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={t("tonies.editNTonies", { n: tags.length })}
            full
            footer={
                busy !== null ? (
                    <div style={{ flex: 1 }}>
                        <div className="small muted" style={{ marginBottom: 6 }}>
                            {t("tonies.applying", { n: busy, total: tags.length })}
                        </div>
                        <div className="progressbar">
                            <div style={{ width: `${(busy / tags.length) * 100}%` }} />
                        </div>
                    </div>
                ) : (
                    <>
                        <button className="btn" onClick={onClose}>
                            {t("common.cancel")}
                        </button>
                        <button className="btn primary" disabled={!changes} onClick={apply}>
                            {changes
                                ? t("tonies.applyNChanges", { n: changes })
                                : t("tonies.apply")}
                        </button>
                    </>
                )
            }
        >
            <p className="small muted" style={{ margin: "0 2px 16px" }}>
                {t("tonies.bulkHint")}
            </p>
            <Section title={t("tonies.options")}>
                {optionRow("live", <Globe size={17} />, t("common.live"), t("tonies.liveHint"))}
                {optionRow(
                    "nocloud",
                    <CloudOff size={17} />,
                    t("tonies.cloudOff"),
                    t("tonies.cloudOffHint"),
                )}
                {optionRow("hide", <EyeOff size={17} />, t("tonies.hide"), t("tonies.hideHint"))}
            </Section>

            {showCfw && (
                <Section title={t("tonies.cfwTagSettings")} plain>
                    {cfwTags.isLoading ? (
                        <Loading />
                    ) : (
                        <>
                            <div className="list">
                                <div className="row-wrap">
                                    <Row
                                        icon={<Sparkles size={17} />}
                                        title={t("tonies.cfwKind")}
                                        right={
                                            <FieldState
                                                mixed={kindValue === MIXED}
                                                changed={Boolean(kind)}
                                            />
                                        }
                                    />
                                    <div style={{ padding: "0 16px 12px" }}>
                                        <Segmented
                                            value={kindValue}
                                            onChange={(k) => setKind(k as Kind)}
                                            options={[
                                                { value: "none", label: t("tonies.cfwKindNone") },
                                                {
                                                    value: "profile",
                                                    label: t("tonies.cfwKindProfile"),
                                                },
                                                { value: "event", label: t("tonies.cfwKindEvent") },
                                            ]}
                                        />
                                    </div>
                                </div>
                                {showProfile && (
                                    <CfwProfileFields
                                        values={profileValues}
                                        changed={changedProfile}
                                        onChange={(k, v) => setProfile((p) => ({ ...p, [k]: v }))}
                                    />
                                )}
                            </div>
                            {!kind && eventCount > 0 && changedProfile.size > 0 && (
                                <div className="mt">
                                    <Notice info>
                                        {t("tonies.bulkEventsKept", { n: eventCount })}
                                    </Notice>
                                </div>
                            )}
                        </>
                    )}
                </Section>
            )}
        </Sheet>
    );
}
