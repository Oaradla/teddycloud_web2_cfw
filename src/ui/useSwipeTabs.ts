import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** a touch that belongs to something else: a sheet, a slider, a list that scrolls sideways */
function claimed(target: EventTarget | null): boolean {
    for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
        if (el.matches(".sheet, .backdrop, .lightbox, input, textarea, select, [data-no-swipe]")) return true;
        if (el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
    }
    return document.querySelector(".sheet, .lightbox") !== null;
}

/** on the phone, a sideways swipe on one of the tab pages goes to the tab next to it */
export function useSwipeTabs(tabs: string[]) {
    const { pathname } = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        const index = tabs.indexOf(pathname);
        if (index < 0) return;
        let start: { x: number; y: number; time: number } | null = null;
        const down = (e: TouchEvent) => {
            const touch = e.touches[0];
            // the screen edges are the browser's (back and forward)
            const edge = touch.clientX < 24 || touch.clientX > window.innerWidth - 24;
            start = e.touches.length === 1 && window.innerWidth < 960 && !edge && !claimed(e.target) ? { x: touch.clientX, y: touch.clientY, time: e.timeStamp } : null;
        };
        const up = (e: TouchEvent) => {
            if (!start) return;
            const dx = e.changedTouches[0].clientX - start.x;
            const dy = e.changedTouches[0].clientY - start.y;
            const quick = e.timeStamp - start.time < 600;
            start = null;
            if (!quick || Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy) || window.getSelection()?.toString()) return;
            const next = tabs[index + (dx < 0 ? 1 : -1)];
            if (next) navigate(next);
        };
        window.addEventListener("touchstart", down, { passive: true });
        window.addEventListener("touchend", up);
        return () => {
            window.removeEventListener("touchstart", down);
            window.removeEventListener("touchend", up);
        };
    }, [pathname, tabs, navigate]);
}
