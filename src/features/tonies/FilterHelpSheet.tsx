import { t } from "../../lib/i18n";
import { Sheet } from "../../ui/Sheet";

const FIELDS = [
    ["series", "tonies.fhSeries"],
    ["episode", "tonies.fhEpisode"],
    ["model", "tonies.fhModel"],
    ["language", "tonies.fhLanguage"],
    ["picture", "tonies.fhPicture"],
    ["ruid, uid", "tonies.fhRuid"],
    ["source", "tonies.fhSource"],
    ["valid, exists", "tonies.fhValid"],
    ["live, nocloud, claimed, hasCloudAuth", "tonies.fhFlags"],
    ["tracks, track", "tonies.fhTracks"],
    ["trackcount, tracksecondscount", "tonies.fhTrackcount"],
] as const;

const EXAMPLES = [
    ['series = "Pixi" and valid', "tonies.fxSeries"],
    ["language in (de-de, fr-fr)", "tonies.fxIn"],
    ["series ~ ^Bibi", "tonies.fxRegex"],
    ["episode is empty", "tonies.fxEmpty"],
    ["model startswith 1000", "tonies.fxStarts"],
    ["unique(series)", "tonies.fxUnique"],
    ['tracks ~ "lied"', "tonies.fxTracks"],
    ["trackcount > 10", "tonies.fxCount"],
    ["tracksecondscount != trackcount", "tonies.fxSeconds"],
    ["live && !nocloud || (source is not empty and not valid)", "tonies.fxCombined"],
] as const;

/** the syntax of the expert filter */
export function FilterHelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <Sheet open={open} onClose={onClose} title={t("tonies.expertFilter")}>
            <p className="muted">{t("tonies.fhIntro")}</p>
            <div className="choice-label mt">{t("tonies.fhFields")}</div>
            <dl className="help-list">
                {FIELDS.map(([code, key]) => (
                    <div key={code}>
                        <dt className="mono">{code}</dt>
                        <dd>{t(key)}</dd>
                    </div>
                ))}
            </dl>
            <div className="choice-label mt">{t("tonies.fhExamples")}</div>
            <dl className="help-list">
                {EXAMPLES.map(([code, key]) => (
                    <div key={code}>
                        <dt className="mono">{code}</dt>
                        <dd>{t(key)}</dd>
                    </div>
                ))}
            </dl>
            <p className="small muted mt">{t("tonies.fhTips")}</p>
        </Sheet>
    );
}
