import { Check, ChevronRight, Minus } from "lucide-react";
import { useMemo, useState } from "react";
import { checkedToList, leaves, listToChecked, type RightsNode } from "../../lib/rightsTree";
import { t } from "../../lib/i18n";
import { SearchField } from "../../ui/kit";

/** the name of a right / node of the tree */
export const rightName = (node: { kind?: string; label: string; pattern: string }) => {
    switch (node.kind) {
        case "all":
            return t("rightsAll");
        case "scope":
            return t(`scope_${node.label}` as never) || node.label;
        case "settings":
            return t("right_box.settings" as never);
        case "group":
        case "setting":
            return node.label;
        default:
            return t(`right_${node.pattern}` as never);
    }
};

/**
 * Rights as a tree of check boxes (everything > area > right > single box settings). A ticked
 * node is written as its pattern; patterns the tree can not show are kept as they are.
 */
export function RightsTree({ tree, value, onChange }: { tree: RightsNode; value: string; onChange: (v: string) => void }) {
    const { checked, extra } = useMemo(() => listToChecked(tree, value), [tree, value]);
    const set = useMemo(() => new Set(checked), [checked]);
    const [open, setOpen] = useState<Set<string>>(() => new Set([tree.key]));
    const [filter, setFilter] = useState("");
    const needle = filter.trim().toLowerCase();

    const state = (node: RightsNode): "on" | "off" | "some" => {
        const l = leaves(node);
        const n = l.filter((x) => set.has(x.key)).length;
        return n === 0 ? "off" : n === l.length ? "on" : "some";
    };
    const toggle = (node: RightsNode) => {
        const keys = leaves(node).map((l) => l.key);
        const next = new Set(set);
        if (state(node) === "on") keys.forEach((k) => next.delete(k));
        else keys.forEach((k) => next.add(k));
        onChange(checkedToList(tree, [...next], extra));
    };
    const matches = (node: RightsNode): boolean =>
        !needle || rightName(node).toLowerCase().includes(needle) || node.pattern.toLowerCase().includes(needle) || Boolean(node.children?.some(matches));

    const render = (node: RightsNode, depth: number) => {
        if (!matches(node)) return null;
        const s = state(node);
        const isOpen = open.has(node.key) || Boolean(needle);
        const kids = node.children ?? [];
        return (
            <div key={node.key}>
                <div className="tree-row" style={{ paddingLeft: 8 + depth * 18 }}>
                    {kids.length ? (
                        <button
                            type="button"
                            className="tree-caret"
                            aria-label="toggle"
                            onClick={() =>
                                setOpen((cur) => {
                                    const next = new Set(cur);
                                    if (next.has(node.key)) next.delete(node.key);
                                    else next.add(node.key);
                                    return next;
                                })
                            }
                        >
                            <ChevronRight size={16} style={{ transform: isOpen ? "rotate(90deg)" : undefined, transition: "transform 0.15s" }} />
                        </button>
                    ) : (
                        <span className="tree-caret" />
                    )}
                    <button type="button" className="tree-label" onClick={() => toggle(node)}>
                        <span className={`tree-check ${s}`}>{s === "on" ? <Check size={13} strokeWidth={3} /> : s === "some" ? <Minus size={13} strokeWidth={3} /> : null}</span>
                        <span className={node.kind === "setting" ? "small" : ""}>{rightName(node)}</span>
                    </button>
                </div>
                {isOpen && kids.map((k) => render(k, depth + 1))}
            </div>
        );
    };

    return (
        <div className="tree">
            <div style={{ padding: "8px 8px 4px" }}>
                <SearchField value={filter} onChange={setFilter} placeholder={t("searchRights")} />
            </div>
            {render(tree, 0)}
            {extra.length > 0 && <div className="small muted" style={{ padding: "6px 12px" }}>{t("rightsExtra", { v: extra.join(", ") })}</div>}
        </div>
    );
}
