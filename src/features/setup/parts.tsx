import { Check, CheckCircle2, Circle, Copy, ExternalLink, XCircle } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { Notice } from "../../ui/kit";
import { Fold } from "../../ui/Fold";
import { Lightbox, LightboxItem } from "../../ui/Lightbox";
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
export function Pics({ items }: { items: LightboxItem[] }) {
    const [open, setOpen] = useState<number | null>(null);
    return (
        <div className="setup-pics">
            {items.map((p, i) => (
                <button key={p.src} type="button" onClick={() => setOpen(i)}>
                    <img src={p.src} alt={p.alt} loading="lazy" />
                    <span>{p.alt}</span>
                </button>
            ))}
            {open !== null && <Lightbox items={items} index={open} onClose={() => setOpen(null)} />}
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
/** the steps of a guide; while busy (something runs on the box) no step can be changed */
export function Steps({ titles, step, setStep, children, last, busy = false }: { titles: string[]; step: number; setStep: (n: number) => void; children: ReactNode; last?: ReactNode; busy?: boolean }) {
    return (
        <>
            <div className="setup-steps" role="tablist">
                {titles.map((title, i) => (
                    <button key={title} role="tab" aria-selected={i === step} className={i === step ? "active" : i < step ? "done" : ""} disabled={busy && i !== step} onClick={() => setStep(i)}>
                        <span>{i + 1}</span>
                        {title}
                    </button>
                ))}
            </div>
            <div className="setup-step">{children}</div>
            <div className="btn-row mt">
                <button className="btn" disabled={busy || step === 0} onClick={() => setStep(step - 1)}>
                    {st("back")}
                </button>
                {step < titles.length - 1 ? (
                    <button className="btn primary" disabled={busy} onClick={() => setStep(step + 1)}>
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

/** while something runs on the box: a reload, closing the tab or pull to reload would break it off */
export function useBusyGuard(busy: boolean) {
    useEffect(() => {
        if (!busy) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener("beforeunload", warn);
        document.documentElement.classList.add("no-pull");
        return () => {
            window.removeEventListener("beforeunload", warn);
            document.documentElement.classList.remove("no-pull");
        };
    }, [busy]);
}

/**
 * always there below a step: something runs (what, how far), the last action is done or failed,
 * or nothing runs
 */
export function StatusLine({ busy, text, progress = 0, result }: { busy: boolean; text?: string; progress?: number; result: { ok: boolean; text: string } | null }) {
    const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
    return (
        <div className={`setup-status state ${busy ? "busy" : result ? (result.ok ? "ok" : "error") : ""}`} role="status" aria-live="polite">
            <div className="setup-status-line">
                {busy ? <span className="spinner small" /> : result ? result.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} /> : <Circle size={18} />}
                <span>
                    {busy
                        ? `${st("statusRunning")}: ${text || st("statusWorking")}${percent > 0 ? ` (${percent} %)` : ""}`
                        : result
                          ? `${result.ok ? st("statusDone") : st("statusFailed")}: ${result.text}`
                          : st("statusIdle")}
                </span>
            </div>
            {busy && percent > 0 && (
                <div className="progress">
                    <div style={{ width: `${percent}%` }} />
                </div>
            )}
        </div>
    );
}
