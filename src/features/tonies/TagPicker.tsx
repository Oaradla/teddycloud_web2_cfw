import { useState } from "react";
import {
    contentTitle,
    figureInfo,
    figureSubtitle,
    figureTitle,
    linkedContent,
    sourceLabel,
} from "../../lib/format";
import { useAccess } from "../../lib/access";
import { t } from "../../lib/i18n";
import { TagWithBox, useAllTags } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { Loading, Row, SearchField, useUi } from "../../ui/kit";
import { FigurePic } from "../../ui/FigurePic";

/** picks one of the tonies (tags) known to the boxes that the user has the right on */
export function TagPicker({
    open,
    onClose,
    onPick,
    title,
    right,
}: {
    open: boolean;
    onClose: () => void;
    onPick: (tag: TagWithBox) => void;
    title?: string;
    right: "tonie.assign" | "tonie.edit";
}) {
    const tags = useAllTags();
    const access = useAccess();
    const ui = useUi();
    const [filter, setFilter] = useState("");
    const f = filter.trim().toLowerCase();
    const list = (tags.data ?? [])
        .filter((x) => x.type !== "system" && access.can("tonie", x.ruid, right))
        .filter((x) => {
            if (!f) return !x.hide;
            const i = figureInfo(x);
            const l = linkedContent(x);
            return `${i.series} ${i.episode} ${l?.series ?? ""} ${l?.episode ?? ""} ${x.ruid} ${x.source}`
                .toLowerCase()
                .includes(f);
        })
        .sort((a, b) => figureTitle(a).localeCompare(figureTitle(b), undefined, { numeric: true }));
    return (
        <Sheet open={open} onClose={onClose} title={title ?? t("tonies.chooseTonie")} full>
            <div style={{ marginBottom: 12 }}>
                <SearchField
                    value={filter}
                    onChange={setFilter}
                    placeholder={t("tonies.searchTonies")}
                />
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
                            sub={
                                l
                                    ? `→ ${contentTitle(l)}`
                                    : x.source
                                      ? `→ ${sourceLabel(x.source)}`
                                      : figureSubtitle(x) || x.ruid.toUpperCase()
                            }
                            onClick={async () => {
                                if (
                                    right === "tonie.assign" &&
                                    x.source &&
                                    !(await ui.confirm({
                                        title: t("tonies.replaceContent"),
                                        text: t("tonies.replaceContentText", {
                                            tonie: figureTitle(x),
                                            current: l ? contentTitle(l) : sourceLabel(x.source),
                                        }),
                                        confirm: t("upload.replace"),
                                    }))
                                )
                                    return;
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
