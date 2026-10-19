import { RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** how far the finger has to pull (after damping) before letting go reloads the page */
const THRESHOLD = 70;
const MAX = 110;

/** a touch that belongs to something else: a sheet with its own swipe, a slider, a scrolled list */
function claimed(target: EventTarget | null): boolean {
    if (document.documentElement.classList.contains("no-pull")) return true; // something must not be broken off
    for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
        if (el.matches(".sheet, .backdrop, .lightbox, input, textarea, select, [data-no-pull]")) return true;
        if (el.scrollTop > 0) return true;
    }
    return document.querySelector(".sheet, .lightbox") !== null;
}

/**
 * pull down at the top of the page to reload it, as apps do; only in the installed app, where
 * the browser offers no reload of its own
 */
export function PullToRefresh() {
    const [pull, setPull] = useState(0);
    const [busy, setBusy] = useState(false);
    const start = useRef<{ x: number; y: number } | null>(null);
    const current = useRef(0);

    useEffect(() => {
        if (!document.documentElement.classList.contains("standalone")) return;
        const set = (v: number) => {
            current.current = v;
            setPull(v);
        };
        const down = (e: TouchEvent) => {
            start.current =
                e.touches.length === 1 && window.scrollY <= 0 && !claimed(e.target)
                    ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
                    : null;
        };
        const move = (e: TouchEvent) => {
            if (!start.current) return;
            const dy = e.touches[0].clientY - start.current.y;
            const dx = Math.abs(e.touches[0].clientX - start.current.x);
            if (window.scrollY > 0 || (current.current === 0 && dx > Math.abs(dy))) {
                start.current = null; // scrolling, or a sideways swipe
                set(0);
                return;
            }
            set(dy > 0 ? Math.min(MAX, dy * 0.5) : 0);
        };
        const up = () => {
            if (!start.current) return;
            start.current = null;
            if (current.current >= THRESHOLD) {
                setBusy(true);
                window.location.reload();
            } else {
                set(0);
            }
        };
        window.addEventListener("touchstart", down, { passive: true });
        window.addEventListener("touchmove", move, { passive: true });
        window.addEventListener("touchend", up);
        window.addEventListener("touchcancel", up);
        return () => {
            window.removeEventListener("touchstart", down);
            window.removeEventListener("touchmove", move);
            window.removeEventListener("touchend", up);
            window.removeEventListener("touchcancel", up);
        };
    }, []);

    if (pull === 0 && !busy) return null;
    const ready = busy || pull >= THRESHOLD;
    return (
        <div
            className={`pull-refresh ${ready ? "ready" : ""} ${busy ? "busy" : ""}`}
            style={{ transform: `translate(-50%, ${busy ? THRESHOLD : pull}px)` }}
            aria-hidden
        >
            <RotateCw size={20} style={busy ? undefined : { transform: `rotate(${pull * 3}deg)` }} />
        </div>
    );
}
