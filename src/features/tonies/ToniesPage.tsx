import { Check, CheckSquare, Disc3, LayoutGrid, List, Pencil, Play, SearchX, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { contentTitle, figureInfo, figureSubtitle, figureTitle, linkedContent } from "../../lib/format";
import { t } from "../../lib/i18n";
import { canPlayTag, tagPlayItem } from "../../lib/play";
import { getPref, setPref } from "../../lib/prefs";
import { TagWithBox, useAllTags, useBoxes, useBoxesDiffer } from "../../lib/queries";
import { usePlayer } from "../../player/Player";
import { FigurePic } from "../../ui/FigurePic";
import { Empty, ErrorBox, Page, SearchField } from "../../ui/kit";
import { ChoiceGroup, Popover } from "../../ui/Popover";
import { useSelection } from "../../ui/useSelection";
import { BulkEditSheet } from "./BulkEditSheet";

type Content = "all" | "content" | "custom" | "original" | "empty" | "live";
type Sort = "az" | "za" | "length" | "series";
type View = "grid" | "list";

const matches = (tag: TagWithBox, f: Content) => {
    switch (f) {
        case "content":
            return tag.valid || tag.live || Boolean(tag.source);
        case "custom":
            return Boolean(tag.source);
        case "original":
            return tag.valid && !tag.source;
        case "empty":
            return !tag.valid && !tag.live && !tag.source;
        case "live":
            return tag.live;
        default:
            return true;
    }
};

const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** the tonies; with system the system sound tags of the boxes instead */
export function ToniesPage({ system = false }: { system?: boolean }) {
    const [params, setParams] = useSearchParams();
    const box = params.get("box") ?? "";
    const content = (params.get("f") as Content) || "all";
    const series = params.get("series") ?? "";
    const hidden = params.get("hidden") === "1";
    const [query, setQuery] = useState(params.get("q") ?? "");
    const [sort, setSortState] = useState<Sort>(() => getPref("tonies.sort", "az") as Sort);
    const [view, setViewState] = useState<View>(() => getPref("tonies.view", "grid") as View);
    const [menu, setMenu] = useState(false);
    const menuBtn = useRef<HTMLButtonElement>(null);
    const boxes = useBoxes();
    const tags = useAllTags();
    const player = usePlayer();
    const boxesDiffer = useBoxesDiffer();
    const navigate = useNavigate();

    const setParam = (k: string, v: string) => {
        const next = new URLSearchParams(params);
        if (v) next.set(k, v);
        else next.delete(k);
        setParams(next, { replace: true });
    };
    const setSort = (v: Sort) => {
        setSortState(v);
        setPref("tonies.sort", v);
    };
    const setView = (v: View) => {
        setViewState(v);
        setPref("tonies.view", v);
    };

    const base = useMemo(() => (tags.data ?? []).filter((x) => (x.type === "system") === system), [tags.data, system]);
    const seriesList = useMemo(
        () => [...new Set(base.map((x) => figureInfo(x).series).filter(Boolean))].sort(cmp),
        [base],
    );

    const list = useMemo(() => {
        const f = query.trim().toLowerCase();
        const result = base
            .filter((x) => hidden || !x.hide)
            .filter((x) => matches(x, content))
            .filter((x) => !box || x.boxIds.includes(box))
            .filter((x) => !series || figureInfo(x).series === series)
            .filter((x) => {
                if (!f) return true;
                const i = figureInfo(x);
                const s = linkedContent(x);
                return `${i.series} ${i.episode} ${i.model} ${s?.series ?? ""} ${s?.episode ?? ""} ${x.ruid} ${x.source}`
                    .toLowerCase()
                    .includes(f);
            });
        const title = (x: TagWithBox) => `${figureTitle(x)} ${figureSubtitle(x)}`;
        result.sort((a, b) => {
            if (sort === "za") return cmp(title(b), title(a));
            if (sort === "length") return (b.lengthSeconds ?? 0) - (a.lengthSeconds ?? 0);
            if (sort === "series") return cmp(figureInfo(a).series, figureInfo(b).series) || cmp(title(a), title(b));
            return cmp(title(a), title(b));
        });
        return result;
    }, [base, query, content, box, series, hidden, sort]);

    const contentLabels: Record<Content, string> = {
        all: t("all"),
        content: t("withContent"),
        custom: t("ownContent"),
        original: t("original"),
        empty: t("noContent"),
        live: t("live"),
    };
    const boxName = (id: string) => boxes.data?.find((b) => b.ID === id)?.boxName || id;
    const active: { label: string; clear: () => void }[] = [
        ...(box ? [{ label: boxName(box), clear: () => setParam("box", "") }] : []),
        ...(content !== "all" ? [{ label: contentLabels[content], clear: () => setParam("f", "") }] : []),
        ...(series ? [{ label: series, clear: () => setParam("series", "") }] : []),
        ...(hidden ? [{ label: t("showHidden"), clear: () => setParam("hidden", "") }] : []),
    ];

    const open = (tag: TagWithBox) => navigate(`/tonie/${tag.ruid}${tag.overlay ? `?box=${tag.overlay}` : ""}`);
    const play = (tag: TagWithBox) => player.play(tagPlayItem(tag));
    const byRuid = useMemo(() => new Map(list.map((x) => [x.ruid, x])), [list]);
    const sel = useSelection((ruid) => {
        const tag = byRuid.get(ruid);
        if (tag) open(tag);
    }, list.map((x) => x.ruid));
    const [bulk, setBulk] = useState(false);
    const selectedTags = list.filter((x) => sel.selected.has(x.ruid));
    const allSelected = list.length > 0 && selectedTags.length === list.length;
    const checkbox = (ruid: string) => (
        <button
            type="button"
            className={`select-box ${sel.selected.has(ruid) ? "checked" : ""}`}
            aria-label={t("select")}
            aria-pressed={sel.selected.has(ruid)}
            onClick={(e) => {
                e.stopPropagation();
                sel.toggle(ruid, e.shiftKey);
            }}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {sel.selected.has(ruid) && <Check size={15} strokeWidth={3} />}
        </button>
    );

    return (
        <Page
            title={system ? t("systemSounds") : t("tonies")}
            back={system ? "/more" : undefined}
            right={
                sel.selecting ? (
                    <button className="btn ghost" onClick={sel.clear}>
                        {t("done")}
                    </button>
                ) : (
                    <button className="icon-btn" onClick={() => sel.setSelecting(true)} aria-label={t("select")} title={t("selectHint")}>
                        <CheckSquare size={21} />
                    </button>
                )
            }
        >
            <div className="sticky-tools">
                <div className="toolbar">
                    <SearchField value={query} onChange={setQuery} placeholder={t("searchTonies")} />
                    <button
                        ref={menuBtn}
                        className={`icon-btn filled filter-btn ${menu ? "active" : ""}`}
                        onClick={() => setMenu((v) => !v)}
                        aria-label={t("filterAndView")}
                    >
                        <SlidersHorizontal size={19} />
                        {active.length > 0 && <span className="count">{active.length}</span>}
                    </button>
                </div>
                {active.length > 0 && (
                    <div className="active-filters">
                        {active.map((a) => (
                            <button key={a.label} className="chip" onClick={a.clear}>
                                {a.label}
                                <X size={14} />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <Popover
                open={menu}
                onClose={() => setMenu(false)}
                anchor={menuBtn}
                title={t("filterAndView")}
                footer={
                    <>
                        <button
                            className="btn"
                            disabled={!active.length}
                            onClick={() => {
                                setParams({}, { replace: true });
                            }}
                        >
                            {t("resetFilters")}
                        </button>
                        <button className="btn primary" onClick={() => setMenu(false)}>
                            {t("showN", { n: list.length })}
                        </button>
                    </>
                }
            >
                <ChoiceGroup
                    label={t("view")}
                    value={view}
                    onChange={setView}
                    options={[
                        { value: "grid", label: <><LayoutGrid size={15} /> {t("viewGrid")}</> },
                        { value: "list", label: <><List size={15} /> {t("viewList")}</> },
                    ]}
                />
                <ChoiceGroup
                    label={t("sortBy")}
                    value={sort}
                    onChange={setSort}
                    options={[
                        { value: "az", label: "A–Z" },
                        { value: "za", label: "Z–A" },
                        { value: "series", label: t("series") },
                        { value: "length", label: t("length") },
                    ]}
                />
                {boxesDiffer && (
                    <ChoiceGroup
                        label={t("box")}
                        value={box}
                        onChange={(v) => setParam("box", v)}
                        options={[{ value: "", label: t("allBoxes") }, ...boxes.data!.map((b) => ({ value: b.ID, label: b.boxName || b.ID }))]}
                    />
                )}
                <ChoiceGroup
                    label={t("content")}
                    value={content}
                    onChange={(v) => setParam("f", v === "all" ? "" : v)}
                    options={(Object.keys(contentLabels) as Content[]).map((k) => ({ value: k, label: contentLabels[k] }))}
                />
                {seriesList.length > 1 && (
                    <div className="choice-group">
                        <div className="choice-label">{t("series")}</div>
                        <select className="select" value={series} onChange={(e) => setParam("series", e.target.value)}>
                            <option value="">{t("allSeries")}</option>
                            {seriesList.map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                <ChoiceGroup
                    label={t("hidden")}
                    value={hidden ? "1" : ""}
                    onChange={(v) => setParam("hidden", v)}
                    options={[
                        { value: "", label: t("hideHidden") },
                        { value: "1", label: t("showHidden") },
                    ]}
                />
            </Popover>

            {tags.isLoading && (
                <div className="grid-tonies">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="skeleton" style={{ aspectRatio: "0.75" }} />
                    ))}
                </div>
            )}
            {tags.error && <ErrorBox error={tags.error} retry={() => tags.refetch()} />}
            {tags.data &&
                list.length === 0 &&
                (query || active.length ? (
                    <Empty icon={<SearchX size={28} />} title={t("nothingFound")} />
                ) : (
                    <Empty icon={<Disc3 size={30} />} title={t("noTonies")} text={t("noToniesText")} />
                ))}
            {list.length > 0 && <p className="small muted" style={{ margin: "0 4px 10px" }}>{t("nTonies", { n: list.length })}</p>}

            {view === "grid" ? (
                <div className={`grid-tonies ${sel.selecting ? "selecting" : ""}`}>
                    {list.map((tag) => {
                        const linked = linkedContent(tag);
                        return (
                            <div
                                key={tag.ruid}
                                className={`tonie-tile ${sel.selected.has(tag.ruid) ? "checked" : ""}`}
                                role="button"
                                tabIndex={0}
                                {...sel.itemProps(tag.ruid)}
                            >
                                {checkbox(tag.ruid)}
                                <div className="pic">
                                    <FigurePic tag={tag} />
                                    {canPlayTag(tag) && !sel.selecting && (
                                        <button
                                            className="play"
                                            aria-label={t("play")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                play(tag);
                                            }}
                                        >
                                            <Play size={17} fill="currentColor" style={{ marginLeft: 2 }} />
                                        </button>
                                    )}
                                </div>
                                <div className="flags">
                                    <span>{tag.live && <span className="badge accent">{t("live")}</span>}</span>
                                    <span>
                                        {tag.source ? (
                                            <span className="badge ok">{t("own")}</span>
                                        ) : !tag.valid && !tag.live ? (
                                            <span className="badge warn">{t("empty")}</span>
                                        ) : null}
                                    </span>
                                </div>
                                <div className="meta">
                                    <div className="series">{figureTitle(tag)}</div>
                                    <div className="episode">{figureSubtitle(tag) || figureInfo(tag).model}</div>
                                    {linked && <div className="linked-title">→ {contentTitle(linked)}</div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className={`list ${sel.selecting ? "selecting" : ""}`}>
                    {list.map((tag) => {
                        const linked = linkedContent(tag);
                        return (
                            <div key={tag.ruid} className="row" role="button" tabIndex={0} {...sel.itemProps(tag.ruid)}>
                                {sel.selecting && checkbox(tag.ruid)}
                                <div style={{ width: 52, height: 52, flexShrink: 0 }}>
                                    <FigurePic tag={tag} />
                                </div>
                                <span className="row-body">
                                    <div className="row-title">{figureTitle(tag)}</div>
                                    <div className="row-sub">
                                        {figureSubtitle(tag)}
                                        {linked && <span style={{ display: "block", color: "var(--accent)" }}>→ {contentTitle(linked)}</span>}
                                        {!linked && !tag.valid && !tag.live && !tag.source && (
                                            <span style={{ display: "block", color: "var(--warn)" }}>{t("noContent")}</span>
                                        )}
                                    </div>
                                </span>
                                {canPlayTag(tag) && !sel.selecting && (
                                    <button
                                        className="icon-btn"
                                        aria-label={t("play")}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            play(tag);
                                        }}
                                        onPointerDown={(e) => e.stopPropagation()}
                                    >
                                        <Play size={20} fill="currentColor" />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {sel.selecting && (
                <div className="select-bar" role="toolbar">
                    <button className="icon-btn" onClick={sel.clear} aria-label={t("cancel")}>
                        <X size={20} />
                    </button>
                    <span className="count">{selectedTags.length ? t("nSelected", { n: selectedTags.length }) : t("selectTonies")}</span>
                    <button
                        className="btn ghost small"
                        onClick={() => sel.setSelected(allSelected ? new Set() : new Set(list.map((x) => x.ruid)))}
                    >
                        {allSelected ? t("selectNone") : t("selectAll")}
                    </button>
                    <button className="btn primary small" disabled={!selectedTags.length} onClick={() => setBulk(true)}>
                        <Pencil size={15} />
                        {t("edit")}
                    </button>
                </div>
            )}
            <BulkEditSheet
                open={bulk}
                onClose={() => {
                    setBulk(false);
                }}
                tags={selectedTags}
            />
        </Page>
    );
}

