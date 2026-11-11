import { RotateCcw } from "lucide-react";
import { ReactNode } from "react";
import { CFW_CAP, type CfwProfile, withoutCapability } from "../../api/types";
import { t } from "../../lib/i18n";
import { useCfwBoxes, useSetting } from "../../lib/queries";
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
    globalResume: null,
};

export const PROFILE_KEYS = Object.keys(EMPTY_PROFILE) as (keyof CfwProfile)[];

/** LED levels as the box numbers them */
const LED_LEVELS = [
    [0, "common.ledOn"],
    [2, "common.ledDimmed"],
    [1, "common.ledOff"],
    [6, "common.ledDimmedPermanent"],
    [5, "common.ledOffPermanent"],
] as const;

/** the box settings a missing value of the tonie falls back to */
const BOX_SETTING = {
    ledLevel: "toniebox.led",
    speakerLimit: "cfw.box.speaker_limit",
    headphoneLimit: "cfw.box.headphone_limit",
    slapLock: "cfw.box.slap_lock",
    tiltLock: "cfw.box.tilt_lock",
    volumeLock: "cfw.box.volume_lock",
} as const;
type BoxKey = keyof typeof BOX_SETTING;

const onOff = (v: boolean | Mixed) => (v === MIXED ? MIXED : v ? "on" : "off");

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
    const boxes = useCfwBoxes();
    const oldBoxes =
        values.globalResume === true
            ? withoutCapability(boxes.data ?? [], CFW_CAP.globalResume)
            : [];
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

    // without a value of its own the tonie does what the box does
    const box = {
        ledLevel: useSetting(BOX_SETTING.ledLevel).data,
        speakerLimit: useSetting(BOX_SETTING.speakerLimit).data,
        headphoneLimit: useSetting(BOX_SETTING.headphoneLimit).data,
        slapLock: useSetting(BOX_SETTING.slapLock).data,
        tiltLock: useSetting(BOX_SETTING.tiltLock).data,
        volumeLock: useSetting(BOX_SETTING.volumeLock).data,
    };
    const inherited = (k: BoxKey) => values[k] === null;
    const effective = (k: BoxKey) => {
        const v = values[k];
        if (v !== null) return v;
        const b = box[k];
        return b === undefined ? MIXED : k.endsWith("Lock") ? b === "true" : Number(b);
    };
    const inheritable = (
        k: BoxKey,
        title: string,
        sub: string,
        control: ReactNode,
        value?: ReactNode,
    ) => (
        <div className="row-wrap" key={k}>
            <Row
                title={title}
                sub={
                    <>
                        {sub}
                        {values[k] !== MIXED && (
                            <span
                                style={{
                                    display: "block",
                                    color: inherited(k) ? "var(--fg-3)" : "var(--accent)",
                                }}
                            >
                                {inherited(k) ? t("tonies.cfwFromBox") : t("tonies.cfwOwnValue")}
                            </span>
                        )}
                    </>
                }
                value={value}
                right={
                    <>
                        {state(k)}
                        {values[k] !== null && (
                            <button
                                className="icon-btn muted"
                                title={t("tonies.cfwUseBox")}
                                aria-label={t("tonies.cfwUseBox")}
                                onClick={() => onChange(k, null)}
                            >
                                <RotateCcw size={17} />
                            </button>
                        )}
                    </>
                }
            />
            <div style={{ padding: "0 16px 12px" }}>{control}</div>
        </div>
    );

    /** a function the box does not know: off is the same as no value */
    const toggle = (k: "resume" | "globalResume" | "shuffle", title: string, sub: string) => {
        // global resume includes resume: shown as on and locked
        const implied = k === "resume" && values.globalResume === true;
        const v = values[k];
        return block(
            k,
            title,
            implied ? t("tonies.cfwResumeByGlobal") : sub,
            <Segmented
                value={implied ? "on" : onOff(v === MIXED ? MIXED : v === true)}
                disabled={implied}
                onChange={(n) => onChange(k, n === "on" ? true : null)}
                options={[
                    { value: "off", label: t("tonies.off") },
                    { value: "on", label: t("tonies.on") },
                ]}
            />,
        );
    };

    const lock = (k: "slapLock" | "tiltLock" | "volumeLock", title: string) =>
        inheritable(
            k,
            title,
            t("tonies.cfwLockHint"),
            <Segmented
                value={onOff(effective(k) as boolean | Mixed)}
                onChange={(n) => onChange(k, n === "on")}
                options={[
                    { value: "off", label: t("tonies.off") },
                    { value: "on", label: t("tonies.on") },
                ]}
            />,
        );

    const limit = (k: "speakerLimit" | "headphoneLimit", title: string) => {
        const v = effective(k);
        return inheritable(
            k,
            title,
            t("tonies.cfwLimitHint"),
            // differing tonies start from the highest step
            <Slider
                value={v === MIXED ? 15 : (v as number)}
                min={0}
                max={15}
                onChange={(n) => onChange(k, n)}
            />,
            v === MIXED ? undefined : `${Math.round(((v as number) / 15) * 100)} %`,
        );
    };

    const sleep = values.sleepMinutes;
    return (
        <>
            {toggle("resume", t("tonies.cfwResume"), t("tonies.cfwResumeHint"))}
            {toggle(
                "globalResume",
                t("tonies.cfwGlobalResume"),
                t("tonies.cfwGlobalResumeHint") +
                    (oldBoxes.length > 0
                        ? " " +
                          t("tonies.cfwGlobalResumeOld", {
                              boxes: oldBoxes
                                  .map((b) => b.boxName || b.commonName || b.id)
                                  .join(", "),
                          })
                        : ""),
            )}
            {toggle("shuffle", t("tonies.cfwShuffle"), t("tonies.cfwShuffleHint"))}
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
            {inheritable(
                "ledLevel",
                t("common.led"),
                t("tonies.cfwLedHint"),
                <div className="chips" style={{ margin: 0, padding: 0, flexWrap: "wrap" }}>
                    {LED_LEVELS.map(([level, label]) => (
                        <button
                            key={String(level)}
                            className={`chip ${effective("ledLevel") === level ? "active" : ""}`}
                            onClick={() => onChange("ledLevel", level)}
                        >
                            {t(label)}
                        </button>
                    ))}
                </div>,
            )}
            {limit("speakerLimit", t("common.speakerLimit"))}
            {limit("headphoneLimit", t("common.headphoneLimit"))}
            {lock("slapLock", t("common.slapLock"))}
            {lock("tiltLock", t("common.tiltLock"))}
            {lock("volumeLock", t("common.volumeLock"))}
        </>
    );
}
