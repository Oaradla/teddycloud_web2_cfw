import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ReactNode, useEffect, useRef, useState } from "react";
import { ApiError, AUTH_REQUIRED_EVENT, setReauthHandler } from "../../api/client";
import { tc } from "../../api/tc";
import logo from "../../logo.png";
import { t } from "../../lib/i18n";
import { keys } from "../../lib/queries";
import { Sheet } from "../../ui/Sheet";
import { Loading } from "../../ui/kit";
import { PasswordSheet, TwoFactorSheet } from "../account/AccountPage";

/** shows the login when teddyCloud's web login is on and there is no session */
export function AuthGate({ children }: { children: ReactNode }) {
    const qc = useQueryClient();
    const auth = useQuery({ queryKey: keys.auth, queryFn: tc.authStatus, retry: 1, staleTime: 60_000 });

    useEffect(() => {
        const onRequired = () => qc.invalidateQueries({ queryKey: keys.auth });
        window.addEventListener(AUTH_REQUIRED_EVENT, onRequired);
        return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onRequired);
    }, [qc]);

    if (auth.isLoading) return <Loading />;
    if (auth.data?.enabled && !auth.data.loggedIn && auth.data.twoFactorSetupRequired)
        return <ForcedTwoFactor username={auth.data.username} onDone={() => qc.invalidateQueries()} />;
    if (auth.data?.enabled && !auth.data.loggedIn)
        return <LoginPage onDone={() => qc.invalidateQueries()} />;
    if (auth.data?.enabled && auth.data.passwordChangeRequired)
        return <ForcedPasswordChange username={auth.data.username} minLength={auth.data.passwordMinLength ?? 10} onDone={() => qc.invalidateQueries()} />;
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
            setError(a.status === 429 || a.code === "rate_limited" ? t("rateLimited") : a.message || t("loginFailed"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="login-wrap">
            <form className="login-card" onSubmit={submit}>
                <img src={logo} className="logo" alt="" />
                <h1>TeddyCloud</h1>
                <p>{challenge ? t("enter2fa") : t("pleaseLogin")}</p>
                {!challenge ? (
                    <>
                        <div className="field">
                            <input className="input" autoComplete="username" placeholder={t("username")} value={user} onChange={(e) => setUser(e.target.value)} autoFocus autoCapitalize="off" />
                        </div>
                        <div className="field">
                            <input className="input" type="password" autoComplete="current-password" placeholder={t("password")} value={password} onChange={(e) => setPassword(e.target.value)} />
                        </div>
                    </>
                ) : (
                    <div className="field">
                        <input className="input mono" autoComplete="one-time-code" inputMode="numeric" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
                        <div className="hint">{t("recoveryCodeHint")}</div>
                    </div>
                )}
                {error && <div className="notice" style={{ background: "var(--danger-soft)" }}>{error}</div>}
                <button className="btn primary block" disabled={busy || (!challenge && (!user || !password)) || (!!challenge && !code)}>
                    {busy ? <span className="spinner small" /> : t("login")}
                </button>
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
                <h1>{t("setUp2fa")}</h1>
                <p>{t("twoFactorForced", { name: username })}</p>
                <button className="btn primary block" onClick={() => setOpen(true)}>
                    {t("setUp")}
                </button>
                <button
                    className="btn ghost block mt"
                    onClick={async () => {
                        await tc.logout().catch(() => undefined);
                        onDone();
                    }}
                >
                    {t("logout")}
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
function ForcedPasswordChange({ username, minLength, onDone }: { username: string; minLength: number; onDone: () => void }) {
    const [open, setOpen] = useState(true);
    return (
        <div className="login-wrap">
            <div className="login-card">
                <img src={logo} className="logo" alt="" />
                <h1>{t("newPasswordRequiredTitle")}</h1>
                <p>{t("newPasswordRequired", { name: username })}</p>
                <button className="btn primary block" onClick={() => setOpen(true)}>
                    {t("changePassword")}
                </button>
                <button
                    className="btn ghost block mt"
                    onClick={async () => {
                        await tc.logout().catch(() => undefined);
                        onDone();
                    }}
                >
                    {t("logout")}
                </button>
            </div>
            <PasswordSheet
                open={open}
                own
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
        return () => setReauthHandler(null);
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
            title={t("confirmIdentity")}
            footer={
                <>
                    <button className="btn" onClick={() => finish(false)}>
                        {t("cancel")}
                    </button>
                    <button className="btn primary" onClick={confirm} disabled={!password}>
                        {t("confirm")}
                    </button>
                </>
            }
        >
            <p className="muted" style={{ marginTop: 0 }}>{t("confirmIdentityText")}</p>
            <div className="field">
                <input className="input" type="password" placeholder={t("password")} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </div>
            <div className="field">
                <input className="input mono" placeholder={t("twoFactorOptional")} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
            </div>
            {error && <div className="small" style={{ color: "var(--danger)" }}>{error}</div>}
        </Sheet>
    );
}
