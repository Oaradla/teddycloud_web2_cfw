import { Pause, Play, Radio, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { backendUrl } from "../../api/client";
import { t } from "../../lib/i18n";
import { Empty, Page } from "../../ui/kit";

const MAX_LINES = 2000;

/** printable ASCII of a hex string, "." for the rest */
const hexAscii = (hex: string) =>
    (hex.match(/../g) ?? []).map((p) => {
        const c = parseInt(p, 16);
        return c >= 32 && c <= 126 ? String.fromCharCode(c) : ".";
    }).join("");

/** the boxes' log records (RTNL) as they arrive at the server */
export function RtnlPage() {
    const [lines, setLines] = useState<string[]>([]);
    const [paused, setPaused] = useState(false);
    const pausedRef = useRef(paused);
    const end = useRef<HTMLDivElement>(null);
    pausedRef.current = paused;

    useEffect(() => {
        const source = new EventSource(backendUrl("/api/sse"));
        const add = (line: string) => {
            if (pausedRef.current) return;
            const time = new Date().toLocaleTimeString();
            setLines((prev) => [...prev.slice(-(MAX_LINES - 1)), `${time}  ${line}`]);
        };
        const parse = (e: MessageEvent) => {
            try {
                return JSON.parse(e.data).data;
            } catch {
                return null;
            }
        };
        source.addEventListener("rtnl-raw-log2", (e) => {
            const d = parse(e as MessageEvent);
            if (!d) return;
            const payload = String(d.field6 ?? "");
            add(`#${d.sequence} up ${d.uptime}  ${String(d.function_group).padStart(2, " ")}-${d.function}  ${payload}  '${hexAscii(payload)}'`);
        });
        source.addEventListener("rtnl-raw-log3", (e) => {
            const d = parse(e as MessageEvent);
            if (d) add(`time ${d.datetime}  ${d.field2}`);
        });
        source.addEventListener("pressed", (e) => {
            const d = parse(e as MessageEvent);
            if (d !== null) add(`${t("rtnlPressed")}: ${d}`);
        });
        return () => source.close();
    }, []);

    useEffect(() => {
        end.current?.scrollIntoView({ block: "end" });
    }, [lines]);

    return (
        <Page
            title={t("rtnlLog")}
            subtitle={t("rtnlLogHint")}
            back="/system"
            right={
                <>
                    <button className="icon-btn" onClick={() => setPaused(!paused)} aria-label={paused ? t("resumeLog") : t("pause")} title={paused ? t("resumeLog") : t("pause")}>
                        {paused ? <Play size={20} /> : <Pause size={20} />}
                    </button>
                    <button className="icon-btn" onClick={() => setLines([])} aria-label={t("clear")} title={t("clear")}>
                        <Trash2 size={20} />
                    </button>
                </>
            }
        >
            {lines.length === 0 ? (
                <Empty icon={<Radio size={28} />} title={t("rtnlWaiting")} text={t("rtnlWaitingText")} />
            ) : (
                <div className="log-view mono">
                    {lines.map((l, i) => (
                        <div key={i}>{l}</div>
                    ))}
                    <div ref={end} />
                </div>
            )}
        </Page>
    );
}
