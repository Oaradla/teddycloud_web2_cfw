import { useQuery } from "@tanstack/react-query";
import { tc } from "../api/tc";

const GITHUB = "https://github.com/toniebox-reverse-engineering/teddycloud/";

/** whether teddyCloud and, when it is switched on, the Boxine cloud answer */
export function useServerStatus() {
    return useQuery({
        queryKey: ["serverStatus"],
        queryFn: async () => {
            const cloud = (await tc.getSetting("cloud.enabled")) === "true";
            const [server, boxine] = await Promise.all([tc.timeOk(false), cloud ? tc.timeOk(true) : Promise.resolve(false)]);
            return { server, cloud, boxine };
        },
        refetchInterval: 60_000,
    });
}

/** a newer teddyCloud on GitHub than the one running; develop builds compare the commit */
export function useNewVersion() {
    return useQuery({
        queryKey: ["newVersion"],
        queryFn: async () => {
            const [id, sha] = await Promise.all([tc.getSetting("internal.version.id"), tc.getSetting("internal.version.git_sha")]);
            if (!id || !sha) return null;
            const develop = id.endsWith("X.X.X");
            const latest = await tc.latestVersion(develop);
            if (develop)
                return latest.sha && !sha.includes("unknown") && sha !== latest.sha ? { develop, url: GITHUB + "tree/" + latest.sha } : null;
            return latest.tag_name && id.replace("v", "tc_v") !== latest.tag_name ? { develop, url: GITHUB + "releases/tag/" + latest.tag_name } : null;
        },
        staleTime: 6 * 3600_000,
        retry: false,
    });
}
