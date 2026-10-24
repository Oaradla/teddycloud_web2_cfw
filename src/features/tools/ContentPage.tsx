import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileAudio, FileText, Folder, FolderInput, FolderOpen, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { tc } from "../../api/tc";
import { bytes, dateTime } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useBoxes } from "../../lib/queries";
import { Empty, ErrorBox, Loading, Page, Row, Section, useUi } from "../../ui/kit";

/**
 * the content folder as the server stores it (one folder per tag), for the server or the content
 * folder of a box; mostly for looking into what a box has
 */
export function ContentPage() {
    const qc = useQueryClient();
    const ui = useUi();
    const boxes = useBoxes();
    const [overlay, setOverlay] = useState("");
    const [path, setPath] = useState("");
    const files = useQuery({
        queryKey: ["contentFiles", overlay, path],
        queryFn: () => tc.files(path, "", overlay || undefined),
    });
    const entries = (files.data ?? []).filter((f) => f.name !== "." && f.name !== "..").sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
    const parts = path.split("/").filter(Boolean);

    return (
        <Page title={t("contentFolder")} subtitle={t("contentFolderHint")} back="/system" narrow>
            <Section title={t("contentOf")}>
                <div style={{ padding: "12px 16px" }}>
                    <select
                        className="select"
                        value={overlay}
                        onChange={(e) => {
                            setOverlay(e.target.value);
                            setPath("");
                        }}
                    >
                        <option value="">{t("certsForServer")}</option>
                        {(boxes.data ?? []).map((b) => (
                            <option key={b.ID} value={b.ID}>
                                {b.boxName || b.commonName}
                            </option>
                        ))}
                    </select>
                </div>
            </Section>
            <Section title={`/${parts.join("/")}`}>
                {parts.length > 0 && (
                    <Row icon={<FolderOpen size={17} />} title=".." onClick={() => setPath(parts.slice(0, -1).join("/"))} chevron={false} />
                )}
                {files.isLoading && <Loading />}
                {files.error && <ErrorBox error={files.error} retry={() => files.refetch()} />}
                {files.data && entries.length === 0 && <Empty icon={<Folder size={28} />} title={t("emptyFolder")} />}
                {entries.map((f) => {
                    const full = [...parts, f.name].join("/");
                    // the content TAF of a tag lies at <first 8 of the ruid>/<last 8>
                    const ruid = parts.length === 1 && /^[0-9A-F]{8}$/i.test(f.name) ? parts[0] + f.name : "";
                    const tonie = f.tonieInfo?.series ? `${f.tonieInfo.series}${f.tonieInfo.episode ? " – " + f.tonieInfo.episode : ""}` : "";
                    return (
                        <Row
                            key={f.name}
                            icon={f.isDir ? <Folder size={17} /> : f.tafHeader ? <FileAudio size={17} /> : <FileText size={17} />}
                            title={f.name}
                            sub={[tonie, f.isDir ? "" : bytes(f.size), dateTime(f.date * 1000)].filter(Boolean).join(" · ")}
                            onClick={f.isDir ? () => setPath(full) : undefined}
                            chevron={f.isDir}
                            right={
                                f.isDir ? undefined : (
                                    <button
                                        className="icon-btn"
                                        aria-label={t("more")}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const migrate = (root: boolean) => async () => {
                                                await ui.run(() => tc.migrateToLibrary(ruid, root, overlay || undefined), t("migrated"));
                                                qc.invalidateQueries({ queryKey: ["contentFiles"] });
                                                qc.invalidateQueries({ queryKey: ["files"] });
                                            };
                                            ui.actions(f.name, [
                                                { label: t("migrateByAudioId"), icon: <FolderInput size={17} />, onSelect: migrate(false), hidden: !ruid },
                                                { label: t("migrateToRoot"), icon: <FolderInput size={17} />, onSelect: migrate(true), hidden: !ruid },
                                                {
                                                    label: t("delete"),
                                                    icon: <Trash2 size={17} />,
                                                    danger: true,
                                                    onSelect: async () => {
                                                        if (!(await ui.confirm({ title: t("deleteFileTitle", { name: f.name }), confirm: t("delete"), danger: true }))) return;
                                                        await ui.run(() => tc.fileDelete(full, false, "", overlay || undefined), t("deleted"));
                                                        qc.invalidateQueries({ queryKey: ["contentFiles"] });
                                                    },
                                                },
                                            ]);
                                        }}
                                    >
                                        <MoreHorizontal size={18} />
                                    </button>
                                )
                            }
                        />
                    );
                })}
            </Section>
        </Page>
    );
}
