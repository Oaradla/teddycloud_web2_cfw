// Which settings are shown where; the custom firmware (CFW) rules follow the classic UI
// (teddycloud_web_cfw src/components/cfw/cfwSettingsVisibility.ts).

const isCfwBoxSetting = (id: string) => id.startsWith("cfw.box.");

/** CFW switches that matter per box */
const CFW_BOX_SWITCHES = ["cfw.settings_sync", "cfw.remote_control"];

/** old settings replaced by the CFW box settings; boxes without CFW get them derived */
export const REPLACED_BY_CFW = ["toniebox.max_vol_spk", "toniebox.max_vol_hdp", "toniebox.slap_enabled"];

/** what makes sense per box (matched as part of the id); the rest is server-wide */
const PER_BOX = [
    "core.certdir",
    "core.client_cert.",
    "core.flex_",
    "core.contentdir",
    "toniebox.",
    "toniebox2.",
    "cloud.enabled",
    "cloud.enableV1Claim",
    "cloud.enableV1CloudReset",
    "cloud.enableV1FreshnessCheck",
    "cloud.enableV1Log",
    "cloud.enableV1Time",
    "cloud.enableV1Ota",
    "cloud.enableV2Content",
    "cloud.cacheOta",
    "cloud.localOta",
    "cloud.cacheContent",
    "cloud.cacheToLibrary",
    "cloud.markCustomTagByPass",
    "cloud.prioCustomContent",
    "cloud.updateOnLowerAudioId",
    "cloud.dumpRuidAuthContentJson",
];

/** all cfw.* but the main switch only matter while the CFW support is on */
const needsCfwEnabled = (id: string) => id.startsWith("cfw.") && id !== "cfw.enabled";

/** settings this UI handles itself or that make no sense here */
const NEVER = ["core.settings_level", "frontend.web_auth_enabled"];

export interface CfwGlobalState {
    /** cfw.enabled; false as well on servers without CFW support */
    enabled: boolean;
    /** cfw.show_box_settings */
    showBoxSettings: boolean;
}

/** server settings page: CFW box settings while they are shown, the old ones otherwise */
export const shownInServerSettings = (id: string, cfw: CfwGlobalState) => {
    if (NEVER.includes(id)) return false;
    if (needsCfwEnabled(id) && !cfw.enabled) return false;
    const boxSettingsShown = cfw.enabled && cfw.showBoxSettings;
    if (isCfwBoxSetting(id)) return boxSettingsShown;
    if (REPLACED_BY_CFW.includes(id)) return !boxSettingsShown;
    return id !== "cfw.force_box_settings";
};

export interface CfwBoxState {
    /** cfw.enabled for this box */
    enabled: boolean;
    /** the box connected with the CFW */
    isCfwBox: boolean;
    /** cfw.force_box_settings of this box */
    forced: boolean;
}

/** the CFW box settings apply to this box (else the old volume steps and slap setting) */
export const cfwSettingsFor = (cfw: CfwBoxState) => cfw.enabled && (cfw.isCfwBox || cfw.forced);

/**
 * settings of one box: the CFW settings for a box with CFW or with them forced, the old ones
 * otherwise; an old setting with an own value of the box stays, as that value still applies
 */
export const shownForBox = (id: string, cfw: CfwBoxState, overlayed: boolean) => {
    const cfwBox = cfw.isCfwBox || cfw.forced;
    const cfwShown = cfw.enabled && cfwBox;
    if (NEVER.includes(id)) return false;
    if (id === "cfw.enabled") return cfwBox;
    if (needsCfwEnabled(id) && !cfw.enabled) return false;
    if (isCfwBoxSetting(id) || CFW_BOX_SWITCHES.includes(id)) return cfwShown;
    if (id === "cfw.force_box_settings") return !cfw.isCfwBox;
    if (id === "cfw.event_notice_language") return !cfw.isCfwBox;
    if (REPLACED_BY_CFW.includes(id)) return !cfwShown || overlayed;
    return PER_BOX.some((part) => id.includes(part));
};

/** for which boxes a setting of the box page is there at all: only with the CFW, only without, or every box */
export const boxSettingScope = (id: string): "cfw" | "plain" | undefined => {
    if (id === "cfw.enabled" || isCfwBoxSetting(id) || CFW_BOX_SWITCHES.includes(id)) return "cfw";
    if (id === "cfw.force_box_settings" || id === "cfw.event_notice_language" || REPLACED_BY_CFW.includes(id)) return "plain";
    return undefined;
};
