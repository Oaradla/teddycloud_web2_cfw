import { useQuery } from "@tanstack/react-query";
import { zipSync } from "fflate";
import { useEffect, useRef, useState } from "react";
import { tc } from "../../api/tc";
import { Notice, Segmented, useUi } from "../../ui/kit";
import { Fold } from "../../ui/Fold";
import nwpBootloaderUrl from "./cc3200/rbtl3100s.dll?url";
import { Cc3200, Cc3200Error } from "./cc3200/protocol";
import { Cc3200Card, packageFiles, saveZip } from "./Cc3200Card";
import { StatusLine, Steps, UartHint, Warnings, useBusyGuard } from "./parts";
import { t, type Key } from "../../lib/i18n";

const equal = (a: Uint8Array, b: Uint8Array) =>
    a.length === b.length && a.every((x, i) => x === b[i]);

/** a HackieboxNG preloader names the SD bootloader it starts; the box's original bootloader does not */
const isPreloader = (image: Uint8Array) =>
    new TextDecoder("latin1").decode(image).includes("/revvox/boot/ngbootloader.bin");

/** the 12 hex digits of the box ID in the common name of its client certificate */
const macOfCertificate = (der: Uint8Array): string => {
    for (let i = 0; i + 7 < der.length; i++) {
        // OID 2.5.4.3 (common name), then a string
        if (
            der[i] === 0x06 &&
            der[i + 1] === 0x03 &&
            der[i + 2] === 0x55 &&
            der[i + 3] === 0x04 &&
            der[i + 4] === 0x03
        ) {
            const length = der[i + 6];
            const cn = String.fromCharCode(...der.subarray(i + 7, i + 7 + length));
            const hex = cn.match(/[0-9a-fA-F]{12}/);
            if (hex) return hex[0].toLowerCase();
        }
    }
    return "";
};

/**
 * A CC3200 box set up from the browser: backup, certificates and CA, the SD bootloader's preloader,
 * and the card content, all from the release package teddyCloud keeps. The box stays connected
 * from the backup to the bootloader.
 */
const errorText = (e: unknown) =>
    e instanceof Cc3200Error
        ? t(`setup.cc3200Errors.${e.key}` as Key, e.values)
        : String((e as Error)?.message ?? e);

export function Cc3200Browser() {
    const ui = useUi();
    const firmware = useQuery({ queryKey: ["cfwFirmware"], queryFn: tc.cfwFirmware, retry: false });
    const releases = (firmware.data?.images ?? [])
        .filter((i) => i.package && i.platform !== "esp32")
        .sort((a, b) => b.build - a.build);
    const [build, setBuild] = useState<number | null>(null);
    const release = releases.find((r) => r.build === build) ?? releases[0];

    const [step, setStep] = useState(0);
    const [gateway, setGateway] = useState(false);
    const [reset, setReset] = useState<"dtr" | "manual">("dtr");
    const [acks, setAcks] = useState({ risk: false, fw: false, uart: false });
    const box = useRef<Cc3200 | null>(null);
    const [connected, setConnected] = useState(false);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
    const [progress, setProgress] = useState(0);
    const [log, setLog] = useState<string[]>([]);
    const backup = useRef<{ flash: Uint8Array; files: Map<string, Uint8Array> } | null>(null);
    const [backupSaved, setBackupSaved] = useState(false);
    const [backupStored, setBackupStored] = useState("");
    const [failed, setFailed] = useState<{ name: string; error: unknown }[]>([]);
    const [mac, setMac] = useState("");
    const [certsDone, setCertsDone] = useState(false);
    const [bootloaderDone, setBootloaderDone] = useState(false);

    useBusyGuard(busy);
    useEffect(() => () => void box.current?.close(), []);
    const addLog = (line: string) => setLog((l) => [...l.slice(-300), line]);
    /** runs one action on the box; what it returns is shown as done, nothing (e.g. cancelled) keeps the last result */
    const run = async (what: () => Promise<string | void>) => {
        setBusy(true);
        setResult(null);
        try {
            const done = await what();
            if (done) setResult({ ok: true, text: done });
        } catch (e) {
            const message = errorText(e);
            addLog(`error: ${message}`);
            ui.toast("error", message);
            setResult({ ok: false, text: message });
        } finally {
            setBusy(false);
            setStatus("");
            setProgress(0);
        }
    };

    const connectAndBackUp = () =>
        run(async () => {
            const port = await navigator.serial.requestPort();
            setStatus(t("setup.cc3200Connecting"));
            const cc = await Cc3200.connect(port, {
                gateway,
                reset,
                log: addLog,
                askReset: async () => {
                    await ui.confirm({
                        title: t("setup.cc3200Reset"),
                        text: t("setup.cc3200ResetAsk"),
                        confirm: "OK",
                    });
                },
                loadNwpBootloader: async () =>
                    new Uint8Array(await (await fetch(nwpBootloaderUrl)).arrayBuffer()),
            });
            box.current = cc;
            setConnected(true);
            // closed on a failed read, so that Connect reads again
            const closeOnError = async (e: unknown): Promise<never> => {
                await closeBox();
                throw e;
            };
            setStatus(t("setup.cc3200ReadingFlash"));
            const flash = await cc
                .readFlash((done, total) => setProgress(done / total))
                .catch(closeOnError);
            const all = await cc
                .readAllFiles((name, i, n) => {
                    setStatus(t("setup.cc3200ReadingFile", { name, i: i + 1, n }));
                    setProgress((i + 1) / n);
                })
                .catch(closeOnError);
            backup.current = { flash, files: all.files };
            setFailed(all.failed);
            const client = all.files.get("/cert/client.der");
            const found = client ? macOfCertificate(client) : "";
            setMac(found);
            const done = t("setup.cc3200BackupDone", {
                files: all.files.size,
                kb: Math.round(flash.length / 1024),
                mac: found || "?",
            });
            addLog(done);
            // the flash dump also stays on the server, as with the ESP32 box
            const stored = await tc
                .storeFlashDump(`CC3200_${found || "unknown"}`, flash)
                .catch((e) => {
                    addLog(t("setup.cc3200BackupNotStored", { reason: String(e?.message ?? e) }));
                    return "";
                });
            setBackupStored(stored);
            if (stored) {
                setBackupSaved(true);
                addLog(`backup stored on the server: ${stored}`);
            }
            return done;
        });

    const downloadBackup = () => {
        const b = backup.current!;
        const entries: Record<string, Uint8Array> = { "backup.bin": b.flash };
        for (const [name, data] of b.files)
            entries[`ExtractedFromBox${name.startsWith("/") ? "" : "/"}${name}`] = data;
        saveZip(zipSync(entries, { level: 0 }), `toniebox-${mac || "cc3200"}-backup.zip`);
        setBackupSaved(true);
    };

    const certificates = () =>
        run(async () => {
            const files = backup.current!.files;
            const certs = ["ca.der", "client.der", "private.der"].map((name) => ({
                name,
                data: files.get(`/cert/${name}`),
            }));
            const missing = certs.filter((c) => !c.data).map((c) => c.name);
            if (missing.length)
                throw new Error(
                    t("setup.cc3200Errors.certsMissing", { names: missing.join(", ") }),
                );
            await tc.uploadCertsByMac(mac, certs as { name: string; data: Uint8Array }[]);
            addLog(`certificates stored for ${mac}`);
            await box.current!.writeFile("/cert/c2.der", await tc.caReplacement());
            addLog("/cert/c2.der written");
            setCertsDone(true);
            ui.toast("ok", t("setup.cc3200CertsDone"));
            return t("setup.cc3200CertsDone");
        });

    const bootloader = () =>
        run(async () => {
            if (
                !(await ui.confirm({
                    title: t("setup.cc3200BootloaderConfirm"),
                    text: t("setup.cc3200BootloaderConfirmText"),
                    confirm: t("setup.cc3200BootloaderRun"),
                    danger: true,
                }))
            )
                return;
            const cc = box.current!;
            const preloader = packageFiles(await tc.cfwPackage(release!.build), "cc3200/flash/")[
                "sys/mcuimg.bin"
            ];
            if (!preloader) throw new Error(t("setup.cc3200Errors.noPreloader"));
            const current = backup.current!.files.get("/sys/mcuimg.bin");
            if (!current) throw new Error(t("setup.cc3200Errors.noMcuimg"));
            if (isPreloader(current)) {
                // HackieboxNG is there: the original stays in pre-img.bin
                addLog(t("setup.cc3200HasHackiebox"));
                if (equal(current, preloader)) {
                    ui.toast("ok", t("setup.cc3200BootloaderUpToDate"));
                    setBootloaderDone(true);
                    return t("setup.cc3200BootloaderUpToDate");
                }
            } else {
                // also over a pre-img.bin an earlier, failed run left behind
                await cc.writeFile("/sys/pre-img.bin", current);
                addLog("original bootloader moved to /sys/pre-img.bin");
            }
            await cc.writeFile("/sys/mcuimg.bin", preloader);
            addLog("preloader written to /sys/mcuimg.bin");
            setBootloaderDone(true);
            ui.toast("ok", t("setup.cc3200BootloaderDone"));
            return t("setup.cc3200BootloaderDone");
        });

    /** after the card content: the box is done with the serial port */
    const closeBox = async () => {
        if (box.current) {
            await box.current.close();
            box.current = null;
            setConnected(false);
        }
    };

    if (!("serial" in navigator)) return <Notice>{t("setup.esp32NoSerial")}</Notice>;
    if (window.location.protocol !== "https:") return <Notice>{t("setup.esp32Https")}</Notice>;

    const steps = [
        <>
            <p>{t("setup.cc3200BrowserIntro")}</p>
            <Warnings factoryReset="cc3200" />
            <UartHint />
            {releases.length === 0 ? (
                <Notice>{t("setup.cc3200ReleaseNone")}</Notice>
            ) : (
                <div className="field">
                    <label>{t("setup.cc3200Release")}</label>
                    <select
                        className="select"
                        value={release?.build}
                        onChange={(e) => setBuild(Number(e.target.value))}
                    >
                        {releases.map((r) => (
                            <option key={r.build} value={r.build}>
                                {r.version || r.build} ({r.channel})
                            </option>
                        ))}
                    </select>
                </div>
            )}
            <label className="small muted">{t("setup.hwTool")}</label>
            <Segmented
                value={gateway ? "gw" : "uart"}
                onChange={(v) => setGateway(v === "gw")}
                options={[
                    { value: "uart", label: t("setup.hwUart") },
                    { value: "gw", label: t("setup.hwEsp32c3") },
                ]}
            />
            {!gateway && (
                <>
                    <label className="small muted">{t("setup.cc3200Reset")}</label>
                    <Segmented
                        value={reset}
                        onChange={setReset}
                        options={[
                            { value: "dtr", label: t("setup.cc3200ResetDtr") },
                            { value: "manual", label: t("setup.cc3200ResetManual") },
                        ]}
                    />
                </>
            )}
            <p className="small muted">{t("setup.debugPortText")}</p>
            {(
                [
                    ["risk", "setup.esp32AckRisk"],
                    ["fw", "setup.esp32AckFw"],
                    ["uart", "setup.uartAck"],
                ] as const
            ).map(([key, text]) => (
                <label key={key} className="check-row">
                    <input
                        type="checkbox"
                        checked={acks[key]}
                        onChange={(e) => setAcks({ ...acks, [key]: e.target.checked })}
                    />
                    {t(text)}
                </label>
            ))}
        </>,
        <>
            <p>{t("setup.cc3200ConnectText")}</p>
            <button className="btn primary" disabled={busy || connected} onClick={connectAndBackUp}>
                {t("setup.cc3200Connect")}
            </button>
            {backup.current && (
                <>
                    {failed.length > 0 && (
                        <Notice>
                            {t("setup.cc3200BackupFailed", {
                                list: failed
                                    .map((f) => (f.name ? `${f.name}: ` : "") + errorText(f.error))
                                    .join("; "),
                            })}
                        </Notice>
                    )}
                    <div className="field mt">
                        <label>{t("setup.cc3200Mac")}</label>
                        <input
                            className="input mono"
                            value={mac}
                            onChange={(e) =>
                                setMac(
                                    e.target.value
                                        .replace(/[^0-9a-fA-F]/g, "")
                                        .toLowerCase()
                                        .slice(0, 12),
                                )
                            }
                        />
                        <div className="hint">{t("setup.cc3200MacHint")}</div>
                    </div>
                    {backupStored && (
                        <Notice info>
                            {t("setup.cc3200BackupStored", { name: backupStored })}
                        </Notice>
                    )}
                    <button className="btn" onClick={downloadBackup}>
                        {t("setup.cc3200DownloadBackup")}
                    </button>
                </>
            )}
        </>,
        <>
            <p>{t("setup.cc3200CertsText")}</p>
            <button
                className="btn primary"
                disabled={busy || !connected || certsDone || mac.length !== 12}
                onClick={certificates}
            >
                {t("setup.cc3200CertsRun")}
            </button>
        </>,
        <>
            <p>{t("setup.cc3200BootloaderText")}</p>
            <button
                className="btn primary"
                disabled={busy || !connected || bootloaderDone}
                onClick={bootloader}
            >
                {t("setup.cc3200BootloaderRun")}
            </button>
        </>,
        <>
            <Cc3200Card build={release?.build} mac={mac} onSaved={closeBox} />
            <Notice info>{t("setup.showBoxesHint")}</Notice>
        </>,
    ];

    // each step needs the one before done: the first two always, certificates and bootloader can be
    // skipped on purpose (done before, e.g. by hand), after a question
    const canGo = [
        releases.length > 0 && Object.values(acks).every(Boolean),
        backupSaved && mac.length === 12,
        certsDone,
        bootloaderDone,
        true,
    ];
    const blocked = [
        t("setup.cc3200AcksFirst"),
        !backupSaved ? t("setup.cc3200BackupFirst") : t("setup.cc3200MacFirst"),
    ];
    const skip = [
        null,
        null,
        { title: t("setup.cc3200CertsSkip"), text: t("setup.cc3200CertsSkipText") },
        { title: t("setup.cc3200BootloaderSkip"), text: t("setup.cc3200BootloaderSkipText") },
    ];
    const goTo = async (n: number) => {
        for (let i = step; i < n; i++) {
            if (canGo[i]) continue;
            const ask = skip[i];
            if (!ask) {
                setStep(i);
                return ui.toast("info", blocked[i]);
            }
            setStep(i);
            if (
                !(await ui.confirm({
                    title: ask.title,
                    text: ask.text,
                    confirm: t("setup.skipAnyway"),
                    danger: true,
                }))
            )
                return;
        }
        setStep(n);
    };

    return (
        <>
            <Steps
                titles={[
                    t("setup.esp32S1"),
                    t("setup.cc3200Connect"),
                    t("setup.cc3200Certs"),
                    t("setup.cc3200Bootloader"),
                    t("setup.cc3200Card"),
                ]}
                step={step}
                busy={busy}
                setStep={(n) => (n <= step ? setStep(n) : goTo(n))}
                last={
                    <a className="btn primary" href="#/">
                        {t("setup.showBoxes")}
                    </a>
                }
            >
                {steps[step]}
                <StatusLine busy={busy} text={status} progress={progress} result={result} />
            </Steps>
            <div className="list mt">
                <Fold
                    title={`${t("setup.log")} · ${connected ? "●" : t("setup.cc3200NotConnected")}`}
                >
                    <div className="log-view mono">
                        {log.map((l, i) => (
                            <div key={i}>{l}</div>
                        ))}
                    </div>
                    {connected && (
                        <button
                            className="btn small mt"
                            onClick={async () => {
                                await box.current?.close();
                                box.current = null;
                                setConnected(false);
                            }}
                        >
                            {t("setup.cc3200Disconnect")}
                        </button>
                    )}
                </Fold>
            </div>
        </>
    );
}
