// Country flags (3:2) for the language of a label, from https://gitlab.com/catamphetamine/country-flag-icons
// (see flags/credits.txt), taken over from the classic UI. Loaded one by one when needed.
const flags = import.meta.glob("./flags/*.svg", { query: "?url", import: "default" }) as Record<string, () => Promise<string>>;

/** languages whose code is not the one of a country */
const COUNTRY: Record<string, string> = { en: "GB", ja: "JP", zh: "CN", ko: "KR", da: "DK", sv: "SE", cs: "CZ", el: "GR", uk: "UA", sl: "SI", et: "EE", ga: "IE" };

/** "de-de" -> DE, "en" -> GB */
export const flagCode = (language?: string) => {
    const [lang, region] = (language ?? "").toLowerCase().split(/[-_]/);
    return (region || COUNTRY[lang] || lang || "").toUpperCase();
};

export const flagUrl = async (language?: string) => {
    const load = flags[`./flags/${flagCode(language)}.svg`];
    return load ? new URL(await load(), location.href).href : null;
};
