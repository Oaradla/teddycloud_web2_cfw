import { useQuery } from "@tanstack/react-query";
import { unzipSync, zipSync } from "fflate";
import { useEffect, useState } from "react";
import { tc } from "../../api/tc";
import { Notice } from "../../ui/kit";
import { StatusLine, useBusyGuard } from "./parts";
import { t } from "../../lib/i18n";
import { validPort } from "./patches";

export const saveZip = (data: Uint8Array, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/zip" }));
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

/** the files of a release package below prefix, without it */
export const packageFiles = (pkg: Uint8Array, prefix: string) => {
    const out: Record<string, Uint8Array> = {};
    for (const [name, data] of Object.entries(unzipSync(pkg)))
        if (name.startsWith(prefix) && !name.endsWith("/")) out[name.slice(prefix.length)] = data;
    return out;
};

/** the CC3200 release packages teddyCloud keeps, newest first */
/** the host name or IP of an input, also of a pasted address like "https://teddycloud.local/" */
const hostOnly = (input: string) =>
    input
        .trim()
        .replace(/^[a-z]+:\/\//i, "")
        .replace(/[/:].*$/, "")
        .replace(/[^a-zA-Z0-9.-]/g, "");

export const useCc3200Releases = () => {
    const firmware = useQuery({ queryKey: ["cfwFirmware"], queryFn: tc.cfwFirmware, retry: false });
    return {
        releases: (firmware.data?.images ?? [])
            .filter((i) => i.package && i.platform !== "esp32")
            .sort((a, b) => b.build - a.build),
        loading: firmware.isLoading,
    };
};

/**
 * The content of the SD card of a CC3200 box: SD bootloader, firmware, setup page and the server
 * settings, from a release package. On its own for a box that runs HackieboxNG already, or as the
 * last step of the setup in the browser (build given).
 */
export function Cc3200Card({
    build,
    mac = "",
    onSaved,
}: {
    build?: number;
    mac?: string;
    onSaved?: () => Promise<void>;
}) {
    const { releases, loading } = useCc3200Releases();
    const [chosen, setChosen] = useState<number | null>(null);
    const release = releases.find((r) => r.build === (build ?? chosen)) ?? releases[0];
    const apiPort = useQuery({
        queryKey: ["setting", "core.server.https_api_port"],
        queryFn: () => tc.getSetting("core.server.https_api_port"),
    });
    const [host, setHost] = useState(window.location.hostname);
    const [hostEdited, setHostEdited] = useState(false);
    // the address the other boxes use: the web address may be a reverse proxy the box cannot use
    const boxHost = useQuery({ queryKey: ["cfwBoxHost"], queryFn: tc.cfwBoxHost, retry: false });
    const seenHost = boxHost.data?.host.replace(/:\d+$/, "") ?? "";
    useEffect(() => {
        if (seenHost && !hostEdited) setHost(hostOnly(seenHost));
    }, [seenHost, hostEdited]);
    const [port, setPort] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
    useBusyGuard(busy);

    const boxPort = (port || apiPort.data || "443").trim();
    const portInvalid = !validPort(Number(boxPort));

    const download = async () => {
        if (!release) return;
        setBusy(true);
        setResult(null);
        try {
            const files = packageFiles(await tc.cfwPackage(release.build), "cc3200/card/");
            const lines = [`host=${host}`];
            if (boxPort !== "443") lines.push(`port=${boxPort}`);
            lines.push("ca=c2.der");
            files["cfw/config.txt"] = new TextEncoder().encode(lines.join("\n") + "\n");
            saveZip(zipSync(files, { level: 0 }), `toniebox-${mac || "cc3200"}-sdcard.zip`);
            await onSaved?.();
            setResult({ ok: true, text: t("setup.cc3200CardSaved") });
        } catch (e) {
            setResult({ ok: false, text: (e as Error).message });
        } finally {
            setBusy(false);
        }
    };

    if (!loading && releases.length === 0) return <Notice>{t("setup.cc3200ReleaseNone")}</Notice>;
    return (
        <>
            <p>{t("setup.cc3200CardText")}</p>
            {build === undefined && releases.length > 0 && (
                <div className="field">
                    <label>{t("setup.cc3200Release")}</label>
                    <select
                        className="select"
                        value={release?.build}
                        onChange={(e) => setChosen(Number(e.target.value))}
                    >
                        {releases.map((r) => (
                            <option key={r.build} value={r.build}>
                                {r.version || r.build} (
                                {t(`boxupdate.channel_${r.channel}` as never)})
                            </option>
                        ))}
                    </select>
                </div>
            )}
            <div className="field">
                <label>{t("setup.hostname")}</label>
                <input
                    className="input"
                    value={host}
                    onChange={(e) => {
                        setHost(hostOnly(e.target.value));
                        setHostEdited(true);
                    }}
                />
                <div className="hint">
                    {seenHost
                        ? t("setup.cc3200HostSeen", { host: seenHost })
                        : t("setup.cc3200HostHint")}
                </div>
            </div>
            <div className="field">
                <label>{t("setup.port")}</label>
                <input
                    className="input"
                    inputMode="numeric"
                    value={port || apiPort.data || "443"}
                    onChange={(e) => setPort(e.target.value)}
                    style={{ maxWidth: 140 }}
                />
                {portInvalid && (
                    <div className="hint" style={{ color: "var(--danger)" }}>
                        {t("setup.portInvalid")}
                    </div>
                )}
            </div>
            <button
                className="btn primary"
                disabled={busy || !host || portInvalid || !release}
                onClick={download}
            >
                {t("setup.cc3200CardDownload")}
            </button>
            <StatusLine busy={busy} text={t("setup.cc3200CardBuilding")} result={result} />
        </>
    );
}
