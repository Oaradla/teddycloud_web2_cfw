import { useState } from "react";
import { contentTitle, figureInfo, figureSubtitle, figureTitle, linkedContent, sourceLabel } from "../../lib/format";
import { t } from "../../lib/i18n";
import { TagWithBox, useAllTags } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { Loading, Row, SearchField } from "../../ui/kit";
import { FigurePic } from "../../ui/FigurePic";

/** picks one of the tonies (tags) known to the boxes */
export function TagPicker({
    open,
    onClose,
    onPick,
    title,
}: {
    open: boolean;
    onClose: () => void;
    onPick: (tag: TagWithBox) => void;
    title?: string;
}) {
    const tags = useAllTags();
    const [filter, setFilter] = useState("");
    const f = filter.trim().toLowerCase();
    const list = (tags.data ?? [])
        .filter((x) => x.type !== "system")
        .filter((x) => {
            if (!f) return !x.hide;
            const i = figureInfo(x);
            const l = linkedContent(x);
            return `${i.series} ${i.episode} ${l?.series ?? ""} ${l?.episode ?? ""} ${x.ruid} ${x.source}`.toLowerCase().includes(f);
        })
        .sort((a, b) => figureTitle(a).localeCompare(figureTitle(b), undefined, { numeric: true }));
    return (
        <Sheet open={open} onClose={onClose} title={title ?? t("chooseTonie")} full>
            <div style={{ marginBottom: 12 }}>
                <SearchField value={filter} onChange={setFilter} placeholder={t("searchTonies")} />
            </div>
            {tags.isLoading && <Loading />}
            <div className="list">
                {list.map((x) => {
                    const l = linkedContent(x);
                    return (
                        <Row
                            key={x.ruid}
                            leading={
                                <div style={{ width: 48, height: 48, flexShrink: 0 }}>
                                    <FigurePic tag={x} />
                                </div>
                            }
                            title={figureTitle(x)}
                            sub={l ? `→ ${contentTitle(l)}` : x.source ? `→ ${sourceLabel(x.source)}` : figureSubtitle(x) || x.ruid.toUpperCase()}
                            onClick={() => {
                                onPick(x);
                                onClose();
                            }}
                            chevron={false}
                        />
                    );
                })}
            </div>
        </Sheet>
    );
}
