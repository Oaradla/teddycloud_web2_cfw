import { Activity, Bell, Cpu, Printer, Wrench, Disc3, FolderOpen, LayoutGrid, Monitor, Moon, Radio, Shapes, SlidersHorizontal, Sun, Upload, Users } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { HashRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import logo from "./logo.png";
import { AuthGate } from "./features/auth/AuthGate";
import { BoxesPage } from "./features/boxes/BoxesPage";
import { BoxPage } from "./features/boxes/BoxPage";
import { LibraryPage } from "./features/library/LibraryPage";
import { ModelsPage } from "./features/models/ModelsPage";
import { MorePage } from "./features/more/MorePage";
import { SystemPage } from "./features/more/SystemPage";
import { AllSettingsPage } from "./features/settings/AllSettingsPage";
import { ToniePage } from "./features/tonies/ToniePage";
import { ToniesPage } from "./features/tonies/ToniesPage";
import { UploadPage } from "./features/upload/UploadPage";
import { BoxUpdatePage } from "./features/boxupdate/BoxUpdatePage";
import { AccountPage } from "./features/account/AccountPage";
import { UsersPage } from "./features/users/UsersPage";
import { CertificatesPage } from "./features/tools/CertificatesPage";
import { ContentPage } from "./features/tools/ContentPage";
import { PluginPage, PluginsPage } from "./features/tools/PluginsPage";
import { RtnlPage } from "./features/tools/RtnlPage";
import { StudioPage } from "./features/studio/StudioPage";
import { CommunityPage } from "./features/community/CommunityPage";
import { SetupPage } from "./features/setup/SetupPage";
import { Cc3200Page } from "./features/setup/Cc3200Page";
import { Cc3235Page } from "./features/setup/Cc3235Page";
import { Esp32Page } from "./features/setup/Esp32Page";
import { useAccess } from "./lib/access";
import { getLang, setLang, t } from "./lib/i18n";
import { applyTheme, getPref, setPref, Theme } from "./lib/prefs";
import { useLiveEvents } from "./lib/queries";
import { PlayerProvider } from "./player/Player";
import { Empty } from "./ui/kit";

const tabs: { to: string; label: () => string; icon: ReactNode; match: (p: string) => boolean }[] = [
    { to: "/", label: () => t("boxes"), icon: <Radio size={24} />, match: (p) => p === "/" || p.startsWith("/box") },
    { to: "/tonies", label: () => t("tonies"), icon: <Disc3 size={24} />, match: (p) => p.startsWith("/tonie") },
    { to: "/library", label: () => t("library"), icon: <FolderOpen size={24} />, match: (p) => p.startsWith("/library") },
    { to: "/more", label: () => t("more"), icon: <LayoutGrid size={24} />, match: (p) => ["/more", "/upload", "/models", "/systemsounds", "/studio", "/settings", "/system", "/plugins", "/community", "/setup", "/boxupdate", "/account", "/users"].some((x) => p.startsWith(x)) },
];

function Shell() {
    const { pathname } = useLocation();
    useLiveEvents();
    const access = useAccess();
    // a new page starts at the top, like a native app
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    return (
        <div className="app">
            <nav className="sidebar" aria-label="main">
                <div className="brand">
                    <img src={logo} alt="" />
                    TeddyCloud
                </div>
                {tabs.slice(0, 3).map((x) => (
                    <NavLink key={x.to} to={x.to} className={() => (x.match(pathname) ? "active" : "")}>
                        {x.icon}
                        {x.label()}
                    </NavLink>
                ))}
                <div className="section-label">{t("content")}</div>
                <NavLink to="/upload" className={() => (pathname.startsWith("/upload") ? "active" : "")}>
                    <Upload size={22} />
                    {t("upload")}
                </NavLink>
                <NavLink to="/models" className={() => (pathname.startsWith("/models") ? "active" : "")}>
                    <Shapes size={22} />
                    {t("customModels")}
                </NavLink>
                <NavLink to="/systemsounds" className={() => (pathname.startsWith("/systemsounds") ? "active" : "")}>
                    <Bell size={22} />
                    {t("systemSounds")}
                </NavLink>
                <NavLink to="/studio" className={() => (pathname.startsWith("/studio") ? "active" : "")}>
                    <Printer size={22} />
                    {t("teddyStudio")}
                </NavLink>
                {(access.canServerSettings || access.canManageUsers) && <div className="section-label">{t("settings")}</div>}
                {access.canServerSettings && (
                    <NavLink to="/settings" className={() => (pathname.startsWith("/settings") ? "active" : "")}>
                        <SlidersHorizontal size={22} />
                        {t("serverSettings")}
                    </NavLink>
                )}
                {access.admin && (
                    <NavLink to="/setup" className={() => (pathname.startsWith("/setup") ? "active" : "")}>
                        <Wrench size={22} />
                        {t("boxSetup")}
                    </NavLink>
                )}
                {access.admin && (
                    <NavLink to="/boxupdate" className={() => (pathname.startsWith("/boxupdate") ? "active" : "")}>
                        <Cpu size={22} />
                        {t("boxUpdate")}
                    </NavLink>
                )}
                {access.canManageUsers && (
                    <NavLink to="/users" className={() => (pathname.startsWith("/users") ? "active" : "")}>
                        <Users size={22} />
                        {t("usersAndRights")}
                    </NavLink>
                )}
                <div className="spacer" />
                {/* what the "More" tab holds on the phone */}
                {access.admin && (
                    <NavLink to="/system" className={() => (["/system", "/plugins", "/community"].some((x) => pathname.startsWith(x)) ? "active" : "")}>
                        <Activity size={22} />
                        {t("system")}
                    </NavLink>
                )}
                <SidebarPrefs />
                {access.loginActive && (
                    <NavLink to="/account" className={() => `account-chip ${pathname.startsWith("/account") ? "active" : ""}`}>
                        <span className="avatar">{(access.status?.username || "?").slice(0, 1).toUpperCase()}</span>
                        <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontWeight: 650, color: "var(--fg)" }}>{access.status?.username}</span>
                            <span className="small muted">{t("myAccount")}</span>
                        </span>
                    </NavLink>
                )}
            </nav>

            <main className="app-main">
                <Routes>
                    <Route path="/" element={<BoxesPage />} />
                    <Route path="/box/:id" element={<BoxPage />} />
                    <Route path="/box/:id/settings" element={<AllSettingsPage />} />
                    <Route path="/tonies" element={<ToniesPage />} />
                    <Route path="/systemsounds" element={<ToniesPage key="system" system />} />
                    <Route path="/studio" element={<StudioPage />} />
                    <Route path="/community" element={<CommunityPage />} />
                    <Route path="/setup" element={<SetupPage />} />
                    <Route path="/setup/cc3200" element={<Cc3200Page />} />
                    <Route path="/setup/cc3235" element={<Cc3235Page />} />
                    <Route path="/setup/esp32" element={<Esp32Page />} />
                    <Route path="/tonie/:ruid" element={<ToniePage />} />
                    <Route path="/library" element={<LibraryPage />} />
                    <Route path="/upload" element={<UploadPage />} />
                    <Route path="/models" element={<ModelsPage />} />
                    <Route path="/settings" element={<AllSettingsPage />} />
                    <Route path="/system" element={<SystemPage />} />
                    <Route path="/system/rtnl" element={<RtnlPage />} />
                    <Route path="/system/certificates" element={<CertificatesPage />} />
                    <Route path="/system/content" element={<ContentPage />} />
                    <Route path="/plugins" element={<PluginsPage />} />
                    <Route path="/plugins/:id" element={<PluginPage />} />
                    <Route path="/boxupdate" element={<BoxUpdatePage />} />
                    <Route path="/account" element={<AccountPage />} />
                    <Route path="/users" element={<UsersPage />} />
                    <Route path="/more" element={<MorePage />} />
                    <Route path="*" element={<Empty icon={<Radio size={28} />} title={t("notFound")} />} />
                </Routes>
            </main>

            <nav className="tabbar" aria-label="tabs">
                {tabs.map((x) => (
                    <NavLink key={x.to} to={x.to} className={() => (x.match(pathname) ? "active" : "")}>
                        {x.icon}
                        {x.label()}
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}

const THEME_ICON: Record<Theme, ReactNode> = { auto: <Monitor size={18} />, light: <Sun size={18} />, dark: <Moon size={18} /> };
const NEXT_THEME: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };
const THEME_LABEL = { auto: "themeAuto", light: "themeLight", dark: "themeDark" } as const;

/** theme and language at the bottom of the sidebar */
function SidebarPrefs() {
    const [theme, setTheme] = useState<Theme>(() => getPref("theme", "auto") as Theme);
    const [lang, setLangState] = useState(getLang());
    return (
        <div className="sidebar-prefs">
            <button
                className="btn ghost small"
                title={`${t("theme")}: ${t(THEME_LABEL[theme])}`}
                aria-label={`${t("theme")}: ${t(THEME_LABEL[theme])}`}
                onClick={() => {
                    const next = NEXT_THEME[theme];
                    setTheme(next);
                    setPref("theme", next);
                    applyTheme(next);
                }}
            >
                {THEME_ICON[theme]}
                {t(THEME_LABEL[theme])}
            </button>
            <button
                className="btn ghost small"
                title={t("language")}
                aria-label={t("language")}
                onClick={() => {
                    const next = lang === "de" ? "en" : "de";
                    setLangState(next);
                    setLang(next);
                }}
            >
                {lang === "de" ? "DE" : "EN"}
            </button>
        </div>
    );
}

export function App() {
    return (
        <HashRouter>
            <AuthGate>
                <PlayerProvider>
                    <Shell />
                </PlayerProvider>
            </AuthGate>
        </HashRouter>
    );
}
