// teddyCloud endpoints used by the app
import { getJson, getText, postForm, postJson, postText, q, request } from "./client";
import type {
    AuthStatus,
    Box,
    BoxModel,
    BoxState,
    CfwBox,
    CfwChannel,
    CfwFirmware,
    CfwImage,
    CfwResult,
    CfwStatus,
    CfwTag,
    CustomModel,
    FileEntry,
    PluginMeta,
    SettingOption,
    Stat,
    Tag,
    Tap,
    TonieInfo,
} from "./types";

const setting = (key: string, overlay?: string) =>
    getText(`/api/settings/get/${key}${q({ overlay })}`).catch(() => "");

const unixToMs = (s: string) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n > 0 ? n * 1000 : 0;
};

/** asked once per page load */
let tapBuildProbe: Promise<boolean> | null = null;

export const NO_RUID = "ffffffffffffffff";

export const tc = {
    /* ---------- boxes ---------- */
    boxes: () => getJson<{ boxes: Box[] }>("/api/getBoxes").then((r) => r.boxes ?? []),
    // without tonieboxes.json the server answers no list
    boxModels: () => getJson<BoxModel[]>("/api/tonieboxesJson").then((r) => (Array.isArray(r) ? r : []), () => [] as BoxModel[]),
    boxState: async (id: string): Promise<BoxState> => {
        const [online, lastRuid, lastRuidTime, lastSeen, ip, firmware] = await Promise.all([
            setting("internal.online", id),
            setting("internal.last_ruid", id),
            setting("internal.last_ruid_time", id),
            setting("internal.last_connection", id),
            setting("internal.ip", id),
            setting("internal.toniebox_firmware.boxIC", id),
        ]);
        return {
            online: online === "true",
            lastRuid: lastRuid && lastRuid !== NO_RUID ? lastRuid.toLowerCase() : "",
            lastRuidTime: unixToMs(lastRuidTime),
            lastSeen: unixToMs(lastSeen),
            ip,
            firmware: firmware && firmware !== "0" ? firmware : "",
        };
    },
    /** forgets a box: its settings (overlay); it comes back as new when it connects again */
    removeBox: (id: string) => postText(`/api/settings/removeOverlay${q({ overlay: id })}`, ""),
    renameBox: (id: string, name: string) =>
        postText(`/api/settings/set/boxName${q({ overlay: id })}`, name),

    /* ---------- tonies ---------- */
    tags: (overlay?: string) =>
        getJson<{ tags: Tag[] }>(`/api/getTagIndex${q({ overlay })}`).then((r) => r.tags ?? []),
    tag: (ruid: string, overlay?: string) =>
        getJson<{ tagInfo: Tag }>(`/api/getTagInfo${q({ ruid, overlay })}`).then((r) => r.tagInfo),
    /** changes the content json of a tag, e.g. setContent(ruid, "live", true) */
    setContent: (ruid: string, key: string, value: string | boolean, overlay?: string) =>
        postText(
            `/content/json/set/${ruid}${q({ overlay })}`,
            `${key}=${typeof value === "string" ? encodeURIComponent(value) : value}`,
        ),
    /** assigns a library file or a stream URL to a tag (like the classic UI: also sets nocloud and live) */
    assignSource: async (tag: Tag, source: string, overlay?: string) => {
        await tc.setContent(tag.ruid, "source", source, overlay);
        if (source && !tag.nocloud) await tc.setContent(tag.ruid, "nocloud", true, overlay);
        const live = source.startsWith("http");
        if (live !== tag.live) await tc.setContent(tag.ruid, "live", live, overlay);
    },
    searchTonies: (text: string) =>
        Promise.all([
            getJson<TonieInfo[]>(`/api/toniesJsonSearch${q({ searchSeries: text })}`).catch(() => []),
            getJson<TonieInfo[]>(`/api/toniesJsonSearch${q({ searchEpisode: text })}`).catch(() => []),
            getJson<TonieInfo[]>(`/api/toniesJsonSearch${q({ searchModel: text })}`).catch(() => []),
        ]).then((lists) => {
            const seen = new Set<string>();
            return lists.flat().filter((t) => !seen.has(t.model) && seen.add(t.model));
        }),

    /* ---------- custom models ---------- */
    customModels: () => getJson<CustomModel[]>("/api/toniesCustomJson"),
    upsertModel: (model: CustomModel) => postJson("/api/toniesCustomJsonUpsert", model),
    /** pictures: also the picture when no other custom tonie shows it */
    deleteModel: (model: string, pictures = false) => postJson("/api/toniesCustomJsonDelete", { models: [model], pictures }),
    /** the custom tonies used only by these library paths: they may go with them */
    orphanModels: (paths: string[]) => postJson<string[]>("/api/toniesCustomJsonOrphans", paths),
    /** the custom tonies and pictures the user may change */
    modelsChangeable: () => getJson<{ models: string[]; images: string[] }>("/api/toniesCustomJsonChangeable"),
    deleteCustomImage: (name: string) => postText(`/api/fileDelete${q({ special: "custom_img" })}`, name),
    renameModel: (fromModel: string, toModel: string) =>
        postJson("/api/toniesCustomJsonRename", { fromModel, toModel, updateContentJson: true }),
    reloadToniesJson: () => getText("/api/toniesJsonReload"),
    /** the audio ids and hashes of a figure, from the custom models and tonies.json (a few MB, fetched on demand) */
    modelAudio: async (model: string) => {
        const lists = await Promise.all([tc.customModels(), getJson<CustomModel[]>("/api/toniesJson")]);
        const entry = lists.flat().find((x) => x.model === model);
        return (entry?.audio_id ?? []).map((id, i) => ({ audioId: String(id), hash: (entry!.hash?.[i] ?? "").toLowerCase() })).filter((x) => x.hash);
    },
    /** a flash dump of a box into the server's firmware folder; answers the file name it got there */
    storeFlashDump: (name: string, data: Uint8Array) => {
        const form = new FormData();
        form.append(name, new Blob([data as BlobPart]), name);
        return postForm("/api/esp32/uploadFirmware", form);
    },
    uploadCustomImage: (file: File, path = "") => {
        const form = new FormData();
        form.append(file.name, file, file.name);
        return postForm(`/api/fileUpload${q({ path, special: "custom_img" })}`, form);
    },

    /* ---------- library ---------- */
    files: (path: string, special = "library", overlay?: string) =>
        getJson<{ files: FileEntry[] }>(`/api/fileIndexV2${q({ path, special, overlay })}`).then(
            (r) => r.files ?? [],
        ),
    dirCreate: (path: string, special = "library") =>
        postText(`/api/dirCreate${q({ special })}`, path),
    /** models: also the custom tonies used only by what is deleted */
    fileDelete: (path: string, isDir: boolean, special = "library", overlay?: string, models = false) =>
        postText(`/api/${isDir ? "dirDelete" : "fileDelete"}${q({ special, overlay, models: models ? 1 : undefined })}`, path),
    /** everything inside a folder, all levels */
    walkTree: async (path: string, special = "library"): Promise<{ path: string; entry: FileEntry }[]> => {
        // the folders of one level are read at the same time
        const levels = await Promise.all(
            (await tc.files(path, special))
                .filter((f) => f.name !== "." && f.name !== "..")
                .map(async (f) => {
                    const p = `${path.replace(/\/$/, "")}/${f.name}`;
                    return [{ path: p, entry: f }, ...(f.isDir ? await tc.walkTree(p, special) : [])];
                }),
        );
        return levels.flat();
    },
    /** deletes a folder with everything in it */
    deleteTree: async (path: string, special = "library", models = false): Promise<void> => {
        // newer servers take the whole folder, also files the lists do not show
        if (await tc.fileDelete(path, false, special, undefined, models).then(() => true, () => false)) return;
        // older ones remove empty folders only
        for (const f of await tc.files(path, special)) {
            if (f.name === "." || f.name === "..") continue;
            const p = `${path.replace(/\/$/, "")}/${f.name}`;
            if (f.isDir) await tc.deleteTree(p, special);
            else await tc.fileDelete(p, false, special);
        }
        await tc.fileDelete(path, true, special);
    },
    /** moves the content TAF of a tag into the library (by/audioId/ or its root) and assigns it there */
    migrateToLibrary: async (ruid: string, root: boolean, overlay?: string) => {
        const r = await (await postText(`/api/migrateContent2Lib${q({ overlay })}`, `ruid=${ruid}&libroot=${root}`)).text();
        if (r.trim() !== "OK") throw new Error(r || "failed");
    },
    fileMove: (source: string, target: string, special = "library") =>
        postText(
            `/api/fileMove${q({ special })}`,
            `source=${encodeURIComponent(source)}&target=${encodeURIComponent(target)}`,
        ),
    setListened: (path: string, listened: boolean) =>
        postText(`/api/fileSetListened${q({ path, special: "library" })}`, `listened=${listened}`),
    uploadFiles: (files: File[], path: string, onProgress?: (f: number) => void) => {
        const form = new FormData();
        for (const f of files) form.append(f.name, f, f.name);
        return postForm(`/api/fileUpload${q({ path, special: "library" })}`, form, onProgress);
    },
    /** uploads 48 kHz stereo PCM chunks; the server encodes them into one TAF */
    pcmUpload: (
        chunks: { title: string; pcm: Blob }[],
        name: string,
        path: string,
        onProgress?: (f: number) => void,
    ) => {
        const form = new FormData();
        chunks.forEach((c, i) => form.append(c.title, c.pcm, `pcmData.${i}.pcm`));
        const audioId = Math.floor(Date.now() / 1000) - 0x50000000;
        return postForm(
            `/api/pcmUpload${q({ name, audioId, path, special: "library" })}`,
            form,
            onProgress,
        );
    },
    /** a TAF made in the browser */
    tafUpload: (taf: Blob, name: string, path: string, onProgress?: (f: number) => void) => {
        const form = new FormData();
        form.append("file", taf, name);
        return postForm(`/api/tafUpload${q({ name, path, special: "library" })}`, form, onProgress);
    },
    /** server side encoding of library files into a TAF (needs ffmpeg on the server) */
    encodeFiles: (source: string[], target: string) =>
        postText(
            "/api/fileEncode?special=library",
            [...source.map((s) => `source=${encodeURIComponent(s)}`), `target=${encodeURIComponent(target)}`].join("&"),
        ),

    /* ---------- playlists (TAP) ---------- */
    readTap: (path: string) =>
        getJson<Tap>(`/content/${path.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/")}${q({ special: "library" })}`),
    /** writes a TAP file into a library folder */
    saveTap: (tap: Tap, dir: string, fileName: string) => {
        const file = new File([JSON.stringify(tap, null, 2)], fileName, { type: "application/json" });
        return tc.uploadFiles([file], dir);
    },
    /** puts the TAF of a playlist together (remux when all files are TAFs) */
    buildTap: async (path: string) => {
        const r = await request("/api/tapBuild?special=library", {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: `path=${encodeURIComponent(path.replace(/^\/+/, ""))}`,
        });
        if (r.status === 404) return null; // server without playlist building: encoded on playback
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data as {
            built: boolean;
            remux: boolean;
            filepath?: string;
            error?: string;
            /** the built TAF, which the file lists leave out */
            tafHeader?: { audioId: number; sha1Hash: string };
        };
    },
    /** whether the server can join TAFs of a playlist (otherwise teddyCloud builds it on playback) */
    hasTapBuild: () =>
        (tapBuildProbe ??= request("/api/tapBuild?special=library", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "" })
            .then((r) => r.status !== 404 && r.status !== 405)
            .catch(() => false)),
    /** every chapter of a TAF as a TAF of its own plus a playlist that builds the original again */
    splitTaf: async (path: string, titles: string[]) => {
        const body = [`path=${encodeURIComponent(path.replace(/^\/+/, ""))}`, ...titles.map((t) => `title=${encodeURIComponent(t)}`)].join("&");
        const r = await request("/api/tafSplit?special=library", { method: "POST", headers: { "Content-Type": "text/plain" }, body });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data as { folder: string; tap: string; chapters: number; original?: string };
    },

    /* ---------- settings ---------- */
    settingsIndex: (overlay?: string) =>
        getJson<{ options: SettingOption[] }>(`/api/settings/getIndex${q({ groups: "true", overlay })}`).then(
            (r) => r.options ?? [],
        ),
    setSetting: async (key: string, value: string | number | boolean, overlay?: string) => {
        await postText(`/api/settings/set/${key}${q({ overlay })}`, String(value));
        await getText("/api/triggerWriteConfig").catch(() => "");
    },
    resetSetting: async (key: string, overlay?: string) => {
        await postText(`/api/settings/reset/${key}${q({ overlay })}`, "");
        await getText("/api/triggerWriteConfig").catch(() => "");
    },

    /* ---------- certificates ---------- */
    /** client certificates of a box (*.der) for the cloud, for the server or one box (overlay) */
    uploadCerts: (files: File[], overlay?: string) => {
        const form = new FormData();
        for (const f of files) form.append("filename", f, f.name);
        return postForm(`/api/uploadCert${q({ overlay })}`, form);
    },

    /* ---------- plugins ---------- */
    plugins: async (): Promise<PluginMeta[]> => {
        const folders = await getJson<string[]>("/api/plugins/getPlugins").catch(() => [] as string[]);
        const metas = await Promise.all(
            folders.map((folder) =>
                getJson<Partial<PluginMeta>>(`/plugins/${encodeURIComponent(folder)}/plugin.json`)
                    .then((m) => (m.pluginName ? ({ ...m, pluginId: folder } as PluginMeta) : null))
                    .catch(() => null),
            ),
        );
        return metas.filter((m): m is PluginMeta => m !== null).sort((a, b) => a.pluginName.localeCompare(b.pluginName));
    },
    uploadPlugin: (file: File) => {
        const form = new FormData();
        form.append("file", file, file.name);
        return postForm("/api/plugins/upload", form);
    },
    deletePlugin: (id: string) => postText(`/api/plugins/delete/${encodeURIComponent(id)}`),

    /* ---------- system ---------- */
    stats: () => getJson<{ stats: Stat[] }>("/api/stats").then((r) => r.stats ?? []),
    version: () => setting("internal.version.v_long"),
    /** a server setting as text; "" when the server does not have it */
    getSetting: (key: string, overlay?: string) => setting(key, overlay).then((v) => v.trim()),
    /** "true"/"false"; "" on a server without CFW support */
    cfwEnabled: () => setting("cfw.enabled").then((v) => v.trim()),
    securityIncident: () => setting("internal.security_mit.incident").then((v) => v === "true"),
    restart: () => getText("/api/triggerRestart"),
    /** a time request answered by teddyCloud itself, and one it forwards to the Boxine cloud */
    timeOk: (viaCloud: boolean) =>
        getText(viaCloud ? "/reverse/v1/time" : "/v1/time")
            .then((v) => v.trim().length === 10)
            .catch(() => false),
    /** the newest teddyCloud on GitHub: a commit of develop or a release */
    latestVersion: (develop: boolean) =>
        getJson<{ sha?: string; tag_name?: string }>(develop ? "/reverseGeneric/teddycloud_develop" : "/reverseGeneric/teddycloud_release"),

    /* ---------- login ---------- */
    authStatus: async (): Promise<AuthStatus> => {
        const response = await request("/api/auth/status");
        if (response.status === 404) return { enabled: false, loggedIn: false, username: "" };
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    },
    login: (username: string, password: string) =>
        postJson<{ twoFactorRequired?: boolean; challenge?: string; methods?: string[] }>(
            "/api/auth/login",
            { username, password },
        ),
    login2fa: (challenge: string, code: string) =>
        postJson(
            "/api/auth/login2fa",
            /^\d{6}$/.test(code.replace(/\s/g, ""))
                ? { challenge, code: code.replace(/\s/g, "") }
                : { challenge, recoveryCode: code.trim() },
        ),
    confirm: (password: string, code?: string) =>
        postJson("/api/auth/confirm", code ? { password, code } : { password }),
    logout: () => getText("/api/auth/logout"),

    /* ---------- custom firmware ---------- */
    cfwBoxes: async (): Promise<CfwBox[] | null> => {
        const response = await request("/api/cfw/boxes");
        if (!response.ok) return null; // no CFW support on this server
        return (await response.json()).boxes ?? [];
    },
    cfwStatus: (id: string) => getJson<CfwStatus>(`/api/cfw/status${q({ overlay: id })}`),
    cfwRemote: (id: string, command: string, extra: Record<string, unknown> = {}) =>
        postJson<{ ok: boolean; message: string }>(`/api/cfw/remote${q({ overlay: id })}`, {
            command,
            ...extra,
        }),
    cfwFirmware: () => getJson<CfwFirmware>("/api/cfw/firmware"),
    /** the name or address under which the boxes reach this server (Host header of the last box request; empty if none yet) */
    cfwBoxHost: () => getJson<{ host: string; apiPort: number }>("/api/cfw/boxHost"),
    /** the release package kept with a CC3200 image, for setting up a box in the browser */
    cfwPackage: async (build: number): Promise<Uint8Array> => {
        const r = await request(`/api/cfw/firmware/package${q({ build })}`);
        if (!r.ok) throw new Error(await r.text());
        return new Uint8Array(await r.arrayBuffer());
    },
    /** this teddyCloud's CA as the replacement the box checks the server with (c2.der) */
    caReplacement: async (): Promise<Uint8Array> => {
        const r = await request("/api/getFile/c2.der");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return new Uint8Array(await r.arrayBuffer());
    },
    /** the certificates of a box teddyCloud does not know yet, under its MAC (and as the defaults where there are none) */
    uploadCertsByMac: (mac: string, files: { name: string; data: Uint8Array }[]) => {
        const form = new FormData();
        for (const f of files) form.append("filename", new Blob([f.data as BlobPart]), f.name);
        return postForm(`/api/uploadCert${q({ mac })}`, form);
    },
    /** a firmware image or release zip; ESP32 originals may get teddyCloud's server patches */
    cfwUpload: (file: File, channel: CfwChannel, patch: { hostname?: string; hostnameOld?: string; port?: number } = {}, onProgress?: (f: number) => void) => {
        const form = new FormData();
        form.append("file", file, file.name);
        return postForm(
            `/api/cfw/firmware/upload${q({ channel, hostname: patch.hostname, hostname_old: patch.hostname ? patch.hostnameOld : undefined, port: patch.port })}`,
            form,
            onProgress,
        ).then((text) => (text ? JSON.parse(text) : { ok: true, message: "" }) as CfwResult);
    },
    /** a setup page alone: for an image, or without one as the default page */
    cfwUploadPage: (file: File, image?: CfwImage) => {
        const form = new FormData();
        form.append("file", file, file.name);
        return postForm(`/api/cfw/firmware/upload${image ? q({ build: image.build, platform: image.platform ?? "cc3200" }) : ""}`, form).then(
            (text) => (text ? JSON.parse(text) : { ok: true, message: "" }) as CfwResult,
        );
    },
    cfwEditFirmware: (image: CfwImage, change: { channel?: CfwChannel; notes?: string }) =>
        postJson<CfwResult>("/api/cfw/firmware/edit", { build: image.build, platform: image.platform ?? "cc3200", ...change }),
    cfwDeleteFirmware: (image: CfwImage) =>
        postJson<CfwResult>("/api/cfw/firmware/delete", { build: image.build, platform: image.platform ?? "cc3200" }),
    cfwCheckGithub: () => postJson<CfwResult>("/api/cfw/firmware/github", {}),
    cfwDownloadGithub: (tag: string) => postJson<CfwResult>("/api/cfw/firmware/githubDownload", { tag }),
    /** assigns an image to a box (0: none); now: the box checks at once */
    cfwDeliver: (id: string, build: number, now = false) => postJson<CfwResult>(`/api/cfw/deliver${q({ overlay: id })}`, { build, now }),
    cfwCheckNow: (id: string) => postJson<CfwResult>(`/api/cfw/deliver${q({ overlay: id })}`, { now: true }),
    cfwTag: (ruid: string) => getJson<CfwTag>(`/api/cfw/tag${q({ ruid })}`),
    cfwSetTag: (ruid: string, tag: Omit<CfwTag, "ruid">) =>
        postJson<{ ok: boolean; message: string }>(`/api/cfw/tag${q({ ruid })}`, tag),
};
