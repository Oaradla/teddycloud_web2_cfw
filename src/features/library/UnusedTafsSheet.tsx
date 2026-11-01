import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileAudio, Trash2 } from "lucide-react";
import { tc } from "../../api/tc";
import { bytes, isTap, isTaf, parentPath } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useBoxes } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { Empty, ErrorBox, Loading, Notice, Row, useUi } from "../../ui/kit";
import { TonieImage } from "../../ui/TonieImage";

/** TAFs of the library that no tonie and no playlist uses; playlists that cannot be read are named */
export function UnusedTafsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    const ui = useUi();
    const qc = useQueryClient();
    const boxes = useBoxes();
    const unused = useQuery({
        queryKey: ["unusedTafs"],
        enabled: open && Boolean(boxes.data),
        queryFn: async () => {
            const tags = await Promise.all([
                tc.tags(),
                ...(boxes.data ?? []).map((b) => tc.tags(b.ID)),
            ]);
            const files = await tc.walkTree("/");
            const used = new Set(tags.flat().map((x) => x.source));
            const broken: string[] = [];
            for (const { path } of files.filter((f) => isTap(f.entry.name))) {
                const tap = await tc.readTap(path).catch(() => null);
                if (!tap) broken.push(path);
                tap?.files?.forEach((f) => used.add(f.filepath));
                if (tap?.filepath) used.add(tap.filepath);
            }
            const tafs = files.filter(
                (f) => isTaf(f.entry.name) && !used.has("lib://" + f.path.replace(/^\//, "")),
            );
            return { tafs, broken };
        },
    });

    const remove = async (path: string) => {
        if (
            !(await ui.confirm({
                title: t("library.deleteFile"),
                text: path,
                confirm: t("common.delete"),
                danger: true,
            }))
        )
            return;
        await ui.run(() => tc.fileDelete(path, false), t("common.deleted"));
        qc.invalidateQueries({ queryKey: ["unusedTafs"] });
        qc.invalidateQueries({ queryKey: ["files"] });
    };

    return (
        <Sheet open={open} onClose={onClose} title={t("library.unusedTafs")} full>
            <p className="small muted">{t("library.unusedTafsHint")}</p>
            {unused.isFetching && <Loading />}
            {unused.error && !unused.isFetching && (
                <ErrorBox error={unused.error} retry={() => unused.refetch()} />
            )}
            {unused.data && unused.data.broken.length > 0 && (
                <Notice>
                    {t("library.unusedTafsBrokenTaps", { list: unused.data.broken.join(", ") })}
                </Notice>
            )}
            {unused.data && unused.data.tafs.length === 0 && (
                <Empty icon={<FileAudio size={28} />} title={t("library.noUnusedTafs")} />
            )}
            {unused.data && unused.data.tafs.length > 0 && !unused.isFetching && (
                <div className="list">
                    {unused.data.tafs.map(({ path, entry }) => (
                        <Row
                            key={path}
                            leading={
                                entry.tonieInfo?.picture ? (
                                    <TonieImage src={entry.tonieInfo.picture} size={40} />
                                ) : undefined
                            }
                            icon={entry.tonieInfo?.picture ? undefined : <FileAudio size={17} />}
                            title={entry.tonieInfo?.series || entry.name}
                            sub={`${parentPath(path)} · ${bytes(entry.size)}`}
                            right={
                                <button
                                    className="icon-btn"
                                    aria-label={t("common.delete")}
                                    onClick={() => remove(path)}
                                >
                                    <Trash2 size={17} />
                                </button>
                            }
                        />
                    ))}
                </div>
            )}
        </Sheet>
    );
}
