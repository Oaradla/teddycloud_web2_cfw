import { useQuery } from "@tanstack/react-query";
import { unzipSync, zipSync } from "fflate";
import { useRef, useState } from "react";
import { tc } from "../../api/tc";
import { Notice, Segmented, useUi } from "../../ui/kit";
import { Fold } from "../../ui/Fold";
import nwpBootloaderUrl from "./cc3200/rbtl3100s.dll?url";
import { Cc3200 } from "./cc3200/protocol";
import { Steps, UartHint, Warnings } from "./parts";
import { st } from "./texts";

const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** the 12 hex digits of the box ID in the common name of its client certificate */
const macOfCertificate = (der: Uint8Array): string => {
    for (let i = 0; i + 7 < der.length; i++) {
        // OID 2.5.4.3 (common name), then a string
        if (der[i] === 0x06 && der[i + 1] === 0x03 && der[i + 2] === 0x55 && der[i + 3] === 0x04 && der[i + 4] === 0x03) {
            const length = der[i + 6];
            const cn = String.fromCharCode(...der.subarray(i + 7, i + 7 + length));
            const hex = cn.match(/[0-9a-fA-F]{12}/);
            if (hex) return hex[0].toLowerCase();
        }
    }
    return "";
};

const save = (data: Uint8Array, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/zip" }));
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

/** the files of a release package below prefix, without it */
const packageFiles = (pkg: Uint8Array, prefix: string) => {
    const out: Record<string, Uint8Array> = {};
    for (const [name, data] of Object.entries(unzipSync(pkg))) if (name.startsWith(prefix) && !name.endsWith("/")) out[name.slice(prefix.length)] = data;
    return out;
};

/**
 * A CC3200 box set up from the browser: backup, certificates and CA, the SD bootloader's preloader,
 * and the card content, all from the release package teddyCloud keeps. The box stays connected
 * from the backup to the bootloader.
 */
export function Cc3200Browser() {
    const ui = useUi();
    const firmware = useQuery({ queryKey: ["cfwFirmware"], queryFn: tc.cfwFirmware, retry: false });
    const apiPort = useQuery({ queryKey: ["setting", "core.server.https_api_port"], queryFn: () => tc.getSetting("core.server.https_api_port") });
    const releases = (firmware.data?.images ?? []).filter((i) => i.package && i.platform !== "esp32").sort((a, b) => b.build - a.build);
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
    const [progress, setProgress] = useState(0);
    const [log, setLog] = useState<string[]>([]);
    const backup = useRef<{ flash: Uint8Array; files: Map<string, Uint8Array> } | null>(null);
    const [backupSaved, setBackupSaved] = useState(false);
    const [failed, setFailed] = useState<string[]>([]);
    const [mac, setMac] = useState("");
    const [certsDone, setCertsDone] = useState(false);
    const [bootloaderDone, setBootloaderDone] = useState(false);
    const [host, setHost] = useState(window.location.hostname);
    const [port, setPort] = useState("");

    const addLog = (line: string) => setLog((l) => [...l.slice(-300), line]);
    const run = async (what: () => Promise<void>) => {
        setBusy(true);
        try {
            await what();
        } catch (e) {
            const message = (e as Error).message;
            addLog(`error: ${message}`);
            ui.toast("error", message);
        } finally {
            setBusy(false);
            setStatus("");
            setProgress(0);
        }
    };

    const connectAndBackUp = () =>
        run(async () => {
            const port = await navigator.serial.requestPort();
            setStatus(st("cc3200Connecting"));
            const cc = await Cc3200.connect(port, {
                gateway,
                reset,
                log: addLog,
                askReset: async () => {
                    await ui.confirm({ title: st("cc3200Reset"), text: st("cc3200ResetAsk"), confirm: "OK" });
                },
                loadNwpBootloader: async () => new Uint8Array(await (await fetch(nwpBootloaderUrl)).arrayBuffer()),
            });
            box.current = cc;
            setConnected(true);
            setStatus(st("cc3200ReadingFlash"));
            const flash = await cc.readFlash((done, total) => setProgress(done / total));
            const all = await cc.readAllFiles((name, i, n) => {
                setStatus(st("cc3200ReadingFile", { name, i: i + 1, n }));
                setProgress((i + 1) / n);
            });
            backup.current = { flash, files: all.files };
            setFailed(all.failed);
            const client = all.files.get("/cert/client.der");
            const found = client ? macOfCertificate(client) : "";
            setMac(found);
            addLog(st("cc3200BackupDone", { files: all.files.size, kb: Math.round(flash.length / 1024), mac: found || "?" }));
        });

    const downloadBackup = () => {
        const b = backup.current!;
        const entries: Record<string, Uint8Array> = { "backup.bin": b.flash };
        for (const [name, data] of b.files) entries[`ExtractedFromBox${name.startsWith("/") ? "" : "/"}${name}`] = data;
        save(zipSync(entries, { level: 0 }), `toniebox-${mac || "cc3200"}-backup.zip`);
        setBackupSaved(true);
    };

    const certificates = () =>
        run(async () => {
            const files = backup.current!.files;
            const certs = ["ca.der", "client.der", "private.der"].map((name) => ({ name, data: files.get(`/cert/${name}`) }));
            const missing = certs.filter((c) => !c.data).map((c) => c.name);
            if (missing.length) throw new Error(`missing on the box: ${missing.join(", ")}`);
            await tc.uploadCertsByMac(mac, certs as { name: string; data: Uint8Array }[]);
            addLog(`certificates stored for ${mac}`);
            await box.current!.writeFile("/cert/c2.der", await tc.caReplacement());
            addLog("/cert/c2.der written");
            setCertsDone(true);
            ui.toast("ok", st("cc3200CertsDone"));
        });

    const bootloader = () =>
        run(async () => {
            if (!(await ui.confirm({ title: st("cc3200BootloaderConfirm"), text: st("cc3200BootloaderConfirmText"), confirm: st("cc3200BootloaderRun"), danger: true }))) return;
            const cc = box.current!;
            const preloader = packageFiles(await tc.cfwPackage(release!.build), "cc3200/flash/")["sys/mcuimg.bin"];
            if (!preloader) throw new Error("the package has no preloader");
            const current = backup.current!.files.get("/sys/mcuimg.bin");
            if (await cc.exists("/sys/pre-img.bin")) {
                // HackieboxNG is there: /sys/mcuimg.bin is its preloader already, the original stays in pre-img.bin
                addLog(st("cc3200HasHackiebox"));
                if (current && equal(current, preloader)) {
                    ui.toast("ok", st("cc3200BootloaderUpToDate"));
                    setBootloaderDone(true);
                    return;
                }
            } else {
                if (!current) throw new Error("/sys/mcuimg.bin was not in the backup");
                await cc.writeFile("/sys/pre-img.bin", current);
                addLog("original bootloader moved to /sys/pre-img.bin");
            }
            await cc.writeFile("/sys/mcuimg.bin", preloader);
            addLog("preloader written to /sys/mcuimg.bin");
            setBootloaderDone(true);
            ui.toast("ok", st("cc3200BootloaderDone"));
        });

    const card = () =>
        run(async () => {
            const files = packageFiles(await tc.cfwPackage(release!.build), "cc3200/card/");
            const lines = [`host=${host.trim()}`];
            const boxPort = (port || apiPort.data || "443").trim();
            if (boxPort !== "443") lines.push(`port=${boxPort}`);
            lines.push("ca=c2.der");
            files["cfw/config.txt"] = new TextEncoder().encode(lines.join("\n") + "\n");
            save(zipSync(files, { level: 0 }), `toniebox-${mac || "cc3200"}-sdcard.zip`);
            if (box.current) {
                await box.current.close();
                box.current = null;
                setConnected(false);
            }
        });

    if (!("serial" in navigator)) return <Notice>{st("esp32NoSerial")}</Notice>;
    if (window.location.protocol !== "https:") return <Notice>{st("esp32Https")}</Notice>;

    const steps = [
        <>
            <p>{st("cc3200BrowserIntro")}</p>
            <Warnings factoryReset="cc3200" />
            <UartHint />
            {releases.length === 0 ? (
                <Notice>{st("cc3200ReleaseNone")}</Notice>
            ) : (
                <div className="field">
                    <label>{st("cc3200Release")}</label>
                    <select className="select" value={release?.build} onChange={(e) => setBuild(Number(e.target.value))}>
                        {releases.map((r) => (
                            <option key={r.build} value={r.build}>
                                {r.version || r.build} ({r.channel})
                            </option>
                        ))}
                    </select>
                </div>
            )}
            <label className="small muted">{st("hwTool")}</label>
            <Segmented value={gateway ? "gw" : "uart"} onChange={(v) => setGateway(v === "gw")} options={[{ value: "uart", label: st("hwUart") }, { value: "gw", label: st("hwEsp32c3") }]} />
            {!gateway && (
                <>
                    <label className="small muted">{st("cc3200Reset")}</label>
                    <Segmented value={reset} onChange={setReset} options={[{ value: "dtr", label: st("cc3200ResetDtr") }, { value: "manual", label: st("cc3200ResetManual") }]} />
                </>
            )}
            <p className="small muted">{st("debugPortText")}</p>
            {(
                [
                    ["risk", "esp32AckRisk"],
                    ["fw", "esp32AckFw"],
                    ["uart", "uartAck"],
                ] as const
            ).map(([key, text]) => (
                <label key={key} className="check-row">
                    <input type="checkbox" checked={acks[key]} onChange={(e) => setAcks({ ...acks, [key]: e.target.checked })} />
                    {st(text)}
                </label>
            ))}
        </>,
        <>
            <p>{st("cc3200ConnectText")}</p>
            <button className="btn primary" disabled={busy || connected} onClick={connectAndBackUp}>
                {st("cc3200Connect")}
            </button>
            {backup.current && (
                <>
                    {failed.length > 0 && <Notice>{st("cc3200BackupFailed", { list: failed.join("; ") })}</Notice>}
                    <div className="field mt">
                        <label>{st("cc3200Mac")}</label>
                        <input className="input mono" value={mac} onChange={(e) => setMac(e.target.value.replace(/[^0-9a-fA-F]/g, "").toLowerCase().slice(0, 12))} />
                        <div className="hint">{st("cc3200MacHint")}</div>
                    </div>
                    <button className="btn" onClick={downloadBackup}>
                        {st("cc3200DownloadBackup")}
                    </button>
                </>
            )}
        </>,
        <>
            <p>{st("cc3200CertsText")}</p>
            <button className="btn primary" disabled={busy || !connected || certsDone || mac.length !== 12} onClick={certificates}>
                {st("cc3200CertsRun")}
            </button>
        </>,
        <>
            <p>{st("cc3200BootloaderText")}</p>
            <button className="btn primary" disabled={busy || !connected || bootloaderDone} onClick={bootloader}>
                {st("cc3200BootloaderRun")}
            </button>
        </>,
        <>
            <p>{st("cc3200CardText")}</p>
            <div className="field">
                <label>{st("hostname")}</label>
                <input className="input" value={host} onChange={(e) => setHost(e.target.value)} />
            </div>
            <div className="field">
                <label>{st("port")}</label>
                <input className="input" inputMode="numeric" value={port || apiPort.data || "443"} onChange={(e) => setPort(e.target.value)} style={{ maxWidth: 140 }} />
            </div>
            <button className="btn primary" disabled={busy || !host.trim()} onClick={card}>
                {st("cc3200CardDownload")}
            </button>
            <Notice info>{st("showBoxesHint")}</Notice>
        </>,
    ];

    // each step needs the one before done: the first two always, certificates and bootloader can be
    // skipped on purpose (done before, e.g. by hand), after a question
    const canGo = [releases.length > 0 && Object.values(acks).every(Boolean), backupSaved && mac.length === 12, certsDone, bootloaderDone, true];
    const blocked = [st("cc3200AcksFirst"), !backupSaved ? st("cc3200BackupFirst") : st("cc3200MacFirst")];
    const skip = [null, null, { title: st("cc3200CertsSkip"), text: st("cc3200CertsSkipText") }, { title: st("cc3200BootloaderSkip"), text: st("cc3200BootloaderSkipText") }];
    const goTo = async (n: number) => {
        for (let i = step; i < n; i++) {
            if (canGo[i]) continue;
            const ask = skip[i];
            if (!ask) {
                setStep(i);
                return ui.toast("info", blocked[i]);
            }
            setStep(i);
            if (!(await ui.confirm({ title: ask.title, text: ask.text, confirm: st("skipAnyway"), danger: true }))) return;
        }
        setStep(n);
    };

    return (
        <>
            <Steps
                titles={[st("esp32S1"), st("cc3200Connect"), st("cc3200Certs"), st("cc3200Bootloader"), st("cc3200Card")]}
                step={step}
                setStep={(n) => (n <= step ? setStep(n) : goTo(n))}
                last={
                    <a className="btn primary" href="#/">
                        {st("showBoxes")}
                    </a>
                }
            >
                {steps[step]}
                {status && (
                    <div className="setup-status">
                        {status}
                        {progress > 0 && (
                            <div className="progress">
                                <div style={{ width: `${Math.round(progress * 100)}%` }} />
                            </div>
                        )}
                    </div>
                )}
            </Steps>
            <div className="list mt">
                <Fold title={`${st("log")} · ${connected ? "●" : st("cc3200NotConnected")}`}>
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
                            {st("cc3200Disconnect")}
                        </button>
                    )}
                </Fold>
            </div>
        </>
    );
}
