import { textsOf } from "../../lib/i18n";

/** the fixed messages of the server's /api/cfw answers in the current language (translations: cfwMessages) */
export const cfwMessage = (message: string) =>
    textsOf<Record<string, string>>("cfwMessages")?.[message] ?? message;

/** for .catch() of an /api/cfw request: the error again, with its message in the current language */
export const cfwThrow = (e: unknown): never => {
    throw new Error(cfwMessage(String((e as Error)?.message ?? e)));
};
