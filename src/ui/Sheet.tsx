import { X } from "lucide-react";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface SheetProps {
    open: boolean;
    onClose: () => void;
    title?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    /** fills the screen height on phones */
    full?: boolean;
    wide?: boolean;
    headerRight?: ReactNode;
    className?: string;
    /** no close button / title row */
    bare?: boolean;
}

// open sheets, the last one is on top; each has a history entry so the back button closes it
const stack: { close: () => void }[] = [];
let ignorePops = 0;

window.addEventListener("popstate", () => {
    if (ignorePops > 0) {
        ignorePops--;
        return;
    }
    const top = stack.pop();
    if (top) top.close();
});

/**
 * Bottom sheet on phones, centered dialog on large screens. Closes by swiping it down, by the
 * back button / gesture of the phone (a history entry is pushed while it is open), by Escape
 * and by tapping the backdrop.
 */
export function Sheet({
    open,
    onClose,
    title,
    children,
    footer,
    full,
    wide,
    headerRight,
    className = "",
    bare,
}: SheetProps) {
    const [mounted, setMounted] = useState(open);
    const [closing, setClosing] = useState(false);
    const sheetRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (open) {
            setMounted(true);
            setClosing(false);
        } else if (mounted) {
            setClosing(true);
            const timer = window.setTimeout(() => {
                setMounted(false);
                setClosing(false);
            }, 220);
            return () => window.clearTimeout(timer);
        }
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    // back button closes the (topmost) sheet
    useEffect(() => {
        if (!open) return;
        const entry = { close: () => onCloseRef.current(), popped: false };
        entry.close = () => {
            entry.popped = true;
            onCloseRef.current();
        };
        stack.push(entry);
        document.documentElement.style.overflow = "hidden";
        window.history.pushState({ ...(window.history.state ?? {}), tcSheet: stack.length }, "");
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && stack[stack.length - 1] === entry) onCloseRef.current();
        };
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            const at = stack.indexOf(entry);
            if (at >= 0) stack.splice(at, 1);
            if (!stack.length) document.documentElement.style.overflow = "";
            // closed in the app: drop its history entry as well (not when the app navigated
            // away meanwhile, going back would undo that)
            if (!entry.popped && window.history.state?.tcSheet) {
                ignorePops++;
                window.history.back();
            }
        };
    }, [open]);

    // swipe down to close (on the grip and the header, or the body when scrolled to the top)
    const drag = useRef<{ y: number; dy: number; active: boolean } | null>(null);
    const onTouchStart = useCallback((e: React.TouchEvent) => {
        const target = e.target as HTMLElement;
        const body = sheetRef.current?.querySelector(".sheet-body");
        const fromBody = body?.contains(target);
        if (fromBody && body && body.scrollTop > 0) return;
        if (target.closest("input, textarea, select, .no-drag, input[type=range]")) return;
        drag.current = { y: e.touches[0].clientY, dy: 0, active: !fromBody };
    }, []);
    const onTouchMove = useCallback((e: React.TouchEvent) => {
        const d = drag.current;
        if (!d || !sheetRef.current) return;
        const dy = e.touches[0].clientY - d.y;
        if (!d.active) {
            if (dy > 8) d.active = true;
            else if (dy < -4) {
                drag.current = null;
                return;
            }
        }
        if (!d.active) return;
        d.dy = Math.max(0, dy);
        if (window.matchMedia("(min-width: 760px)").matches) return;
        sheetRef.current.style.transition = "none";
        sheetRef.current.style.transform = `translateY(${d.dy}px)`;
    }, []);
    const onTouchEnd = useCallback(() => {
        const d = drag.current;
        drag.current = null;
        const el = sheetRef.current;
        if (!d || !el) return;
        el.style.transition = "transform 0.22s ease-out";
        if (d.dy > 110) {
            el.style.transform = "translateY(100%)";
            window.setTimeout(() => onCloseRef.current(), 160);
        } else {
            el.style.transform = "";
        }
    }, []);

    if (!mounted) return null;

    return createPortal(
        <>
            <div className={`backdrop ${closing ? "closing" : ""}`} onClick={onClose} />
            <div
                ref={sheetRef}
                className={`sheet ${full ? "full" : ""} ${wide ? "wide" : ""} ${closing ? "closing" : ""} ${className}`}
                role="dialog"
                aria-modal="true"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                <div className="sheet-grip" />
                {!bare && (
                    <div className="sheet-head">
                        <h2>{title}</h2>
                        {headerRight}
                        <button className="icon-btn filled small-x" onClick={onClose} aria-label="close">
                            <X size={18} />
                        </button>
                    </div>
                )}
                <div className="sheet-body">{children}</div>
                {footer && <div className="sheet-foot">{footer}</div>}
            </div>
        </>,
        document.body,
    );
}
