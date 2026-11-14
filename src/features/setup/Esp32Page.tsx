import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { tc } from "../../api/tc";
import { esp32Releases } from "./esp32/cfwInstall";
import { Notice, Page, useUi } from "../../ui/kit";
import { Fold } from "../../ui/Fold";
import j100 from "./img/esp32-j100.webp";
import uart from "./img/tb-esp32-uart.webp";
import uartClamp from "./img/tb-esp32-uart-clamp.webp";
import pcbClamp from "./img/esp32-pcb-clamp.webp";
import esptoolScreen from "./img/esp32-write-patched-image-with-esptools.webp";
import { ESP32_FLASH_STEPS } from "./esp32/esp32Constants";
import { useESP32Flasher } from "./esp32/useESP32Flasher";
import {
    Code,
    DnsGuide,
    ExtLink,
    Pics,
    StatusLine,
    UartHint,
    Warnings,
    useBusyGuard,
} from "./parts";
import { useAccess } from "../../lib/access";
import { t } from "../../lib/i18n";

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
    // the custom firmware image is the admin's
    const admin = useAccess().admin;
    const firmware = useQuery({
        queryKey: ["cfwFirmware"],
        queryFn: tc.cfwFirmware,
        retry: false,
        enabled: admin,
    });
    const releases = esp32Releases(firmware.data?.images);
    // the library answers only with CFW support on
    const cfwOff = firmware.isError;

    // the hook asks with its own dialog state; answered here with web2's dialog
    useEffect(() => {
        if (!f.isOverwriteForceConfirmationModalOpen) return;
        f.setIsOverwriteForceConfirmationModalOpen(false);
        ui.confirm({
            title: t("setup.overwriteCerts"),
            text: f.extractCertificateErrorMessage,
            confirm: t("setup.overwrite"),
            danger: true,
        }).then((ok) => {
            if (ok) void f.extractAndStoreCertsFromFlash(true);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [f.isOverwriteForceConfirmationModalOpen]);

    const flash = async () => {
        if (
            await ui.confirm({
                title: t("setup.confirmFlash"),
                text: state.resetBox ? t("setup.confirmResetText") : t("setup.confirmFlashText"),
                confirm: t("setup.flashEsp32"),
                danger: true,
            })
        )
            await (state.resetBox ? f.resetFlash() : f.writeFlash());
    };

    const titles = state.resetBox
        ? [t("setup.esp32S1"), t("setup.esp32S2"), t("setup.esp32S4"), t("setup.esp32S5")]
        : [
              t("setup.esp32S1"),
              t("setup.esp32S2"),
              t("setup.esp32S3"),
              t("setup.esp32S4"),
              t("setup.esp32S5"),
          ];
    const shown = state.resetBox && step > ESP32_FLASH_STEPS.PATCH ? step - 1 : step;
    const busy = f.disableButtons;
    useBusyGuard(busy);
    // the outcome of the last action, kept until the next one starts
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
    const wasBusy = useRef(false);
    useEffect(() => {
        if (busy) setResult(null);
        else if (wasBusy.current)
            setResult({
                ok: !state.error,
                text:
                    state.state || (state.error ? t("setup.statusFailed") : t("setup.statusDone")),
            });
        wasBusy.current = busy;
    }, [busy]);

    const manual = (
        <Fold title={t("setup.manualTitle")} sub={t("setup.manualText")}>
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
cp certs/client/<mac>/ca.der certs/client/ca.der
# the box certificates with the teddyCloud CA, to put into the image
mkdir certs/client/esp32-fakeca
cp certs/client/esp32/CLIENT.DER certs/client/esp32-fakeca/
cp certs/client/esp32/PRIVATE.DER certs/client/esp32-fakeca/
cp certs/server/ca.der certs/client/esp32-fakeca/CA.DER`}</Code>
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
            <Page title={t("setup.esp32Title")} back="/setup" narrow>
                {!f.isSupported ? (
                    <Notice>{t("setup.esp32NoSerial")}</Notice>
                ) : (
                    <Notice>
                        {t("setup.esp32Https")}
                        <div className="mt">
                            <button
                                className="btn primary small"
                                onClick={f.openHttpsUrl}
                                disabled={!f.httpsUrl}
                            >
                                {t("setup.esp32OpenHttps")}
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
                    <td>{t("setup.chip")}</td>
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
                <p>{t("setup.esp32Connect")}</p>
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
                        ["risk", "setup.esp32AckRisk"],
                        ["fw", "setup.esp32AckFw"],
                        ["backup", "setup.esp32AckBackup"],
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
            </>
        );
        actions = (
            <button
                className="btn primary"
                disabled={busy || !Object.values(acks).every(Boolean)}
                onClick={f.next}
            >
                {t("setup.next")}
            </button>
        );
    } else if (step === ESP32_FLASH_STEPS.READ) {
        body = (
            <>
                <p>{t("setup.esp32ReadText")}</p>
                <div className="row-gap" style={{ flexWrap: "wrap" }}>
                    <button
                        className="btn primary"
                        disabled={busy}
                        onClick={() => (
                            setState((p) => ({ ...p, resetBox: false })),
                            f.readFlash()
                        )}
                    >
                        {t("setup.readFlash")}
                    </button>
                    <button
                        className="btn"
                        disabled={busy}
                        onClick={async () => (
                            setState((p) => ({ ...p, actionInProgress: true, resetBox: false })),
                            await f.startLoadFlash()
                        )}
                    >
                        {t("setup.loadFile")}
                    </button>
                    <button
                        className="btn"
                        title={t("setup.resetToOriginalHint")}
                        disabled={busy}
                        onClick={async () => (
                            setState((p) => ({ ...p, actionInProgress: true, resetBox: true })),
                            await f.startLoadFlash()
                        )}
                    >
                        {t("setup.resetToOriginal")}
                    </button>
                </div>
                <input ref={f.fileInputRef} type="file" hidden onChange={f.loadFlashFile} />
                {chipInfo}
            </>
        );
        actions = (
            <button
                className="btn primary"
                disabled={busy || (!state.proceed && !state.filename)}
                onClick={f.next}
            >
                {t("setup.next")}
            </button>
        );
    } else if (step === ESP32_FLASH_STEPS.PATCH) {
        const set = (patch: Partial<typeof state>) => setState((p) => ({ ...p, ...patch }));
        body = (
            <>
                <p>{t("setup.esp32PatchText")}</p>
                <div className="field">
                    <label>{t("setup.hostname")}</label>
                    <input
                        className="input"
                        value={state.hostname}
                        onChange={(e) => set({ hostname: e.target.value.trim() })}
                    />
                    {state.warningTextHostname && (
                        <div className="hint">{state.warningTextHostname}</div>
                    )}
                    {state.hostname.length > 12 && (
                        <div className="hint">{t("setup.hostnameTooLong")}</div>
                    )}
                </div>
                <label className="check-row">
                    <input
                        type="checkbox"
                        checked={state.flagPreviousHostname}
                        onChange={(e) => set({ flagPreviousHostname: e.target.checked })}
                    />
                    {t("setup.previousHostnameFlag")}
                </label>
                {state.flagPreviousHostname && (
                    <div className="field">
                        <label>{t("setup.previousHostname")}</label>
                        <input
                            className="input"
                            value={state.previousHostname}
                            onChange={(e) => set({ previousHostname: e.target.value.trim() })}
                        />
                    </div>
                )}
                <div className="field">
                    <label>{t("setup.port")}</label>
                    <input
                        className="input"
                        inputMode="numeric"
                        value={state.apiPort}
                        onChange={(e) => set({ apiPort: e.target.value.trim() })}
                        style={{ maxWidth: 140 }}
                    />
                    <div className="hint">{state.warningTextApiPort || t("setup.apiPortHint")}</div>
                </div>
                <div className="field">
                    <label>{t("setup.wifiSsid")}</label>
                    <input
                        className="input"
                        value={state.wifi_ssid}
                        onChange={(e) => set({ wifi_ssid: e.target.value })}
                    />
                </div>
                <div className="field">
                    <label>{t("setup.wifiPass")}</label>
                    <input
                        className="input"
                        type="password"
                        value={state.wifi_pass}
                        onChange={(e) => set({ wifi_pass: e.target.value })}
                    />
                    {state.warningTextWifi && <div className="hint">{state.warningTextWifi}</div>}
                </div>
                <button
                    className="btn primary"
                    disabled={
                        busy ||
                        !state.hostname ||
                        (state.flagPreviousHostname && !state.previousHostname)
                    }
                    onClick={f.patchFlash}
                >
                    {t("setup.patch")}
                </button>
            </>
        );
        actions = (
            <button className="btn primary" disabled={busy || !state.showFlash} onClick={f.next}>
                {t("setup.next")}
            </button>
        );
    } else if (step === ESP32_FLASH_STEPS.WRITE) {
        body = (
            <>
                <p>{t("setup.esp32FlashText")}</p>
                {admin && !state.resetBox && !state.proceed && (
                    <div className="field">
                        <label>{t("setup.esp32Firmware")}</label>
                        <select
                            className="select"
                            value={state.cfwBuild}
                            disabled={busy}
                            onChange={(e) =>
                                setState((p) => ({ ...p, cfwBuild: Number(e.target.value) }))
                            }
                        >
                            <option value={0}>{t("setup.esp32FirmwareOriginal")}</option>
                            {releases.length === 0 && (
                                <option value={-1} disabled>
                                    {t("setup.esp32FirmwareCustom")}
                                </option>
                            )}
                            {releases.map((r) => (
                                <option key={r.build} value={r.build}>
                                    {t("setup.esp32FirmwareCustom")} {r.version || r.build} (
                                    {t(`boxupdate.channel_${r.channel}` as never)})
                                </option>
                            ))}
                        </select>
                        {releases.length === 0 && !firmware.isLoading && (
                            <div className="hint">
                                {t(cfwOff ? "setup.esp32CfwSupportOff" : "setup.esp32CfwNoImage")}
                            </div>
                        )}
                    </div>
                )}
                {state.cfwBuild !== 0 && <Notice>{t("setup.esp32CfwHint")}</Notice>}
                <button className="btn primary" disabled={busy} onClick={flash}>
                    {t("setup.flashEsp32")}
                </button>
            </>
        );
        actions = <span />;
    } else {
        body = (
            <>
                <Notice info>
                    {state.resetBox ? t("setup.esp32ResetDoneText") : t("setup.esp32DoneText")}
                </Notice>
                {!state.resetBox && (
                    <>
                        <p className="small muted">
                            {t("setup.extractCertsHint", { dir: f.certDir })}
                        </p>
                        <button
                            className="btn primary"
                            disabled={busy}
                            onClick={() => f.extractAndStoreCertsFromFlash()}
                        >
                            {t("setup.extractCerts")}
                        </button>
                    </>
                )}
            </>
        );
        actions = !state.resetBox && (
            <a className="btn primary" href="#/">
                {t("setup.showBoxes")}
            </a>
        );
    }

    return (
        <Page
            title={t("setup.esp32Title")}
            back="/setup"
            narrow
            right={
                <select
                    className="select small"
                    value={f.baudRate}
                    onChange={(e) => f.handleBaudrateChange(Number(e.target.value))}
                    title={t("setup.baudRate")}
                    aria-label={t("setup.baudRate")}
                >
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
                    <button
                        key={title}
                        className={i === shown ? "active" : i < shown ? "done" : ""}
                        disabled
                    >
                        <span>{i + 1}</span>
                        {title}
                    </button>
                ))}
            </div>
            <div className="setup-step">
                {body}
                <StatusLine
                    busy={busy}
                    text={state.state}
                    progress={state.showProgress ? state.progress / 100 : 0}
                    result={result}
                />
                {(state.downloadLink || state.downloadLinkPatched) && (
                    <div className="row-gap mt" style={{ flexWrap: "wrap" }}>
                        {state.downloadLink && (
                            <a
                                className="btn small"
                                href={state.downloadLink}
                                download={state.filename || "ESP32_backup.bin"}
                            >
                                {t("setup.downloadOriginal")}
                            </a>
                        )}
                        {state.downloadLinkPatched && (
                            <a
                                className="btn small"
                                href={state.downloadLinkPatched}
                                download={`patched_${state.chipMac.replace(/:/g, "")}.bin`}
                            >
                                {t("setup.downloadPatched")}
                            </a>
                        )}
                    </div>
                )}
            </div>
            <div className="btn-row mt">
                <button
                    className="btn"
                    disabled={busy || step === ESP32_FLASH_STEPS.PREP}
                    onClick={f.prev}
                >
                    {t("setup.back")}
                </button>
                {actions}
            </div>
            <div className="list mt">
                <Fold title={t("setup.log")}>
                    <div className="log-view mono">
                        {log.map((l, i) => (
                            <div key={i}>{l}</div>
                        ))}
                    </div>
                    <button className="btn small mt" onClick={f.clearLog}>
                        {t("setup.clearLog")}
                    </button>
                </Fold>
                {manual}
            </div>
        </Page>
    );
}
