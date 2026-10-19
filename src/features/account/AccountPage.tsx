import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, MonitorSmartphone, ShieldCheck, ShieldOff, UserRound } from "lucide-react";
import qrcode from "qrcode-generator";
import { useState } from "react";
import { auth } from "../../api/auth";
import { tc } from "../../api/tc";
import { useAccess } from "../../lib/access";
import { ago } from "../../lib/format";
import { t } from "../../lib/i18n";
import { persister } from "../../lib/persist";
import { Sheet } from "../../ui/Sheet";
import { Empty, Notice, Page, Row, Section, SwitchRow, useUi } from "../../ui/kit";

export const levelName = (level?: string) => t(`level_${level || "admin"}` as never);

/** the own account: password, two-factor login, sessions, log out */
export function AccountPage() {
    const access = useAccess();
    const status = access.status;
    const ui = useUi();
    const qc = useQueryClient();
    const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => auth.sessions(), enabled: access.loginActive });
    const [pw, setPw] = useState(false);
    const [twofa, setTwofa] = useState<"setup" | "disable" | "renew" | null>(null);

    const logout = async () => {
        await ui.run(() => tc.logout());
        qc.clear();
        await persister.removeClient();
        window.location.reload();
    };

    if (!status?.enabled)
        return (
            <Page title={t("account")} back="/more" narrow>
                <Empty icon={<UserRound size={28} />} title={t("loginOff")} text={t("loginOffText")} />
            </Page>
        );

    const group = access.mine.group ? access.mine.group : levelName(access.mine.level);
    return (
        <Page title={t("account")} back="/more" narrow>
            <div className="hero side" style={{ alignItems: "center" }}>
                <div className="avatar big">{(status.username || "?").slice(0, 1).toUpperCase()}</div>
                <div>
                    <h1>{status.username}</h1>
                    <p>{group}</p>
                </div>
            </div>
            {status.twoFactorSetupRequired && <Notice>{t("twoFactorRequiredNotice")}</Notice>}

            <Section title={t("security")}>
                <Row icon={<KeyRound size={17} />} title={t("changePassword")} onClick={() => setPw(true)} chevron />
                {status.twoFactorEnabled ? (
                    <>
                        <Row
                            icon={<ShieldCheck size={17} />}
                            iconColor="var(--ok)"
                            title={t("twoFactor")}
                            sub={t("twoFactorOn", { n: status.recoveryCodesLeft ?? 0 })}
                        />
                        <Row title={t("newRecoveryCodes")} onClick={() => setTwofa("renew")} chevron />
                        {!status.twoFactorRequired && <Row title={t("disable2fa")} danger onClick={() => setTwofa("disable")} chevron={false} />}
                    </>
                ) : (
                    <Row icon={<ShieldOff size={17} />} title={t("twoFactor")} sub={t("twoFactorOffHint")} onClick={() => setTwofa("setup")} value={t("setUp")} chevron />
                )}
            </Section>

            <Section
                title={t("sessions")}
                right={
                    (sessions.data?.length ?? 0) > 1 && (
                        <button
                            className="btn ghost small"
                            onClick={async () => {
                                const r = await ui.run(() => auth.revokeOtherSessions());
                                if (r) ui.toast("ok", t("sessionsEnded", { n: r.revoked ?? 0 }));
                                sessions.refetch();
                            }}
                        >
                            {t("endOthers")}
                        </button>
                    )
                }
            >
                {(sessions.data ?? []).map((s) => (
                    <Row
                        key={s.id}
                        icon={<MonitorSmartphone size={17} />}
                        title={
                            <>
                                {browserName(s.userAgent)} {s.current && <span className="badge ok">{t("thisDevice")}</span>}
                            </>
                        }
                        sub={`${s.ip} · ${t("lastActive", { when: ago(s.lastSeen * 1000) })}`}
                        right={
                            !s.current && (
                                <button
                                    className="btn small"
                                    onClick={async () => {
                                        await ui.run(() => auth.revokeSession(s.id), t("sessionEnded"));
                                        sessions.refetch();
                                    }}
                                >
                                    {t("end")}
                                </button>
                            )
                        }
                    />
                ))}
            </Section>

            <Section>
                <Row icon={<LogOut size={17} />} title={t("logout")} danger onClick={logout} chevron={false} />
            </Section>

            <PasswordSheet open={pw} onClose={() => setPw(false)} username={status.username} minLength={status.passwordMinLength ?? 10} own />
            <TwoFactorSheet mode={twofa} onClose={() => setTwofa(null)} username={status.username} />
        </Page>
    );
}

const browserName = (ua: string) => {
    const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
    const b = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : ua.split(" ")[0] || "?";
    return os ? `${b} · ${os}` : b;
};

/** new password: the own (with the current one) or, for managers, of another user */
export function PasswordSheet({
    open,
    onClose,
    username,
    minLength,
    own,
    onSaved,
}: {
    open: boolean;
    onClose: () => void;
    username: string;
    minLength: number;
    own?: boolean;
    /** with the demand for a new password at the next login */
    onSaved?: (mustChange: boolean) => void;
}) {
    const ui = useUi();
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [repeat, setRepeat] = useState("");
    const [mustChange, setMustChange] = useState(false);
    const valid = next.length >= minLength && next === repeat && (!own || current);
    const save = async () => {
        const r = await ui.run(() => auth.setPassword(username, next, own ? current : undefined, !own && mustChange), t("passwordChanged"));
        if (r) {
            setCurrent("");
            setNext("");
            setRepeat("");
            setMustChange(false);
            onSaved?.(!own && mustChange);
            onClose();
        }
    };
    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={own ? t("changePassword") : t("passwordFor", { name: username })}
            footer={
                <>
                    <button className="btn" onClick={onClose}>
                        {t("cancel")}
                    </button>
                    <button className="btn primary" disabled={!valid} onClick={save}>
                        {t("save")}
                    </button>
                </>
            }
        >
            <form onSubmit={(e) => (e.preventDefault(), valid && save())}>
                <input type="text" autoComplete="username" value={username} readOnly hidden />
                {own && (
                    <div className="field">
                        <label>{t("currentPassword")}</label>
                        <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
                    </div>
                )}
                <div className="field">
                    <label>{t("newPassword")}</label>
                    <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
                    <div className="hint">{t("passwordMin", { n: minLength })}</div>
                </div>
                <div className="field">
                    <label>{t("repeatPassword")}</label>
                    <input className="input" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
                    {repeat && repeat !== next && <div className="hint" style={{ color: "var(--danger)" }}>{t("passwordsDiffer")}</div>}
                </div>
                {!own && (
                    <div className="list">
                        <SwitchRow title={t("mustChangePassword")} checked={mustChange} onChange={setMustChange} />
                    </div>
                )}
            </form>
        </Sheet>
    );
}

export function TwoFactorSheet({ mode, onClose, username }: { mode: "setup" | "disable" | "renew" | null; onClose: () => void; username: string }) {
    const ui = useUi();
    const qc = useQueryClient();
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
    const [codes, setCodes] = useState<string[] | null>(null);

    const close = () => {
        setPassword("");
        setCode("");
        setSetup(null);
        setCodes(null);
        qc.invalidateQueries({ queryKey: ["auth"] });
        onClose();
    };

    const qr = (uri: string) => {
        const q = qrcode(0, "M");
        q.addData(uri);
        q.make();
        return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    };

    const step = async () => {
        if (mode === "setup" && !setup) {
            const r = await ui.run(() => auth.setup2fa(password));
            if (r) setSetup(r);
        } else if (mode === "setup") {
            const r = await ui.run(() => auth.enable2fa(code.replace(/\s/g, "")));
            if (r) setCodes(r);
        } else if (mode === "disable") {
            const r = await ui.run(() => auth.disable2fa(password, code), t("twoFactorDisabled"));
            if (r) close();
        } else if (mode === "renew") {
            const r = await ui.run(() => auth.renewRecoveryCodes(password, code));
            if (r) setCodes(r);
        }
    };

    const download = () => {
        const blob = new Blob([`TeddyCloud – ${username}\n\n${codes!.join("\n")}\n`], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `teddycloud-recovery-${username}.txt`;
        a.click();
    };

    const title = mode === "setup" ? t("setUp2fa") : mode === "disable" ? t("disable2fa") : t("newRecoveryCodes");
    return (
        <Sheet
            open={mode !== null}
            onClose={close}
            title={title}
            footer={
                codes ? (
                    <>
                        <button className="btn" onClick={download}>
                            {t("download")}
                        </button>
                        <button className="btn primary" onClick={close}>
                            {t("done")}
                        </button>
                    </>
                ) : (
                    <>
                        <button className="btn" onClick={close}>
                            {t("cancel")}
                        </button>
                        <button
                            className={`btn ${mode === "disable" ? "danger" : "primary"}`}
                            disabled={mode === "setup" && !setup ? !password : mode === "setup" ? code.replace(/\s/g, "").length !== 6 : !password || !code}
                            onClick={step}
                        >
                            {mode === "setup" && !setup ? t("next") : t("confirm")}
                        </button>
                    </>
                )
            }
        >
            {codes ? (
                <>
                    <p className="muted" style={{ marginTop: 0 }}>
                        {t("recoveryCodesText")}
                    </p>
                    <div className="card mono selectable" style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 15 }}>
                        {codes.map((c) => (
                            <span key={c}>{c}</span>
                        ))}
                    </div>
                </>
            ) : mode === "setup" && setup ? (
                <>
                    <p className="muted" style={{ marginTop: 0 }}>
                        {t("scanQr")}
                    </p>
                    <div style={{ width: 220, margin: "0 auto 12px", background: "#fff", borderRadius: 12, padding: 6 }} dangerouslySetInnerHTML={{ __html: qr(setup.otpauthUri) }} />
                    <p className="small muted" style={{ textAlign: "center" }}>
                        {t("orEnterKey")} <span className="mono selectable">{setup.secret}</span>
                    </p>
                    <div className="field">
                        <label>{t("codeFromApp")}</label>
                        <input className="input mono" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
                    </div>
                </>
            ) : (
                <form onSubmit={(e) => (e.preventDefault(), step())}>
                    <p className="muted" style={{ marginTop: 0 }}>
                        {mode === "setup" ? t("setUp2faIntro") : t("confirmWithCode")}
                    </p>
                    <div className="field">
                        <label>{t("password")}</label>
                        <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
                    </div>
                    {mode !== "setup" && (
                        <div className="field">
                            <label>{t("codeOrRecovery")}</label>
                            <input className="input mono" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
                        </div>
                    )}
                </form>
            )}
        </Sheet>
    );
}
