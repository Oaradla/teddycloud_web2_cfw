import { textsOf } from "../../lib/i18n";

/** the fixed messages of the server's /api/cfw answers in the current language (translations: cfwMessages) */
export const cfwMessage = (message: string) =>
    textsOf<Record<string, string>>("cfwMessages")?.[message] ?? message;
