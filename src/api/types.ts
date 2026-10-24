export interface Box {
    ID: string;
    commonName: string;
    boxName: string;
    boxModel: string;
}

export interface BoxModel {
    id: string;
    name: string;
    img_src: string;
}

export interface BoxState {
    online: boolean;
    lastRuid: string;
    lastRuidTime: number;
    lastSeen: number;
    ip: string;
    firmware: string;
}

export interface TonieInfo {
    tracks: string[];
    model: string;
    series: string;
    episode: string;
    picture: string;
    language?: string;
}

export interface Tag {
    ruid: string;
    uid?: string;
    type: string;
    valid: boolean;
    exists: boolean;
    live: boolean;
    nocloud: boolean;
    hasCloudAuth: boolean;
    hide: boolean;
    claimed: boolean;
    source: string;
    trackSeconds: number[];
    lengthSeconds?: number;
    audioUrl: string;
    downloadTriggerUrl?: string;
    tonieInfo: TonieInfo;
    sourceInfo?: TonieInfo;
}

export interface SettingOption {
    ID: string;
    shortname: string;
    description: string;
    label: string;
    type: "desc" | "bool" | "uint" | "int" | "string" | "float" | "hex";
    overlayed: boolean;
    internal: boolean;
    level: number;
    writable?: boolean;
    value?: string | number | boolean;
    valueInit?: string | number | boolean;
    min?: number;
    max?: number;
}

export interface TafHeader {
    audioId: number;
    sha1Hash: string;
    size: number;
    valid: boolean;
    trackSeconds?: number[];
    lengthSeconds?: number;
}

export interface FileEntry {
    name: string;
    date: number;
    size: number;
    isDir: boolean;
    hide?: boolean;
    listened?: boolean;
    tafHeader?: TafHeader;
    tonieInfo?: TonieInfo;
    /** a folder: the one picture of the playlists and TAFs in it */
    folderPicture?: string;
}

/** plugin.json of a teddyCloud plugin (data/www/plugins/<pluginId>/) */
export interface PluginMeta {
    pluginId: string;
    pluginName: string;
    author?: string;
    version?: string;
    description?: string;
    pluginHomepage?: string;
    standalone?: boolean;
    /** where the menu shows it: home, tonies, tonieboxes, settings or community */
    teddyCloudSection?: string;
    hideInNav?: boolean;
}

export interface CustomModel {
    model: string;
    audio_id: (string | number)[];
    hash: string[];
    title: string;
    series: string;
    episodes: string;
    tracks: string[];
    release?: string | number;
    language: string;
    category?: string;
    pic: string;
}

export interface Stat {
    ID: string;
    description: string;
    value: number;
}

export interface AuthStatus {
    enabled: boolean;
    loggedIn: boolean;
    username: string;
    envOverride?: boolean;
    userCount?: number;
    twoFactorSetupRequired?: boolean;
    /** an admin demands a new password; until then the server answers nothing else */
    passwordChangeRequired?: boolean;
    twoFactorEnabled?: boolean;
    twoFactorRequired?: boolean;
    recoveryCodesLeft?: number;
    passwordMinLength?: number;
    /** this connection as the server sees it */
    client?: { ip: string; lan: boolean; secure: boolean; viaTrustedProxy: boolean; forwardedForIgnored?: boolean };
}

/* ---------- custom firmware (only on servers with CFW support) ---------- */

export const CFW_CAP = {
    resume: 1 << 0,
    shuffle: 1 << 1,
    sleepTimer: 1 << 2,
    eventTags: 1 << 3,
    restartGesture: 1 << 4,
    limitsPerFigure: 1 << 5,
    globalSettings: 1 << 6,
    foreignTags: 1 << 7,
    locks: 1 << 8,
    eventTagExt: 1 << 9,
    remote: 1 << 10,
    battery: 1 << 11,
};

export interface CfwBattery {
    mv: number;
    station: boolean;
    low: boolean;
    critical: boolean;
    implausible: boolean;
    reason: number;
    time: number;
    /** charge from the voltage, 0-100; missing on the charger */
    percent?: number;
    /** playing time left at the volume of the report, once the box's capacity is learned */
    remainingMin?: number;
    /** the charge curve comes from a discharge of this box, not the defaults */
    learned?: boolean;
}

export type CfwChannel = "none" | "release" | "beta" | "alpha";
export type CfwPlatform = "cc3200" | "esp32";

export interface CfwBox {
    id: string;
    commonName: string;
    boxName: string;
    isCfw: boolean;
    platform?: CfwPlatform;
    /** build delivered to the original firmware of an ESP32 box (first installation), 0: none */
    esp32Delivered?: number;
    /** the setup page version the box reported last, 0: none */
    pageVersion?: number;
    version: number;
    capabilities: number;
    updateResult?: number;
    rolledBackBuild?: number;
    helloTime?: number;
    lastOfferedBuild?: number;
    lastOfferTime?: number;
    helloValid: boolean;
    online: boolean;
    showBattery?: boolean;
    battery?: CfwBattery;
    settings: { enabled: boolean; settingsSync: boolean; remoteControl: boolean };
    update: {
        enabled: boolean;
        channel: CfwChannel;
        mode: "manual" | "automatic";
        target: number;
        allowRolledBack: boolean;
        next: number;
    };
}

export interface CfwStatus {
    helloValid?: boolean;
    online?: boolean;
    capabilities?: number;
    remote?: boolean;
    queued?: number;
    status?: {
        state: "idle" | "idleWithFigure" | "playing" | "paused" | "preparing" | "unknown";
        ruid: string;
        audioId: number;
        chapter: number;
        position: number;
        volume: number;
        limit: number;
        headphones: boolean;
        batteryMv: number;
        charging: boolean;
        locks: { slap: boolean; tilt: boolean; volume: boolean };
        time: number;
    };
    lastResult?: { command: number; result: number; time: number };
}

export interface CfwProfile {
    resume: boolean | null;
    shuffle: boolean | null;
    sleepMinutes: number | null;
    speakerLimit: number | null;
    headphoneLimit: number | null;
    ledLevel: number | null;
    slapLock: boolean | null;
    tiltLock: boolean | null;
    volumeLock: boolean | null;
}

export interface CfwTag {
    ruid: string;
    kind: "none" | "profile" | "event";
    origin?: string;
    timestamp?: number;
    profile?: CfwProfile;
    event?: { tones: boolean; actions: { action: number; mode: number; value: number }[] };
}

/** a playlist of the library: its files are put together into the TAF at filepath */
export interface Tap {
    type: "tap";
    audio_id: number;
    filepath: string;
    name: string;
    files: { filepath: string; name: string }[];
}

export interface CfwImage {
    build: number;
    version: string;
    revision: string;
    buildDate: string;
    channel: CfwChannel;
    source: string;
    githubTag: string;
    notes: string;
    added: number;
    size: number;
    platform?: CfwPlatform;
    /** the original firmware of an ESP32 box, for the return */
    original?: boolean;
    patches?: string;
    page?: number;
    pageNew?: boolean;
    pageLabel?: string;
    pageRequires?: string;
    /** the release package is kept with this CC3200 image (preloader, card tree) */
    package?: boolean;
}

export interface CfwGithubRelease {
    tag: string;
    name: string;
    published: string;
    channel: CfwChannel;
    hasImage: boolean;
    downloaded: boolean;
}

export interface CfwFirmware {
    images: CfwImage[];
    defaultPage?: { page: number; label: string; requires?: string };
    github: { repo: string; autoDownload: number; lastCheck: number; message: string; releases: CfwGithubRelease[] };
}

export interface CfwResult {
    ok: boolean;
    message: string;
}
