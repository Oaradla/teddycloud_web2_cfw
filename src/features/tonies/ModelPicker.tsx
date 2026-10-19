import { useQuery } from "@tanstack/react-query";
import { Ban, UserRoundPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { tc } from "../../api/tc";
import type { TonieInfo } from "../../api/types";
import { t } from "../../lib/i18n";
import { useCustomModels } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { Loading, Row, SearchField } from "../../ui/kit";
import { TonieImage } from "../../ui/TonieImage";
import { ModelEditor, ModelEditorStart } from "../models/ModelEditor";

/** picks a figure (model number) from tonies.json and the custom models */
export function ModelPicker({
    open,
    onClose,
    onPick,
    current,
}: {
    open: boolean;
    onClose: () => void;
    onPick: (model: string) => void;
    current?: string;
}) {
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");
    const [create, setCreate] = useState<ModelEditorStart | null>(null);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [query]);
    const custom = useCustomModels();
    const search = useQuery({
        queryKey: ["tonieSearch", debounced],
        queryFn: () => tc.searchTonies(debounced),
        enabled: open && debounced.length >= 2,
    });
    const f = debounced.toLowerCase();
    const customHits: TonieInfo[] = (custom.data ?? [])
        .filter((m) => !f || `${m.model} ${m.series} ${m.episodes} ${m.title}`.toLowerCase().includes(f))
        .slice(0, 50)
        .map((m) => ({ model: m.model, series: m.series, episode: m.episodes, picture: m.pic, tracks: m.tracks }));

    const pick = (model: string) => {
        onPick(model);
        onClose();
    };

    const item = (m: TonieInfo, tag?: string) => (
        <Row
            key={(tag ?? "") + m.model}
            leading={<TonieImage src={m.picture} size={44} />}
            title={m.series || m.model}
            sub={[m.episode, m.model].filter(Boolean).join(" · ")}
            onClick={() => pick(m.model)}
            chevron={false}
            right={m.model === current ? <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span> : undefined}
        />
    );

    return (
        <Sheet open={open} onClose={onClose} title={t("chooseFigure")} full>
            <div style={{ marginBottom: 12 }}>
                <SearchField value={query} onChange={setQuery} placeholder={t("searchFigure")} autoFocus />
            </div>
            <div className="section">
                <div className="list">
                    <Row icon={<UserRoundPlus size={17} />} title={t("newFigure")} sub={t("newFigureHint")} onClick={() => setCreate({ mode: "figure" })} chevron />
                    <Row icon={<Ban size={17} />} title={t("noFigure")} sub={t("noFigureHint")} onClick={() => pick("")} chevron={false} />
                </div>
            </div>
            {customHits.length > 0 && (
                <div className="section">
                    <div className="section-head">
                        <h2 className="section-title">{t("customModels")}</h2>
                    </div>
                    <div className="list">{customHits.map((m) => item(m, "c"))}</div>
                </div>
            )}
            {debounced.length >= 2 && (
                <div className="section">
                    <div className="section-head">
                        <h2 className="section-title">tonies.json</h2>
                    </div>
                    {search.isLoading ? (
                        <Loading />
                    ) : (
                        <div className="list">
                            {(search.data ?? []).map((m) => item(m, "o"))}
                            {search.data?.length === 0 && <Row title={t("nothingFound")} />}
                        </div>
                    )}
                </div>
            )}
            {debounced.length < 2 && <p className="small muted" style={{ textAlign: "center" }}>{t("searchFigureHint")}</p>}
            <ModelEditor
                start={create}
                onClose={() => setCreate(null)}
                onSaved={(m) => {
                    setCreate(null);
                    pick(m.model);
                }}
            />
        </Sheet>
    );
}
