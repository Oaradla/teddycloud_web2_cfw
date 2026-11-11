import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useState } from "react";
import { tc } from "../../api/tc";
import type { CfwPosition, CfwResume } from "../../api/types";
import { t } from "../../lib/i18n";
import { Row, useUi } from "../../ui/kit";
import { cfwThrow } from "../boxupdate/cfwMessages";

const minutes = (seconds: number) =>
    seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`;
const when = (seconds: number) => (seconds ? new Date(seconds * 1000).toLocaleString() : "-");

/** where the figure was heard last and, for global resume, its position or the conflict to decide */
export function CfwResumeInfo({
    ruid,
    resume,
    canEdit,
}: {
    ruid: string;
    resume: CfwResume;
    canEdit: boolean;
}) {
    const ui = useUi();
    const qc = useQueryClient();
    const boxes = useQuery({ queryKey: ["cfwBoxes"], queryFn: tc.cfwBoxes, retry: false });
    const box = (id: string) => {
        const b = boxes.data?.find((x) => x.id === id);
        return b ? b.boxName || b.commonName : id;
    };
    const branch = (p: CfwPosition) =>
        t("tonies.cfwResumeBranch", {
            box: box(p.box),
            listened: minutes(p.listened),
        });
    const [choosing, setChoosing] = useState(false);
    /** the server takes the branch by its index: only while the list shown is still the current one */
    const choose = async (i: number, shown: CfwPosition) => {
        setChoosing(true);
        const r = await ui.run(async () => {
            const now = (await tc.cfwTag(ruid)).resume;
            if (!now?.conflict || JSON.stringify(now.branches[i]) !== JSON.stringify(shown))
                throw new Error(t("tonies.cfwResumeChanged"));
            return tc.cfwChooseResume(ruid, i).catch(cfwThrow);
        });
        setChoosing(false);
        if (r) ui.toast("ok", t("tonies.cfwResumeChosen"));
        qc.invalidateQueries({ queryKey: ["cfwTag", ruid] });
        qc.invalidateQueries({ queryKey: ["cfwResume"] });
    };

    const lines = [
        resume.onBox && t("tonies.cfwResumePlaying", { box: box(resume.onBox) }),
        resume.last.box &&
            t("tonies.cfwResumeLast", {
                box: box(resume.last.box),
                time: when(resume.last.time),
            }),
        resume.global &&
            resume.current &&
            !resume.conflict &&
            t("tonies.cfwResumeCurrent", {
                box: box(resume.current.box),
                listened: minutes(resume.current.listened),
            }),
    ].filter(Boolean);

    return (
        <>
            <Row
                icon={<History size={17} />}
                title={t(
                    resume.global || resume.conflict
                        ? "tonies.cfwResumeTitle"
                        : "tonies.cfwResumeTitleLast",
                )}
                sub={lines.join(" · ")}
            />
            {resume.conflict && (
                <div style={{ padding: "0 16px 12px" }}>
                    <div className="badge warn" style={{ marginBottom: 8 }}>
                        {t("tonies.cfwResumeConflict")}
                    </div>
                    {resume.branches.map((p, i) => (
                        <Row
                            key={i}
                            title={branch(p)}
                            sub={when(p.time)}
                            right={
                                canEdit ? (
                                    <button
                                        className="btn small"
                                        disabled={choosing}
                                        onClick={() => choose(i, p)}
                                    >
                                        {t("tonies.cfwResumeChoose")}
                                    </button>
                                ) : undefined
                            }
                        />
                    ))}
                </div>
            )}
        </>
    );
}
