import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, ChevronDown, ChevronRight, Gamepad2, Info, Radio, Settings2 } from "lucide-react";
import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { tc } from "../../api/tc";
import type { Box, CfwBox } from "../../api/types";
import { CFW_CAP } from "../../api/types";
import { ago, contentTitle, figureSubtitle, figureTitle, linkedContent } from "../../lib/format";
import { useAccess } from "../../lib/access";
import { t } from "../../lib/i18n";
import { keys, useAllTags, useBoxes, useBoxImage, useBoxState, useCfwBox, useSetting } from "../../lib/queries";
import { Empty, ErrorBox, Notice, Page } from "../../ui/kit";
import { NewVersionNotice } from "../more/SystemPage";
import { FigurePic } from "../../ui/FigurePic";
import { TonieImage } from "../../ui/TonieImage";

export function BoxesPage() {
    const boxes = useBoxes();
    const cfwEnabled = useQuery({ queryKey: ["cfwEnabled"], queryFn: tc.cfwEnabled });
    const access = useAccess();
    return (
        <Page title={t("boxes")}>
            {access.admin && <AdminNotices boxes={boxes.data ?? []} />}
            {boxes.isLoading && <BoxSkeleton />}
            {boxes.error && <ErrorBox error={boxes.error} retry={() => boxes.refetch()} />}
            {boxes.data && boxes.data.length === 0 && (
                <Empty
                    icon={<Radio size={30} />}
                    title={t("noBoxes")}
                    text={t("noBoxesText")}
                    action={
                        <a className="btn primary" href="#/setup">
                            {t("boxSetup")}
                        </a>
                    }
                />
            )}
            <div className="grid-boxes">
                {boxes.data?.map((box) => <BoxCard key={box.ID} box={box} />)}
            </div>
            {cfwEnabled.data === "true" && <CfwControls />}
        </Page>
    );
}

/** what an admin should know: a newer teddyCloud, new boxes still allowed, boxes without API access */
function AdminNotices({ boxes }: { boxes: Box[] }) {
    const allowNew = useSetting("core.allowNewBox");
    const apiAccess = useQueries({
        queries: boxes.map((b) => ({ queryKey: [...keys.settings(b.ID), "toniebox.api_access"], queryFn: () => tc.getSetting("toniebox.api_access", b.ID) })),
    });
    const withoutApi = boxes.filter((_, i) => apiAccess[i]?.data === "false").map((b) => b.boxName || b.ID);
    return (
        <>
            <NewVersionNotice />
            {allowNew.data === "true" && (
                <Notice>
                    <strong>{t("newBoxesAllowed")}</strong>
                    <br />
                    {t("newBoxesAllowedText")}
                    {withoutApi.length > 0 && (
                        <>
                            <br />
                            {t("boxesWithoutApi", { names: withoutApi.join(", ") })}
                        </>
                    )}
                </Notice>
            )}
        </>
    );
}

/** how a box with the custom firmware is used beyond the original: a quiet link below the boxes, closed */
function CfwControls() {
    const [open, setOpen] = useState(false);
    const items = [
        ["cfwControlsRestart", "cfwControlsRestartText"],
        ["cfwControlsBothEars", "cfwControlsBothEarsText"],
        ["cfwControlsAnyTag", "cfwControlsAnyTagText"],
        ["cfwControlsEvent", "cfwControlsEventText"],
        ["cfwControlsLocks", "cfwControlsLocksText"],
    ] as const;
    return (
        <div className="mt small muted">
            <button className="btn ghost small" style={{ color: "var(--fg-2)", paddingLeft: 0, gap: 6 }} onClick={() => setOpen(!open)} aria-expanded={open}>
                <Info size={14} />
                {t("cfwControls")}
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {open && (
                <div style={{ maxWidth: 720, lineHeight: 1.5 }}>
                    <p>{t("cfwControlsIntro")}</p>
                    {items.map(([title, text]) => (
                        <p key={title}>
                            <strong>{t(title)}</strong>
                            <br />
                            {t(text)}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}

const BoxSkeleton = () => (
    <div className="grid-boxes">
        {[0, 1].map((i) => (
            <div key={i} className="skeleton" style={{ height: 190 }} />
        ))}
    </div>
);

/** "2 h 10 min" */
export const durationText = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
};

export const batteryInfo = (cfw?: CfwBox) => {
    if (!cfw?.showBattery || !cfw.battery || !(cfw.capabilities & CFW_CAP.battery)) return null;
    const b = cfw.battery;
    if (b.implausible) return null;
    const volts = `${(b.mv / 1000).toFixed(2).replace(".", ",")} V`;
    // on the charger the box measures the charger, not the battery: no charge then
    const percent = b.station ? undefined : b.percent;
    const icon = b.station ? (
        <BatteryCharging size={15} />
    ) : b.low || b.critical || (percent !== undefined && percent < 25) ? (
        <BatteryLow size={15} />
    ) : percent !== undefined && percent >= 70 ? (
        <BatteryFull size={15} />
    ) : (
        <BatteryMedium size={15} />
    );
    const cls = b.critical ? "danger" : b.low || (percent !== undefined && percent < 15) ? "warn" : b.station ? "ok" : "";
    return {
        icon,
        cls,
        text: b.station ? t("charging") : percent !== undefined ? `${percent} %` : volts,
        volts,
        percent,
        remaining: !b.station && b.remainingMin ? durationText(b.remainingMin) : undefined,
        learned: Boolean(b.learned),
        station: b.station,
        /** when the report is older than ten minutes (the box is off or asleep) */
        age: b.time && Date.now() - b.time * 1000 > 10 * 60_000 ? ago(b.time * 1000) : undefined,
    };
};

export const remoteAvailable = (cfw?: CfwBox) =>
    Boolean(cfw?.isCfw && cfw.settings?.enabled && cfw.settings.remoteControl && cfw.capabilities & CFW_CAP.remote);

function BoxCard({ box }: { box: Box }) {
    const access = useAccess();
    const state = useBoxState(box.ID);
    const cfw = useCfwBox(box.ID);
    const img = useBoxImage(box);
    const tags = useAllTags();
    const navigate = useNavigate();
    const s = state.data;
    const online = Boolean(s?.online || cfw?.online);
    const tag = s?.lastRuid ? tags.data?.find((x) => x.ruid === s.lastRuid) : undefined;
    const battery = batteryInfo(cfw);

    return (
        <div className="card">
            <Link to={`/box/${box.ID}`} className="box-card">
                <div className="box-card-head">
                    {img ? <img src={img} alt="" /> : <div style={{ width: 52, height: 52 }} className="tonie-pic-fallback"><Radio size={24} /></div>}
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="box-card-name">{box.boxName || box.ID}</div>
                        <div className="box-card-meta">
                            <span className={`badge ${online ? "ok" : ""}`}>
                                <span className={`dot ${online ? "ok" : ""}`} />
                                {online ? t("online") : t("offline")}
                            </span>
                            {!online && s?.lastSeen ? <span>{ago(s.lastSeen)}</span> : null}
                            {battery && (
                                <span className={`badge ${battery.cls}`} title={battery.volts}>
                                    {battery.icon}
                                    {battery.text}
                                </span>
                            )}
                            {cfw?.isCfw && <span className="badge accent">CFW</span>}
                        </div>
                    </div>
                </div>
                {s?.lastRuid && (
                    <div className="now-on-box">
                        {tag ? (
                            <div style={{ width: 56, height: 56, flexShrink: 0 }}>
                                <FigurePic tag={tag} />
                            </div>
                        ) : (
                            <TonieImage size={56} />
                        )}
                        <div style={{ minWidth: 0 }}>
                            <div className="label">{online ? t("onTheBox") : t("lastTonie")}</div>
                            <div className="title">{tag ? figureTitle(tag) : s.lastRuid.toUpperCase()}</div>
                            <div className="sub">
                                {[tag ? (linkedContent(tag) ? "→ " + contentTitle(linkedContent(tag)!) : figureSubtitle(tag)) : "", s.lastRuidTime ? ago(s.lastRuidTime) : ""]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </div>
                        </div>
                    </div>
                )}
            </Link>
            <div className="box-card-actions" style={{ padding: "0 16px 16px", marginTop: 0 }}>
                <button className="btn small" onClick={() => navigate(`/box/${box.ID}?focus=settings`)}>
                    <Settings2 size={16} />
                    {t("settings")}
                </button>
                {remoteAvailable(cfw) && online && access.can("box", box.ID, "box.cfw") && (
                    <button className="btn small soft" onClick={() => navigate(`/box/${box.ID}?focus=remote`)}>
                        <Gamepad2 size={16} />
                        {t("remote")}
                    </button>
                )}
            </div>
        </div>
    );
}
