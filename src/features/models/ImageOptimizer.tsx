import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ImageDown } from "lucide-react";
import { useEffect, useState } from "react";
import { backendUrl } from "../../api/client";
import { tc } from "../../api/tc";
import type { CustomModel } from "../../api/types";
import { bytes } from "../../lib/format";
import { t } from "../../lib/i18n";
import { remoteSize, shrinkImage } from "../../lib/image";
import { keys, useInvalidateTags } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { Loading, Row, useUi } from "../../ui/kit";

const LIMIT = 250 * 1024;

interface Big {
    pic: string;
    size: number;
    models: CustomModel[];
}

/** finds big pictures of the custom models and replaces them by small copies (originals stay) */
export function ImageOptimizer({ open, onClose, models }: { open: boolean; onClose: () => void; models: CustomModel[] }) {
    const ui = useUi();
    const qc = useQueryClient();
    const invalidateTags = useInvalidateTags();
    const [scan, setScan] = useState<{ done: number; total: number } | null>(null);
    const [big, setBig] = useState<Big[] | null>(null);
    const [work, setWork] = useState<{ done: number; total: number } | null>(null);
    const [saved, setSaved] = useState<{ count: number; before: number; after: number } | null>(null);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setBig(null);
        setSaved(null);
        const byPic = new Map<string, CustomModel[]>();
        for (const m of models) if (m.pic?.startsWith("/custom_img/")) byPic.set(m.pic, [...(byPic.get(m.pic) ?? []), m]);
        const pics = [...byPic.keys()];
        setScan({ done: 0, total: pics.length });
        (async () => {
            const found: Big[] = [];
            let i = 0;
            const worker = async () => {
                while (!cancelled && i < pics.length) {
                    const pic = pics[i++];
                    const size = await remoteSize(pic);
                    if (size > LIMIT) found.push({ pic, size, models: byPic.get(pic)! });
                    setScan((s) => (s ? { ...s, done: s.done + 1 } : s));
                }
            };
            await Promise.all(Array.from({ length: 6 }, worker));
            if (!cancelled) {
                setBig(found.sort((a, b) => b.size - a.size));
                setScan(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, models]);

    const run = async () => {
        if (!big) return;
        setWork({ done: 0, total: big.length });
        let before = 0;
        let after = 0;
        let count = 0;
        for (let i = 0; i < big.length; i++) {
            const b = big[i];
            try {
                const r = await fetch(backendUrl(b.pic), { credentials: "same-origin" });
                const blob = await r.blob();
                const rel = b.pic.slice("/custom_img/".length);
                const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
                const name = rel.split("/").pop()!.replace(/\.[^.]+$/, "") + ".web";
                const small = await shrinkImage(blob, name + ".x");
                if (small.size < blob.size) {
                    await tc.uploadCustomImage(small, dir);
                    const pic = `/custom_img/${dir ? dir + "/" : ""}${small.name}`;
                    for (const m of b.models) await tc.upsertModel({ ...m, pic });
                    before += blob.size;
                    after += small.size;
                    count++;
                }
            } catch (e) {
                if (count === 0) {
                    // nothing could be written: the picture folder is read-only, no use going on
                    ui.toast("error", t("optimizeFailed"), t("imageFolderReadOnly"));
                    break;
                }
                ui.toast("error", t("actionFailed"), `${b.pic}: ${(e as Error).message}`);
            }
            setWork({ done: i + 1, total: big.length });
        }
        setWork(null);
        setSaved({ count, before, after });
        qc.invalidateQueries({ queryKey: keys.customModels });
        invalidateTags();
    };

    const total = big?.reduce((n, b) => n + b.size, 0) ?? 0;
    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={t("optimizeImages")}
            full
            footer={
                work ? (
                    <div style={{ flex: 1 }}>
                        <div className="small muted" style={{ marginBottom: 6 }}>
                            {t("optimizingN", { n: work.done, total: work.total })}
                        </div>
                        <div className="progressbar">
                            <div style={{ width: `${(work.done / work.total) * 100}%` }} />
                        </div>
                    </div>
                ) : saved ? (
                    <button className="btn primary" onClick={onClose}>
                        {t("done")}
                    </button>
                ) : (
                    <>
                        <button className="btn" onClick={onClose}>
                            {t("cancel")}
                        </button>
                        <button className="btn primary" disabled={!big?.length} onClick={run}>
                            <ImageDown size={17} />
                            {big?.length ? t("shrinkN", { n: big.length }) : t("optimizeImages")}
                        </button>
                    </>
                )
            }
        >
            {saved ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                    <CheckCircle2 size={44} color="var(--ok)" style={{ margin: "0 auto 10px" }} />
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{t("imagesOptimized", { n: saved.count })}</div>
                    <p className="muted">{t("savedFromTo", { from: bytes(saved.before), to: bytes(saved.after) })}</p>
                </div>
            ) : (
                <>
                    <p className="small muted" style={{ margin: "0 2px 14px" }}>
                        {t("optimizeImagesHint")}
                    </p>
                    {scan && (
                        <>
                            <Loading />
                            <p className="small muted" style={{ textAlign: "center" }}>
                                {t("checkingN", { n: scan.done, total: scan.total })}
                            </p>
                        </>
                    )}
                    {big && big.length === 0 && <p className="muted" style={{ textAlign: "center" }}>{t("allImagesSmall")}</p>}
                    {big && big.length > 0 && (
                        <>
                            <p className="small" style={{ margin: "0 2px 8px" }}>
                                {t("bigImagesFound", { n: big.length, size: bytes(total) })}
                            </p>
                            <div className="list">
                                {big.map((b) => (
                                    <Row
                                        key={b.pic}
                                        icon={<ImageDown size={17} />}
                                        title={b.models[0].series || b.models[0].model}
                                        sub={b.pic.replace("/custom_img/", "")}
                                        value={bytes(b.size)}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </>
            )}
        </Sheet>
    );
}
