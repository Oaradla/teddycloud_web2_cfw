export const GITHUB = "https://github.com/toniebox-reverse-engineering/teddycloud/";

/** the kind of a teddyCloud build by its version id (internal.version.id) */
export const versionKind = (id: string): "develop" | "rc" | "release" =>
    id.includes("-rc") ? "rc" : id.endsWith("X.X.X") ? "develop" : "release";

/** the git tag of a release candidate: v0.7.1-rc2 -> rc_v0.7.1-2, v0.7.1-rc -> rc_v0.7.1 */
export const rcTag = (id: string) =>
    id
        .replace(/^v/, "rc_v")
        .replace(/-rc(\d+)$/, "-$1")
        .replace(/-rc$/, "");

/** [major, minor, patch, candidate] of rc_vX.Y.Z, rc_vX.Y.Z-N or rc_vX.Y.Z-rcN */
export const rcNumbers = (tag: string): number[] | null => {
    const m = tag.match(/^rc_v(\d+)\.(\d+)\.(\d+)(?:-(?:rc)?(\d+))?$/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0)] : null;
};

const compare = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
};

/** the newest release-candidate tag of GitHub's tag refs, if it is newer than the running id */
export const newerRcTag = (
    id: string,
    refs: { ref: string; object?: { type?: string } }[],
): string | undefined => {
    const current = rcNumbers(rcTag(id));
    if (!current) return undefined;
    let newest: { tag: string; numbers: number[] } | undefined;
    for (const r of refs) {
        const tag = r.ref.replace("refs/tags/", "");
        const numbers = rcNumbers(tag);
        if (!numbers || r.object?.type !== "commit") continue;
        if (!newest || compare(numbers, newest.numbers) > 0) newest = { tag, numbers };
    }
    return newest && compare(newest.numbers, current) > 0 ? newest.tag : undefined;
};

/** where on GitHub the running build comes from */
export const buildUrl = (id: string, sha: string) => {
    const kind = versionKind(id);
    if (kind === "rc") return GITHUB + "tree/" + rcTag(id);
    if (kind === "develop") return GITHUB + "tree/" + sha;
    return GITHUB + "releases/tag/tc_" + id;
};
