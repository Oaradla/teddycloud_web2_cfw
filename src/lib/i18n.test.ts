// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { cfwMessage } from "../features/boxupdate/cfwMessages";
import { initLang, t, textsOf } from "./i18n";
import { setPref } from "./prefs";
import { settingLabel } from "./settingsText";
import type { SettingOption } from "../api/types";

describe("i18n in German", () => {
    beforeAll(async () => {
        setPref("lang", "de");
        await initLang();
    });

    it("finds texts by area and key and fills placeholders", () => {
        expect(t("common.cancel")).toBe("Abbrechen");
        expect(t("library.deleteFolderText", { name: "Pixi", n: 3 })).toBe(
            "„Pixi“ und alles darin (3 Einträge) wird endgültig gelöscht.",
        );
    });

    it("knows the keys of the flasher taken over from the classic UI", () => {
        expect(t("tonieboxes.esp32BoxFlashing.esp32flasher.uploading")).toBe("Upload läuft...");
    });

    it("names settings and server messages", () => {
        expect(textsOf<object>("settings.options")).toBeTruthy();
        expect(settingLabel({ ID: "log.level", label: "Log level" } as SettingOption)).toBe(
            "Log-Level",
        );
        expect(cfwMessage("box not found")).toBe("Box nicht gefunden");
        expect(cfwMessage("something new")).toBe("something new");
    });
});
