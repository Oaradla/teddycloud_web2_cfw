import { Plus, Trash2 } from "lucide-react";
import { t, type Key } from "../../lib/i18n";
import { Segmented, SwitchRow } from "../../ui/kit";

/* the actions an event tag can carry (custom firmware); "figure" ones change the next figure,
   "global" ones the box */

type Scope = "figure" | "global";
type ValueKind = "none" | "minutes" | "minutesOnce" | "volumeStart" | "ledStart";
interface ActionDef {
    action: number;
    key: string;
    scope: Scope;
    modes: "all" | "earsSet" | "none";
    value: ValueKind;
}
export interface CfwAction {
    action: number;
    mode: number;
    value: number;
}
export interface CfwEvent {
    tones: boolean;
    actions: CfwAction[];
}

const ACTIONS: ActionDef[] = [
    { action: 1, key: "resume", scope: "figure", modes: "all", value: "none" },
    { action: 2, key: "shuffle", scope: "figure", modes: "all", value: "none" },
    { action: 3, key: "sleepTimer", scope: "figure", modes: "all", value: "minutes" },
    { action: 4, key: "sleepTimerOnce", scope: "figure", modes: "none", value: "minutesOnce" },
    { action: 5, key: "volumeLimitFigure", scope: "figure", modes: "earsSet", value: "volumeStart" },
    { action: 6, key: "ledLevelFigure", scope: "figure", modes: "earsSet", value: "ledStart" },
    { action: 7, key: "resetProfile", scope: "figure", modes: "none", value: "none" },
    { action: 10, key: "slapLockFigure", scope: "figure", modes: "all", value: "none" },
    { action: 11, key: "tiltLockFigure", scope: "figure", modes: "all", value: "none" },
    { action: 12, key: "volumeLockFigure", scope: "figure", modes: "all", value: "none" },
    { action: 8, key: "ledLevelGlobal", scope: "global", modes: "earsSet", value: "ledStart" },
    { action: 9, key: "volumeLimitGlobal", scope: "global", modes: "earsSet", value: "volumeStart" },
    { action: 13, key: "slapLockGlobal", scope: "global", modes: "all", value: "none" },
    { action: 14, key: "tiltLockGlobal", scope: "global", modes: "all", value: "none" },
    { action: 15, key: "volumeLockGlobal", scope: "global", modes: "all", value: "none" },
    { action: 16, key: "bothEarsOff", scope: "global", modes: "all", value: "none" },
];
const MODE_REMOVE = 3;
const MAX_ACTIONS = 16;
/** LED levels as the box numbers them: on, dimmed, off */
const LED_LEVELS = [0, 2, 1];

const def = (action: number) => ACTIONS.find((a) => a.action === action);
const scopeOf = (actions: CfwAction[]): Scope => actions.map((a) => def(a.action)).find(Boolean)?.scope ?? "figure";
const defaultValue = (d: ActionDef) => (d.value === "minutes" || d.value === "minutesOnce" ? 30 : d.value === "ledStart" ? 3 : 0);
const fresh = (scope: Scope): CfwAction => {
    const d = ACTIONS.find((a) => a.scope === scope)!;
    return { action: d.action, mode: 0, value: defaultValue(d) };
};
const tk = (key: string) => t(key as Key);

export const EMPTY_EVENT: CfwEvent = { tones: true, actions: [fresh("figure")] };

/** an event tag: what it changes, up to 16 actions and the feedback tones */
export function CfwEventFields({ event, onChange }: { event: CfwEvent; onChange: (e: CfwEvent) => void }) {
    const actions = event.actions.length ? event.actions : [fresh("figure")];
    const scope = scopeOf(actions);
    const setActions = (list: CfwAction[]) => onChange({ ...event, actions: list });
    const update = (i: number, change: Partial<CfwAction>) => setActions(actions.map((a, j) => (j === i ? { ...a, ...change } : a)));
    /** only the first volume and the first LED action set with the ears count */
    const ignored = (a: CfwAction, i: number) => {
        const kind = def(a.action)?.value;
        return (kind === "volumeStart" || kind === "ledStart") && a.mode !== MODE_REMOVE && actions.some((o, j) => j < i && def(o.action)?.value === kind && o.mode !== MODE_REMOVE);
    };

    return (
        <div className="cfw-event">
            <p className="small muted">{t("cfwEventIntro")}</p>
            <label className="small muted">{t("cfwEventScope")}</label>
            <Segmented
                value={scope}
                onChange={(s) => s !== scope && setActions([fresh(s)])}
                options={[
                    { value: "figure", label: t("cfwEventScopeFigure") },
                    { value: "global", label: t("cfwEventScopeGlobal") },
                ]}
            />
            {actions.map((a, i) => {
                const d = def(a.action);
                return (
                    <div key={i} className="cfw-action">
                        <select
                            className="select"
                            value={a.action}
                            onChange={(e) => {
                                const n = Number(e.target.value);
                                update(i, { action: n, mode: 0, value: defaultValue(def(n)!) });
                            }}
                        >
                            {ACTIONS.filter((x) => x.scope === scope).map((x) => (
                                <option key={x.action} value={x.action}>
                                    {tk(`cfwAction_${x.key}`)}
                                </option>
                            ))}
                        </select>
                        {d?.modes === "all" && (
                            <select className="select" value={a.mode} onChange={(e) => update(i, { mode: Number(e.target.value) })}>
                                {[0, 1, 2, 3].map((m) => (
                                    <option key={m} value={m}>
                                        {tk(`cfwMode${m}`)}
                                    </option>
                                ))}
                            </select>
                        )}
                        {d?.modes === "earsSet" && (
                            <select className="select" value={a.mode === MODE_REMOVE ? MODE_REMOVE : 0} onChange={(e) => update(i, { mode: Number(e.target.value) })}>
                                <option value={0}>{t("cfwModeEars")}</option>
                                <option value={MODE_REMOVE}>{t("cfwMode3")}</option>
                            </select>
                        )}
                        {d && a.mode !== MODE_REMOVE && (d.value === "minutes" || d.value === "minutesOnce") && a.mode !== 2 && (
                            <label className="row-gap">
                                <input
                                    className="input"
                                    type="number"
                                    min={d.value === "minutes" ? 1 : 0}
                                    max={16383}
                                    value={a.value}
                                    onChange={(e) => update(i, { value: Math.max(0, Math.min(16383, Number(e.target.value) || 0)) })}
                                    style={{ maxWidth: 110 }}
                                />
                                <span className="small muted">{t("minutesShort")}</span>
                            </label>
                        )}
                        {d && a.mode !== MODE_REMOVE && d.value === "volumeStart" && (
                            <select className="select" value={a.value} onChange={(e) => update(i, { value: Number(e.target.value) })}>
                                <option value={0}>{t("cfwStartCurrentVolume")}</option>
                                {Array.from({ length: 16 }, (_, step) => (
                                    <option key={step} value={step + 1}>
                                        {t("cfwStartVolume", { step })}
                                    </option>
                                ))}
                            </select>
                        )}
                        {d && a.mode !== MODE_REMOVE && d.value === "ledStart" && (
                            <select className="select" value={a.value} onChange={(e) => update(i, { value: Number(e.target.value) })}>
                                <option value={3}>{t("cfwStartCurrentLed")}</option>
                                {LED_LEVELS.map((level) => (
                                    <option key={level} value={level}>
                                        {t("cfwStartLed", { level: tk(`cfwLed${level}`) })}
                                    </option>
                                ))}
                            </select>
                        )}
                        <button className="icon-btn" aria-label={t("cfwRemoveAction")} title={t("cfwRemoveAction")} disabled={actions.length <= 1} onClick={() => setActions(actions.filter((_, j) => j !== i))}>
                            <Trash2 size={16} />
                        </button>
                        {ignored(a, i) && <div className="small" style={{ color: "var(--warn, #b26a00)", flexBasis: "100%" }}>{t("cfwSecondEarsIgnored")}</div>}
                    </div>
                );
            })}
            <button className="btn small" disabled={actions.length >= MAX_ACTIONS} onClick={() => setActions([...actions, fresh(scope)])}>
                <Plus size={15} />
                {t("cfwAddAction")}
            </button>
            <div className="list mt">
                <SwitchRow title={t("cfwEventTones")} sub={t("cfwEventTonesHint")} checked={event.tones} onChange={(tones) => onChange({ ...event, tones })} />
            </div>
        </div>
    );
}
