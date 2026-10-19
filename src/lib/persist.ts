// Keeps lists the app shows first (boxes, tonies, library folders, models) in IndexedDB, so the
// installed app opens with the last known data at once and refreshes it in the background.
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { Query } from "@tanstack/react-query";
import { del, get, set } from "idb-keyval";
import { PREFIX } from "../api/client";

const PERSISTED = new Set(["boxes", "boxModels", "allTags", "tags", "files", "customModels", "cfwBoxes"]);

export const persister = createAsyncStoragePersister({
    storage: {
        getItem: (key) => get<string>(key).then((v) => v ?? null),
        setItem: (key, value) => set(key, value),
        removeItem: (key) => del(key),
    },
    // one cache per teddyCloud (path prefix of a reverse proxy)
    key: `tc-web2-cache:${window.location.host}${PREFIX}`,
    throttleTime: 2000,
});

export const persistOptions = {
    persister,
    maxAge: 7 * 24 * 3600 * 1000,
    buster: "1",
    dehydrateOptions: {
        shouldDehydrateQuery: (q: Query) => q.state.status === "success" && PERSISTED.has(String(q.queryKey[0])),
    },
};
