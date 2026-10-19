// German names of the teddyCloud settings; the server sends English ones. The texts come from the
// classic web UI (scripts/import-settings-i18n.mjs), EXTRA covers settings it does not translate.
import type { SettingOption } from "../api/types";
import { getLang } from "./i18n";
import de from "./settings.de.json";

type Text = { label?: string; description?: string };

const EXTRA: Record<string, Text> = {
    core_server_cert_file_web_crt: { label: "Web-Zertifikat", description: "Eigenes Zertifikat für die HTTPS-Weboberfläche" },
    core_server_cert_file_web_key: { label: "Web-Zertifikat-Schlüssel", description: "Schlüssel zum eigenen Web-Zertifikat" },
    web_auth: { label: "Sicherheit der Anmeldung" },
    web_auth_require_2fa: { label: "2FA verlangen", description: "Alle Nutzer müssen eine Zwei-Faktor-Anmeldung einrichten" },
    web_auth_password_min_length: { label: "Mindestlänge Passwort", description: "So viele Zeichen muss ein Passwort mindestens haben" },
    web_auth_session_days: { label: "Sitzungsdauer (Tage)", description: "So lange bleibt man höchstens angemeldet" },
    web_auth_session_idle_hours: { label: "Abmeldung bei Inaktivität (Stunden)", description: "Ohne Nutzung endet die Sitzung nach dieser Zeit" },
    web_auth_lockout_attempts: { label: "Fehlversuche bis zur Sperre", description: "Nach so vielen falschen Anmeldungen wird gesperrt" },
    web_auth_lockout_minutes: { label: "Sperrzeit (Minuten)", description: "So lange dauert eine Sperre nach zu vielen Fehlversuchen" },
    web_auth_trusted_proxies: { label: "Vertrauenswürdige Reverse-Proxys", description: "Adressen, deren X-Forwarded-For übernommen wird" },
    web_auth_lan_networks: { label: "Lokale Netze", description: "Diese Netze gelten als LAN (z.B. für „Admin nur aus dem LAN“)" },
    web_auth_remote_access: { label: "Weboberfläche von außen", description: "Zugriff auf die Weboberfläche aus dem Internet erlauben" },
    web_auth_remote_https_only: { label: "Von außen nur HTTPS", description: "Zugriffe von außen nur über HTTPS erlauben" },
    web_auth_allow_networks: { label: "Erlaubte Netze", description: "Nur diese Netze dürfen auf die Weboberfläche (leer: alle)" },
    web_auth_deny_networks: { label: "Gesperrte Netze", description: "Diese Netze werden immer abgewiesen" },
};

const key = (id: string) => id.replace(/\./g, "_");
const options = de.options as Record<string, Text>;
const groups = de.groups as Record<string, string>;
const values = de.values as Record<string, Record<string, string>>;
const german = () => getLang() === "de";

const text = (o: SettingOption): Text => (german() ? (EXTRA[key(o.ID)] ?? options[key(o.ID)] ?? {}) : {});

export const settingLabel = (o: SettingOption) =>
    (o.type === "desc" && german() ? groups[key(o.ID)] : undefined) ?? text(o).label ?? o.label ?? o.shortname;

export const settingDescription = (o: SettingOption) => text(o).description ?? o.description;

/** translated names of enumerated values, by value */
export const settingValues = (o: SettingOption): Record<string, string> | undefined => (german() ? values[key(o.ID)] : undefined);
