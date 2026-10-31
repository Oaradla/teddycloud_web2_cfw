// What the ESP32 flasher code (taken over from teddycloud_web, now maintained here) expects of
// its surroundings: an API client, notifications and a t() for its texts, on web2's own pieces.
import { backendUrl, request } from "../../../api/client";
import { t, type Key } from "../../../lib/i18n";
import { useUi } from "../../../ui/kit";

export enum NotificationTypeEnum {
    Success = "success",
    Error = "error",
    Warning = "warning",
    Info = "info",
}

/** the few calls of the classic generated API client the copied files use */
export class TeddyCloudApi {
    constructor(_config?: unknown) {}
    // throws on an error answer, as the classic client does: no error text as a setting value
    async apiGetTeddyCloudSettingRaw(name: string) {
        const response = await request(`/api/settings/get/${name}`);
        if (!response.ok) throw new Error(`Error: ${response.status} ${response.statusText}`);
        return response;
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

/** the flasher's keys are the classic UI's ones, under tonieboxes.esp32BoxFlashing in translations */
export const useTranslation = () => ({
    t: (key: string, vars?: Record<string, string | number>) => t(key as Key, vars),
});
export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

/** the notifications of the classic TeddyCloudProvider as web2 toasts */
export const useTeddyCloud = () => {
    const ui = useUi();
    return {
        addNotification: (type: NotificationTypeEnum, title: string, detail?: string) =>
            ui.toast(
                type === NotificationTypeEnum.Error
                    ? "error"
                    : type === NotificationTypeEnum.Success
                      ? "ok"
                      : "info",
                title,
                detail,
            ),
        addLoadingNotification: (_key: string, title: string, detail?: string) =>
            ui.toast("info", title, detail),
        closeLoadingNotification: (_key: string) => undefined,
        setFetchCloudStatus: (_v: unknown) => undefined,
    };
};

export const scrollToTop = (anchor?: HTMLElement | null) => {
    const top = anchor ? window.scrollY + anchor.getBoundingClientRect().top : 0;
    window.scrollTo({ top, behavior: "smooth" });
};
