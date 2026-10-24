import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initLang } from "./lib/i18n";
import { persistOptions } from "./lib/persist";
import { applyTheme, getPref, Theme } from "./lib/prefs";
import { UiProvider } from "./ui/kit";
import "./styles.css";

applyTheme(getPref("theme", "auto") as Theme);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
    applyTheme(getPref("theme", "auto") as Theme),
);

const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
if (standalone) document.documentElement.classList.add("standalone");

// a browser toolbar over the bottom of the page (it slides away when scrolling) would hide the tab
// bar until then; the keyboard (taller) and zooming are left alone
const viewport = window.visualViewport;
if (viewport) {
    const fit = () => {
        const covered = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
        const toolbar = viewport.scale < 1.01 && covered > 0 && covered < 150 ? covered : 0;
        document.documentElement.style.setProperty("--covered-bottom", `${toolbar}px`);
    };
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    fit();
}

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: true,
            staleTime: 10_000,
            // keep persisted lists for a week; they show at once and refresh in the background
            gcTime: 7 * 24 * 3600 * 1000,
        },
    },
});

// the texts of a further language load first
initLang().then(() =>
    createRoot(document.getElementById("root")!).render(
        <StrictMode>
            <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
                <UiProvider>
                    <App />
                </UiProvider>
            </PersistQueryClientProvider>
        </StrictMode>,
    ),
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    });
}
