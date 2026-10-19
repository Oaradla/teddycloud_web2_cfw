import { useState } from "react";
import { Notice, Page, Segmented } from "../../ui/kit";
import programmer1 from "./img/01-ch341a-programmer-1.webp";
import programmer2 from "./img/01-ch341a-programmer-2.webp";
import sop8a from "./img/02-ch341a-sop8-1.webp";
import sop8b from "./img/02-ch341a-sop8-2.webp";
import sop8c from "./img/02-ch341a-sop8-3.webp";
import sop8cut from "./img/02-ch341a-sop8-remove.webp";
import flash from "./img/cc3235-flash.webp";
import grippers from "./img/cc3235-smd-grippers.webp";
import { Code, DnsGuide, ExtLink, Pics, Steps, Warnings } from "./parts";
import { st } from "./texts";

/** the CC3235 box: read the flash chip, put in the teddyCloud CA, write it back */
export function Cc3235Page() {
    const [step, setStep] = useState(0);
    const [hw, setHw] = useState<"ch341a" | "pico">("ch341a");
    const programmer = hw === "pico" ? "serprog:dev=/dev/ttyACM0:921600" : "ch341a_spi";
    const dump = hw === "pico" ? "cc32xx-flash" : "backupCC3235";

    const steps = [
        <>
            <Warnings factoryReset="other" />
            <p>{st("cc3235Prep")}</p>
            <Pics
                items={[
                    { src: flash, alt: "IS25LP032D" },
                    { src: grippers, alt: "SMD grippers" },
                    { src: sop8a, alt: "SOP8" },
                ]}
            />
            <Code>{"sudo apt-get install flashrom"}</Code>
            <div className="mt">
                <Segmented value={hw} onChange={setHw} options={[{ value: "ch341a", label: st("hwCh341a") }, { value: "pico", label: st("hwPico") }]} />
            </div>
            {hw === "ch341a" ? (
                <>
                    <p>{st("ch341aText")}</p>
                    <Pics
                        items={[
                            { src: programmer1, alt: "CH341A" },
                            { src: sop8cut, alt: "Cut" },
                            { src: programmer2, alt: "SOP8 clamp" },
                            { src: sop8b, alt: "SOP8" },
                            { src: sop8c, alt: "SOP8" },
                        ]}
                    />
                    <Code>{"lsusb"}</Code>
                </>
            ) : (
                <p>
                    {st("picoText")} <ExtLink href="https://github.com/stacksmashing/pico-serprog">pico-serprog</ExtLink>
                </p>
            )}
        </>,
        <>
            <p>{st("readThree")}</p>
            <Code>{`flashrom -p ${programmer} -r ${dump}-1.bin --progress
flashrom -p ${programmer} -r ${dump}-2.bin --progress
flashrom -p ${programmer} -r ${dump}-3.bin --progress
diff ${dump}-1.bin ${dump}-2.bin
diff ${dump}-1.bin ${dump}-3.bin`}</Code>
            <Code>{`cc3200tool -if ${dump}-1.bin -d cc32xx read_all_files extract/
cc3200tool -if ${dump}-1.bin -of cc32xx-flash.customca.bin -d cc32xx write_file ca.der /cert/ca.der`}</Code>
            <p>{st("flashBack")}</p>
            <Code>{`flashrom -p ${programmer} -w cc32xx-flash.customca.bin --progress`}</Code>
            <Notice>
                {st("cc3235CaWarn")} <ExtLink href="https://raw.githubusercontent.com/toniebox-reverse-engineering/teddycloud/master/contrib/gencerts.sh">gencerts.sh</ExtLink>
            </Notice>
        </>,
        <>
            <DnsGuide />
            <Notice info>{st("showBoxesHint")}</Notice>
        </>,
    ];

    return (
        <Page title={st("cc3235Title")} back="/setup" narrow>
            <Steps
                titles={[st("cc3235S1"), st("cc3235S2"), st("cc3235S3")]}
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
        </Page>
    );
}
