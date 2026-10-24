import { t } from "../../lib/i18n";
import { Sheet } from "../../ui/Sheet";

const FIELDS = [
    ["series", "fhSeries"],
    ["episode", "fhEpisode"],
    ["model", "fhModel"],
    ["language", "fhLanguage"],
    ["picture", "fhPicture"],
    ["ruid, uid", "fhRuid"],
    ["source", "fhSource"],
    ["valid, exists", "fhValid"],
    ["live, nocloud, claimed, hasCloudAuth", "fhFlags"],
    ["tracks, track", "fhTracks"],
    ["trackcount, tracksecondscount", "fhTrackcount"],
] as const;

const EXAMPLES = [
    ['series = "Pixi" and valid', "fxSeries"],
    ["language in (de-de, fr-fr)", "fxIn"],
    ["series ~ ^Bibi", "fxRegex"],
    ["episode is empty", "fxEmpty"],
    ["model startswith 1000", "fxStarts"],
    ["unique(series)", "fxUnique"],
    ['tracks ~ "lied"', "fxTracks"],
    ["trackcount > 10", "fxCount"],
    ["tracksecondscount != trackcount", "fxSeconds"],
    ["live && !nocloud || (source is not empty and not valid)", "fxCombined"],
] as const;

/** the syntax of the expert filter */
export function FilterHelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <Sheet open={open} onClose={onClose} title={t("expertFilter")}>
            <p className="muted">{t("fhIntro")}</p>
            <div className="choice-label mt">{t("fhFields")}</div>
            <dl className="help-list">
                {FIELDS.map(([code, key]) => (
                    <div key={code}>
                        <dt className="mono">{code}</dt>
                        <dd>{t(key)}</dd>
                    </div>
                ))}
            </dl>
            <div className="choice-label mt">{t("fhExamples")}</div>
            <dl className="help-list">
                {EXAMPLES.map(([code, key]) => (
                    <div key={code}>
                        <dt className="mono">{code}</dt>
                        <dd>{t(key)}</dd>
                    </div>
                ))}
            </dl>
            <p className="small muted mt">{t("fhTips")}</p>
        </Sheet>
    );
}
