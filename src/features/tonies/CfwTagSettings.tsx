import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { tc } from "../../api/tc";
import type { CfwProfile, CfwTag } from "../../api/types";
import { t } from "../../lib/i18n";
import { Row, Section, Segmented, useUi } from "../../ui/kit";
import { CfwEventFields, EMPTY_EVENT } from "./CfwEventFields";
import { CfwProfileFields, EMPTY_PROFILE } from "./CfwProfileFields";

/** settings of the custom firmware for a tag: the profile that travels with the figure, or an event tag */
export function CfwTagSettings({ ruid }: { ruid: string }) {
    const ui = useUi();
    const qc = useQueryClient();
    const tag = useQuery({ queryKey: ["cfwTag", ruid], queryFn: () => tc.cfwTag(ruid), retry: false });
    const [draft, setDraft] = useState<CfwTag | null>(null);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (tag.data) setDraft(tag.data);
    }, [tag.data]);
    if (tag.isError || !draft) return null;

    const profile = draft.profile ?? EMPTY_PROFILE;
    const setP = <K extends keyof CfwProfile>(k: K, v: CfwProfile[K]) =>
        setDraft({ ...draft, kind: "profile", profile: { ...profile, [k]: v } });
    const dirty = JSON.stringify(draft) !== JSON.stringify(tag.data);

    const save = async () => {
        setSaving(true);
        const body: Omit<CfwTag, "ruid"> =
            draft.kind === "profile" ? { kind: "profile", profile } : draft.kind === "event" ? { kind: "event", event: draft.event ?? EMPTY_EVENT } : { kind: "none" };
        const r = await ui.run(() => tc.cfwSetTag(ruid, body));
        setSaving(false);
        if (r && r.ok === false) ui.toast("error", t("saveFailed"), r.message);
        else if (r) {
            ui.toast("ok", t("saved"));
            qc.invalidateQueries({ queryKey: ["cfwTag", ruid] });
        }
    };

    return (
        <Section
            title={t("cfwTagSettings")}
            footer={dirty ? undefined : t("cfwTagSettingsHint")}
            plain
        >
            <div className="list">
                <div className="row-wrap">
                    <Row icon={<Sparkles size={17} />} title={t("cfwKind")} />
                    <div style={{ padding: "0 16px 12px" }}>
                        <Segmented
                            value={draft.kind}
                            onChange={(kind) => setDraft({ ...draft, kind, profile: kind === "profile" ? profile : draft.profile })}
                            options={[
                                { value: "none", label: t("cfwKindNone") },
                                { value: "profile", label: t("cfwKindProfile") },
                                { value: "event", label: t("cfwKindEvent") },
                            ]}
                        />
                    </div>
                </div>
                {draft.kind === "profile" && <CfwProfileFields values={profile} onChange={setP} />}
            </div>
            {draft.kind === "event" && (
                <div className="list mt" style={{ padding: "12px 16px" }}>
                    <CfwEventFields event={draft.event ?? EMPTY_EVENT} onChange={(event) => setDraft({ ...draft, kind: "event", event })} />
                </div>
            )}
            {dirty && (
                <div className="btn-row mt">
                    <button className="btn" onClick={() => setDraft(tag.data!)}>
                        {t("discard")}
                    </button>
                    <button className="btn primary" onClick={save} disabled={saving}>
                        {t("save")}
                    </button>
                </div>
            )}
        </Section>
    );
}
