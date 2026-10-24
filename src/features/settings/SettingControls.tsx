import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { ReactNode, useState } from "react";
import { tc } from "../../api/tc";
import type { SettingOption } from "../../api/types";
import { t } from "../../lib/i18n";
import { keys } from "../../lib/queries";
import { settingDescription, settingLabel, settingValues } from "../../lib/settingsText";
import { Sheet } from "../../ui/Sheet";
import { Row, Segmented, Slider, Switch, useUi } from "../../ui/kit";

/** a volume step of the CFW, with the limit of the original firmware where it has the same step */
const ORIGINAL_STEP: Record<number, number> = { 6: 25, 9: 50, 12: 75, 15: 100 };
const volumeStep = (v: number) => (ORIGINAL_STEP[v] ? t("volumeStepOriginal", { n: v, pct: ORIGINAL_STEP[v] }) : t("volumeStep", { n: v }));

/** settings that slide with their values shown this way, wherever they appear */
const FORMATS: Partial<Record<string, (v: number) => string>> = { "cfw.box.speaker_limit": volumeStep, "cfw.box.headphone_limit": volumeStep };

/** "0=25%, 1=50%, 2=75%" -> options, undefined when the description is no such list */
export const enumOptions = (opt: SettingOption): { value: number; label: string }[] | undefined => {
    if (opt.type !== "uint" && opt.type !== "int") return undefined;
    const named = settingValues(opt);
    if (named && Object.keys(named).length >= 2)
        return Object.entries(named).map(([v, label]) => ({ value: Number(v), label }));
    const parts = [...opt.description.matchAll(/(\d+)\s*=\s*([^,;]+)/g)];
    if (parts.length < 2) return undefined;
    return parts.map((m) => ({ value: Number(m[1]), label: m[2].trim() }));
};

export function useSettingActions(overlay: string) {
    const qc = useQueryClient();
    const ui = useUi();
    const refresh = () => {
        qc.invalidateQueries({ queryKey: keys.settings(overlay) });
        if (!overlay) qc.invalidateQueries({ queryKey: ["settings"] });
        qc.invalidateQueries({ queryKey: keys.cfwBoxes });
    };
    const patch = (id: string, value: SettingOption["value"], overlayed = true) => {
        qc.setQueryData<SettingOption[]>(keys.settings(overlay), (list) =>
            list?.map((o) => (o.ID === id ? { ...o, value, overlayed: overlay ? overlayed : o.overlayed } : o)),
        );
    };
    return {
        set: async (opt: SettingOption, value: string | number | boolean) => {
            const old = opt.value;
            patch(opt.ID, value);
            try {
                await tc.setSetting(opt.ID, value, overlay || undefined);
            } catch (e) {
                patch(opt.ID, old, opt.overlayed);
                ui.toast("error", t("saveFailed"), String((e as Error).message));
            }
            refresh();
        },
        reset: async (opt: SettingOption) => {
            await ui.run(() => tc.resetSetting(opt.ID, overlay || undefined), t("resetDone"));
            refresh();
        },
    };
}

interface SettingRowProps {
    opt: SettingOption;
    overlay: string;
    /** overrides the label of the server */
    label?: ReactNode;
    sub?: ReactNode;
    icon?: ReactNode;
    iconColor?: string;
    /** shows values of a range as text, e.g. v => `${v * 25}%` */
    format?: (v: number) => string;
    /** no reset button for box overrides */
    noReset?: boolean;
    /** own labels for enumerated values, by value */
    labels?: Record<number, string>;
}

/** one setting with the fitting control; on a box (overlay) it shows whether the box has its own value */
export function SettingRow({ opt, overlay, label, sub, icon, iconColor, format: givenFormat, noReset, labels }: SettingRowProps) {
    const format = givenFormat ?? FORMATS[opt.ID];
    const { set, reset } = useSettingActions(overlay);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [slide, setSlide] = useState<number | null>(null);
    const title = label ?? settingLabel(opt);
    const description = settingDescription(opt);
    const disabled = opt.writable === false;
    const own = overlay && opt.overlayed;
    const resetBtn =
        own && !noReset ? (
            <button
                className="icon-btn muted"
                title={t("useDefault")}
                aria-label={t("useDefault")}
                onClick={(e) => {
                    e.stopPropagation();
                    reset(opt);
                }}
            >
                <RotateCcw size={17} />
            </button>
        ) : null;
    const subLine = (
        <>
            {sub ?? (label || description === title ? undefined : description)}
            {overlay ? (
                <span style={{ display: "block", color: own ? "var(--accent)" : "var(--fg-3)" }}>
                    {own ? t("ownValue") : t("inherited")}
                </span>
            ) : null}
        </>
    );

    if (opt.type === "bool") {
        const v = Boolean(opt.value);
        return (
            <Row
                icon={icon}
                iconColor={iconColor}
                title={title}
                sub={subLine}
                onClick={disabled ? undefined : () => set(opt, !v)}
                chevron={false}
                right={
                    <>
                        {resetBtn}
                        <Switch checked={v} disabled={disabled} onChange={(n) => set(opt, n)} />
                    </>
                }
            />
        );
    }

    const choices = enumOptions(opt)?.map((c) => ({ ...c, label: labels?.[c.value] ?? c.label }));
    // side by side only when the names fit the phone's width
    if (choices && choices.length <= 4 && choices.reduce((n, c) => n + c.label.length, 0) <= 32) {
        return (
            <div className="row-wrap">
                <Row icon={icon} iconColor={iconColor} title={title} sub={subLine} right={resetBtn} />
                <div style={{ padding: "0 16px 12px" }}>
                    <Segmented
                        value={String(opt.value)}
                        options={choices.map((c) => ({ value: String(c.value), label: c.label }))}
                        onChange={(v) => set(opt, Number(v))}
                    />
                </div>
            </div>
        );
    }

    const numeric = opt.type === "uint" || opt.type === "int" || opt.type === "float";
    // many enumerated steps with a format (e.g. 16 volume steps) slide too; their names are too long for a row
    const range = choices && format ? { min: choices[0].value, max: choices[choices.length - 1].value } : choices ? undefined : opt;
    if (numeric && range?.min !== undefined && range.max !== undefined && range.max - range.min <= 100) {
        const v = slide ?? Number(opt.value ?? 0);
        // as wide as the widest value, so that the slider does not move while sliding
        const { min, max } = range;
        const widest = Math.max(...Array.from({ length: Math.floor(max - min) + 1 }, (_, i) => (format ? format(min + i) : String(min + i)).length));
        return (
            <div className="row-wrap">
                <Row
                    icon={icon}
                    iconColor={iconColor}
                    title={title}
                    sub={subLine}
                    right={resetBtn}
                />
                <div style={{ padding: "0 16px 10px", display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ minWidth: `${widest + 1}ch`, color: "var(--fg-2)", whiteSpace: "nowrap" }}>{format ? format(v) : String(v)}</span>
                    <Slider
                        value={v}
                        min={range.min}
                        max={range.max}
                        disabled={disabled}
                        onChange={setSlide}
                        onCommit={(n) => {
                            setSlide(null);
                            if (n !== Number(opt.value)) set(opt, n);
                        }}
                    />
                </div>
            </div>
        );
    }

    const shown = choices?.find((c) => c.value === Number(opt.value))?.label ?? String(opt.value ?? "");
    return (
        <>
            <Row
                icon={icon}
                iconColor={iconColor}
                title={title}
                sub={subLine}
                value={shown || <span style={{ color: "var(--fg-3)" }}>{t("empty")}</span>}
                right={resetBtn}
                onClick={
                    disabled
                        ? undefined
                        : () => {
                              setDraft(String(opt.value ?? ""));
                              setEditing(true);
                          }
                }
                chevron
            />
            <Sheet
                open={editing}
                onClose={() => setEditing(false)}
                title={title}
                footer={
                    <>
                        <button className="btn" onClick={() => setEditing(false)}>
                            {t("cancel")}
                        </button>
                        <button
                            className="btn primary"
                            onClick={() => {
                                setEditing(false);
                                set(opt, numeric ? Number(draft) : draft);
                            }}
                        >
                            {t("save")}
                        </button>
                    </>
                }
            >
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        setEditing(false);
                        set(opt, numeric ? Number(draft) : draft);
                    }}
                >
                    {choices ? (
                        <div className="list">
                            {choices.map((c) => (
                                <Row
                                    key={c.value}
                                    title={c.label}
                                    onClick={() => setDraft(String(c.value))}
                                    chevron={false}
                                    right={String(c.value) === draft ? <span style={{ color: "var(--accent)" }}>✓</span> : null}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="field">
                            <input
                                className="input"
                                autoFocus
                                inputMode={numeric ? "numeric" : undefined}
                                type={opt.ID.toLowerCase().includes("password") ? "password" : "text"}
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                            />
                            <div className="hint">
                                {description}
                                {numeric && opt.min !== undefined ? ` (${opt.min}–${opt.max})` : ""}
                            </div>
                        </div>
                    )}
                </form>
            </Sheet>
        </>
    );
}
