import { listAllows, type AclRight } from "../api/auth";

/** one node of the rights tree; "pattern" is what the list says when the whole node is ticked */
export type RightsNode = {
    key: string;
    pattern: string;
    kind: "all" | "scope" | "right" | "settings" | "group" | "setting";
    label: string;
    children?: RightsNode[];
};

export type SettingName = { id: string; label?: string };

const SCOPES = ["box", "tonie", "folder", "users"];

/**
 * Tree of the rights a non-admin can have: everything > scope > right, and below
 * "box.settings" the single box settings grouped by the part before the first dot.
 */
export function buildRightsTree(
    rights: AclRight[],
    settings: SettingName[],
    scopes: string[] = SCOPES,
    groupTitles: Record<string, string> = {},
): RightsNode {
    const scopeNodes: RightsNode[] = [];
    for (const scope of scopes) {
        const names = rights
            .filter((r) => !r.adminOnly && r.name !== "box.setting")
            .map((r) => r.name)
            .filter((n) => n.split(".")[0] === scope);
        if (names.length === 0) {
            continue;
        }
        const children = names.map((name): RightsNode => {
            if (name === "box.settings" && settings.length > 0) {
                return {
                    key: name,
                    pattern: name,
                    kind: "settings",
                    label: name,
                    children: settingGroups(settings, groupTitles),
                };
            }
            return { key: name, pattern: name, kind: "right", label: name };
        });
        scopeNodes.push(
            children.length === 1 && children[0].kind === "right"
                ? children[0]
                : {
                      key: `${scope}.*`,
                      pattern: `${scope}.*`,
                      kind: "scope",
                      label: scope,
                      children,
                  },
        );
    }
    /* a tree of one scope ticks "tonie.*", not every right there is */
    const pattern = scopes.length === 1 ? `${scopes[0]}.*` : "*";
    return { key: pattern, pattern, kind: "all", label: pattern, children: scopeNodes };
}

function settingGroups(settings: SettingName[], titles: Record<string, string>): RightsNode[] {
    const groups = new Map<string, RightsNode[]>();
    for (const s of [...settings].sort((a, b) => a.id.localeCompare(b.id))) {
        const dot = s.id.indexOf(".");
        const group = dot > 0 ? s.id.slice(0, dot) : "";
        const list = groups.get(group) ?? [];
        list.push({
            key: `box.setting:${s.id}`,
            pattern: `box.setting:${s.id}`,
            kind: "setting",
            label: s.label || s.id,
        });
        groups.set(group, list);
    }
    const out: RightsNode[] = [];
    for (const [group, children] of groups) {
        if (group === "" || children.length === 1) {
            out.push(...children);
        } else {
            out.push({
                key: `box.setting:${group}.*`,
                pattern: `box.setting:${group}.*`,
                kind: "group",
                label: titles[group] || group,
                children,
            });
        }
    }
    return out;
}

export function leaves(node: RightsNode): RightsNode[] {
    return node.children ? node.children.flatMap(leaves) : [node];
}

function allNodes(node: RightsNode): RightsNode[] {
    return [node, ...(node.children ?? []).flatMap(allNodes)];
}

function tokens(list: string | undefined): string[] {
    return (list ?? "").split(/[,\s]+/).filter(Boolean);
}

/** ticked leaves for a list, and the entries the tree cannot show (kept as they are) */
export function listToChecked(
    tree: RightsNode,
    list: string | undefined,
): { checked: string[]; extra: string[] } {
    const all = leaves(tree);
    const checked = all.filter((l) => listAllows(list, l.pattern)).map((l) => l.key);
    const extra = tokens(list).filter((token) => !all.some((l) => listAllows(token, l.pattern)));
    return { checked, extra };
}

/** shortest list for the ticked leaves: a fully ticked node is written as its pattern */
export function checkedToList(tree: RightsNode, checked: string[], extra: string[] = []): string {
    const set = new Set(checked);
    const out: string[] = [];
    const walk = (node: RightsNode) => {
        const nodeLeaves = leaves(node);
        if (nodeLeaves.every((l) => set.has(l.key))) {
            out.push(node.pattern);
            return;
        }
        node.children?.forEach(walk);
    };
    walk(tree);
    const known = new Set(allNodes(tree).map((n) => n.pattern));
    return [...out, ...extra.filter((e) => !known.has(e) && !out.includes(e))].join(", ");
}
