import { Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, X } from "lucide-react";
import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { backendUrl } from "../api/client";
import { duration as fmt } from "../lib/format";
import { t } from "../lib/i18n";
import { Sheet } from "../ui/Sheet";
import { ChapterTime, Slider } from "../ui/kit";
import { TonieImage } from "../ui/TonieImage";

export interface PlayItem {
    /** identifies the item, e.g. the ruid or the library path */
    id: string;
    title: string;
    subtitle?: string;
    pic?: string;
    url: string;
    /** start of each chapter in seconds */
    chapters?: number[];
    chapterTitles?: string[];
    length?: number;
}

interface PlayerState {
    item: PlayItem | null;
    playing: boolean;
    time: number;
    duration: number;
    buffering: boolean;
}

interface PlayerApi extends PlayerState {
    play: (item: PlayItem, startAt?: number) => void;
    toggle: () => void;
    seek: (time: number) => void;
    chapter: number;
    jumpChapter: (index: number) => void;
    stop: () => void;
    openFull: () => void;
}

const PlayerContext = createContext<PlayerApi | null>(null);

export const usePlayer = () => {
    const p = useContext(PlayerContext);
    if (!p) throw new Error("PlayerProvider missing");
    return p;
};

const chapterAt = (chapters: number[] | undefined, time: number) => {
    if (!chapters?.length) return -1;
    let index = 0;
    for (let i = 0; i < chapters.length; i++) if (time + 0.5 >= chapters[i]) index = i;
    return index;
};

export function PlayerProvider({ children }: { children: ReactNode }) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    if (!audioRef.current && typeof Audio !== "undefined") {
        audioRef.current = new Audio();
        audioRef.current.preload = "auto";
    }
    const [state, setState] = useState<PlayerState>({
        item: null,
        playing: false,
        time: 0,
        duration: 0,
        buffering: false,
    });
    const [full, setFull] = useState(false);
    const itemRef = useRef<PlayItem | null>(null);

    useEffect(() => {
        const a = audioRef.current!;
        const upd = () =>
            setState((s) => ({
                ...s,
                playing: !a.paused,
                time: a.currentTime,
                duration:
                    Number.isFinite(a.duration) && a.duration > 0
                        ? a.duration
                        : (itemRef.current?.length ?? 0),
            }));
        const waiting = () => setState((s) => ({ ...s, buffering: true }));
        const playing = () => setState((s) => ({ ...s, buffering: false }));
        const events = ["timeupdate", "play", "pause", "durationchange", "ended", "seeked"];
        events.forEach((e) => a.addEventListener(e, upd));
        a.addEventListener("waiting", waiting);
        a.addEventListener("playing", playing);
        a.addEventListener("canplay", playing);
        return () => {
            events.forEach((e) => a.removeEventListener(e, upd));
            a.removeEventListener("waiting", waiting);
            a.removeEventListener("playing", playing);
            a.removeEventListener("canplay", playing);
        };
    }, []);

    const play = useCallback((item: PlayItem, startAt = 0) => {
        const a = audioRef.current!;
        const same = itemRef.current?.id === item.id && itemRef.current?.url === item.url;
        itemRef.current = item;
        if (!same) {
            a.src = backendUrl(item.url);
            setState({ item, playing: false, time: startAt, duration: item.length ?? 0, buffering: true });
        }
        if (startAt || !same) {
            const seekTo = () => {
                if (startAt) a.currentTime = startAt;
            };
            if (a.readyState >= 1) seekTo();
            else a.addEventListener("loadedmetadata", seekTo, { once: true });
        }
        a.play().catch(() => setState((s) => ({ ...s, buffering: false })));
    }, []);

    const toggle = useCallback(() => {
        const a = audioRef.current!;
        if (a.paused) a.play().catch(() => undefined);
        else a.pause();
    }, []);

    const seek = useCallback((time: number) => {
        const a = audioRef.current!;
        a.currentTime = Math.max(0, time);
        setState((s) => ({ ...s, time: a.currentTime }));
    }, []);

    const stop = useCallback(() => {
        const a = audioRef.current!;
        a.pause();
        a.removeAttribute("src");
        a.load();
        itemRef.current = null;
        setFull(false);
        setState({ item: null, playing: false, time: 0, duration: 0, buffering: false });
    }, []);

    const chapter = chapterAt(state.item?.chapters, state.time);
    const jumpChapter = useCallback(
        (index: number) => {
            const chapters = itemRef.current?.chapters;
            if (!chapters?.length) return;
            const i = Math.max(0, Math.min(chapters.length - 1, index));
            seek(chapters[i]);
            audioRef.current?.play().catch(() => undefined);
        },
        [seek],
    );

    // lock screen / headset controls
    useEffect(() => {
        const ms = navigator.mediaSession;
        if (!ms) return;
        const item = state.item;
        if (!item) {
            ms.metadata = null;
            return;
        }
        const pic = item.pic ? new URL(backendUrl(item.pic), window.location.href).href : undefined;
        ms.metadata = new MediaMetadata({
            title: item.chapterTitles?.[Math.max(0, chapter)] || item.title,
            artist: item.subtitle || item.title,
            album: item.title,
            artwork: pic ? [{ src: pic, sizes: "512x512" }] : [],
        });
    }, [state.item, chapter]);

    useEffect(() => {
        const ms = navigator.mediaSession;
        if (!ms) return;
        const a = audioRef.current!;
        const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
            try {
                ms.setActionHandler(action, handler);
            } catch {
                /* not supported */
            }
        };
        set("play", () => a.play());
        set("pause", () => a.pause());
        set("seekbackward", () => seek(a.currentTime - 15));
        set("seekforward", () => seek(a.currentTime + 30));
        set("seekto", (d) => d.seekTime !== undefined && seek(d.seekTime));
        set("previoustrack", () => {
            const c = itemRef.current?.chapters;
            if (!c?.length) return seek(0);
            const i = chapterAt(c, a.currentTime);
            jumpChapter(a.currentTime - c[i] > 3 ? i : i - 1);
        });
        set("nexttrack", () => {
            const c = itemRef.current?.chapters;
            if (!c?.length) return;
            jumpChapter(chapterAt(c, a.currentTime) + 1);
        });
    }, [seek, jumpChapter]);

    useEffect(() => {
        const ms = navigator.mediaSession;
        if (!ms?.setPositionState || !state.duration) return;
        try {
            ms.setPositionState({
                duration: state.duration,
                position: Math.min(state.time, state.duration),
                playbackRate: 1,
            });
        } catch {
            /* ignore */
        }
    }, [Math.floor(state.time / 5), state.duration]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        document.documentElement.style.setProperty("--mini-h", state.item ? "70px" : "0px");
    }, [state.item]);

    const api = useMemo<PlayerApi>(
        () => ({
            ...state,
            play,
            toggle,
            seek,
            chapter,
            jumpChapter,
            stop,
            openFull: () => setFull(true),
        }),
        [state, play, toggle, seek, chapter, jumpChapter, stop],
    );

    return (
        <PlayerContext.Provider value={api}>
            {children}
            {state.item && <MiniPlayer onOpen={() => setFull(true)} />}
            <Sheet open={full && !!state.item} onClose={() => setFull(false)} full bare>
                <FullPlayer />
            </Sheet>
        </PlayerContext.Provider>
    );
}

function MiniPlayer({ onOpen }: { onOpen: () => void }) {
    const p = usePlayer();
    const item = p.item!;
    const pct = p.duration ? (p.time / p.duration) * 100 : 0;
    return (
        <div className="mini-player">
            <button className="tap" onClick={onOpen}>
                <TonieImage src={item.pic} size={46} />
                <div style={{ minWidth: 0 }}>
                    <div className="title">{item.title}</div>
                    <div className="sub">
                        {p.chapter >= 0 && item.chapters && item.chapters.length > 1
                            ? (item.chapterTitles?.[p.chapter] ??
                              t("chapterN", { n: p.chapter + 1 }))
                            : item.subtitle}
                    </div>
                </div>
            </button>
            <button className="icon-btn" onClick={p.toggle} aria-label={p.playing ? "pause" : "play"}>
                {p.buffering && p.playing ? (
                    <span className="spinner small" />
                ) : p.playing ? (
                    <Pause size={24} fill="currentColor" />
                ) : (
                    <Play size={24} fill="currentColor" />
                )}
            </button>
            <button className="icon-btn muted" onClick={p.stop} aria-label="stop">
                <X size={20} />
            </button>
            <div className="progress" style={{ width: `${pct}%` }} />
        </div>
    );
}

function FullPlayer() {
    const p = usePlayer();
    const item = p.item;
    const [drag, setDrag] = useState<number | null>(null);
    if (!item) return null;
    const time = drag ?? p.time;
    const chapters = item.chapters ?? [];
    const hasChapters = chapters.length > 1;
    return (
        <div className="player-full">
            <TonieImage src={item.pic} className="cover" />
            <h2>{item.title}</h2>
            {item.subtitle && <div className="muted">{item.subtitle}</div>}
            {hasChapters && (
                <div className="track">
                    {item.chapterTitles?.[p.chapter] ?? t("chapterN", { n: p.chapter + 1 })}
                    <span className="muted"> · {p.chapter + 1}/{chapters.length}</span>
                </div>
            )}
            <div style={{ width: "100%", marginTop: 18 }}>
                <Slider
                    value={time}
                    min={0}
                    max={p.duration || 1}
                    step={1}
                    onChange={setDrag}
                    onCommit={(v) => {
                        p.seek(v);
                        setDrag(null);
                    }}
                />
                <div className="times">
                    <span>{fmt(time)}</span>
                    <span>-{fmt(Math.max(0, p.duration - time))}</span>
                </div>
            </div>
            <div className="player-controls">
                {hasChapters ? (
                    <button className="icon-btn" onClick={() => p.jumpChapter(p.time - chapters[p.chapter] > 3 ? p.chapter : p.chapter - 1)}>
                        <SkipBack size={28} fill="currentColor" />
                    </button>
                ) : (
                    <button className="icon-btn" onClick={() => p.seek(p.time - 15)}>
                        <RotateCcw size={26} />
                    </button>
                )}
                <button className="icon-btn play-big" onClick={p.toggle}>
                    {p.playing ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" style={{ marginLeft: 4 }} />}
                </button>
                {hasChapters ? (
                    <button className="icon-btn" onClick={() => p.jumpChapter(p.chapter + 1)} disabled={p.chapter >= chapters.length - 1}>
                        <SkipForward size={28} fill="currentColor" />
                    </button>
                ) : (
                    <button className="icon-btn" onClick={() => p.seek(p.time + 30)}>
                        <RotateCw size={26} />
                    </button>
                )}
            </div>
            {hasChapters && (
                <div className="list tracks" style={{ width: "100%", textAlign: "left", marginTop: 8 }}>
                    {chapters.map((_, i) => (
                        <button
                            key={i}
                            className={`row ${i === p.chapter ? "playing" : ""}`}
                            onClick={() => p.jumpChapter(i)}
                        >
                            <span className="track-no">{i + 1}</span>
                            <span className="row-body">
                                <div className="row-title nowrap">
                                    {item.chapterTitles?.[i] ?? t("chapterN", { n: i + 1 })}
                                </div>
                            </span>
                            <ChapterTime starts={chapters} i={i} total={p.duration || item.length} />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
