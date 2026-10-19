import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Download, FileKey, Radio, Scale, Search, Wrench } from "lucide-react";
import { useState } from "react";
import { backendUrl, getText } from "../../api/client";
import { tc } from "../../api/tc";
import { Fold } from "../../ui/Fold";
import { Notice, Page, Row, Section, useUi } from "../../ui/kit";
import cc3200Pcb from "./img/3200-pcb.webp";
import cc3200Preview from "./img/3200-pcb-preview.webp";
import cc3235Pcb from "./img/3235-pcb.webp";
import cc3235Preview from "./img/3235-pcb-preview.webp";
import esp32Pcb from "./img/esp32-pcb.webp";
import esp32Preview from "./img/esp32-pcb-preview.webp";
import tb2Pcb from "./img/tb2-pcb.webp";
import tb2Preview from "./img/tb2-pcb-preview.webp";
import open1 from "./img/opentb-step1-1.webp";
import open1b from "./img/opentb-step1-2.webp";
import open2 from "./img/opentb-step2.webp";
import open3 from "./img/opentb-step3.webp";
import open4 from "./img/opentb-step4.webp";
import open5 from "./img/opentb-step5.webp";
import { ExtLink, Pics, WifiGuide } from "./parts";
import { st, stList, type SetupKey } from "./texts";

type Chip = "cc3200" | "cc3235" | "esp32" | "tb2";

const CHIPS: { id: Chip; name: string; text: SetupKey; preview: string; full: string; to?: string }[] = [
    { id: "cc3200", name: "CC3200", text: "chipCc3200", preview: cc3200Preview, full: cc3200Pcb, to: "/setup/cc3200" },
    { id: "cc3235", name: "CC3235", text: "chipCc3235", preview: cc3235Preview, full: cc3235Pcb, to: "/setup/cc3235" },
    { id: "esp32", name: "ESP32", text: "chipEsp32", preview: esp32Preview, full: esp32Pcb, to: "/setup/esp32" },
    { id: "tb2", name: "Toniebox 2", text: "chipTb2", preview: tb2Preview, full: tb2Pcb },
];

/** the chips a vendor of the MAC address stands for */
const chipsOfVendor = (vendor: string): Chip[] => {
    const v = vendor.toLowerCase();
    if (v.includes("espressif")) return ["esp32"];
    if (v.includes("texas")) return ["cc3200", "cc3235"];
    if (v.includes("tonies")) return ["tb2"];
    return [];
};

/** the way of a Toniebox to teddyCloud: find out the chip, prepare the box, connect it */
export function SetupPage() {
    const ui = useUi();
    const qc = useQueryClient();
    const allowNew = useQuery({ queryKey: ["setting", "core.allowNewBox"], queryFn: () => tc.getSetting("core.allowNewBox") });
    const [mac, setMac] = useState("");
    const [vendor, setVendor] = useState<string | null>(null);
    const [lookupFailed, setLookupFailed] = useState(false);
    const macValid = /^([0-9a-f]{2}[:-]?){5}[0-9a-f]{2}$/i.test(mac.trim());
    const matching = vendor ? chipsOfVendor(vendor) : [];

    const lookup = async () => {
        setVendor(null);
        setLookupFailed(false);
        try {
            setVendor((await getText(`/reverseGeneric/macvendor/${encodeURIComponent(mac.trim())}`)).trim());
        } catch {
            setLookupFailed(true);
        }
    };

    return (
        <Page title={st("title")} subtitle={st("intro")} back="/more" narrow>
            {allowNew.data === "false" && (
                <Notice>
                    {st("newBoxesOff")}
                    <div className="mt">
                        <button
                            className="btn primary small"
                            onClick={async () => {
                                await ui.run(() => tc.setSetting("core.allowNewBox", true));
                                qc.invalidateQueries({ queryKey: ["setting", "core.allowNewBox"] });
                            }}
                        >
                            {st("allowNewBoxes")}
                        </button>
                    </div>
                </Notice>
            )}

            <Section title={st("step1")} footer={st("step1Text")}>
                <div className="row-wrap">
                    <Row icon={<Search size={17} />} title={st("macLabel")} />
                    <div className="row-gap" style={{ padding: "0 16px 12px" }}>
                        <input className="input mono" placeholder="00:11:22:33:44:55" value={mac} onChange={(e) => setMac(e.target.value.replace(/[^0-9a-fA-F:-]/g, ""))} />
                        <button className="btn small" disabled={!macValid} onClick={lookup}>
                            {st("macCheck")}
                        </button>
                    </div>
                    {mac && !macValid && <div className="small muted" style={{ padding: "0 16px 12px" }}>{st("macInvalid")}</div>}
                    {vendor && (
                        <div style={{ padding: "0 16px 12px" }}>
                            {st("macResult", { vendor })}{" "}
                            {matching.length > 0 ? <strong>{st("macMeans", { version: matching.map((c) => CHIPS.find((x) => x.id === c)!.name).join(" / ") })}</strong> : st("macUnknown")}
                        </div>
                    )}
                    {lookupFailed && <div style={{ padding: "0 16px 12px" }}>{st("macUnknown")}</div>}
                </div>
                <div className="setup-chips">
                    {CHIPS.filter((c) => matching.length === 0 || matching.includes(c.id)).map((c) => (
                        <div key={c.id} className="setup-chip">
                            <a href={c.full} target="_blank" rel="noopener">
                                <img src={c.preview} alt={c.name} loading="lazy" />
                            </a>
                            <div>
                                <strong>{c.name}</strong>
                                <p className="small muted">{st(c.text)}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <Fold title={st("openBox")} sub={st("openBoxHint")} icon={<Wrench size={17} />}>
                    <OpenBox />
                </Fold>
                <Fold title={st("versions")} sub={st("versionsHint")} icon={<Scale size={17} />}>
                    <Versions />
                </Fold>
            </Section>

            <Section title={st("step2")} footer={st("step2Text")}>
                {CHIPS.filter((c) => c.to).map((c) => (
                    <Row key={c.id} icon={<Cpu size={17} />} title={c.name} sub={st(c.text)} to={c.to} />
                ))}
                <Row icon={<Cpu size={17} />} title={st("tb2")} sub={st("tb2Text")} chevron={false} />
            </Section>

            <Section title={st("step3")} footer={st("step3Text")}>
                <Row icon={<Download size={17} />} title={st("caDownloadC2")} sub={st("caDownloadHint")} onClick={() => (window.location.href = backendUrl("/api/getFile/c2.der"))} chevron={false} />
                <Row icon={<Download size={17} />} title={st("caDownloadCa")} sub={st("caDownloadHint")} onClick={() => (window.location.href = backendUrl("/api/getFile/ca.der"))} chevron={false} />
                <Row icon={<FileKey size={17} />} title={st("cc3200S3")} to="/system/certificates" />
                <WifiGuide />
                <Row icon={<Radio size={17} />} title={st("showBoxes")} sub={st("showBoxesHint")} to="/" />
            </Section>
        </Page>
    );
}

function OpenBox() {
    const steps: [SetupKey, string[]][] = [
        ["openStep1", [open1, open1b]],
        ["openStep2", [open2]],
        ["openStep3", [open3]],
        ["openStep4", [open4]],
        ["openStep5", [open5]],
    ];
    return (
        <>
            <ol>
                {steps.map(([key, pics]) => (
                    <li key={key}>
                        <p>{st(key)}</p>
                        <Pics items={pics.map((src) => ({ src, alt: "" }))} />
                    </li>
                ))}
            </ol>
            <p className="small muted">
                {st("openSource")} <ExtLink href="https://de.ifixit.com/Anleitung/Toniebox+%C3%B6ffnen/124139">iFixit</ExtLink> ·{" "}
                <ExtLink href="https://de.ifixit.com/Teardown/Toniebox+Teardown/106148">Teardown</ExtLink> ·{" "}
                <ExtLink href="https://creativecommons.org/licenses/by-nc-sa/3.0/">CC BY-NC-SA 3.0</ExtLink>
            </p>
            <p>
                <ExtLink href="https://www.youtube.com/watch?v=Cv9ID4-P6_A">{st("openVideo")}</ExtLink>
            </p>
        </>
    );
}

function Versions() {
    const rows: [string, SetupKey, SetupKey][] = [
        ["CC3200", "cc3200Pros", "cc3200Cons"],
        ["CC3235", "cc3235Pros", "cc3235Cons"],
        ["ESP32", "esp32Pros", "esp32Cons"],
    ];
    return (
        <>
            <p>{st("identifyHints")}</p>
            {rows.map(([name, pros, cons]) => (
                <div key={name} className="mt">
                    <h3>{name}</h3>
                    <div className="setup-proscons">
                        <div>
                            <strong>{st("pros")}</strong>
                            <ul>{stList(pros).map((x) => <li key={x}>{x}</li>)}</ul>
                        </div>
                        <div>
                            <strong>{st("cons")}</strong>
                            <ul>{stList(cons).map((x) => <li key={x}>{x}</li>)}</ul>
                        </div>
                    </div>
                </div>
            ))}
        </>
    );
}
