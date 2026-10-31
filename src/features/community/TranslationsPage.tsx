import { useQuery } from "@tanstack/react-query";
import { type Lang, LANGS, loadTexts, t } from "../../lib/i18n";
import { Loading, Page, Section } from "../../ui/kit";
import { Share } from "../more/TonieStats";

type Texts = Record<string, unknown> & { settings?: { options?: object } };

/** the keys of the app's texts, without the names of the settings */
const textKeys = (o: unknown, at = ""): string[] =>
    typeof o === "string"
        ? [at]
        : at === "settings.options" || at === "settings.groups" || at === "settings.values"
          ? []
          : Object.entries(o as object).flatMap(([k, v]) => textKeys(v, at ? `${at}.${k}` : k));
const settingsCount = (texts: Texts) => Object.keys(texts.settings?.options ?? {}).length;

/** how complete each language is, measured against German: the app's texts and the names of the settings */
export function TranslationsPage() {
    const counts = useQuery({
        queryKey: ["translationCounts"],
        queryFn: async () => {
            const de = (await loadTexts("de")) as Texts;
            const all = textKeys(de);
            const langs = await Promise.all(
                (Object.keys(LANGS) as Lang[])
                    .filter((l) => l !== "de" && l !== "en")
                    .map(async (l) => {
                        const own = (await loadTexts(l)) as Texts;
                        const keys = new Set(textKeys(own));
                        return {
                            l,
                            texts: all.filter((k) => keys.has(k)).length,
                            settings: settingsCount(own),
                        };
                    }),
            );
            return { texts: all.length, settings: settingsCount(de), langs };
        },
    });
    const total = counts.data;
    return (
        <Page
            title={t("community.translations")}
            subtitle={t("community.translationsIntro")}
            back="/community"
            narrow
        >
            {counts.isLoading && <Loading />}
            {total && (
                <>
                    <Section title={t("community.translationsTexts")}>
                        <div className="shares">
                            <Share
                                label={`${LANGS.de}, ${LANGS.en}`}
                                n={total.texts}
                                of={total.texts}
                            />
                            {total.langs.map((c) => (
                                <Share key={c.l} label={LANGS[c.l]} n={c.texts} of={total.texts} />
                            ))}
                        </div>
                    </Section>
                    <Section
                        title={t("community.translationsSettings")}
                        footer={t("community.translationsSettingsHint")}
                    >
                        <div className="shares">
                            <Share label={LANGS.de} n={total.settings} of={total.settings} />
                            {total.langs.map((c) => (
                                <Share
                                    key={c.l}
                                    label={LANGS[c.l]}
                                    n={Math.min(c.settings, total.settings)}
                                    of={total.settings}
                                />
                            ))}
                        </div>
                    </Section>
                </>
            )}
        </Page>
    );
}
