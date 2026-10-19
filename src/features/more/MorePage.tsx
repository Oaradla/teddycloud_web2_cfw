import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Activity,
    Bell,
    Printer,
    Cpu,
    Languages,
    LogOut,
    Moon,
    Shapes,
    SlidersHorizontal,
    Upload,
    Users,
    Wrench,
} from "lucide-react";
import { useState } from "react";
import { tc } from "../../api/tc";
import { getLang, setLang, t } from "../../lib/i18n";
import { applyTheme, getPref, setPref, Theme } from "../../lib/prefs";
import { persister } from "../../lib/persist";
import { useAccess } from "../../lib/access";
import { keys } from "../../lib/queries";
import { Page, Row, Section, Segmented, useUi } from "../../ui/kit";

export function MorePage() {
    const auth = useQuery({ queryKey: keys.auth, queryFn: tc.authStatus });
    const access = useAccess();
    const [theme, setTheme] = useState<Theme>(() => getPref("theme", "auto") as Theme);
    const [lang, setLangState] = useState(getLang());
    const qc = useQueryClient();
    const ui = useUi();

    const logout = async () => {
        await ui.run(() => tc.logout());
        // nothing of this account stays on the device
        qc.clear();
        await persister.removeClient();
        window.location.reload();
    };

    return (
        <Page title={t("more")} narrow>
            <Section title={t("content")}>
                <Row icon={<Upload size={17} />} title={t("upload")} to="/upload" />
                <Row icon={<Shapes size={17} />} title={t("customModels")} to="/models" />
                <Row icon={<Bell size={17} />} title={t("systemSounds")} sub={t("systemSoundsHint")} to="/systemsounds" />
                <Row icon={<Printer size={17} />} title={t("teddyStudio")} sub={t("teddyStudioHint")} to="/studio" />
            </Section>

            {(access.canServerSettings || access.admin) && (
            <Section title={t("settings")}>
                    {access.canServerSettings && <Row icon={<SlidersHorizontal size={17} />} title={t("serverSettings")} sub={t("serverSettingsHint")} to="/settings" />}
                    {access.admin && <Row icon={<Activity size={17} />} title={t("system")} sub={t("systemHint")} to="/system" />}
                    {access.admin && <Row icon={<Wrench size={17} />} title={t("boxSetup")} sub={t("boxSetupHint")} to="/setup" />}
                    {access.admin && <Row icon={<Cpu size={17} />} title={t("boxUpdate")} sub={t("boxUpdateHint")} to="/boxupdate" />}
                </Section>
            )}

            <Section title={t("appearance")}>
                <div className="row-wrap">
                    <Row icon={<Moon size={17} />} title={t("theme")} />
                    <div style={{ padding: "0 16px 12px" }}>
                        <Segmented
                            value={theme}
                            onChange={(v) => {
                                setTheme(v);
                                setPref("theme", v);
                                applyTheme(v);
                            }}
                            options={[
                                { value: "auto", label: t("themeAuto") },
                                { value: "light", label: t("themeLight") },
                                { value: "dark", label: t("themeDark") },
                            ]}
                        />
                    </div>
                </div>
                <div className="row-wrap">
                    <Row icon={<Languages size={17} />} title={t("language")} />
                    <div style={{ padding: "0 16px 12px" }}>
                        <Segmented
                            value={lang}
                            onChange={(v) => {
                                setLangState(v);
                                setLang(v);
                            }}
                            options={[
                                { value: "de", label: "Deutsch" },
                                { value: "en", label: "English" },
                            ]}
                        />
                    </div>
                </div>
            </Section>

            {auth.data?.enabled && (
                <Section title={t("account")}>
                    <Row
                        leading={<span className="avatar">{(auth.data.username || "?").slice(0, 1).toUpperCase()}</span>}
                        title={auth.data.username || "–"}
                        sub={t("myAccount")}
                        to="/account"
                    />
                    <Row icon={<LogOut size={17} />} title={t("logout")} danger onClick={logout} chevron={false} />
                </Section>
            )}
            {access.canManageUsers && (
                <Section>
                    <Row icon={<Users size={17} />} title={t("usersAndRights")} sub={t("usersAndRightsHint")} to="/users" />
                </Section>
            )}

        </Page>
    );
}
