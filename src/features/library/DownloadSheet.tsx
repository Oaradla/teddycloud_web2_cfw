import { zipSync } from "fflate";
import { Check, Download, FileArchive } from "lucide-react";
import { useEffect, useState } from "react";
import { backendUrl } from "../../api/client";
import { duration } from "../../lib/format";
import { t } from "../../lib/i18n";
import { getPref, setPref } from "../../lib/prefs";
import { ChoiceGroup } from "../../ui/Popover";
import { Sheet } from "../../ui/Sheet";
import { Row, Section, useUi } from "../../ui/kit";

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim() || "download";
const pad = (n: number) => String(n).padStart(2, "0");
const mp3Url = (url: string) => `${url}&format=mp3`;

type Format = "ogg" | "mp3";
type Several = "zip" | "single";

const save = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

const fetchBlob = async (url: string) => {
    const r = await fetch(backendUrl(url), { credentials: "same-origin" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.blob();
};

/**
 * Audio download of a TAF as OGG or MP3 (encoded by the server): the whole file, or chosen
 * chapters. Several chapters are fetched one by one and either packed into a zip in the browser
 * or saved as single files, which suits phones better.
 */
export function DownloadSheet({
    open,
    onClose,
    title,
    wholeUrl,
    trackUrl,
    chapters,
    chapterTitles,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    /** the whole content as plain Ogg */
    wholeUrl: string;
    /** one chapter as Ogg (1-based), undefined when the source cannot cut chapters */
    trackUrl?: (n: number) => string;
    chapters: number[];
    chapterTitles: string[];
}) {
    const ui = useUi();
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [busy, setBusy] = useState<string | null>(null);
    const [format, setFormat] = useState(() => getPref("download.format", "ogg") as Format);
    const [several, setSeveral] = useState(() => getPref("download.several", "zip") as Several);
    useEffect(() => {
        if (open) setSelected(new Set());
    }, [open]);
    const name = safe(title);
    const url = (u: string) => (format === "mp3" ? mp3Url(u) : u);
    const trackName = (n: number) =>
        `${pad(n)} ${safe(chapterTitles[n - 1] || t("common.chapterN", { n }))}.${format}`;
    const canSplit = Boolean(trackUrl) && chapters.length > 1;
    const all = canSplit && selected.size === chapters.length;

    const run = async (fn: () => Promise<void>, label: string) => {
        setBusy(label);
        try {
            await fn();
        } catch (e) {
            ui.toast("error", t("library.downloadFailed"), String((e as Error).message));
        } finally {
            setBusy(null);
        }
    };

    const whole = () =>
        run(
            async () => save(await fetchBlob(url(wholeUrl)), `${name}.${format}`),
            t("library.downloading"),
        );

    const tracks = () =>
        run(async () => {
            const list = [...selected].sort((a, b) => a - b);
            const fetchTrack = (n: number) => fetchBlob(url(trackUrl!(n)));
            if (list.length === 1) return save(await fetchTrack(list[0]), trackName(list[0]));
            if (several === "single") {
                for (let i = 0; i < list.length; i++) {
                    setBusy(t("library.downloadingN", { n: i + 1, total: list.length }));
                    save(await fetchTrack(list[i]), trackName(list[i]));
                }
                return;
            }
            const files: Record<string, Uint8Array> = {};
            for (let i = 0; i < list.length; i++) {
                setBusy(t("library.downloadingN", { n: i + 1, total: list.length }));
                files[trackName(list[i])] = new Uint8Array(
                    await (await fetchTrack(list[i])).arrayBuffer(),
                );
            }
            setBusy(t("library.packing"));
            // Ogg and MP3 are compressed already: store only
            const zip = zipSync(files, { level: 0 });
            save(new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" }), `${name}.zip`);
        }, t("library.downloading"));

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={t("common.downloadOgg")}
            full={canSplit}
            footer={
                busy ? (
                    <div className="row-gap" style={{ flex: 1 }}>
                        <span className="spinner small" />
                        <span className="small">{busy}</span>
                    </div>
                ) : canSplit ? (
                    <>
                        <button className="btn" onClick={whole}>
                            <Download size={17} />
                            {t("library.wholeFile")}
                        </button>
                        <button className="btn primary" disabled={!selected.size} onClick={tracks}>
                            {selected.size > 1 && several === "zip" ? (
                                <FileArchive size={17} />
                            ) : (
                                <Download size={17} />
                            )}
                            {selected.size
                                ? t("library.nTracks", { n: selected.size })
                                : t("library.chooseTracks")}
                        </button>
                    </>
                ) : (
                    <button className="btn primary" onClick={whole}>
                        <Download size={17} />
                        {t("library.wholeFile")}
                    </button>
                )
            }
        >
            <p className="small muted" style={{ margin: "0 2px 14px" }}>
                {canSplit
                    ? t("library.downloadOggChoose")
                    : trackUrl
                      ? t("common.downloadOggHint")
                      : t("library.downloadOggWholeOnly")}
            </p>
            <ChoiceGroup
                label={t("library.format")}
                value={format}
                onChange={(v) => {
                    setFormat(v);
                    setPref("download.format", v);
                }}
                options={[
                    { value: "ogg", label: "OGG" },
                    { value: "mp3", label: "MP3" },
                ]}
            />
            {canSplit && (
                <ChoiceGroup
                    label={t("library.severalChapters")}
                    value={several}
                    onChange={(v) => {
                        setSeveral(v);
                        setPref("download.several", v);
                    }}
                    options={[
                        { value: "zip", label: t("library.asZip") },
                        { value: "single", label: t("library.asSingleFiles") },
                    ]}
                />
            )}
            {canSplit && (
                <Section
                    title={t("common.chapters")}
                    right={
                        <button
                            className="btn ghost small"
                            onClick={() =>
                                setSelected(
                                    all ? new Set() : new Set(chapters.map((_, i) => i + 1)),
                                )
                            }
                        >
                            {all ? t("common.selectNone") : t("common.selectAll")}
                        </button>
                    }
                >
                    {chapters.map((start, i) => {
                        const n = i + 1;
                        const on = selected.has(n);
                        return (
                            <Row
                                key={n}
                                leading={
                                    <span
                                        className={`select-box ${on ? "checked" : ""}`}
                                        style={{ position: "static", opacity: 1 }}
                                    >
                                        {on && <Check size={15} strokeWidth={3} />}
                                    </span>
                                }
                                title={chapterTitles[i] || t("common.chapterN", { n })}
                                nowrap
                                right={<span className="track-time">{duration(start)}</span>}
                                onClick={() =>
                                    setSelected((cur) => {
                                        const next = new Set(cur);
                                        if (next.has(n)) next.delete(n);
                                        else next.add(n);
                                        return next;
                                    })
                                }
                                chevron={false}
                            />
                        );
                    })}
                </Section>
            )}
        </Sheet>
    );
}
