// Takes the texts of the teddyCloud settings (labels, descriptions, groups, values) and of the
// ESP32 flasher from the translations of the classic web UI, so both UIs name them the same way.
// Both have the same keys there as in src/translations/<lang>.json (settings.options/groups/values,
// tonieboxes.esp32BoxFlashing.esp32flasher); German and English keep their own flasher texts.
//
//   node scripts/import-settings-i18n.mjs <teddycloud_web>/public/translations/{de,es,fr,it,pl}.json
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const sources = process.argv.slice(2);
if (!sources.length) {
    console.error("usage: node scripts/import-settings-i18n.mjs <path to de.json> [es.json …]");
    process.exit(1);
}
const translation = (lang) => new URL(`../src/translations/${lang}.json`, import.meta.url);
const FLASHER = ["tonieboxes", "esp32BoxFlashing", "esp32flasher"];
const lookup = (obj, path) =>
    path.reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
const flasherKeys = Object.keys(
    lookup(JSON.parse(readFileSync(translation("en"), "utf8")), FLASHER),
);

for (const source of sources) {
    const lang = basename(source, ".json");
    const classic = JSON.parse(readFileSync(source, "utf8"));
    const texts = JSON.parse(readFileSync(translation(lang), "utf8"));
    const { options = {}, groups = {}, values = {} } = classic.settings ?? {};
    texts.settings = { ...texts.settings, options, groups, values };
    console.log(
        `${lang}: ${Object.keys(options).length} options, ${Object.keys(groups).length} groups, ${Object.keys(values).length} value lists`,
    );
    if (lang !== "de" && lang !== "en") {
        const from = lookup(classic, FLASHER) ?? {};
        const to = FLASHER.reduce((o, k) => (o[k] ??= {}), texts);
        for (const key of flasherKeys) if (typeof from[key] === "string") to[key] = from[key];
    }
    writeFileSync(translation(lang), JSON.stringify(texts, null, 4) + "\n");
}
