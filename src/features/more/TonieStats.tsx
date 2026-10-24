import { lang, t } from "../../lib/i18n";
import { tagInfo } from "../../lib/format";
import { useAllTags, useBoxes } from "../../lib/queries";
import { Section } from "../../ui/kit";

const languageName = (code: string) => {
    try {
        return new Intl.DisplayNames([lang()], { type: "language" }).of(code) ?? code;
    } catch {
        return code;
    }
};

/** a part of the whole as a bar, with the numbers as text beside it */
export function Share({ label, n, of }: { label: string; n: number; of: number }) {
    const pct = of ? Math.round((n / of) * 100) : 0;
    return (
        <div className="share" title={`${label}: ${n} / ${of}`}>
            <div className="share-head">
                <span>{label}</span>
                <span className="muted">
                    {n} / {of} · {pct} %
                </span>
            </div>
            <div className="share-bar">
                <span style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

/** how the tonies are set: cloud, live, claimed, and their languages */
export function TonieStats() {
    const tags = useAllTags();
    const boxes = useBoxes();
    const list = (tags.data ?? []).filter((x) => x.type !== "system");
    if (!list.length) return null;
    const count = (f: (x: (typeof list)[number]) => boolean) => list.filter(f).length;
    const languages = new Map<string, number>();
    for (const x of list) {
        const l = tagInfo(x).language || "";
        if (l) languages.set(l, (languages.get(l) ?? 0) + 1);
    }
    const top = [...languages].sort((a, b) => b[1] - a[1]);
    const shown = top.slice(0, 7);
    const other = top.slice(7).reduce((n, [, c]) => n + c, 0);
    return (
        <Section title={t("tonieStats")}>
            <div className="stats-tiles">
                <div>
                    <strong>{list.length}</strong>
                    <span>{t("tonies")}</span>
                </div>
                <div>
                    <strong>{boxes.data?.length ?? "–"}</strong>
                    <span>{t("boxes")}</span>
                </div>
            </div>
            <div className="shares">
                <Share label={t("statCloudOn")} n={count((x) => !x.nocloud)} of={list.length} />
                <Share label={t("live")} n={count((x) => x.live)} of={list.length} />
                <Share label={t("statClaimed")} n={count((x) => x.claimed)} of={list.length} />
            </div>
            {shown.length > 0 && (
                <div className="shares">
                    <div className="choice-label">{t("language")}</div>
                    {shown.map(([code, n]) => (
                        <Share key={code} label={languageName(code)} n={n} of={list.length} />
                    ))}
                    {other > 0 && <Share label={t("statOther")} n={other} of={list.length} />}
                </div>
            )}
        </Section>
    );
}
