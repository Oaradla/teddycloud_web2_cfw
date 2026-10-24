import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { backendUrl } from "../api/client";
import { tc } from "../api/tc";
import type { Box, CfwBox, Tag } from "../api/types";

export const keys = {
    boxes: ["boxes"] as const,
    boxModels: ["boxModels"] as const,
    boxState: (id: string) => ["boxState", id] as const,
    cfwBoxes: ["cfwBoxes"] as const,
    cfwStatus: (id: string) => ["cfwStatus", id] as const,
    tags: (overlay: string) => ["tags", overlay] as const,
    allTags: ["allTags"] as const,
    tag: (ruid: string, overlay: string) => ["tag", ruid, overlay] as const,
    settings: (overlay: string) => ["settings", overlay] as const,
    files: (path: string) => ["files", path] as const,
    customModels: ["customModels"] as const,
    auth: ["auth"] as const,
};

export const useBoxes = () =>
    useQuery({ queryKey: keys.boxes, queryFn: tc.boxes, staleTime: 30_000 });

export const useBoxModels = () =>
    useQuery({ queryKey: keys.boxModels, queryFn: tc.boxModels, staleTime: Infinity });

export const useBoxImage = (box?: Box) => {
    const { data } = useBoxModels();
    return data?.find((m) => m.id === box?.boxModel)?.img_src;
};

export const useBoxState = (id: string) =>
    useQuery({
        queryKey: keys.boxState(id),
        queryFn: () => tc.boxState(id),
        refetchInterval: 15_000,
        enabled: Boolean(id),
    });

/** null when the server has no custom firmware support */
export const useCfwBoxes = () =>
    useQuery({ queryKey: keys.cfwBoxes, queryFn: tc.cfwBoxes, staleTime: 15_000, refetchInterval: 30_000 });

export const useCfwBox = (id: string): CfwBox | undefined => {
    const { data } = useCfwBoxes();
    return data?.find((b) => b.id.toLowerCase() === id.toLowerCase());
};

export const useTags = (overlay: string) =>
    useQuery({ queryKey: keys.tags(overlay), queryFn: () => tc.tags(overlay || undefined), staleTime: 30_000 });

export interface TagWithBox extends Tag {
    /** overlay (box ID) the tag was read with, "" for the server defaults */
    overlay: string;
    /** boxes that know the tag */
    boxIds: string[];
}

/** all tags of all boxes, each one once */
export const useAllTags = () => {
    const boxes = useBoxes();
    return useQuery({
        queryKey: keys.allTags,
        enabled: boxes.isSuccess,
        staleTime: 30_000,
        queryFn: async (): Promise<TagWithBox[]> => {
            const list = boxes.data ?? [];
            const perBox = await Promise.all(
                list.map((b) => tc.tags(b.ID).then((tags) => ({ id: b.ID, tags })).catch(() => ({ id: b.ID, tags: [] as Tag[] }))),
            );
            const global = await tc.tags().catch(() => [] as Tag[]);
            const map = new Map<string, TagWithBox>();
            for (const { id, tags } of perBox) {
                for (const tag of tags) {
                    const known = map.get(tag.ruid);
                    if (known) {
                        known.boxIds.push(id);
                        // prefer the entry that has content
                        if (!known.valid && tag.valid) map.set(tag.ruid, { ...tag, overlay: id, boxIds: known.boxIds });
                    } else map.set(tag.ruid, { ...tag, overlay: id, boxIds: [id] });
                }
            }
            for (const tag of global) if (!map.has(tag.ruid)) map.set(tag.ruid, { ...tag, overlay: "", boxIds: [] });
            return [...map.values()];
        },
    });
};

/**
 * whether the boxes know different tonies (own content directories); with one shared content
 * directory every box lists the same tonies and a filter by box means nothing
 */
export const useBoxesDiffer = () => {
    const boxes = useBoxes();
    const tags = useAllTags();
    const n = boxes.data?.length ?? 0;
    return n > 1 && Boolean(tags.data?.some((x) => x.type !== "system" && x.boxIds.length > 0 && x.boxIds.length < n));
};

export const useTag = (ruid: string, overlay: string) =>
    useQuery({
        queryKey: keys.tag(ruid, overlay),
        queryFn: () => tc.tag(ruid, overlay || undefined),
        enabled: Boolean(ruid),
    });

export const useSettings = (overlay: string) =>
    useQuery({ queryKey: keys.settings(overlay), queryFn: () => tc.settingsIndex(overlay || undefined) });

/** one setting as text, also for users who may not list it with all settings */
export const useSetting = (key: string, overlay = "") =>
    useQuery({ queryKey: [...keys.settings(overlay), key], queryFn: () => tc.getSetting(key, overlay || undefined) });

export const useFiles = (path: string) =>
    useQuery({ queryKey: keys.files(path), queryFn: () => tc.files(path) });

export const useCustomModels = () =>
    useQuery({ queryKey: keys.customModels, queryFn: tc.customModels });

/** refreshes tag lists after a change of a tag */
export const useInvalidateTags = () => {
    const qc = useQueryClient();
    return () => {
        qc.invalidateQueries({ queryKey: ["tags"] });
        qc.invalidateQueries({ queryKey: keys.allTags });
        qc.invalidateQueries({ queryKey: ["tag"] });
    };
};

/**
 * Server sent events of teddyCloud: a box placing a tonie, starting playback etc. They carry
 * no box ID, so they just refresh the box states (debounced).
 */
export function useLiveEvents() {
    const qc = useQueryClient();
    useEffect(() => {
        let source: EventSource | null = null;
        let timer = 0;
        let retry = 0;
        const refresh = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                qc.invalidateQueries({ queryKey: ["boxState"] });
                qc.invalidateQueries({ queryKey: ["cfwStatus"] });
                qc.invalidateQueries({ queryKey: keys.cfwBoxes });
            }, 700);
        };
        const connect = () => {
            source = new EventSource(backendUrl("/api/sse"));
            const names = ["TagValid", "TagInvalid", "playback", "ContentAudioId", "ContentTitle", "charger", "cfw-battery", "VolumeLevel", "keep-alive"];
            for (const n of names) if (n !== "keep-alive") source.addEventListener(n, refresh);
            source.onerror = () => {
                source?.close();
                retry = window.setTimeout(connect, 10_000);
            };
        };
        connect();
        const onVisible = () => {
            if (document.visibilityState === "visible") refresh();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            source?.close();
            window.clearTimeout(timer);
            window.clearTimeout(retry);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [qc]);
}

/** the list of a library folder, from the cache when it is fresh enough */
export const useFetchFiles = () => {
    const qc = useQueryClient();
    return (path: string) => qc.fetchQuery({ queryKey: keys.files(path), queryFn: () => tc.files(path), staleTime: 60_000 });
};

/**
 * Loads the sub folders of a folder in the background, one after the other, so opening one is
 * instant (teddyCloud needs a while for folders with many TAF files). Fresh cache entries are skipped.
 */
export function usePrefetchSubfolders(path: string, files: { name: string; isDir: boolean }[] | undefined) {
    const qc = useQueryClient();
    useEffect(() => {
        if (!files) return;
        let cancelled = false;
        const dirs = files.filter((f) => f.isDir && f.name !== "." && f.name !== "..").map((f) => `${path.replace(/\/$/, "")}/${f.name}`);
        const run = async () => {
            // let the visible folder render and load its pictures first
            await new Promise((r) => window.setTimeout(r, 800));
            for (const dir of dirs) {
                if (cancelled) return;
                const state = qc.getQueryState(keys.files(dir));
                if (state?.dataUpdatedAt && Date.now() - state.dataUpdatedAt < 5 * 60_000) continue;
                await qc.prefetchQuery({ queryKey: keys.files(dir), queryFn: () => tc.files(dir) }).catch(() => undefined);
            }
        };
        run();
        return () => {
            cancelled = true;
        };
    }, [path, files, qc]);
}
