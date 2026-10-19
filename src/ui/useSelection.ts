import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Multi selection of list items: long press on touch screens starts it (like native apps),
 * a checkbox does it with the mouse. While selecting, a tap toggles an item. Escape ends it.
 */
export function useSelection(onOpen: (id: string) => void, order: string[] = []) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [selecting, setSelecting] = useState(false);
    const press = useRef<{ id: string; x: number; y: number; timer: number; fired: boolean } | null>(null);

    const anchor = useRef<string | null>(null);
    const orderRef = useRef(order);
    orderRef.current = order;

    /** with range (shift key) everything from the last clicked item to this one is selected */
    const toggle = useCallback((id: string, range = false) => {
        setSelecting(true);
        const list = orderRef.current;
        // read now: the updater below runs later, after the anchor moved to this item
        const from = anchor.current ? list.indexOf(anchor.current) : -1;
        const to = list.indexOf(id);
        setSelected((cur) => {
            const next = new Set(cur);
            if (range && from >= 0 && to >= 0) {
                const [a, b] = from < to ? [from, to] : [to, from];
                for (let i = a; i <= b; i++) next.add(list[i]);
            } else if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        anchor.current = id;
    }, []);

    const clear = useCallback(() => {
        anchor.current = null;
        setSelecting(false);
        setSelected(new Set());
    }, []);

    useEffect(() => {
        if (!selecting) return;
        const key = (e: KeyboardEvent) => e.key === "Escape" && clear();
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, [selecting, clear]);

    /** props for an item: long press, tap, keyboard */
    const itemProps = (id: string) => ({
        onPointerDown: (e: React.PointerEvent) => {
            if (e.pointerType === "mouse") return;
            const timer = window.setTimeout(() => {
                if (!press.current) return;
                press.current.fired = true;
                if ("vibrate" in navigator) navigator.vibrate?.(15);
                toggle(id);
            }, 450);
            press.current = { id, x: e.clientX, y: e.clientY, timer, fired: false };
        },
        onPointerMove: (e: React.PointerEvent) => {
            const p = press.current;
            if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) {
                window.clearTimeout(p.timer);
                press.current = null;
            }
        },
        onPointerUp: () => {
            const p = press.current;
            if (p && !p.fired) {
                window.clearTimeout(p.timer);
                press.current = null;
            }
        },
        onPointerCancel: () => {
            if (press.current) window.clearTimeout(press.current.timer);
            press.current = null;
        },
        onContextMenu: (e: React.MouseEvent) => {
            // the long press selects; no browser menu on touch screens
            if (press.current || selecting) e.preventDefault();
        },
        onClick: (e: React.MouseEvent) => {
            if (press.current?.fired) {
                press.current = null;
                return;
            }
            if (e.shiftKey) {
                // shift click selects ranges, like in a file manager
                window.getSelection()?.removeAllRanges();
                toggle(id, true);
            } else if (e.ctrlKey || e.metaKey || selecting) toggle(id);
            else onOpen(id);
        },
        onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter") selecting ? toggle(id) : onOpen(id);
            if (e.key === " ") {
                e.preventDefault();
                toggle(id);
            }
        },
    });

    return { selected, selecting, setSelecting, setSelected, toggle, clear, itemProps };
}
