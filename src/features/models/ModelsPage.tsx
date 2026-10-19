import { ImageDown, ImagePlus, LayoutGrid, List, Plus, Shapes, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { t } from "../../lib/i18n";
import { useCustomModels } from "../../lib/queries";
import { getPref, setPref } from "../../lib/prefs";
import { Empty, ErrorBox, Loading, Page, Row, SearchField, Segmented, useUi } from "../../ui/kit";
import { TonieImage } from "../../ui/TonieImage";
import { ModelEditor, ModelEditorStart } from "./ModelEditor";
import { ImageOptimizer } from "./ImageOptimizer";

type Kind = "all" | "figure" | "cover";

export function ModelsPage() {
    const models = useCustomModels();
    const ui = useUi();
    const [query, setQuery] = useState("");
    const [kind, setKind] = useState<Kind>("all");
    const [editing, setEditing] = useState<ModelEditorStart | null>(null);
    const [optimize, setOptimize] = useState(false);
    const [view, setView] = useState(() => getPref("models.view", "list"));
    const toggleView = () => {
        const v = view === "list" ? "grid" : "list";
        setView(v);
        setPref("models.view", v);
    };

    const list = useMemo(() => {
        const f = query.trim().toLowerCase();
        return (models.data ?? [])
            .filter((m) => kind === "all" || (kind === "cover") === m.audio_id.length > 0)
            .filter((m) => !f || `${m.model} ${m.series} ${m.episodes} ${m.title}`.toLowerCase().includes(f))
            .sort((a, b) => (a.series || a.model).localeCompare(b.series || b.model, undefined, { numeric: true }));
    }, [models.data, query, kind]);

    const create = () =>
        ui.actions(t("whatToCreate"), [
            { label: t("newFigure"), icon: <UserRound size={17} />, onSelect: () => setEditing({ mode: "figure" }) },
            { label: t("newCover"), icon: <ImagePlus size={17} />, onSelect: () => setEditing({ mode: "cover" }) },
        ]);

    return (
        <Page
            title={t("customModels")}
            subtitle={t("customModelsHint")}
            back="/more"
            right={
                <button className="icon-btn" onClick={create} aria-label={t("newModel")}>
                    <Plus size={24} />
                </button>
            }
        >
            <div className="sticky-tools">
                <div className="toolbar">
                    <SearchField value={query} onChange={setQuery} />
                    <button className="icon-btn filled" onClick={toggleView} aria-label={view === "list" ? t("viewGrid") : t("viewList")}>
                        {view === "list" ? <LayoutGrid size={19} /> : <List size={19} />}
                    </button>
                </div>
                <div style={{ marginBottom: 12 }}>
                    <Segmented
                        value={kind}
                        onChange={setKind}
                        options={[
                            { value: "all", label: t("all") },
                            { value: "figure", label: t("figures") },
                            { value: "cover", label: t("covers") },
                        ]}
                    />
                </div>
            </div>
            <div className="btn-row" style={{ marginBottom: 10 }}>
                <button className="btn soft" onClick={() => setEditing({ mode: "figure" })}>
                    <UserRound size={18} />
                    {t("newFigure")}
                </button>
                <button className="btn soft" onClick={() => setEditing({ mode: "cover" })}>
                    <ImagePlus size={18} />
                    {t("newCover")}
                </button>
            </div>
            <button className="btn ghost small" style={{ marginBottom: 14, padding: "0 4px" }} onClick={() => setOptimize(true)}>
                <ImageDown size={16} />
                {t("optimizeImages")}
            </button>
            {models.isLoading && <Loading />}
            {models.error && <ErrorBox error={models.error} retry={() => models.refetch()} />}
            {models.data && list.length === 0 && <Empty icon={<Shapes size={28} />} title={query ? t("nothingFound") : t("noModels")} />}
            {list.length > 0 && view === "grid" && (
                <div className="grid-tonies">
                    {list.map((m) => (
                        <div key={m.model} className="tonie-tile" role="button" tabIndex={0} onClick={() => setEditing({ mode: "edit", model: structuredClone(m) })}>
                            <div className="pic">
                                <TonieImage src={m.pic} />
                            </div>
                            <div className="flags">
                                <span />
                                <span className={`badge ${m.audio_id.length ? "ok" : "accent"}`}>{m.audio_id.length ? t("cover") : t("figure")}</span>
                            </div>
                            <div className="meta">
                                <div className="series">{m.series || m.title || m.model}</div>
                                <div className="episode">{m.episodes}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {list.length > 0 && view === "list" && (
                <div className="list">
                    {list.map((m) => (
                        <Row
                            key={m.model}
                            leading={<TonieImage src={m.pic} size={46} />}
                            title={m.series || m.title || m.model}
                            sub={m.episodes || undefined}
                            right={<span className={`badge ${m.audio_id.length ? "ok" : "accent"}`}>{m.audio_id.length ? t("cover") : t("figure")}</span>}
                            onClick={() => setEditing({ mode: "edit", model: structuredClone(m) })}
                            chevron
                        />
                    ))}
                </div>
            )}
            <ModelEditor start={editing} onClose={() => setEditing(null)} />
            <ImageOptimizer open={optimize} onClose={() => setOptimize(false)} models={models.data ?? []} />
        </Page>
    );
}
