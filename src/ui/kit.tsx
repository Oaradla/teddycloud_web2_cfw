import { CheckCircle2, ChevronLeft, ChevronRight, Info, Search, X, XCircle } from "lucide-react";
import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { chapterLength, duration } from "../lib/format";
import { t } from "../lib/i18n";
import { Sheet } from "./Sheet";

/* ------------------------------------------------------------------ page frame */

interface PageProps {
    title: string;
    /** shown under the large title */
    subtitle?: ReactNode;
    back?: string | true;
    right?: ReactNode;
    children: ReactNode;
    narrow?: boolean;
    /** no large title, the title always sits in the bar */
    compact?: boolean;
}

export function Page({ title, subtitle, back, right, children, narrow, compact }: PageProps) {
    const [scrolled, setScrolled] = useState(false);
    const navigate = useNavigate();
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > (compact ? 2 : 34));
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, [compact]);
    useEffect(() => {
        document.title = `${title} · TeddyCloud`;
    }, [title]);
    const goBack = () => {
        if (back === true) {
            if (window.history.length > 1) navigate(-1);
            else navigate("/");
        } else if (back) navigate(back);
    };
    return (
        <>
            <header className={`topbar ${scrolled ? "scrolled" : ""} ${compact ? "always" : ""}`}>
                <div className="topbar-inner">
                    <div className="topbar-side">
                        {back && (
                            // the "More" tab exists on the phone only; on the desktop the page is in the sidebar
                            <button className={`btn ghost ${back === "/more" ? "mobile-only" : ""}`} onClick={goBack} style={{ paddingLeft: 2 }}>
                                <ChevronLeft size={26} />
                            </button>
                        )}
                    </div>
                    <div className="topbar-title">{title}</div>
                    <div className="topbar-side right">{right}</div>
                </div>
            </header>
            <div className={`page ${narrow ? "narrow" : ""}`}>
                {!compact && <h1 className="large-title">{title}</h1>}
                {subtitle && !compact && <p className="subtitle">{subtitle}</p>}
                {children}
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ lists */

export function Section({
    title,
    footer,
    children,
    right,
    big,
    plain,
}: {
    title?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    right?: ReactNode;
    big?: boolean;
    /** children without the list background */
    plain?: boolean;
}) {
    return (
        <section className="section">
            {(title || right) && (
                <div className="section-head">
                    <h2 className={`section-title ${big ? "big" : ""}`}>{title}</h2>
                    {right}
                </div>
            )}
            {plain ? children : <div className="list">{children}</div>}
            {footer && <div className="section-foot">{footer}</div>}
        </section>
    );
}

interface RowProps {
    icon?: ReactNode;
    iconColor?: string;
    title: ReactNode;
    sub?: ReactNode;
    value?: ReactNode;
    right?: ReactNode;
    to?: string;
    onClick?: () => void;
    chevron?: boolean;
    danger?: boolean;
    accent?: boolean;
    disabled?: boolean;
    className?: string;
    nowrap?: boolean;
    leading?: ReactNode;
}

export function Row({
    icon,
    iconColor,
    title,
    sub,
    value,
    right,
    to,
    onClick,
    chevron,
    danger,
    accent,
    disabled,
    className = "",
    nowrap,
    leading,
}: RowProps) {
    const content = (
        <>
            {leading}
            {icon && (
                <span
                    className="row-icon"
                    style={iconColor ? { background: iconColor, color: "#fff" } : undefined}
                >
                    {icon}
                </span>
            )}
            <span className="row-body">
                <div className={`row-title ${nowrap ? "nowrap" : ""}`}>{title}</div>
                {sub && <div className="row-sub">{sub}</div>}
            </span>
            {value !== undefined && <span className="row-value">{value}</span>}
            {right}
            {(chevron ?? Boolean(to)) && <ChevronRight size={18} className="row-chevron" />}
        </>
    );
    const cls = `row ${danger ? "danger" : ""} ${accent ? "accent" : ""} ${disabled ? "disabled" : ""} ${className}`;
    if (to)
        return (
            <Link to={to} className={cls}>
                {content}
            </Link>
        );
    if (onClick)
        // a div, not a button: rows often hold their own buttons (switches, reset)
        return (
            <div
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled}
                className={cls}
                onClick={disabled ? undefined : onClick}
                onKeyDown={(e) => {
                    if (!disabled && (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                        e.preventDefault();
                        onClick();
                    }
                }}
            >
                {content}
            </div>
        );
    return <div className={cls}>{content}</div>;
}

export function Switch({
    checked,
    onChange,
    disabled,
    label,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
    label?: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            className={`switch ${checked ? "on" : ""}`}
            disabled={disabled}
            onClick={(e) => {
                e.stopPropagation();
                if ("vibrate" in navigator) navigator.vibrate?.(8);
                onChange(!checked);
            }}
        />
    );
}

/** a row with a switch that can be tapped anywhere */
export function SwitchRow({
    title,
    sub,
    checked,
    onChange,
    disabled,
    icon,
    iconColor,
}: {
    title: ReactNode;
    sub?: ReactNode;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
    icon?: ReactNode;
    iconColor?: string;
}) {
    return (
        <Row
            icon={icon}
            iconColor={iconColor}
            title={title}
            sub={sub}
            onClick={disabled ? undefined : () => onChange(!checked)}
            chevron={false}
            disabled={disabled}
            right={<Switch checked={checked} onChange={onChange} disabled={disabled} />}
        />
    );
}

export function Segmented<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: { value: T; label: ReactNode }[];
    onChange: (v: T) => void;
}) {
    return (
        <div className="segmented" role="tablist">
            {options.map((o) => (
                <button
                    key={o.value}
                    role="tab"
                    aria-selected={o.value === value}
                    className={o.value === value ? "active" : ""}
                    onClick={() => onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export function SearchField({
    value,
    onChange,
    placeholder,
    autoFocus,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
}) {
    return (
        <div className="search">
            <Search size={17} />
            <input
                type="search"
                value={value}
                placeholder={placeholder ?? t("search")}
                onChange={(e) => onChange(e.target.value)}
                autoFocus={autoFocus}
                enterKeyHint="search"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
            />
            {value && (
                <button className="clear" onClick={() => onChange("")} aria-label="clear">
                    <XCircle size={17} />
                </button>
            )}
        </div>
    );
}

export function Slider({
    value,
    min,
    max,
    step = 1,
    onChange,
    onCommit,
    disabled,
}: {
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange?: (v: number) => void;
    onCommit?: (v: number) => void;
    disabled?: boolean;
}) {
    const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
    return (
        <input
            type="range"
            className="slider no-drag"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            style={{ ["--pct" as string]: `${pct}%` }}
            onChange={(e) => onChange?.(Number(e.target.value))}
            onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        />
    );
}

export function Empty({
    icon,
    title,
    text,
    action,
}: {
    icon: ReactNode;
    title: string;
    text?: ReactNode;
    action?: ReactNode;
}) {
    return (
        <div className="empty">
            <div className="e-icon">{icon}</div>
            <h3>{title}</h3>
            {text && <p>{text}</p>}
            {action}
        </div>
    );
}

export const Spinner = ({ small }: { small?: boolean }) => (
    <div className={`spinner ${small ? "small" : ""}`} />
);

export const Loading = () => (
    <div className="center-spinner">
        <Spinner />
    </div>
);

export function Notice({ children, info }: { children: ReactNode; info?: boolean }) {
    return (
        <div className={`notice ${info ? "info" : ""}`}>
            <Info size={18} />
            <div>{children}</div>
        </div>
    );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
    return (
        <Empty
            icon={<XCircle size={30} />}
            title={t("loadFailed")}
            text={String((error as Error)?.message ?? error)}
            action={
                retry && (
                    <button className="btn soft" onClick={retry}>
                        {t("retry")}
                    </button>
                )
            }
        />
    );
}

/* ------------------------------------------------------------------ toasts and dialogs */

type ToastKind = "ok" | "error" | "info";
interface ToastItem {
    id: number;
    kind: ToastKind;
    text: string;
    detail?: string;
    closing?: boolean;
}

interface ConfirmOptions {
    title: string;
    text?: ReactNode;
    confirm?: string;
    danger?: boolean;
    /** a check box below the text; confirmCheck tells its state */
    check?: { label: string; value: boolean };
}

interface PromptOptions {
    title: string;
    label?: string;
    value?: string;
    placeholder?: string;
    confirm?: string;
}

export interface ActionItem {
    label: string;
    icon?: ReactNode;
    danger?: boolean;
    onSelect: () => void;
    hidden?: boolean;
}

interface UiApi {
    toast: (kind: ToastKind, text: string, detail?: string) => void;
    confirm: (o: ConfirmOptions) => Promise<boolean>;
    confirmCheck: (o: ConfirmOptions) => Promise<{ ok: boolean; checked: boolean }>;
    prompt: (o: PromptOptions) => Promise<string | null>;
    actions: (title: string, items: ActionItem[]) => void;
    /** runs an action with a success / error toast */
    run: <T>(fn: () => Promise<T>, ok?: string) => Promise<T | undefined>;
}

const UiContext = createContext<UiApi | null>(null);

export const useUi = () => {
    const ui = useContext(UiContext);
    if (!ui) throw new Error("UiProvider missing");
    return ui;
};

export function UiProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const nextId = useRef(1);
    const [confirmState, setConfirmState] = useState<
        (ConfirmOptions & { resolve: (v: boolean) => void }) | null
    >(null);
    const [checked, setChecked] = useState(false);
    const checkedRef = useRef(false);
    checkedRef.current = checked;
    const [promptState, setPromptState] = useState<
        (PromptOptions & { resolve: (v: string | null) => void }) | null
    >(null);
    const [promptValue, setPromptValue] = useState("");
    const [actionState, setActionState] = useState<{ title: string; items: ActionItem[] } | null>(
        null,
    );

    const dismiss = useCallback((id: number) => {
        setToasts((list) => list.map((x) => (x.id === id ? { ...x, closing: true } : x)));
        window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 200);
    }, []);

    const toast = useCallback(
        (kind: ToastKind, text: string, detail?: string) => {
            const id = nextId.current++;
            setToasts((list) => [...list.slice(-2), { id, kind, text, detail }]);
            window.setTimeout(() => dismiss(id), kind === "error" ? 6000 : 2800);
        },
        [dismiss],
    );

    const api = useMemo<UiApi>(
        () => ({
            toast,
            confirm: (o) => new Promise((resolve) => setConfirmState({ ...o, resolve })),
            confirmCheck: (o) =>
                new Promise((resolve) => {
                    setChecked(o.check?.value ?? false);
                    setConfirmState({ ...o, resolve: (ok) => resolve({ ok, checked: checkedRef.current }) });
                }),
            prompt: (o) =>
                new Promise((resolve) => {
                    setPromptValue(o.value ?? "");
                    setPromptState({ ...o, resolve });
                }),
            actions: (title, items) => setActionState({ title, items: items.filter((i) => !i.hidden) }),
            run: async (fn, ok) => {
                try {
                    const result = await fn();
                    if (ok) toast("ok", ok);
                    return result;
                } catch (e) {
                    toast("error", t("actionFailed"), String((e as Error)?.message ?? e));
                    return undefined;
                }
            },
        }),
        [toast],
    );

    const closeConfirm = (v: boolean) => {
        confirmState?.resolve(v);
        setConfirmState(null);
    };
    const closePrompt = (v: string | null) => {
        promptState?.resolve(v);
        setPromptState(null);
    };

    return (
        <UiContext.Provider value={api}>
            {children}
            <div className="toasts" aria-live="polite">
                {toasts.map((x) => (
                    <div
                        key={x.id}
                        className={`toast ${x.kind} ${x.closing ? "closing" : ""}`}
                        onClick={() => dismiss(x.id)}
                    >
                        <span className="t-icon">
                            {x.kind === "ok" ? (
                                <CheckCircle2 size={22} />
                            ) : x.kind === "error" ? (
                                <XCircle size={22} />
                            ) : (
                                <Info size={22} />
                            )}
                        </span>
                        <div className="t-body">
                            <div>{x.text}</div>
                            {x.detail && <div className="t-detail">{x.detail}</div>}
                        </div>
                    </div>
                ))}
            </div>

            <Sheet
                open={!!confirmState}
                onClose={() => closeConfirm(false)}
                title={confirmState?.title}
                footer={
                    <>
                        <button className="btn" onClick={() => closeConfirm(false)}>
                            {t("cancel")}
                        </button>
                        <button
                            className={`btn ${confirmState?.danger ? "danger" : "primary"}`}
                            onClick={() => closeConfirm(true)}
                        >
                            {confirmState?.confirm ?? t("ok")}
                        </button>
                    </>
                }
            >
                <div className="muted">{confirmState?.text}</div>
                {confirmState?.check && (
                    <div className="list mt">
                        <SwitchRow title={confirmState.check.label} checked={checked} onChange={setChecked} />
                    </div>
                )}
            </Sheet>

            <Sheet
                open={!!promptState}
                onClose={() => closePrompt(null)}
                title={promptState?.title}
                footer={
                    <>
                        <button className="btn" onClick={() => closePrompt(null)}>
                            {t("cancel")}
                        </button>
                        <button
                            className="btn primary"
                            disabled={!promptValue.trim()}
                            onClick={() => closePrompt(promptValue.trim())}
                        >
                            {promptState?.confirm ?? t("save")}
                        </button>
                    </>
                }
            >
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (promptValue.trim()) closePrompt(promptValue.trim());
                    }}
                >
                    <div className="field">
                        {promptState?.label && <label>{promptState.label}</label>}
                        <input
                            className="input"
                            autoFocus
                            value={promptValue}
                            placeholder={promptState?.placeholder}
                            onChange={(e) => setPromptValue(e.target.value)}
                        />
                    </div>
                </form>
            </Sheet>

            <Sheet
                open={!!actionState}
                onClose={() => setActionState(null)}
                bare
                className="actions-sheet"
            >
                {actionState?.title && <div className="action-title">{actionState.title}</div>}
                <div className="list">
                    {actionState?.items.map((item) => (
                        <Row
                            key={item.label}
                            icon={item.icon}
                            iconColor={item.danger ? "var(--danger)" : undefined}
                            title={item.label}
                            danger={item.danger}
                            onClick={() => {
                                setActionState(null);
                                window.setTimeout(item.onSelect, 60);
                            }}
                            chevron={false}
                        />
                    ))}
                </div>
                <button className="btn block mt" onClick={() => setActionState(null)}>
                    {t("cancel")}
                </button>
            </Sheet>
        </UiContext.Provider>
    );
}

export const CloseX = X;

/** length of a chapter, with its start below */
export function ChapterTime({ starts, i, total }: { starts: number[]; i: number; total?: number }) {
    const len = chapterLength(starts, i, total);
    return (
        <span className="chapter-time">
            <span>{len !== undefined ? duration(len) : "–:–"}</span>
            <span className="start">{t("fromTime", { t: duration(starts[i]) })}</span>
        </span>
    );
}
