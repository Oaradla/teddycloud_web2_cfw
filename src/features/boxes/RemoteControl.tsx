import { useQuery } from "@tanstack/react-query";
import { Headphones, ListMusic, Lock, Pause, Play, SkipBack, SkipForward, Square, Volume1, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { tc } from "../../api/tc";
import { contentTitle, figureSubtitle, figureTitle, linkedContent, tagInfo, tagTitle } from "../../lib/format";
import { t } from "../../lib/i18n";
import { keys, useAllTags } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { Row, SearchField, Slider, useUi } from "../../ui/kit";
import { FigurePic } from "../../ui/FigurePic";
import { TonieImage } from "../../ui/TonieImage";

/** remote control of a box with the custom firmware */
export function RemoteControl({ boxId }: { boxId: string }) {
    const ui = useUi();
    const status = useQuery({
        queryKey: keys.cfwStatus(boxId),
        queryFn: () => tc.cfwStatus(boxId),
        refetchInterval: 2500,
    });
    const tags = useAllTags();
    const [vol, setVol] = useState<number | null>(null);
    const [pick, setPick] = useState(false);
    const [filter, setFilter] = useState("");
    const refreshTimer = useRef(0);

    useEffect(() => {
        // a status request makes the box report its state on this connection
        tc.cfwRemote(boxId, "status").catch(() => undefined);
        return () => window.clearTimeout(refreshTimer.current);
    }, [boxId]);

    const send = async (command: string, extra: Record<string, unknown> = {}) => {
        if ("vibrate" in navigator) navigator.vibrate?.(10);
        try {
            const r = await tc.cfwRemote(boxId, command, extra);
            if (r && r.ok === false) ui.toast("error", t("commandFailed"), r.message);
        } catch (e) {
            ui.toast("error", t("commandFailed"), String((e as Error).message));
        }
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = window.setTimeout(() => status.refetch(), 1200);
    };

    const st = status.data?.status;
    const connected = status.data?.remote === true;
    const playing = st?.state === "playing";
    const tag = st?.ruid ? tags.data?.find((x) => x.ruid.toLowerCase() === st.ruid.toLowerCase()) : undefined;
    const limit = st?.limit || 15;
    const volume = vol ?? st?.volume ?? 0;
    const stateText = st ? t(`state_${st.state}` as never) : connected ? "…" : t("remoteWaiting");

    const choices = (tags.data ?? [])
        .filter((x) => x.type !== "system" && (x.valid || x.source))
        .filter((x) => {
            const f = filter.trim().toLowerCase();
            if (!f) return true;
            const i = tagInfo(x);
            return `${i.series} ${i.episode} ${x.ruid}`.toLowerCase().includes(f);
        });

    return (
        <div className="card remote">
            <div className="row-gap" style={{ marginBottom: 8 }}>
                <TonieImage src={tag ? tagInfo(tag).picture : undefined} size={48} />
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 650 }}>{tag ? tagTitle(tag) : st?.ruid ? st.ruid.toUpperCase() : t("noTonie")}</div>
                    <div className="small muted">
                        {stateText}
                        {st && st.chapter > 0 ? ` · ${t("chapterN", { n: st.chapter })}` : ""}
                        {st?.headphones ? " · " : ""}
                        {st?.headphones && <Headphones size={13} style={{ verticalAlign: -2 }} />}
                    </div>
                </div>
                {st && (st.locks.slap || st.locks.tilt || st.locks.volume) && (
                    <span className="badge" title={t("locks")}>
                        <Lock size={12} />
                    </span>
                )}
            </div>
            <div className="remote-controls">
                <button className="icon-btn" onClick={() => send("prev")} aria-label={t("previous")}>
                    <SkipBack size={22} fill="currentColor" />
                </button>
                <button className="icon-btn" onClick={() => send("stop")} aria-label={t("stop")}>
                    <Square size={18} fill="currentColor" />
                </button>
                <button
                    className="icon-btn main"
                    onClick={() => send(playing ? "pause" : "continue")}
                    aria-label={playing ? t("pause") : t("play")}
                >
                    {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" style={{ marginLeft: 3 }} />}
                </button>
                <button className="icon-btn" onClick={() => setPick(true)} aria-label={t("playTonie")}>
                    <ListMusic size={20} />
                </button>
                <button className="icon-btn" onClick={() => send("next")} aria-label={t("next")}>
                    <SkipForward size={22} fill="currentColor" />
                </button>
            </div>
            <div className="vol-row">
                <Volume1 size={20} />
                <Slider
                    value={volume}
                    min={0}
                    max={limit}
                    onChange={setVol}
                    onCommit={(v) => {
                        send("volume", { volume: v });
                        window.setTimeout(() => setVol(null), 2500);
                    }}
                />
                <Volume2 size={20} />
            </div>
            {!connected && <div className="small muted" style={{ marginTop: 8 }}>{t("remoteHint")}</div>}

            <Sheet open={pick} onClose={() => setPick(false)} title={t("playTonie")} full>
                <div style={{ marginBottom: 12 }}>
                    <SearchField value={filter} onChange={setFilter} />
                </div>
                <div className="list">
                    {choices.map((x) => (
                        <Row
                            key={x.ruid}
                            leading={
                                <div style={{ width: 44, height: 44, flexShrink: 0 }}>
                                    <FigurePic tag={x} />
                                </div>
                            }
                            title={figureTitle(x)}
                            sub={linkedContent(x) ? `→ ${contentTitle(linkedContent(x)!)}` : figureSubtitle(x)}
                            onClick={() => {
                                setPick(false);
                                send("play", { ruid: x.ruid });
                            }}
                            chevron={false}
                        />
                    ))}
                </div>
            </Sheet>
        </div>
    );
}
