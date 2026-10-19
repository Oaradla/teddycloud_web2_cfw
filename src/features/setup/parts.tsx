import { Check, Copy, ExternalLink } from "lucide-react";
import { ReactNode, useState } from "react";
import { Notice } from "../../ui/kit";
import { Fold } from "../../ui/Fold";
import { st, stList } from "./texts";

/** a command or file content with a copy button */
export function Code({ children }: { children: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="setup-code">
            <pre>{children}</pre>
            <button
                className="icon-btn"
                aria-label={copied ? st("copied") : st("copy")}
                title={copied ? st("copied") : st("copy")}
                onClick={async () => {
                    try {
                        await navigator.clipboard.writeText(children);
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1500);
                    } catch {
                        /* no clipboard (http): the text can still be selected */
                    }
                }}
            >
                {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
        </div>
    );
}

/** pictures side by side, each opens full size */
export function Pics({ items }: { items: { src: string; alt: string }[] }) {
    return (
        <div className="setup-pics">
            {items.map((p) => (
                <a key={p.src} href={p.src} target="_blank" rel="noopener">
                    <img src={p.src} alt={p.alt} loading="lazy" />
                    <span>{p.alt}</span>
                </a>
            ))}
        </div>
    );
}

export const ExtLink = ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href} target="_blank" rel="noopener" className="ext-link">
        {children} <ExternalLink size={13} />
    </a>
);

/** the warnings every guide starts with */
export function Warnings({ factoryReset }: { factoryReset: "cc3200" | "other" }) {
    return (
        <>
            <Notice>
                <strong>{st("riskTitle")}:</strong> {st("riskText")}
            </Notice>
            <Notice info>
                <strong>{st("latestFwTitle")}:</strong> {st("latestFwText")} {st(factoryReset === "cc3200" ? "factoryResetCc3200" : "factoryResetOther")}
            </Notice>
        </>
    );
}

/** steps of a guide: the bar on top, back and next below */
export function Steps({ titles, step, setStep, children, last }: { titles: string[]; step: number; setStep: (n: number) => void; children: ReactNode; last?: ReactNode }) {
    return (
        <>
            <div className="setup-steps" role="tablist">
                {titles.map((title, i) => (
                    <button key={title} role="tab" aria-selected={i === step} className={i === step ? "active" : i < step ? "done" : ""} onClick={() => setStep(i)}>
                        <span>{i + 1}</span>
                        {title}
                    </button>
                ))}
            </div>
            <div className="setup-step">{children}</div>
            <div className="btn-row mt">
                <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
                    {st("back")}
                </button>
                {step < titles.length - 1 ? (
                    <button className="btn primary" onClick={() => setStep(step + 1)}>
                        {st("next")}
                    </button>
                ) : (
                    last
                )}
            </div>
        </>
    );
}

export function UartHint() {
    return (
        <Notice>
            <strong>{st("uartTitle")}:</strong> {st("uartText")}
        </Notice>
    );
}

export function WifiGuide() {
    return (
        <Fold title={st("wifiTitle")}>
            <ol>
                {stList("wifiSteps").map((s, i) => (
                    <li key={i}>{s}</li>
                ))}
            </ol>
        </Fold>
    );
}

export function DnsGuide() {
    return (
        <Fold title={st("dnsTitle")}>
            <p>{st("dnsText")}</p>
            <Code>{`||prod.de.tbs.toys^$dnsrewrite=NOERROR;A;XXX.XXX.XXX.XXX,client=YYY.YYY.YYY.YYY
||rtnl.bxcl.de^$dnsrewrite=NOERROR;A;XXX.XXX.XXX.XXX,client=YYY.YYY.YYY.YYY`}</Code>
            <p>{st("dnsOpenWrt")}</p>
            <Code>{`uci set dhcp.teddycloud="tag"
uci set dhcp.teddycloud.dhcp_option="3,1.2.3.4" # 1.2.3.4 = teddyCloud IP
uci add dhcp host
uci set dhcp.@host[-1].name="toniebox_1"
uci set dhcp.@host[-1].mac="00:11:22:33:44:55" # MAC of the box
uci set dhcp.@host[-1].ip="1.2.3.101"
uci set dhcp.@host[-1].tag="teddycloud"
uci commit dhcp
/etc/init.d/dnsmasq restart`}</Code>
        </Fold>
    );
}
