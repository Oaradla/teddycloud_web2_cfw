import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Notice, Page, Segmented } from "../../ui/kit";
import { Cc3200Browser } from "./Cc3200Browser";
import { Cc3200Card } from "./Cc3200Card";
import debugPort from "./img/cc3200-debugport.webp";
import tagConnector from "./img/cc3200-tagconnector.webp";
import wires from "./img/cc3200-wiresastagconnector.webp";
import cfwUpload from "./img/cc3200-installcfwflashupload.webp";
import jumper1 from "./img/uart-3v3-5v-jumper-black.webp";
import jumper2 from "./img/uart-3v3-5v-jumper-switch.webp";
import jumper3 from "./img/uart-3v3-5v-jumper-yellow.webp";
import { ALT_URL_MAX, altPortPatch, altUrlPatch, download, validPort } from "./patches";
import { Code, DnsGuide, ExtLink, Pics, Steps, UartHint, Warnings } from "./parts";
import { st } from "./texts";

/** the CC3200 box: backup, HackieboxNG bootloader, certificates and the patches that point it to teddyCloud */
export function Cc3200Page() {
    const [params] = useSearchParams();
    const [way, setWay] = useState<"browser" | "manual" | "card">(
        params.get("way") === "card" ? "card" : "serial" in navigator ? "browser" : "manual",
    );
    const [step, setStep] = useState(0);
    const [hw, setHw] = useState<"uart" | "esp32c3">("uart");
    const [host, setHost] = useState("");
    const [port, setPort] = useState("");
    const tool = `cc3200tool -p COM3 ${hw === "esp32c3" ? "--gateway " : ""}`;

    const steps = [
        <>
            <Warnings factoryReset="cc3200" />
            <div className="mt">
                <label className="small muted">{st("hwTool")}</label>
                <Segmented
                    value={hw}
                    onChange={setHw}
                    options={[
                        { value: "uart", label: st("hwUart") },
                        { value: "esp32c3", label: st("hwEsp32c3") },
                    ]}
                />
            </div>
            {hw === "uart" ? (
                <>
                    <UartHint />
                    <Pics
                        items={[jumper1, jumper2, jumper3].map((src) => ({ src, alt: "3V3 / 5V" }))}
                    />
                </>
            ) : (
                <p>
                    {st("esp32c3Text")}{" "}
                    <ExtLink href="https://g3gg0.github.io/ESP32-UART-Gateway/flasher.html">
                        ESP32-UART-Gateway
                    </ExtLink>
                </p>
            )}
            <p>{st("debugPortText")}</p>
            <Pics
                items={[
                    { src: debugPort, alt: "Debug port" },
                    { src: tagConnector, alt: "TC2050" },
                    { src: wires, alt: "Wires" },
                ]}
            />
            <h3>{st("toolTitle")}</h3>
            <p>{st("toolText")}</p>
            <Code>
                {"pip install git+https://github.com/toniebox-reverse-engineering/cc3200tool.git"}
            </Code>
        </>,
        <>
            <Notice info>{st("resetHint")}</Notice>
            <p>{st("backupText")}</p>
            <Code>{`${tool}read_all_files ExtractedFromBox/ read_flash backup.bin`}</Code>
            <Code>{`${tool}read_all_files ExtractedFromBox/\n${tool}read_flash backup.bin`}</Code>
            <p>
                {st("bootloaderText")}{" "}
                <ExtLink href="https://github.com/toniebox-reverse-engineering/hackiebox_cfw_ng/releases">
                    HackieboxNG
                </ExtLink>
            </p>
            <Notice>{st("bootloaderWarn")}</Notice>
            <Code>{`${tool}write_file ExtractedFromBox/sys/mcuimg.bin /sys/pre-img.bin\n${tool}write_file flash/sys/mcuimg.bin /sys/mcuimg.bin`}</Code>
            <p>{st("sdText")}</p>
            <p className="small muted">{st("updateText")}</p>
            <Pics items={[{ src: cfwUpload, alt: "Hackiebox CFW upload" }]} />
        </>,
        <>
            <p>{st("certText")}</p>
            <Code>{`${tool}write_file c2.der /cert/c2.der`}</Code>
            <p>{st("certAgain")}</p>
            <Code>{`${tool}read_file /cert/ca.der ExtractedFromBox/cert/ca.der read_file /cert/private.der ExtractedFromBox/cert/private.der read_file /cert/client.der ExtractedFromBox/cert/client.der`}</Code>
        </>,
        <>
            <p>{st("patchesText")}</p>
            <DnsGuide />
            <div className="field mt">
                <label>{st("hostname")}</label>
                <div className="row-gap">
                    <input
                        className="input"
                        value={host}
                        onChange={(e) => setHost(e.target.value.trim())}
                        placeholder="tc.local"
                    />
                    <button
                        className="btn small"
                        disabled={!host || host.length > ALT_URL_MAX}
                        onClick={() => download("altUrl.custom.305.json", altUrlPatch(host))}
                    >
                        {st("createUrlPatch")}
                    </button>
                </div>
                {host.length > ALT_URL_MAX && (
                    <div className="hint" style={{ color: "var(--danger)" }}>
                        {st("hostnameTooLong")}
                    </div>
                )}
            </div>
            <p className="small muted">{st("portPatchText")}</p>
            <div className="field">
                <label>{st("port")}</label>
                <div className="row-gap">
                    <input
                        className="input"
                        inputMode="numeric"
                        value={port}
                        onChange={(e) => setPort(e.target.value.trim())}
                        placeholder="10443"
                        style={{ maxWidth: 140 }}
                    />
                    <button
                        className="btn small"
                        disabled={!validPort(Number(port))}
                        onClick={() => download("altPort.custom.json", altPortPatch(Number(port)))}
                    >
                        {st("createPortPatch")}
                    </button>
                </div>
                {port && !validPort(Number(port)) && (
                    <div className="hint" style={{ color: "var(--danger)" }}>
                        {st("portInvalid")}
                    </div>
                )}
            </div>
        </>,
        <>
            <p>{st("applyText")}</p>
            <Code>{`{
    "general": {
        "activeImg": "ofw2",
        ...
    },
    ...
    "ofw2": {
        "checkHash": true,
        "hashFile": false,
        "watchdog": true,
        "ofwFix": true,
        "ofwSimBL": true,
        "patches": ["altCa.305", "altUrl.custom.305"]
    }
}`}</Code>
            <p className="small muted">{st("cfgText")}</p>
            <p>
                <ExtLink href="https://tonies-wiki.revvox.de/docs/custom-firmware/cc3200/hackieboxng-bl/ofw-patches/">
                    {st("patchWiki")}
                </ExtLink>
            </p>
            <Notice info>{st("showBoxesHint")}</Notice>
        </>,
    ];

    return (
        <Page title={st("cc3200Title")} back="/setup" narrow>
            <div className="mb">
                <Segmented
                    value={way}
                    onChange={setWay}
                    options={[
                        { value: "browser", label: st("cc3200WayBrowser") },
                        { value: "manual", label: st("cc3200WayManual") },
                        { value: "card", label: st("cc3200WayCard") },
                    ]}
                />
            </div>
            {way === "browser" ? (
                <Cc3200Browser />
            ) : way === "card" ? (
                <>
                    <p>{st("cc3200CardOnlyText")}</p>
                    <Notice>{st("cc3200CardOnlyCfg")}</Notice>
                    <Cc3200Card />
                </>
            ) : (
                <Steps
                    titles={[
                        st("cc3200S1"),
                        st("cc3200S2"),
                        st("cc3200S3"),
                        st("cc3200S4"),
                        st("cc3200S5"),
                    ]}
                    step={step}
                    setStep={setStep}
                    last={
                        <a className="btn primary" href="#/">
                            {st("showBoxes")}
                        </a>
                    }
                >
                    {steps[step]}
                </Steps>
            )}
        </Page>
    );
}
