import { useEffect, useRef, useState } from "react";
import { Notice, Page, useUi } from "../../ui/kit";
import { Fold } from "../../ui/Fold";
import j100 from "./img/esp32-j100.webp";
import uart from "./img/tb-esp32-uart.webp";
import uartClamp from "./img/tb-esp32-uart-clamp.webp";
import pcbClamp from "./img/esp32-pcb-clamp.webp";
import esptoolScreen from "./img/esp32-write-patched-image-with-esptools.webp";
import { ESP32_FLASH_STEPS } from "./esp32/esp32Constants";
import { useESP32Flasher } from "./esp32/useESP32Flasher";
import { Code, DnsGuide, ExtLink, Pics, UartHint, Warnings } from "./parts";
import { st } from "./texts";

/**
 * The ESP32 box in the browser: read the flash over Web Serial, patch it on the server (CA,
 * host name, port, Wi-Fi), write it back, store the box's certificates. The flashing itself is
 * the proven code of useESP32Flasher; this page only drives it.
 */
export function Esp32Page() {
    const ui = useUi();
    const anchor = useRef<HTMLDivElement>(null);
    const [log, setLog] = useState<string[]>([]);
    const f = useESP32Flasher(anchor.current, log, setLog);
    const { state, setState, currentStep: step } = f;
    const [acks, setAcks] = useState({ risk: false, fw: false, backup: false, uart: false });

    // the hook asks with its own dialog state; answered here with web2's dialog
    useEffect(() => {
        if (!f.isOverwriteForceConfirmationModalOpen) return;
        f.setIsOverwriteForceConfirmationModalOpen(false);
        ui.confirm({ title: st("overwriteCerts"), text: f.extractCertificateErrorMessage, confirm: st("overwrite"), danger: true }).then((ok) => {
            if (ok) void f.extractAndStoreCertsFromFlash(true);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [f.isOverwriteForceConfirmationModalOpen]);

    const flash = async () => {
        if (state.resetBox) return f.resetFlash();
        if (await ui.confirm({ title: st("confirmFlash"), text: st("confirmFlashText"), confirm: st("flashEsp32"), danger: true })) await f.writeFlash();
    };

    const titles = state.resetBox ? [st("esp32S1"), st("esp32S2"), st("esp32S4"), st("esp32S5")] : [st("esp32S1"), st("esp32S2"), st("esp32S3"), st("esp32S4"), st("esp32S5")];
    const shown = state.resetBox && step > ESP32_FLASH_STEPS.PATCH ? step - 1 : step;
    const busy = f.disableButtons;

    const manual = (
        <Fold title={st("manualTitle")} sub={st("manualText")}>
            <p>
                <ExtLink href="https://github.com/espressif/esptool">esptool</ExtLink>
            </p>
            <Code>{`# read the flash
esptool.py -b 921600 read_flash 0x0 0x800000 tb.esp32.bin
# certificates out of the image
mkdir certs/client/esp32
mkdir certs/client/<mac>
teddycloud --esp32-extract tb.esp32.bin --destination certs/client/esp32
cp certs/client/esp32/CLIENT.DER certs/client/<mac>/client.der
cp certs/client/esp32/PRIVATE.DER certs/client/<mac>/private.der
cp certs/client/esp32/CA.DER certs/client/<mac>/ca.der
# the first box: also as the default certificates of teddyCloud
cp certs/client/<mac>/client.der certs/client/client.der
cp certs/client/<mac>/private.der certs/client/private.der
cp certs/client/<mac>/ca.der certs/client/ca.der`}</Code>
            <Code>{`cp tb.esp32.bin tb.esp32.fakeca.bin
# the teddyCloud CA into the image
teddycloud --esp32-inject tb.esp32.fakeca.bin --source certs/client/esp32-fakeca
# host name of teddyCloud (optional; else DNS, see below)
teddycloud --esp32-hostpatch tb.esp32.fakeca.bin --hostname <YOUR-IP/HOST>
# write it
esptool.py -b 921600 write_flash 0x0 tb.esp32.fakeca.bin`}</Code>
            <Pics items={[{ src: esptoolScreen, alt: "esptool" }]} />
            <DnsGuide />
        </Fold>
    );

    if (!f.isSupported || !f.httpsActive)
        return (
            <Page title={st("esp32Title")} back="/setup" narrow>
                {!f.isSupported ? (
                    <Notice>{st("esp32NoSerial")}</Notice>
                ) : (
                    <Notice>
                        {st("esp32Https")}
                        <div className="mt">
                            <button className="btn primary small" onClick={f.openHttpsUrl} disabled={!f.httpsUrl}>
                                {st("esp32OpenHttps")}
                            </button>
                        </div>
                    </Notice>
                )}
                <div className="list mt">{manual}</div>
            </Page>
        );

    const chipInfo = state.chipType && (
        <table className="setup-table">
            <tbody>
                <tr>
                    <td>{st("chip")}</td>
                    <td>{state.chipType}</td>
                </tr>
                {state.chipMac && (
                    <tr>
                        <td>MAC</td>
                        <td className="mono">{state.chipMac}</td>
                    </tr>
                )}
                {state.flashSize && (
                    <tr>
                        <td>Flash</td>
                        <td>{state.flashSize} KiB</td>
                    </tr>
                )}
            </tbody>
        </table>
    );

    let body;
    let actions;
    if (step === ESP32_FLASH_STEPS.PREP) {
        body = (
            <>
                <Warnings factoryReset="other" />
                <UartHint />
                <p>{st("esp32Connect")}</p>
                <Pics
                    items={[
                        { src: j100, alt: "J100" },
                        { src: uart, alt: "J103" },
                        { src: uartClamp, alt: "J103 clamp" },
                        { src: pcbClamp, alt: "clothes peg" },
                    ]}
                />
                {(
                    [
                        ["risk", "esp32AckRisk"],
                        ["fw", "esp32AckFw"],
                        ["backup", "esp32AckBackup"],
                        ["uart", "uartAck"],
                    ] as const
                ).map(([key, text]) => (
                    <label key={key} className="check-row">
                        <input type="checkbox" checked={acks[key]} onChange={(e) => setAcks({ ...acks, [key]: e.target.checked })} />
                        {st(text)}
                    </label>
                ))}
            </>
        );
        actions = (
            <button className="btn primary" disabled={busy || !Object.values(acks).every(Boolean)} onClick={f.next}>
                {st("next")}
            </button>
        );
    } else if (step === ESP32_FLASH_STEPS.READ) {
        body = (
            <>
                <p>{st("esp32ReadText")}</p>
                <div className="row-gap" style={{ flexWrap: "wrap" }}>
                    <button className="btn primary" disabled={busy} onClick={() => (setState((p) => ({ ...p, resetBox: false })), f.readFlash())}>
                        {st("readFlash")}
                    </button>
                    <button className="btn" disabled={busy} onClick={async () => (setState((p) => ({ ...p, actionInProgress: true, resetBox: false })), await f.startLoadFlash())}>
                        {st("loadFile")}
                    </button>
                    <button className="btn" title={st("resetToOriginalHint")} disabled={busy} onClick={async () => (setState((p) => ({ ...p, actionInProgress: true, resetBox: true })), await f.startLoadFlash())}>
                        {st("resetToOriginal")}
                    </button>
                </div>
                <input ref={f.fileInputRef} type="file" hidden onChange={f.loadFlashFile} />
                {chipInfo}
            </>
        );
        actions = (
            <button className="btn primary" disabled={busy || (!state.proceed && !state.filename)} onClick={f.next}>
                {st("next")}
            </button>
        );
    } else if (step === ESP32_FLASH_STEPS.PATCH) {
        const set = (patch: Partial<typeof state>) => setState((p) => ({ ...p, ...patch }));
        body = (
            <>
                <p>{st("esp32PatchText")}</p>
                <div className="field">
                    <label>{st("hostname")}</label>
                    <input className="input" value={state.hostname} onChange={(e) => set({ hostname: e.target.value.trim() })} />
                    {state.warningTextHostname && <div className="hint">{state.warningTextHostname}</div>}
                    {state.hostname.length > 12 && <div className="hint">{st("hostnameTooLong")}</div>}
                </div>
                <label className="check-row">
                    <input type="checkbox" checked={state.flagPreviousHostname} onChange={(e) => set({ flagPreviousHostname: e.target.checked })} />
                    {st("previousHostnameFlag")}
                </label>
                {state.flagPreviousHostname && (
                    <div className="field">
                        <label>{st("previousHostname")}</label>
                        <input className="input" value={state.previousHostname} onChange={(e) => set({ previousHostname: e.target.value.trim() })} />
                    </div>
                )}
                <div className="field">
                    <label>{st("port")}</label>
                    <input className="input" inputMode="numeric" value={state.apiPort} onChange={(e) => set({ apiPort: e.target.value.trim() })} style={{ maxWidth: 140 }} />
                    <div className="hint">{state.warningTextApiPort || st("apiPortHint")}</div>
                </div>
                <div className="field">
                    <label>{st("wifiSsid")}</label>
                    <input className="input" value={state.wifi_ssid} onChange={(e) => set({ wifi_ssid: e.target.value })} />
                </div>
                <div className="field">
                    <label>{st("wifiPass")}</label>
                    <input className="input" type="password" value={state.wifi_pass} onChange={(e) => set({ wifi_pass: e.target.value })} />
                    {state.warningTextWifi && <div className="hint">{state.warningTextWifi}</div>}
                </div>
                <button className="btn primary" disabled={busy || !state.hostname || (state.flagPreviousHostname && !state.previousHostname)} onClick={f.patchFlash}>
                    {st("patch")}
                </button>
            </>
        );
        actions = (
            <button className="btn primary" disabled={busy || !state.showFlash} onClick={f.next}>
                {st("next")}
            </button>
        );
    } else if (step === ESP32_FLASH_STEPS.WRITE) {
        body = (
            <>
                <p>{st("esp32FlashText")}</p>
                <button className="btn primary" disabled={busy} onClick={flash}>
                    {st("flashEsp32")}
                </button>
            </>
        );
        actions = <span />;
    } else {
        body = (
            <>
                <Notice info>{state.resetBox ? st("esp32ResetDoneText") : st("esp32DoneText")}</Notice>
                {!state.resetBox && (
                    <>
                        <p className="small muted">{st("extractCertsHint", { dir: f.certDir })}</p>
                        <button className="btn primary" disabled={busy} onClick={() => f.extractAndStoreCertsFromFlash()}>
                            {st("extractCerts")}
                        </button>
                    </>
                )}
            </>
        );
        actions = !state.resetBox && (
            <a className="btn primary" href="#/">
                {st("showBoxes")}
            </a>
        );
    }

    return (
        <Page
            title={st("esp32Title")}
            back="/setup"
            narrow
            right={
                <select className="select small" value={f.baudRate} onChange={(e) => f.handleBaudrateChange(Number(e.target.value))} title={st("baudRate")} aria-label={st("baudRate")}>
                    {f.baudRates.map((r) => (
                        <option key={r} value={r}>
                            {r}
                        </option>
                    ))}
                </select>
            }
        >
            <div ref={anchor} />
            <div className="setup-steps">
                {titles.map((title, i) => (
                    <button key={title} className={i === shown ? "active" : i < shown ? "done" : ""} disabled>
                        <span>{i + 1}</span>
                        {title}
                    </button>
                ))}
            </div>
            <div className="setup-step">
                {body}
                {(state.showStatus || state.state) && (
                    <div className={`setup-status ${state.error ? "error" : ""}`}>
                        {state.state}
                        {state.showProgress && (
                            <div className="progress">
                                <div style={{ width: `${Math.round(state.progress)}%` }} />
                            </div>
                        )}
                    </div>
                )}
                {(state.downloadLink || state.downloadLinkPatched) && (
                    <div className="row-gap mt" style={{ flexWrap: "wrap" }}>
                        {state.downloadLink && (
                            <a className="btn small" href={state.downloadLink} download>
                                {st("downloadOriginal")}
                            </a>
                        )}
                        {state.downloadLinkPatched && (
                            <a className="btn small" href={state.downloadLinkPatched} download>
                                {st("downloadPatched")}
                            </a>
                        )}
                    </div>
                )}
            </div>
            <div className="btn-row mt">
                <button className="btn" disabled={busy || step === ESP32_FLASH_STEPS.PREP} onClick={f.prev}>
                    {st("back")}
                </button>
                {actions}
            </div>
            <div className="list mt">
                <Fold title={st("log")}>
                    <div className="log-view mono">
                        {log.map((l, i) => (
                            <div key={i}>{l}</div>
                        ))}
                    </div>
                    <button className="btn small mt" onClick={f.clearLog}>
                        {st("clearLog")}
                    </button>
                </Fold>
                {manual}
            </div>
        </Page>
    );
}
