// What the ESP32 flasher code (taken over from teddycloud_web, now maintained here) expects of
// its surroundings: an API client, notifications and a t() for its texts, on web2's own pieces.
import { backendUrl, request } from "../../../api/client";
import { pick } from "../../../lib/i18n";
import { useUi } from "../../../ui/kit";
import { ESP32_TEXTS } from "./texts";

export enum NotificationTypeEnum {
    Success = "success",
    Error = "error",
    Warning = "warning",
    Info = "info",
}

/** the few calls of the classic generated API client the copied files use */
export class TeddyCloudApi {
    constructor(_config?: unknown) {}
    apiGetTeddyCloudSettingRaw(name: string) {
        return request(`/api/settings/get/${name}`);
    }
    apiGetTeddyCloudApiRaw(path: string) {
        return request(path);
    }
    apiPostTeddyCloudRaw(path: string, body?: BodyInit) {
        return request(path, { method: "POST", body });
    }
    apiPostTeddyCloudFormDataRaw(path: string, formData: FormData) {
        return request(path, { method: "POST", body: formData });
    }
}
export const defaultAPIConfig = () => undefined;
export { backendUrl };

/** t() over the texts of the flasher (texts.ts), {{name}} filled from vars */
export const useTranslation = () => {
    return {
        t: (key: string, vars: Record<string, string | number> = {}) =>
            (ESP32_TEXTS[key] ? pick(ESP32_TEXTS[key], `esp32.${key}`) : key).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => String(vars[name] ?? "")),
    };
};
export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

/** the notifications of the classic TeddyCloudProvider as web2 toasts */
export const useTeddyCloud = () => {
    const ui = useUi();
    return {
        addNotification: (type: NotificationTypeEnum, title: string, detail?: string) =>
            ui.toast(type === NotificationTypeEnum.Error ? "error" : type === NotificationTypeEnum.Success ? "ok" : "info", title, detail),
        addLoadingNotification: (_key: string, title: string, detail?: string) => ui.toast("info", title, detail),
        closeLoadingNotification: (_key: string) => undefined,
        setFetchCloudStatus: (_v: unknown) => undefined,
    };
};

export const scrollToTop = (anchor?: HTMLElement | null) => {
    const top = anchor ? window.scrollY + anchor.getBoundingClientRect().top : 0;
    window.scrollTo({ top, behavior: "smooth" });
};
