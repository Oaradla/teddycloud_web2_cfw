import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { SettingOption } from "../../api/types";
import { t } from "../../lib/i18n";
import { useBoxes, useCfwBox, useSetting, useSettings } from "../../lib/queries";
import { shownForBox, shownInServerSettings } from "./visibility";
import { settingDescription, settingLabel } from "../../lib/settingsText";
import { getPref, setPref } from "../../lib/prefs";
import { Empty, ErrorBox, Loading, Page, Section, SearchField, Segmented, Switch } from "../../ui/kit";
import { SettingRow } from "./SettingControls";
import { SearchX } from "lucide-react";

type Level = "1" | "2" | "3";

/** every setting of the server, or of one box (its overlay) */
export function AllSettingsPage() {
    const { id = "" } = useParams();
    const boxes = useBoxes();
    const box = boxes.data?.find((b) => b.ID === id);
    const settings = useSettings(id);
    // users get only the settings they may change in the list
    const cfwEnabled = useSetting("cfw.enabled", id).data === "true";
    const cfwForced = useSetting("cfw.force_box_settings", id).data === "true";
    const cfwBox = useCfwBox(id);
    const [query, setQuery] = useState("");
    const [level, setLevel] = useState<Level>(() => getPref("settingsLevel", "2") as Level);
    const [ownOnly, setOwnOnly] = useState(false);

    const groups = useMemo(() => {
        const list = settings.data ?? [];
        const value = (k: string) => list.find((o) => o.ID === k)?.value === true;
        const shown = id
            ? (o: SettingOption) =>
                  shownForBox(o.ID, { enabled: cfwEnabled, isCfwBox: Boolean(cfwBox?.isCfw), forced: cfwForced }, o.overlayed)
            : (o: SettingOption) => shownInServerSettings(o.ID, { enabled: value("cfw.enabled"), showBoxSettings: value("cfw.show_box_settings") });
        const f = query.trim().toLowerCase();
        const result: { head: SettingOption | null; items: SettingOption[] }[] = [];
        let current: { head: SettingOption | null; items: SettingOption[] } = { head: null, items: [] };
        for (const o of list) {
            if (o.internal || o.level === 0) continue;
            if (o.ID === "internal" || o.ID.startsWith("internal.")) continue;
            if (o.type !== "desc" && !shown(o)) continue;
            if (o.type === "desc") {
                if (current.items.length) result.push(current);
                current = { head: o, items: [] };
                continue;
            }
            if (f) {
                const text = `${o.ID} ${o.label} ${o.description} ${settingLabel(o)} ${settingDescription(o)} ${current.head ? settingLabel(current.head) : ""}`.toLowerCase();
                if (!text.includes(f)) continue;
            } else if (o.level > Number(level)) continue;
            if (ownOnly && !o.overlayed) continue;
            current.items.push(o);
        }
        if (current.items.length) result.push(current);
        return result;
    }, [settings.data, query, level, ownOnly, id, cfwBox, cfwEnabled, cfwForced]);

    const title = id ? t("allBoxSettings") : t("serverSettings");
    return (
        <Page title={title} subtitle={id ? box?.boxName ?? id : undefined} back={id ? `/box/${id}` : "/more"} narrow>
            <div className="sticky-tools">
                <div className="toolbar">
                    <SearchField value={query} onChange={setQuery} placeholder={t("searchSettings")} />
                </div>
                {!query && (
                    <div className="toolbar">
                        <div className="grow">
                            <Segmented
                                value={level}
                                onChange={(v) => {
                                    setLevel(v);
                                    setPref("settingsLevel", v);
                                }}
                                options={[
                                    { value: "1", label: t("levelBasic") },
                                    { value: "2", label: t("levelDetail") },
                                    { value: "3", label: t("levelExpert") },
                                ]}
                            />
                        </div>
                    </div>
                )}
                {id && (
                    <label className="row-gap small muted" style={{ margin: "0 4px 10px" }}>
                        <Switch checked={ownOnly} onChange={setOwnOnly} label={t("onlyOwnValues")} />
                        {t("onlyOwnValues")}
                    </label>
                )}
            </div>
            {id && !query && <p className="small muted" style={{ margin: "0 4px 16px" }}>{t("overlayHint")}</p>}
            {settings.isLoading && <Loading />}
            {settings.error && <ErrorBox error={settings.error} retry={() => settings.refetch()} />}
            {settings.data && groups.length === 0 && <Empty icon={<SearchX size={28} />} title={t("nothingFound")} />}
            {groups.map((g, i) => (
                <Section key={(g.head?.ID ?? "") + i} title={g.head ? settingLabel(g.head) : t("general")}>
                    {g.items.map((o) => (
                        <SettingRow key={o.ID} opt={o} overlay={id} />
                    ))}
                </Section>
            ))}
        </Page>
    );
}
