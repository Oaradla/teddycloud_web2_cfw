import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ReactNode, useEffect, useRef, useState } from "react";
import { ApiError, AUTH_REQUIRED_EVENT, setReauthHandler } from "../../api/client";
import { tc } from "../../api/tc";
import logo from "../../logo.png";
import { t } from "../../lib/i18n";
import { persister } from "../../lib/persist";
import { getPref, setPref } from "../../lib/prefs";
import { keys } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { Loading } from "../../ui/kit";
import { PasswordSheet, TwoFactorSheet } from "../account/AccountPage";

/** shows the login when teddyCloud's web login is on and there is no session */
export function AuthGate({ children }: { children: ReactNode }) {
    const qc = useQueryClient();
    const auth = useQuery({
        queryKey: keys.auth,
        queryFn: tc.authStatus,
        retry: 1,
        staleTime: 60_000,
    });

    useEffect(() => {
        const onRequired = () => qc.invalidateQueries({ queryKey: keys.auth });
        window.addEventListener(AUTH_REQUIRED_EVENT, onRequired);
        return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onRequired);
    }, [qc]);

    // the cached lists (also those kept on the device) belong to one account: no other one sees them
    const user = auth.data?.enabled ? (auth.data.loggedIn ? auth.data.username : "") : null;
    useEffect(() => {
        if (user === null || getPref("cacheUser", "") === user) return;
        setPref("cacheUser", user);
        void qc.resetQueries({ predicate: (q) => q.queryKey[0] !== keys.auth[0] });
        void persister.removeClient();
    }, [user, qc]);

    if (auth.isLoading) return <Loading />;
    if (auth.data?.enabled && !auth.data.loggedIn && auth.data.twoFactorSetupRequired)
        return (
            <ForcedTwoFactor username={auth.data.username} onDone={() => qc.invalidateQueries()} />
        );
    if (auth.data?.enabled && !auth.data.loggedIn)
        return <LoginPage onDone={() => qc.invalidateQueries()} />;
    if (auth.data?.enabled && auth.data.passwordChangeRequired)
        return (
            <ForcedPasswordChange
                username={auth.data.username}
                minLength={auth.data.passwordMinLength ?? 10}
                twoFactor={auth.data.twoFactorEnabled}
                onDone={() => qc.invalidateQueries()}
            />
        );
    return (
        <>
            {children}
            <ReauthDialog />
        </>
    );
}

function LoginPage({ onDone }: { onDone: () => void }) {
    const [user, setUser] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [challenge, setChallenge] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const backToPassword = () => {
        setChallenge(null);
        setCode("");
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            if (challenge) {
                await tc.login2fa(challenge, code);
                onDone();
            } else {
                const r = await tc.login(user.trim(), password);
                if (r.twoFactorRequired) setChallenge(r.challenge ?? "");
                else onDone();
            }
        } catch (err) {
            const a = err as ApiError;
            if (a.code === "challenge_invalid") backToPassword();
            setError(
                a.status === 429 || a.code === "rate_limited"
                    ? t("auth.rateLimited")
                    : a.code === "lan_only"
                      ? t("auth.lanOnly")
                      : a.message || t("auth.loginFailed"),
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="login-wrap">
            <form className="login-card" onSubmit={submit}>
                <img src={logo} className="logo" alt="" />
                <h1>TeddyCloud</h1>
                <p>{challenge ? t("auth.enter2fa") : t("auth.pleaseLogin")}</p>
                {!challenge ? (
                    <>
                        <div className="field">
                            <input
                                className="input"
                                autoComplete="username"
                                placeholder={t("common.username")}
                                value={user}
                                onChange={(e) => setUser(e.target.value)}
                                autoFocus
                                autoCapitalize="off"
                            />
                        </div>
                        <div className="field">
                            <input
                                className="input"
                                type="password"
                                autoComplete="current-password"
                                placeholder={t("common.password")}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </>
                ) : (
                    <div className="field">
                        <input
                            className="input mono"
                            autoComplete="one-time-code"
                            inputMode="numeric"
                            placeholder="123456"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            autoFocus
                        />
                        <div className="hint">{t("auth.recoveryCodeHint")}</div>
                    </div>
                )}
                {error && (
                    <div className="notice" style={{ background: "var(--danger-soft)" }}>
                        {error}
                    </div>
                )}
                <button
                    className="btn primary block"
                    disabled={
                        busy || (!challenge && (!user || !password)) || (!!challenge && !code)
                    }
                >
                    {busy ? <span className="spinner small" /> : t("auth.login")}
                </button>
                {challenge && (
                    <button type="button" className="btn ghost block" onClick={backToPassword}>
                        {t("auth.back")}
                    </button>
                )}
            </form>
        </div>
    );
}

/** the admin requires two-factor login: the session only allows setting it up */
function ForcedTwoFactor({ username, onDone }: { username: string; onDone: () => void }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="login-wrap">
            <div className="login-card">
                <img src={logo} className="logo" alt="" />
                <h1>{t("common.setUp2fa")}</h1>
                <p>{t("auth.twoFactorForced", { name: username })}</p>
                <button className="btn primary block" onClick={() => setOpen(true)}>
                    {t("common.setUp")}
                </button>
                <button
                    className="btn ghost block mt"
                    onClick={async () => {
                        await tc.logout().catch(() => undefined);
                        onDone();
                    }}
                >
                    {t("common.logout")}
                </button>
            </div>
            <TwoFactorSheet
                mode={open ? "setup" : null}
                username={username}
                onClose={() => {
                    setOpen(false);
                    onDone();
                }}
            />
        </div>
    );
}

/** an admin demands a new password: the session only allows changing it */
function ForcedPasswordChange({
    username,
    minLength,
    twoFactor,
    onDone,
}: {
    username: string;
    minLength: number;
    twoFactor?: boolean;
    onDone: () => void;
}) {
    const [open, setOpen] = useState(true);
    return (
        <div className="login-wrap">
            <div className="login-card">
                <img src={logo} className="logo" alt="" />
                <h1>{t("auth.newPasswordRequiredTitle")}</h1>
                <p>{t("auth.newPasswordRequired", { name: username })}</p>
                <button className="btn primary block" onClick={() => setOpen(true)}>
                    {t("common.changePassword")}
                </button>
                <button
                    className="btn ghost block mt"
                    onClick={async () => {
                        await tc.logout().catch(() => undefined);
                        onDone();
                    }}
                >
                    {t("common.logout")}
                </button>
            </div>
            <PasswordSheet
                open={open}
                own
                twoFactor={twoFactor}
                username={username}
                minLength={minLength}
                onClose={() => {
                    setOpen(false);
                    onDone();
                }}
            />
        </div>
    );
}

/** sensitive changes ask for the password again (server answers 403 reauth_required) */
function ReauthDialog() {
    const [open, setOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const resolver = useRef<((ok: boolean) => void) | null>(null);

    useEffect(() => {
        setReauthHandler(
            () =>
                new Promise<boolean>((resolve) => {
                    resolver.current = resolve;
                    setPassword("");
                    setCode("");
                    setError("");
                    setOpen(true);
                }),
        );
        return () => {
            setReauthHandler(null);
            // a dialog closed by a logout answers no, or later requests would wait for it for good
            resolver.current?.(false);
            resolver.current = null;
        };
    }, []);

    const finish = (ok: boolean) => {
        setOpen(false);
        resolver.current?.(ok);
        resolver.current = null;
    };

    const confirm = async () => {
        try {
            await tc.confirm(password, code.trim() || undefined);
            finish(true);
        } catch (e) {
            setError((e as Error).message);
        }
    };

    return (
        <Sheet
            open={open}
            onClose={() => finish(false)}
            title={t("auth.confirmIdentity")}
            footer={
                <>
                    <button className="btn" onClick={() => finish(false)}>
                        {t("common.cancel")}
                    </button>
                    <button className="btn primary" onClick={confirm} disabled={!password}>
                        {t("common.confirm")}
                    </button>
                </>
            }
        >
            <p className="muted" style={{ marginTop: 0 }}>
                {t("auth.confirmIdentityText")}
            </p>
            <div className="field">
                <input
                    className="input"
                    type="password"
                    placeholder={t("common.password")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                />
            </div>
            <div className="field">
                <input
                    className="input mono"
                    placeholder={t("auth.twoFactorOptional")}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode="numeric"
                />
            </div>
            {error && (
                <div className="small" style={{ color: "var(--danger)" }}>
                    {error}
                </div>
            )}
        </Sheet>
    );
}
