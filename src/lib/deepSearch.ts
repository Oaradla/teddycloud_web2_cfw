import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { tc } from "../api/tc";

/**
 * the search through a folder and everything below it: by file name, series and episode;
 * the tree is read once per folder and kept a minute
 */
export function useDeepSearch(root: string, query: string, enabled: boolean) {
    const q = query.trim().toLowerCase();
    const active = enabled && q.length >= 2;
    const tree = useQuery({ queryKey: ["walkTree", root], queryFn: () => tc.walkTree(root), enabled: active, staleTime: 60_000 });
    const hits = useMemo(
        () =>
            (tree.data ?? [])
                .filter(({ entry }) => `${entry.name} ${entry.tonieInfo?.series ?? ""} ${entry.tonieInfo?.episode ?? ""}`.toLowerCase().includes(q))
                .slice(0, 300),
        [tree.data, q],
    );
    return { active, loading: active && tree.isFetching && !tree.data, hits };
}
