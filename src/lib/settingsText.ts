// Names of the teddyCloud settings in the app's language; the server sends English ones. The texts come from the
// classic web UI (scripts/import-settings-i18n.mjs) plus a few it does not translate.
import type { SettingOption } from "../api/types";
import { textsOf } from "./i18n";

type Text = { label?: string; description?: string };

const key = (id: string) => id.replace(/\./g, "_");
/** the texts of the current language; English is what the server sends */
const tables = () =>
    textsOf<{
        options?: Record<string, Text>;
        groups?: Record<string, string>;
        values?: Record<string, Record<string, string>>;
    }>("settings") ?? {};
const text = (o: SettingOption): Text => tables().options?.[key(o.ID)] ?? {};

export const settingLabel = (o: SettingOption) =>
    (o.type === "desc" ? tables().groups?.[key(o.ID)] : undefined) ??
    text(o).label ??
    o.label ??
    o.shortname;

export const settingDescription = (o: SettingOption) => text(o).description ?? o.description;

/** translated names of enumerated values, by value */
export const settingValues = (o: SettingOption): Record<string, string> | undefined =>
    tables().values?.[key(o.ID)];

/** the name of a setting or a group of settings by its id in the current language, for lists without the option itself */
export const settingNameById = (id: string, fallback: string) =>
    tables().groups?.[key(id)] ?? tables().options?.[key(id)]?.label ?? fallback;
