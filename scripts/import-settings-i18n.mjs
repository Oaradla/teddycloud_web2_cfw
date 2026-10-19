// Takes the German texts of the teddyCloud settings (labels, descriptions, groups, values) from
// the translations of the classic web UI, so both UIs name settings the same way.
//
//   node scripts/import-settings-i18n.mjs <teddycloud_web>/public/translations/de.json
import { readFileSync, writeFileSync } from "node:fs";

const [source] = process.argv.slice(2);
if (!source) {
    console.error("usage: node scripts/import-settings-i18n.mjs <path to de.json>");
    process.exit(1);
}
const { options = {}, groups = {}, values = {} } = JSON.parse(readFileSync(source, "utf8")).settings ?? {};
const out = new URL("../src/lib/settings.de.json", import.meta.url);
writeFileSync(out, JSON.stringify({ options, groups, values }, null, 1) + "\n");
console.log(`${Object.keys(options).length} options, ${Object.keys(groups).length} groups, ${Object.keys(values).length} value lists -> ${out.pathname}`);
