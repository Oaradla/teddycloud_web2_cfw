import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL(".", import.meta.url);
const load = (lang: string) =>
    JSON.parse(readFileSync(new URL(`${lang}.json`, dir), "utf8")) as Record<string, unknown>;

/** key → text of the app's own texts; the settings names and cfw messages are tables, not keys */
const texts = (o: unknown, at = ""): Record<string, string> =>
    typeof o === "string"
        ? { [at]: o }
        : /^(settings\.(options|groups|values)|cfwMessages)$/.test(at)
          ? {}
          : Object.assign(
                {},
                ...Object.entries(o as object).map(([k, v]) => texts(v, at ? `${at}.${k}` : k)),
            );
/** every key, the tables included */
const allKeys = (o: unknown, at = ""): string[] =>
    typeof o === "string"
        ? [at]
        : Object.entries(o as object).flatMap(([k, v]) => allKeys(v, at ? `${at}.${k}` : k));
const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

const en = texts(load("en"));
const others = readdirSync(dir)
    .filter((f) => /^[a-z]{2}\.json$/.test(f) && f !== "en.json")
    .map((f) => f.slice(0, 2));

describe("translations", () => {
    it("German has every English text and no other", () => {
        expect(Object.keys(texts(load("de"))).sort()).toEqual(Object.keys(en).sort());
    });

    it.each(others)("%s has no keys English does not know", (lang) => {
        // plural forms English does not have (Polish "_few", "_many") belong to its "_other"
        const known = (k: string) => k.replace(/_(zero|two|few|many)$/, "_other") in en;
        expect(Object.keys(texts(load(lang))).filter((k) => !known(k))).toEqual([]);
    });

    it.each(others.filter((l) => l !== "de"))("%s has every German text", (lang) => {
        const have = new Set(allKeys(load(lang)));
        expect(allKeys(load("de")).filter((k) => !have.has(k))).toEqual([]);
    });

    it.each(others)("%s keeps the placeholders of English", (lang) => {
        const wrong = Object.entries(texts(load(lang))).filter(
            ([k, v]) => k in en && placeholders(v).join() !== placeholders(en[k]).join(),
        );
        expect(wrong.map(([k]) => k)).toEqual([]);
    });
});
