import { useQuery } from "@tanstack/react-query";
import { CFW_MESSAGES } from "../boxupdate/cfwMessages";
import { ESP32_TEXTS } from "../setup/esp32/texts";
import { SETUP_KEYS } from "../setup/texts";
import { LANGS, t, TEXT_KEYS } from "../../lib/i18n";
import { Loading, Page, Section } from "../../ui/kit";
import { Share } from "../more/TonieStats";
import de from "../../lib/settings.de.json";

const texts = import.meta.glob("../../lib/lang/[a-z][a-z].json", { import: "default" }) as Record<string, () => Promise<Record<string, string>>>;
const settings = import.meta.glob("../../lib/lang/settings.*.json", { import: "default" }) as Record<string, () => Promise<{ options?: object }>>;

/** every text of the app with the key a further language has it under */
const ALL = [...TEXT_KEYS, ...SETUP_KEYS.map((k) => `setup.${k}`), ...CFW_MESSAGES.map((k) => `cfw.${k}`), ...Object.keys(ESP32_TEXTS).map((k) => `esp32.${k}`)];

/** how complete each language is: the app's texts and the names of the settings */
export function TranslationsPage() {
    const counts = useQuery({
        queryKey: ["translationCounts"],
        queryFn: () =>
            Promise.all(
                Object.keys(LANGS)
                    .filter((l) => l !== "de" && l !== "en")
                    .map(async (l) => {
                        const own = await texts[`../../lib/lang/${l}.json`]?.();
                        const set = await settings[`../../lib/lang/settings.${l}.json`]?.();
                        return { l, texts: ALL.filter((k) => own?.[k]).length, settings: Object.keys(set?.options ?? {}).length };
                    }),
            ),
    });
    const settingsTotal = Object.keys(de.options).length;
    return (
        <Page title={t("translations")} subtitle={t("translationsIntro")} back="/community" narrow>
            {counts.isLoading && <Loading />}
            {counts.data && (
                <>
                    <Section title={t("translationsTexts")}>
                        <div className="shares">
                            <Share label={`${LANGS.de}, ${LANGS.en}`} n={ALL.length} of={ALL.length} />
                            {counts.data.map((c) => (
                                <Share key={c.l} label={LANGS[c.l as keyof typeof LANGS]} n={c.texts} of={ALL.length} />
                            ))}
                        </div>
                    </Section>
                    <Section title={t("translationsSettings")} footer={t("translationsSettingsHint")}>
                        <div className="shares">
                            <Share label={LANGS.de} n={settingsTotal} of={settingsTotal} />
                            {counts.data.map((c) => (
                                <Share key={c.l} label={LANGS[c.l as keyof typeof LANGS]} n={Math.min(c.settings, settingsTotal)} of={settingsTotal} />
                            ))}
                        </div>
                    </Section>
                </>
            )}
        </Page>
    );
}
