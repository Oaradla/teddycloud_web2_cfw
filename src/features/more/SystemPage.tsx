import { useQuery } from "@tanstack/react-query";
import { FileKey, Users, FolderTree, Power, Puzzle, Radio, RefreshCw } from "lucide-react";
import { tc } from "../../api/tc";
import { t } from "../../lib/i18n";
import { Loading, Notice, Page, Row, Section, useUi } from "../../ui/kit";

export function SystemPage() {
    const version = useQuery({ queryKey: ["version"], queryFn: tc.version });
    const stats = useQuery({ queryKey: ["stats"], queryFn: tc.stats, refetchInterval: 10_000 });
    const incident = useQuery({ queryKey: ["incident"], queryFn: tc.securityIncident });
    const ui = useUi();

    const restart = async () => {
        const ok = await ui.confirm({ title: t("restartServer"), text: t("restartServerText"), confirm: t("restart"), danger: true });
        if (ok) await ui.run(() => tc.restart(), t("restarting"));
    };

    return (
        <Page title={t("system")} back="/more" narrow>
            {incident.data && (
                <Notice>
                    {t("securityIncident")}
                </Notice>
            )}
            <Section title={t("version")}>
                <Row title="teddyCloud" value={version.data || "…"} />
                <Row title={t("webApp")} value={`web2 ${__APP_VERSION__}`} />
            </Section>
            <Section title={t("statistics")}>
                {stats.isLoading && <Loading />}
                {stats.data?.map((s) => <Row key={s.ID} title={s.description} value={s.value.toLocaleString()} />)}
            </Section>
            <Section title={t("tools")}>
                <Row icon={<Radio size={17} />} title={t("rtnlLog")} sub={t("rtnlLogHint")} to="/system/rtnl" />
                <Row icon={<FileKey size={17} />} title={t("certificates")} sub={t("certificatesHint")} to="/system/certificates" />
                <Row icon={<FolderTree size={17} />} title={t("contentFolder")} sub={t("contentFolderHint")} to="/system/content" />
                <Row icon={<Puzzle size={17} />} title={t("plugins")} sub={t("pluginsHint")} to="/plugins" />
                <Row icon={<Users size={17} />} title={t("communityTitle")} sub={t("communityHint")} to="/community" />
            </Section>
            <Section title={t("actions")}>
                <Row
                    icon={<RefreshCw size={17} />}
                    title={t("reloadToniesJson")}
                    onClick={() => ui.run(() => tc.reloadToniesJson(), t("done"))}
                    chevron={false}
                />
                <Row icon={<Power size={17} />} title={t("restartServer")} danger onClick={restart} chevron={false} />
            </Section>
        </Page>
    );
}
