import { ReactNode, RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sheet } from "./Sheet";

const wide = () => window.matchMedia("(min-width: 760px)").matches;

/**
 * A menu that opens at its button on large screens and as a bottom sheet on phones
 * (filter and view options).
 */
export function Popover({
    open,
    onClose,
    anchor,
    title,
    children,
    footer,
    width = 360,
}: {
    open: boolean;
    onClose: () => void;
    anchor: RefObject<HTMLElement | null>;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
    width?: number;
}) {
    const [isWide, setWide] = useState(wide);
    const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);
    const panel = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const mq = window.matchMedia("(min-width: 760px)");
        const on = () => setWide(mq.matches);
        mq.addEventListener("change", on);
        return () => mq.removeEventListener("change", on);
    }, []);

    useLayoutEffect(() => {
        if (!open || !isWide || !anchor.current) return;
        const place = () => {
            const r = anchor.current!.getBoundingClientRect();
            const left = Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12));
            const top = r.bottom + 8;
            setPos({ top, left, maxH: window.innerHeight - top - 16 });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, { passive: true });
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place);
        };
    }, [open, isWide, anchor, width]);

    useEffect(() => {
        if (!open || !isWide) return;
        const down = (e: PointerEvent) => {
            const t = e.target as Node;
            if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
            onClose();
        };
        const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        document.addEventListener("pointerdown", down);
        document.addEventListener("keydown", key);
        return () => {
            document.removeEventListener("pointerdown", down);
            document.removeEventListener("keydown", key);
        };
    }, [open, isWide, onClose, anchor]);

    if (!isWide)
        return (
            <Sheet open={open} onClose={onClose} title={title} footer={footer}>
                {children}
            </Sheet>
        );
    if (!open || !pos) return null;
    return createPortal(
        <div
            ref={panel}
            className="popover"
            role="dialog"
            aria-label={title}
            style={{ top: pos.top, left: pos.left, width, maxHeight: pos.maxH }}
        >
            <div className="popover-body">{children}</div>
            {footer && <div className="popover-foot">{footer}</div>}
        </div>,
        document.body,
    );
}

/** a labelled group of choices inside a filter menu */
export function ChoiceGroup<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: T;
    options: { value: T; label: ReactNode }[];
    onChange: (v: T) => void;
}) {
    return (
        <div className="choice-group">
            <div className="choice-label">{label}</div>
            <div className="choice-options">
                {options.map((o) => (
                    <button
                        key={o.value}
                        type="button"
                        className={`chip ${o.value === value ? "active" : ""}`}
                        onClick={() => onChange(o.value)}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
