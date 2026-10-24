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

/** all preferences of this device, e.g. to take them to another one */
export const allPrefs = (): Record<string, string> => {
    const out: Record<string, string> = {};
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)!;
            if (key.startsWith(PREFIX)) out[key.slice(PREFIX.length)] = localStorage.getItem(key) ?? "";
        }
    } catch {
        /* ignore */
    }
    return out;
};

export type Theme = "auto" | "light" | "dark" | "matrix";

export const applyTheme = (theme: Theme) => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    const dark =
        theme === "dark" ||
        theme === "matrix" || (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document
        .querySelectorAll('meta[name="theme-color"]')
        .forEach((m) => m.setAttribute("content", theme === "matrix" ? "#000000" : dark ? "#111214" : "#f6f5f2"));
    window.dispatchEvent(new Event("themechange"));
};
