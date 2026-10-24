import { CheckCheck, CheckCircle2, Info, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { dateTime } from "../../lib/format";
import { t } from "../../lib/i18n";
import { notifications, useNotifications, type Notification } from "../../lib/notifications";
import { Empty, Page, Row, SearchField, Section, Segmented } from "../../ui/kit";

type Kind = "all" | Notification["kind"];

const ICON = { ok: <CheckCircle2 size={17} />, info: <Info size={17} />, error: <XCircle size={17} /> };
const COLOR = { ok: "var(--ok)", info: undefined, error: "var(--danger)" };

/** what the app reported earlier: the messages of the toasts */
export function NotificationsPage() {
    const all = useNotifications();
    const [kind, setKind] = useState<Kind>("all");
    const [query, setQuery] = useState("");
    // what was unread is shown as such once, then counts as read
    const [unread] = useState(() => new Set(all.filter((n) => !n.read).map((n) => n.id)));
    useEffect(() => notifications.markRead(), []);
    const f = query.trim().toLowerCase();
    const list = all.filter((n) => (kind === "all" || n.kind === kind) && (!f || `${n.text} ${n.detail ?? ""}`.toLowerCase().includes(f)));

    return (
        <Page
            title={t("notifications")}
            back="/system"
            narrow
            right={
                all.length > 0 && (
                    <button className="icon-btn" onClick={() => notifications.remove(list.map((n) => n.id))} aria-label={t("deleteShown")} title={t("deleteShown")}>
                        <Trash2 size={20} />
                    </button>
                )
            }
        >
            <div className="sticky-tools">
                <div className="toolbar">
                    <SearchField value={query} onChange={setQuery} />
                </div>
                <div style={{ marginBottom: 12 }}>
                    <Segmented
                        value={kind}
                        onChange={setKind}
                        options={[
                            { value: "all", label: t("all") },
                            { value: "ok", label: t("kindOk") },
                            { value: "info", label: t("kindInfo") },
                            { value: "error", label: t("kindError") },
                        ]}
                    />
                </div>
            </div>
            {list.length === 0 ? (
                <Empty icon={<CheckCheck size={28} />} title={t("noNotifications")} />
            ) : (
                <Section>
                    {list.map((n) => (
                        <Row
                            key={n.id}
                            icon={ICON[n.kind]}
                            iconColor={COLOR[n.kind]}
                            title={unread.has(n.id) ? <strong>{n.text}</strong> : n.text}
                            sub={[n.detail, dateTime(n.time)].filter(Boolean).join(" · ")}
                            right={
                                <button className="icon-btn" aria-label={t("delete")} onClick={() => notifications.remove([n.id])}>
                                    <Trash2 size={16} />
                                </button>
                            }
                        />
                    ))}
                </Section>
            )}
        </Page>
    );
}
