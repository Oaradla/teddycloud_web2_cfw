// Takes the texts of the teddyCloud settings (labels, descriptions, groups, values) and of the
// ESP32 flasher from the translations of the classic web UI, so both UIs name them the same way.
// German goes to src/lib/settings.de.json; es/fr/it/pl to src/lib/lang/ (settings.<lang>.json,
// the flasher texts as "esp32.<key>" into <lang>.json, keeping the other texts there).
//
//   node scripts/import-settings-i18n.mjs <teddycloud_web>/public/translations/{de,es,fr,it,pl}.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const sources = process.argv.slice(2);
if (!sources.length) {
    console.error("usage: node scripts/import-settings-i18n.mjs <path to de.json> [es.json …]");
    process.exit(1);
}
/** the keys of the flasher texts, as in the classic translations */
const ESP32_KEYS = [...readFileSync(new URL("../src/features/setup/esp32/texts.ts", import.meta.url), "utf8").matchAll(/^\s+"([^"]+)": \[/gm)].map((m) => m[1]);
const lookup = (obj, path) => path.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);

for (const source of sources) {
    const lang = basename(source, ".json");
    const all = JSON.parse(readFileSync(source, "utf8"));
    const { options = {}, groups = {}, values = {} } = all.settings ?? {};
    const out = new URL(lang === "de" ? "../src/lib/settings.de.json" : `../src/lib/lang/settings.${lang}.json`, import.meta.url);
    writeFileSync(out, JSON.stringify({ options, groups, values }, null, 1) + "\n");
    console.log(`${lang}: ${Object.keys(options).length} options, ${Object.keys(groups).length} groups, ${Object.keys(values).length} value lists`);
    if (lang === "de") continue;
    const textsFile = new URL(`../src/lib/lang/${lang}.json`, import.meta.url);
    const texts = existsSync(textsFile) ? JSON.parse(readFileSync(textsFile, "utf8")) : {};
    for (const key of ESP32_KEYS) {
        const text = lookup(all, key);
        if (typeof text === "string") texts[`esp32.${key}`] = text;
    }
    writeFileSync(textsFile, JSON.stringify(texts, null, 1) + "\n");
}
