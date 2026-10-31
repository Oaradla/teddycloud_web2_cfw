import { useQuery } from "@tanstack/react-query";
import {
    Bell,
    Cloud,
    Download as DownloadIcon,
    MonitorSmartphone,
    Upload as UploadIcon,
    ExternalLink,
    FileKey,
    Users,
    FolderTree,
    Power,
    Puzzle,
    Radio,
    RefreshCw,
    Server,
} from "lucide-react";
import { tc } from "../../api/tc";
import { t } from "../../lib/i18n";
import { useNewVersion, useServerStatus } from "../../lib/serverInfo";
import { useNotifications } from "../../lib/notifications";
import { TonieStats } from "./TonieStats";
import { allPrefs, setPref } from "../../lib/prefs";
import { saveFile } from "../../lib/download";
import { Loading, Notice, Page, Row, Section, useUi } from "../../ui/kit";

export function SystemPage() {
    const version = useQuery({ queryKey: ["version"], queryFn: tc.version });
    const stats = useQuery({ queryKey: ["stats"], queryFn: tc.stats, refetchInterval: 10_000 });
    const incident = useQuery({ queryKey: ["incident"], queryFn: tc.securityIncident });
    const status = useServerStatus();
    const unread = useNotifications().filter((n) => !n.read).length;
    const ui = useUi();

    /** the preferences of this device (view, filters, TeddyStudio …) as a file, and back */
    const devicePrefs = () =>
        ui.actions(t("more.devicePrefs"), [
            {
                label: t("more.exportPrefs"),
                icon: <DownloadIcon size={17} />,
                onSelect: () =>
                    saveFile(
                        "teddycloud-web2-prefs.json",
                        JSON.stringify(allPrefs(), null, 2),
                        "application/json",
                    ),
            },
            {
                label: t("more.importPrefs"),
                icon: <UploadIcon size={17} />,
                onSelect: () => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "application/json,.json";
                    input.onchange = async () => {
                        const file = input.files?.[0];
                        if (!file) return;
                        const ok = await ui.run(async () => {
                            const prefs = JSON.parse(await file.text()) as Record<string, string>;
                            Object.entries(prefs).forEach(([k, v]) => setPref(k, String(v)));
                            return true;
                        }, t("more.prefsImported"));
                        if (ok) window.setTimeout(() => window.location.reload(), 800);
                    };
                    input.click();
                },
            },
        ]);

    const restart = async () => {
        const ok = await ui.confirm({
            title: t("more.restartServer"),
            text: t("more.restartServerText"),
            confirm: t("more.restart"),
            danger: true,
        });
        if (ok) await ui.run(() => tc.restart(), t("more.restarting"));
    };

    return (
        <Page title={t("common.system")} back="/more" narrow>
            {incident.data && <Notice>{t("more.securityIncident")}</Notice>}
            <NewVersionNotice />
            <Section title={t("more.serverStatus")}>
                <Row
                    icon={<Server size={17} />}
                    title="teddyCloud"
                    value={
                        status.data ? (
                            <StatusDot
                                ok={status.data.server}
                                text={t(
                                    status.data.server ? "more.serverOnline" : "more.serverOffline",
                                )}
                            />
                        ) : (
                            "…"
                        )
                    }
                />
                <Row
                    icon={<Cloud size={17} />}
                    title={t("more.boxineCloud")}
                    sub={status.data && !status.data.cloud ? t("more.boxineOffHint") : undefined}
                    value={
                        status.data ? (
                            <StatusDot
                                ok={status.data.cloud ? status.data.boxine : undefined}
                                text={t(
                                    !status.data.cloud
                                        ? "more.boxineOff"
                                        : status.data.boxine
                                          ? "more.boxineConnected"
                                          : "more.boxineNotConnected",
                                )}
                            />
                        ) : (
                            "…"
                        )
                    }
                />
            </Section>
            <Section title={t("common.version")}>
                <Row title="teddyCloud" value={version.data || "…"} />
                <Row title={t("common.webApp")} value={`web2 ${__APP_VERSION__}`} />
            </Section>
            <Section title={t("more.statistics")}>
                {stats.isLoading && <Loading />}
                {stats.data?.map((s) => (
                    <Row key={s.ID} title={s.description} value={s.value.toLocaleString()} />
                ))}
            </Section>
            <TonieStats />
            <Section title={t("common.tools")}>
                <Row
                    icon={<MonitorSmartphone size={17} />}
                    title={t("more.devicePrefs")}
                    sub={t("more.devicePrefsHint")}
                    onClick={devicePrefs}
                />
                <Row
                    icon={<Bell size={17} />}
                    title={t("more.notifications")}
                    sub={t("more.notificationsHint")}
                    value={unread ? String(unread) : undefined}
                    to="/system/notifications"
                />
                <Row
                    icon={<Radio size={17} />}
                    title={t("common.rtnlLog")}
                    sub={t("common.rtnlLogHint")}
                    to="/system/rtnl"
                />
                <Row
                    icon={<FileKey size={17} />}
                    title={t("common.certificates")}
                    sub={t("common.certificatesHint")}
                    to="/system/certificates"
                />
                <Row
                    icon={<FolderTree size={17} />}
                    title={t("common.contentFolder")}
                    sub={t("common.contentFolderHint")}
                    to="/system/content"
                />
                <Row
                    icon={<Puzzle size={17} />}
                    title={t("common.plugins")}
                    sub={t("common.pluginsHint")}
                    to="/plugins"
                />
                <Row
                    icon={<Users size={17} />}
                    title={t("common.communityTitle")}
                    sub={t("more.communityHint")}
                    to="/community"
                />
            </Section>
            <Section title={t("common.actions")}>
                <Row
                    icon={<RefreshCw size={17} />}
                    title={t("more.reloadToniesJson")}
                    onClick={() => ui.run(() => tc.reloadToniesJson(), t("common.done"))}
                    chevron={false}
                />
                <Row
                    icon={<Power size={17} />}
                    title={t("more.restartServer")}
                    danger
                    onClick={restart}
                    chevron={false}
                />
            </Section>
        </Page>
    );
}

/** green, red, or (undefined) amber */
const StatusDot = ({ ok, text }: { ok?: boolean; text: string }) => (
    <span className="status-dot-text">
        <span className={`status-dot ${ok === undefined ? "warn" : ok ? "ok" : "danger"}`} />
        {text}
    </span>
);

export function NewVersionNotice() {
    const newVersion = useNewVersion();
    if (!newVersion.data) return null;
    return (
        <Notice info>
            <strong>{t("more.newVersion")}</strong>
            <br />
            {t(newVersion.data.develop ? "more.newVersionTextDevelop" : "more.newVersionText")}{" "}
            <a href={newVersion.data.url} target="_blank" rel="noopener noreferrer">
                {t("more.openOnGithub")} <ExternalLink size={13} style={{ verticalAlign: -2 }} />
            </a>
        </Notice>
    );
}
