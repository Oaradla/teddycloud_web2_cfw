import { BookOpen, ChevronDown, ChevronRight, HardDrive, Wrench } from "lucide-react";
import { Fragment, useState } from "react";
import { t, type Key } from "../../lib/i18n";
import { Row, Section } from "../../ui/kit";

/** a step text: `quoted` parts become code */
const StepText = ({ text }: { text: string }) => (
    <>
        {text.split("`").map((part, i) =>
            i % 2 ? (
                <code key={i} className="mono">
                    {part}
                </code>
            ) : (
                <Fragment key={i}>{part}</Fragment>
            ),
        )}
    </>
);

const STEPS = { cc3200: 7, esp32: 6 };

const Steps = ({ chip }: { chip: "cc3200" | "esp32" }) => {
    const host = window.location.hostname;
    return (
        <ol className="guide-steps">
            {Array.from({ length: STEPS[chip] }, (_, i) => i + 1).map((n) => (
                <li key={n}>
                    <StepText text={t(`guide_${chip}_${n}` as Key, { host })} />
                </li>
            ))}
        </ol>
    );
};

/**
 * how a box with the original firmware gets the custom firmware, per chip; open at the top of the
 * page while no box runs the custom firmware, closed at the bottom afterwards
 */
export function InstallGuide({ open: initiallyOpen }: { open: boolean }) {
    const [open, setOpen] = useState(initiallyOpen);
    return (
        <Section title={t("guideTitle")}>
            <Row
                icon={<BookOpen size={17} />}
                title={open ? t("guideHide") : t("guideShow")}
                sub={t("guideIntro")}
                right={open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                onClick={() => setOpen(!open)}
                chevron={false}
            />
            {open && (
                <div style={{ padding: "4px 16px 12px" }}>
                    <h3 className="guide-chip">{t("guideCc3200")}</h3>
                    <Steps chip="cc3200" />
                    <p className="small">
                        {t("guideCardZip")}{" "}
                        <a className="btn small" href="#/setup/cc3200?way=card">
                            <HardDrive size={15} />
                            {t("guideCardZipLink")}
                        </a>
                    </p>
                    <h3 className="guide-chip">{t("guideEsp32")}</h3>
                    <Steps chip="esp32" />
                </div>
            )}
            {open && (
                <Row icon={<Wrench size={17} />} title={t("boxSetup")} sub={t("guideBoxSetupHint")} to="/setup" />
            )}
        </Section>
    );
}
