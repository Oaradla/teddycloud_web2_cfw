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

initLang();
applyTheme(getPref("theme", "auto") as Theme);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
    applyTheme(getPref("theme", "auto") as Theme),
);

const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
if (standalone) document.documentElement.classList.add("standalone");

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

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
            <UiProvider>
                <App />
            </UiProvider>
        </PersistQueryClientProvider>
    </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    });
}
