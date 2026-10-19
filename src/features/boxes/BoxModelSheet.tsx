import { Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Box } from "../../api/types";
import { tc } from "../../api/tc";
import { t } from "../../lib/i18n";
import { keys, useBoxModels } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { useUi } from "../../ui/kit";

/** the picture of the box: one of the Toniebox models, or none */
export function BoxModelSheet({ box, open, onClose }: { box: Box; open: boolean; onClose: () => void }) {
    const models = useBoxModels();
    const qc = useQueryClient();
    const ui = useUi();
    const choose = (id: string) =>
        ui.run(async () => {
            await tc.setSetting("boxModel", id, box.ID);
            await qc.invalidateQueries({ queryKey: keys.boxes });
            onClose();
        }, t("saved"));
    return (
        <Sheet open={open} onClose={onClose} title={t("boxModel")} wide>
            <div className="model-grid">
                <button type="button" className={`model-pick ${!box.boxModel || box.boxModel === "-1" ? "active" : ""}`} onClick={() => choose("-1")}>
                    <div className="model-pick-img none" />
                    <span>{t("boxModelNone")}</span>
                </button>
                {(models.data ?? []).map((m) => (
                    <button type="button" key={m.id} className={`model-pick ${m.id === box.boxModel ? "active" : ""}`} onClick={() => choose(m.id)}>
                        <img src={m.img_src} alt="" loading="lazy" />
                        <span>{m.name}</span>
                        {m.id === box.boxModel && <Check size={16} className="model-pick-check" />}
                    </button>
                ))}
            </div>
        </Sheet>
    );
}
