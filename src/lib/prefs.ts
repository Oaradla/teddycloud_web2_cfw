// small per-device preferences (theme, language, view options); storage may be unavailable
const PREFIX = "tc-web2.";

export const getPref = (key: string, fallback: string): string => {
    try {
        return localStorage.getItem(PREFIX + key) ?? fallback;
    } catch {
        return fallback;
    }
};

export const setPref = (key: string, value: string) => {
    try {
        localStorage.setItem(PREFIX + key, value);
    } catch {
        /* ignore */
    }
};

export type Theme = "auto" | "light" | "dark";

export const applyTheme = (theme: Theme) => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    const dark =
        theme === "dark" || (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document
        .querySelectorAll('meta[name="theme-color"]')
        .forEach((m) => m.setAttribute("content", dark ? "#111214" : "#f6f5f2"));
};
