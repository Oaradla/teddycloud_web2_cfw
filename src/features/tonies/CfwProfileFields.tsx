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

/** LED levels as the box numbers them */
const LED_LEVELS = [
    [null, "tonies.notSet"],
    [0, "common.ledOn"],
    [2, "common.ledDimmed"],
    [1, "common.ledOff"],
    [6, "common.ledDimmedPermanent"],
    [5, "common.ledOffPermanent"],
] as const;

type Tri = "unset" | "on" | "off";
const toTri = (v: boolean | null | Mixed): Tri | Mixed =>
    v === MIXED ? MIXED : v === null ? "unset" : v ? "on" : "off";
const fromTri = (v: Tri) => (v === "unset" ? null : v === "on");

/** marks a value that differs between the selected tonies, or that the user changed */
export function FieldState({ mixed, changed }: { mixed?: boolean; changed?: boolean }) {
    if (changed) return <span className="badge accent">{t("tonies.changed")}</span>;
    if (mixed) return <span className="badge warn">{t("tonies.mixed")}</span>;
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
    const state = (k: keyof CfwProfile) => (
        <FieldState mixed={values[k] === MIXED} changed={changed?.has(k)} />
    );
    const block = (
        k: keyof CfwProfile,
        title: string,
        sub: string,
        control: ReactNode,
        value?: ReactNode,
    ) => (
        <div className="row-wrap" key={k}>
            <Row title={title} sub={sub} value={value} right={state(k)} />
            <div style={{ padding: "0 16px 12px" }}>{control}</div>
        </div>
    );

    const tri = (
        k: "resume" | "shuffle" | "slapLock" | "tiltLock" | "volumeLock",
        title: string,
        sub: string,
    ) =>
        block(
            k,
            title,
            sub,
            <Segmented
                value={toTri(values[k])}
                onChange={(v) => onChange(k, fromTri(v as Tri))}
                options={[
                    { value: "unset", label: t("tonies.notSet") },
                    { value: "on", label: t("tonies.on") },
                    { value: "off", label: t("tonies.off") },
                ]}
            />,
        );

    const limit = (k: "speakerLimit" | "headphoneLimit", title: string) => {
        const v = values[k];
        return (
            <div className="row-wrap" key={k}>
                <Row
                    title={title}
                    sub={t("tonies.cfwLimitHint")}
                    value={
                        v === MIXED
                            ? undefined
                            : v === null
                              ? t("tonies.notSet")
                              : `${Math.round((v / 15) * 100)} %`
                    }
                    right={
                        <>
                            {state(k)}
                            <button
                                className="btn small"
                                onClick={() =>
                                    onChange(k, v === null ? 15 : v === MIXED ? 15 : null)
                                }
                            >
                                {v === null || v === MIXED ? t("tonies.set") : t("tonies.unset")}
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
            {tri("resume", t("tonies.cfwResume"), t("tonies.cfwResumeHint"))}
            {tri("shuffle", t("tonies.cfwShuffle"), t("tonies.cfwShuffleHint"))}
            {block(
                "sleepMinutes",
                t("tonies.cfwSleep"),
                t("tonies.cfwSleepHint"),
                <div className="chips" style={{ margin: 0, padding: 0, flexWrap: "wrap" }}>
                    {[null, 10, 15, 20, 30, 45, 60, 90].map((m) => (
                        <button
                            key={String(m)}
                            className={`chip ${sleep !== MIXED && (sleep || null) === m ? "active" : ""}`}
                            onClick={() => onChange("sleepMinutes", m)}
                        >
                            {m === null ? t("tonies.inactive") : `${m} min`}
                        </button>
                    ))}
                </div>,
                sleep === MIXED ? undefined : !sleep ? t("tonies.inactive") : `${sleep} min`,
            )}
            {block(
                "ledLevel",
                t("common.led"),
                t("tonies.cfwLedHint"),
                <div className="chips" style={{ margin: 0, padding: 0, flexWrap: "wrap" }}>
                    {LED_LEVELS.map(([level, label]) => (
                        <button
                            key={String(level)}
                            className={`chip ${values.ledLevel === level ? "active" : ""}`}
                            onClick={() => onChange("ledLevel", level)}
                        >
                            {t(label)}
                        </button>
                    ))}
                </div>,
            )}
            {limit("speakerLimit", t("common.speakerLimit"))}
            {limit("headphoneLimit", t("common.headphoneLimit"))}
            {tri("slapLock", t("common.slapLock"), t("tonies.cfwLockHint"))}
            {tri("tiltLock", t("common.tiltLock"), t("tonies.cfwLockHint"))}
            {tri("volumeLock", t("common.volumeLock"), t("tonies.cfwLockHint"))}
        </>
    );
}
