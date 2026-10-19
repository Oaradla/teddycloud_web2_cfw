import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface LightboxItem {
    src: string;
    alt: string;
}

const MAX_ZOOM = 5;
const TAP_ZOOM = 2.5;

/**
 * an image large on the whole screen: a tap or double click zooms in and out, two fingers or the
 * wheel zoom, a finger pans while zoomed; swipe sideways for the next image, down to close
 */
export function Lightbox({ items, index, onClose }: { items: LightboxItem[]; index: number; onClose: () => void }) {
    const [at, setAt] = useState(index);
    const [view, setView] = useState({ s: 1, x: 0, y: 0 });
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const gesture = useRef<{ x: number; y: number; t: number; view: typeof view; dist: number; moved: boolean } | null>(null);
    const item = items[at];
    const many = items.length > 1;

    const go = (d: number) => {
        setAt((i) => (i + d + items.length) % items.length);
        setView({ s: 1, x: 0, y: 0 });
    };

    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowLeft" && many) go(-1);
            else if (e.key === "ArrowRight" && many) go(1);
        };
        document.addEventListener("keydown", key);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", key);
            document.body.style.overflow = overflow;
        };
    }, [many, onClose]);

    /** zoom to scale s keeping the screen point (px, py) where it is */
    const zoomAt = (s: number, px: number, py: number, from = view) => {
        s = Math.min(MAX_ZOOM, Math.max(1, s));
        if (s === 1) return { s: 1, x: 0, y: 0 };
        const cx = px - window.innerWidth / 2;
        const cy = py - window.innerHeight / 2;
        return { s, x: cx - ((cx - from.x) * s) / from.s, y: cy - ((cy - from.y) * s) / from.s };
    };

    const distance = () => {
        const [a, b] = [...pointers.current.values()];
        return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };

    const down = (e: React.PointerEvent) => {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        gesture.current = { x: e.clientX, y: e.clientY, t: Date.now(), view, dist: distance(), moved: pointers.current.size > 1 };
    };

    const move = (e: React.PointerEvent) => {
        const g = gesture.current;
        if (!g || !pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        if (Math.hypot(dx, dy) > 8) g.moved = true;
        if (pointers.current.size === 2 && g.dist > 0) {
            const [a, b] = [...pointers.current.values()];
            setView(zoomAt((g.view.s * distance()) / g.dist, (a.x + b.x) / 2, (a.y + b.y) / 2, g.view));
        } else if (pointers.current.size === 1 && g.view.s > 1) {
            setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
        } else if (pointers.current.size === 1) {
            setView({ s: 1, x: many ? dx : 0, y: dy > 0 && Math.abs(dy) > Math.abs(dx) ? dy : 0 });
        }
    };

    const up = (e: React.PointerEvent) => {
        const g = gesture.current;
        pointers.current.delete(e.pointerId);
        if (!g || pointers.current.size > 0) return;
        gesture.current = null;
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        if (!g.moved) {
            const onImage = (e.target as Element).tagName === "IMG";
            if (view.s > 1) setView({ s: 1, x: 0, y: 0 });
            else if (onImage) setView(zoomAt(TAP_ZOOM, e.clientX, e.clientY));
            else onClose();
            return;
        }
        if (g.view.s === 1 && pointers.current.size === 0) {
            if (many && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) return go(dx < 0 ? 1 : -1);
            if (dy > 100 && dy > Math.abs(dx)) return onClose();
            setView({ s: 1, x: 0, y: 0 });
        }
    };

    const wheel = (e: React.WheelEvent) => setView(zoomAt(view.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY));

    const settling = gesture.current === null;
    return createPortal(
        <div className="lightbox" role="dialog" aria-label={item.alt || undefined}>
            <div
                className="lightbox-stage"
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onWheel={wheel}
                onDoubleClick={(e) => e.preventDefault()}
            >
                <img
                    src={item.src}
                    alt={item.alt}
                    draggable={false}
                    style={{
                        transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
                        transition: settling ? "transform 0.2s ease-out" : "none",
                        opacity: view.s === 1 && view.y > 0 ? Math.max(0.3, 1 - view.y / 400) : 1,
                    }}
                />
            </div>
            <button className="lightbox-btn close" onClick={onClose} aria-label="Close">
                <X size={22} />
            </button>
            {many && (
                <>
                    <button className="lightbox-btn prev" onClick={() => go(-1)} aria-label="Previous">
                        <ChevronLeft size={26} />
                    </button>
                    <button className="lightbox-btn next" onClick={() => go(1)} aria-label="Next">
                        <ChevronRight size={26} />
                    </button>
                </>
            )}
            {(item.alt || many) && (
                <div className="lightbox-caption">
                    {item.alt}
                    {many && <span className="muted"> {at + 1} / {items.length}</span>}
                </div>
            )}
        </div>,
        document.body,
    );
}
