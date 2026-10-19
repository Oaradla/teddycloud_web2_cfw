import { ReactNode } from "react";
import type { CfwProfile } from "../../api/types";
import { t } from "../../lib/i18n";
import { Row, Segmented, Slider } from "../../ui/kit";

/** value of a field that differs between the selected tonies */
export const MIXED = "__mixed" as const;
export type Mixed = typeof MIXED;
export type ProfileValues = { [K in keyof CfwProfile]: CfwProfile[K] | Mixed };

export const EMPTY_PROFILE: CfwProfile = {
    resume: null,
    shuffle: null,
    sleepMinutes: null,
    speakerLimit: null,
    headphoneLimit: null,
    ledLevel: null,
    slapLock: null,
    tiltLock: null,
    volumeLock: null,
};

export const PROFILE_KEYS = Object.keys(EMPTY_PROFILE) as (keyof CfwProfile)[];

type Tri = "unset" | "on" | "off";
const toTri = (v: boolean | null | Mixed): Tri | Mixed => (v === MIXED ? MIXED : v === null ? "unset" : v ? "on" : "off");
const fromTri = (v: Tri) => (v === "unset" ? null : v === "on");

/** marks a value that differs between the selected tonies, or that the user changed */
export function FieldState({ mixed, changed }: { mixed?: boolean; changed?: boolean }) {
    if (changed) return <span className="badge accent">{t("changed")}</span>;
    if (mixed) return <span className="badge warn">{t("mixed")}</span>;
    return null;
}

/**
 * The profile fields of the custom firmware. Used for one tonie and for several at once: then a
 * field can be MIXED (shown as "different", nothing selected) until the user picks a value.
 */
export function CfwProfileFields({
    values,
    onChange,
    changed,
}: {
    values: ProfileValues;
    onChange: <K extends keyof CfwProfile>(k: K, v: CfwProfile[K]) => void;
    changed?: Set<keyof CfwProfile>;
}) {
    const state = (k: keyof CfwProfile) => <FieldState mixed={values[k] === MIXED} changed={changed?.has(k)} />;
    const block = (k: keyof CfwProfile, title: string, sub: string, control: ReactNode, value?: ReactNode) => (
        <div className="row-wrap" key={k}>
            <Row title={title} sub={sub} value={value} right={state(k)} />
            <div style={{ padding: "0 16px 12px" }}>{control}</div>
        </div>
    );

    const tri = (k: "resume" | "shuffle" | "slapLock" | "tiltLock" | "volumeLock", title: string, sub: string) =>
        block(
            k,
            title,
            sub,
            <Segmented
                value={toTri(values[k])}
                onChange={(v) => onChange(k, fromTri(v as Tri))}
                options={[
                    { value: "unset", label: t("notSet") },
                    { value: "on", label: t("on") },
                    { value: "off", label: t("off") },
                ]}
            />,
        );

    const limit = (k: "speakerLimit" | "headphoneLimit", title: string) => {
        const v = values[k];
        return (
            <div className="row-wrap" key={k}>
                <Row
                    title={title}
                    sub={t("cfwLimitHint")}
                    value={v === MIXED ? undefined : v === null ? t("notSet") : `${Math.round((v / 15) * 100)} %`}
                    right={
                        <>
                            {state(k)}
                            <button className="btn small" onClick={() => onChange(k, v === null ? 15 : v === MIXED ? 15 : null)}>
                                {v === null || v === MIXED ? t("set") : t("unset")}
                            </button>
                        </>
                    }
                />
                {v !== null && v !== MIXED && (
                    <div style={{ padding: "0 16px 10px" }}>
                        <Slider value={v} min={0} max={15} onChange={(n) => onChange(k, n)} />
                    </div>
                )}
            </div>
        );
    };

    const sleep = values.sleepMinutes;
    return (
        <>
            {tri("resume", t("cfwResume"), t("cfwResumeHint"))}
            {tri("shuffle", t("cfwShuffle"), t("cfwShuffleHint"))}
            {block(
                "sleepMinutes",
                t("cfwSleep"),
                t("cfwSleepHint"),
                <div className="chips" style={{ margin: 0, padding: 0, flexWrap: "wrap" }}>
                    {[null, 10, 15, 20, 30, 45, 60, 90].map((m) => (
                        <button
                            key={String(m)}
                            className={`chip ${sleep !== MIXED && (sleep || null) === m ? "active" : ""}`}
                            onClick={() => onChange("sleepMinutes", m)}
                        >
                            {m === null ? t("inactive") : `${m} min`}
                        </button>
                    ))}
                </div>,
                sleep === MIXED ? undefined : !sleep ? t("inactive") : `${sleep} min`,
            )}
            {block(
                "ledLevel",
                t("led"),
                t("cfwLedHint"),
                <Segmented
                    value={values.ledLevel === MIXED ? MIXED : values.ledLevel === null ? "unset" : String(values.ledLevel)}
                    onChange={(v) => onChange("ledLevel", v === "unset" ? null : Number(v))}
                    options={[
                        { value: "unset", label: t("notSet") },
                        { value: "0", label: t("ledOn") },
                        { value: "2", label: t("ledDimmed") },
                        { value: "1", label: t("ledOff") },
                    ]}
                />,
            )}
            {limit("speakerLimit", t("speakerLimit"))}
            {limit("headphoneLimit", t("headphoneLimit"))}
            {tri("slapLock", t("slapLock"), t("cfwLockHint"))}
            {tri("tiltLock", t("tiltLock"), t("cfwLockHint"))}
            {tri("volumeLock", t("volumeLock"), t("cfwLockHint"))}
        </>
    );
}
