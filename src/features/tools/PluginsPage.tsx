import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Puzzle, Trash2, UploadCloud } from "lucide-react";
import { useRef } from "react";
import { useParams } from "react-router-dom";
import { backendUrl } from "../../api/client";
import { tc } from "../../api/tc";
import { t } from "../../lib/i18n";
import { Empty, ErrorBox, Loading, Page, Row, Section, useUi } from "../../ui/kit";

const pluginUrl = (id: string) => backendUrl(`/plugins/${encodeURIComponent(id)}/index.html`);

/** the plugins in data/www/plugins: open, add (zip), remove */
export function PluginsPage() {
    const qc = useQueryClient();
    const ui = useUi();
    const plugins = useQuery({ queryKey: ["plugins"], queryFn: tc.plugins });
    const input = useRef<HTMLInputElement>(null);

    const upload = async (file: File | undefined) => {
        if (!file) return;
        await ui.run(() => tc.uploadPlugin(file), t("pluginAdded"));
        if (input.current) input.current.value = "";
        qc.invalidateQueries({ queryKey: ["plugins"] });
    };

    return (
        <Page
            title={t("plugins")}
            subtitle={t("pluginsHint")}
            back="/system"
            narrow
            right={
                <button className="icon-btn" onClick={() => input.current?.click()} aria-label={t("pluginAdd")} title={t("pluginAdd")}>
                    <UploadCloud size={20} />
                </button>
            }
        >
            {plugins.isLoading && <Loading />}
            {plugins.error && <ErrorBox error={plugins.error} retry={() => plugins.refetch()} />}
            {plugins.data && plugins.data.length === 0 && <Empty icon={<Puzzle size={28} />} title={t("noPlugins")} text={t("noPluginsText")} />}
            {plugins.data && plugins.data.length > 0 && (
                <Section>
                    {plugins.data.map((p) => (
                        <Row
                            key={p.pluginId}
                            icon={<Puzzle size={17} />}
                            title={p.pluginName}
                            sub={[p.version, p.author, p.description].filter(Boolean).join(" · ")}
                            to={p.standalone ? undefined : `/plugins/${encodeURIComponent(p.pluginId)}`}
                            onClick={p.standalone ? () => window.open(pluginUrl(p.pluginId), "_blank", "noopener") : undefined}
                            right={
                                <button
                                    className="icon-btn"
                                    aria-label={t("delete")}
                                    title={t("delete")}
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        if (!(await ui.confirm({ title: t("pluginDeleteTitle", { name: p.pluginName }), confirm: t("delete"), danger: true }))) return;
                                        await ui.run(() => tc.deletePlugin(p.pluginId), t("deleted"));
                                        qc.invalidateQueries({ queryKey: ["plugins"] });
                                    }}
                                >
                                    <Trash2 size={17} />
                                </button>
                            }
                        />
                    ))}
                </Section>
            )}
            <input ref={input} type="file" accept=".zip" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </Page>
    );
}

/** one plugin in a frame */
export function PluginPage() {
    const { id = "" } = useParams();
    const plugins = useQuery({ queryKey: ["plugins"], queryFn: tc.plugins });
    const meta = plugins.data?.find((p) => p.pluginId === id);
    return (
        <Page
            title={meta?.pluginName ?? id}
            back="/plugins"
            right={
                <a className="icon-btn" href={pluginUrl(id)} target="_blank" rel="noopener" aria-label={t("openInNewTab")} title={t("openInNewTab")}>
                    <ExternalLink size={20} />
                </a>
            }
        >
            <iframe className="plugin-frame" src={pluginUrl(id)} title={meta?.pluginName ?? id} />
        </Page>
    );
}
