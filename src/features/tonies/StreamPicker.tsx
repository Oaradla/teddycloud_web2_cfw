import { useQuery } from "@tanstack/react-query";
import { Check, Headphones, Radio } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "../../lib/i18n";
import { usePlayer } from "../../player/Player";
import { Sheet } from "../../ui/Sheet";
import { Loading, Row, SearchField } from "../../ui/kit";

// radio-browser.info, like the classic UI: a random server of the list, a fixed one as fallback
const SERVERS = "https://all.api.radio-browser.info/json/servers";
const FALLBACK = "https://de2.api.radio-browser.info/json";

interface Station {
    stationuuid: string;
    name: string;
    url: string;
    url_resolved?: string;
    favicon?: string;
    country?: string;
    countrycode?: string;
    language?: string;
    tags?: string;
    bitrate?: number;
    codec?: string;
}

let apiBase: Promise<string> | null = null;
const radioApi = () => {
    if (!apiBase)
        apiBase = fetch(SERVERS)
            .then((r) => (r.ok ? r.json() : []))
            .then((list: { name: string }[]) =>
                list.length ? `https://${list[Math.floor(Math.random() * list.length)].name}/json` : FALLBACK,
            )
            .catch(() => FALLBACK);
    return apiBase;
};

async function searchStations(text: string): Promise<Station[]> {
    const base = await radioApi();
    const url = `${base}/stations/search?name=${encodeURIComponent(text)}&is_https=true&hidebroken=true&order=clickcount&reverse=true&limit=60`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const data: Station[] = await r.json();
    const seen = new Set<string>();
    return data.filter((s) => !seen.has(s.url) && seen.add(s.url));
}

/** a stream URL: typed in or found in the radio-browser.info directory */
export function StreamPicker({
    open,
    onClose,
    onPick,
    current,
}: {
    open: boolean;
    onClose: () => void;
    onPick: (url: string) => void;
    current?: string;
}) {
    const player = usePlayer();
    const [url, setUrl] = useState("");
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");
    useEffect(() => {
        if (open) setUrl(current?.startsWith("http") ? current : "");
    }, [open, current]);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(query.trim()), 400);
        return () => window.clearTimeout(timer);
    }, [query]);
    const stations = useQuery({
        queryKey: ["radio", debounced],
        queryFn: () => searchStations(debounced),
        enabled: open && debounced.length >= 2,
        staleTime: 5 * 60_000,
    });

    const pick = (u: string) => {
        onPick(u);
        onClose();
    };

    return (
        <Sheet open={open} onClose={onClose} title={t("streamUrl")} full>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    if (/^https?:\/\//i.test(url.trim())) pick(url.trim());
                }}
                className="section"
            >
                <div className="field" style={{ marginBottom: 8 }}>
                    <label>{t("streamUrlManual")}</label>
                    <div className="row-gap">
                        <input className="input mono" type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
                        <button className="btn primary" disabled={!/^https?:\/\//i.test(url.trim())} aria-label={t("assign")}>
                            <Check size={18} />
                        </button>
                    </div>
                    <div className="hint">{t("streamUrlHint")}</div>
                </div>
            </form>

            <div className="section-head">
                <h2 className="section-title">{t("findRadio")}</h2>
            </div>
            <div style={{ marginBottom: 12 }}>
                <SearchField value={query} onChange={setQuery} placeholder={t("findRadioPlaceholder")} />
            </div>
            {debounced.length < 2 && <p className="small muted" style={{ textAlign: "center" }}>{t("findRadioHint")}</p>}
            {stations.isLoading && debounced.length >= 2 && <Loading />}
            {stations.error && <p className="small" style={{ color: "var(--danger)" }}>{String((stations.error as Error).message)}</p>}
            {stations.data && stations.data.length === 0 && <p className="small muted" style={{ textAlign: "center" }}>{t("nothingFound")}</p>}
            {stations.data && stations.data.length > 0 && (
                <div className="list">
                    {stations.data.map((s) => (
                        <Row
                            key={s.stationuuid}
                            leading={
                                <span className="file-icon">
                                    {s.favicon ? (
                                        <img src={s.favicon} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                                    ) : (
                                        <Radio size={20} />
                                    )}
                                </span>
                            }
                            title={s.name.trim()}
                            sub={[s.countrycode, s.language, s.bitrate ? `${s.bitrate} kbit/s` : "", s.codec].filter(Boolean).join(" · ")}
                            onClick={() => pick(s.url_resolved || s.url)}
                            chevron={false}
                            right={
                                <button
                                    className="icon-btn muted"
                                    aria-label={t("preview")}
                                    title={t("preview")}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        player.play({ id: "radio:" + s.stationuuid, title: s.name.trim(), subtitle: t("preview"), pic: s.favicon, url: s.url_resolved || s.url });
                                    }}
                                >
                                    <Headphones size={19} />
                                </button>
                            }
                        />
                    ))}
                </div>
            )}
            <p className="small muted" style={{ textAlign: "center", marginTop: 14 }}>
                {t("radioSource")}
            </p>
        </Sheet>
    );
}
