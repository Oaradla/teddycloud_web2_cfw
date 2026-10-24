import { useEffect, useRef, useState } from "react";
import { getPref } from "../lib/prefs";

const CHARS = "アァイィウゥエェオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** the falling characters of the matrix theme, drawn on a canvas behind the page */
export function MatrixRain() {
    const [on, setOn] = useState(() => getPref("theme", "auto") === "matrix");
    const canvas = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const update = () => setOn(getPref("theme", "auto") === "matrix");
        window.addEventListener("themechange", update);
        return () => window.removeEventListener("themechange", update);
    }, []);
    useEffect(() => {
        const c = canvas.current;
        if (!on || !c || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const ctx = c.getContext("2d")!;
        const size = 16;
        let drops: number[] = [];
        const resize = () => {
            c.width = window.innerWidth;
            c.height = window.innerHeight;
            drops = Array.from({ length: Math.ceil(c.width / size) }, () => Math.random() * -50);
        };
        resize();
        window.addEventListener("resize", resize);
        const timer = window.setInterval(() => {
            ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.fillStyle = "#3cff6e";
            ctx.font = `${size}px monospace`;
            drops.forEach((y, i) => {
                ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], i * size, y * size);
                drops[i] = y * size > c.height && Math.random() > 0.97 ? 0 : y + 1;
            });
        }, 60);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("resize", resize);
        };
    }, [on]);
    return on ? <canvas ref={canvas} className="matrix-rain" aria-hidden="true" /> : null;
}
