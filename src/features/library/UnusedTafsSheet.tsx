import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileAudio, Trash2 } from "lucide-react";
import { tc } from "../../api/tc";
import { bytes, isTap, isTaf, parentPath } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useAllTags } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { Empty, Loading, Row, useUi } from "../../ui/kit";
import { TonieImage } from "../../ui/TonieImage";

/** TAFs of the library that no tonie and no playlist uses */
export function UnusedTafsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    const ui = useUi();
    const qc = useQueryClient();
    const tags = useAllTags();
    const unused = useQuery({
        queryKey: ["unusedTafs"],
        enabled: open && Boolean(tags.data),
        queryFn: async () => {
            const files = await tc.walkTree("/");
            const used = new Set((tags.data ?? []).map((x) => x.source));
            for (const { path } of files.filter((f) => isTap(f.entry.name))) {
                const tap = await tc.readTap(path).catch(() => null);
                tap?.files?.forEach((f) => used.add(f.filepath));
                if (tap?.filepath) used.add(tap.filepath);
            }
            return files.filter((f) => isTaf(f.entry.name) && !used.has("lib://" + f.path.replace(/^\//, "")));
        },
    });

    const remove = async (path: string) => {
        if (!(await ui.confirm({ title: t("deleteFile"), text: path, confirm: t("delete"), danger: true }))) return;
        await ui.run(() => tc.fileDelete(path, false), t("deleted"));
        qc.invalidateQueries({ queryKey: ["unusedTafs"] });
        qc.invalidateQueries({ queryKey: ["files"] });
    };

    return (
        <Sheet open={open} onClose={onClose} title={t("unusedTafs")} full>
            <p className="small muted">{t("unusedTafsHint")}</p>
            {unused.isFetching && <Loading />}
            {unused.data && unused.data.length === 0 && <Empty icon={<FileAudio size={28} />} title={t("noUnusedTafs")} />}
            {unused.data && unused.data.length > 0 && !unused.isFetching && (
                <div className="list">
                    {unused.data.map(({ path, entry }) => (
                        <Row
                            key={path}
                            leading={entry.tonieInfo?.picture ? <TonieImage src={entry.tonieInfo.picture} size={40} /> : undefined}
                            icon={entry.tonieInfo?.picture ? undefined : <FileAudio size={17} />}
                            title={entry.tonieInfo?.series || entry.name}
                            sub={`${parentPath(path)} · ${bytes(entry.size)}`}
                            right={
                                <button className="icon-btn" aria-label={t("delete")} onClick={() => remove(path)}>
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
