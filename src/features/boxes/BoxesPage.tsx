import { BatteryCharging, BatteryLow, BatteryMedium, Gamepad2, Lock, Nfc, Power, Radio, RotateCcw, Settings2, Tag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { tc } from "../../api/tc";
import type { Box, CfwBox } from "../../api/types";
import { CFW_CAP } from "../../api/types";
import { ago, contentTitle, figureSubtitle, figureTitle, linkedContent } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useAllTags, useBoxes, useBoxImage, useBoxState, useCfwBox } from "../../lib/queries";
import { Fold } from "../../ui/Fold";
import { Empty, ErrorBox, Page, Section } from "../../ui/kit";
import { FigurePic } from "../../ui/FigurePic";
import { TonieImage } from "../../ui/TonieImage";

export function BoxesPage() {
    const boxes = useBoxes();
    const cfwEnabled = useQuery({ queryKey: ["cfwEnabled"], queryFn: tc.cfwEnabled });
    return (
        <Page title={t("boxes")}>
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

/** how a box with the custom firmware is used beyond the original, the upside-down slap open on top */
function CfwControls() {
    const p = (text: string) => <p style={{ margin: 0 }}>{text}</p>;
    return (
        <div className="mt">
            <Section title={t("cfwControls")} footer={t("cfwControlsIntro")}>
                <Fold title={t("cfwControlsRestart")} icon={<RotateCcw size={17} />} open>
                    {p(t("cfwControlsRestartText"))}
                </Fold>
                <Fold title={t("cfwControlsBothEars")} icon={<Power size={17} />}>
                    {p(t("cfwControlsBothEarsText"))}
                </Fold>
                <Fold title={t("cfwControlsAnyTag")} icon={<Nfc size={17} />}>
                    {p(t("cfwControlsAnyTagText"))}
                </Fold>
                <Fold title={t("cfwControlsEvent")} icon={<Tag size={17} />}>
                    {p(t("cfwControlsEventText"))}
                </Fold>
                <Fold title={t("cfwControlsLocks")} icon={<Lock size={17} />}>
                    {p(t("cfwControlsLocksText"))}
                </Fold>
            </Section>
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

export const batteryInfo = (cfw?: CfwBox) => {
    if (!cfw?.showBattery || !cfw.battery || !(cfw.capabilities & CFW_CAP.battery)) return null;
    const b = cfw.battery;
    if (b.implausible) return null;
    const icon = b.station ? (
        <BatteryCharging size={15} />
    ) : b.low || b.critical ? (
        <BatteryLow size={15} />
    ) : (
        <BatteryMedium size={15} />
    );
    const cls = b.critical ? "danger" : b.low ? "warn" : b.station ? "ok" : "";
    return { icon, cls, text: `${(b.mv / 1000).toFixed(2)} V`, station: b.station };
};

export const remoteAvailable = (cfw?: CfwBox) =>
    Boolean(cfw?.isCfw && cfw.settings?.enabled && cfw.settings.remoteControl && cfw.capabilities & CFW_CAP.remote);

function BoxCard({ box }: { box: Box }) {
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
                                <span className={`badge ${battery.cls}`}>
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
                {remoteAvailable(cfw) && online && (
                    <button className="btn small soft" onClick={() => navigate(`/box/${box.ID}?focus=remote`)}>
                        <Gamepad2 size={16} />
                        {t("remote")}
                    </button>
                )}
            </div>
        </div>
    );
}
