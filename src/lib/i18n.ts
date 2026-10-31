// i18n with i18next, the texts in src/translations/<lang>.json like in the classic UI; the language
// is picked from the browser and switchable in "Mehr".
import i18next from "i18next";
import type en from "../translations/en.json";
import { getPref, setPref } from "./prefs";

type Leaves<T, P extends string = ""> = {
    [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
/** every text key, e.g. "boxes.noBoxes" */
export type Key = Leaves<typeof en>;

export const LANGS = {
    de: "Deutsch",
    en: "English",
    es: "Español",
    fr: "Français",
    it: "Italiano",
    pl: "Polski",
} as const;
export type Lang = keyof typeof LANGS;
const LOCALES: Record<Lang, string> = {
    de: "de-DE",
    en: "en-GB",
    es: "es-ES",
    fr: "fr-FR",
    it: "it-IT",
    pl: "pl-PL",
};

let current: Lang = "de";

export const getLang = (): Lang => current;
export const lang = () => LOCALES[current];

export const loadTexts = (l: Lang) =>
    import(`../translations/${l}.json`).then((m) => m.default as Record<string, unknown>);

/** picks the language and loads its texts, English as fallback */
export async function initLang() {
    const saved = getPref("lang", "") as Lang;
    const browser = (navigator.language ?? "").slice(0, 2).toLowerCase() as Lang;
    current = saved in LANGS ? saved : browser in LANGS ? browser : "en";
    document.documentElement.lang = current;
    const langs: Lang[] = current === "en" ? ["en"] : [current, "en"];
    const texts = await Promise.all(langs.map(loadTexts));
    await i18next.init({
        lng: current,
        fallbackLng: "en",
        resources: Object.fromEntries(langs.map((l, i) => [l, { translation: texts[i] }])),
        interpolation: { escapeValue: false },
    });
}

export function setLang(l: Lang) {
    setPref("lang", l);
    current = l;
    window.location.reload();
}

/** the text of a key in the current language, {{name}} filled from vars */
export const t = (key: Key, vars?: Record<string, string | number>): string => i18next.t(key, vars);

/** a part of the current language's texts as it is, e.g. "settings.options" */
export const textsOf = <T>(path: string) =>
    i18next.getResource(current, "translation", path) as T | undefined;
