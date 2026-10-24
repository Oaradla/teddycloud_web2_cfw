import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { tc } from "../../api/tc";
import { picUrl, tagInfo } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useAllTags } from "../../lib/queries";
import { Page, Row, Section } from "../../ui/kit";

const GITHUB = "https://github.com/toniebox-reverse-engineering/teddycloud/";

const FEATURES = [
    ["featContent", ["featContent1", "featContent2", "featContent3", "featContent4", "featContent5", "featContent6"]],
    ["featTonies", ["featTonies1", "featTonies2", "featTonies3", "featTonies4", "featTonies5"]],
    ["featLibrary", ["featLibrary1", "featLibrary2", "featLibrary3", "featLibrary4"]],
    ["featBoxes", ["featBoxes1", "featBoxes2", "featBoxes3", "featBoxes4"]],
    ["featSetup", ["featSetup1", "featSetup2", "featSetup3"]],
    ["featMore", ["featMore1", "featMore2", "featMore3", "featMore4"]],
] as const;

/** what teddyCloud and this web app do, with the version running */
export function FeaturesPage() {
    const id = useQuery({ queryKey: ["versionId"], queryFn: () => tc.getSetting("internal.version.id") });
    const sha = useQuery({ queryKey: ["versionSha"], queryFn: () => tc.getSetting("internal.version.git_sha") });
    const version = useQuery({ queryKey: ["version"], queryFn: tc.version });
    const build = id.data?.endsWith("X.X.X") ? GITHUB + "tree/" + sha.data : GITHUB + "releases/tag/tc_" + id.data;
    return (
        <Page title={t("features")} subtitle={t("featuresIntro")} back="/community" narrow>
            <Section title={t("version")}>
                <Row title="teddyCloud" sub={version.data} onClick={() => window.open(build, "_blank", "noopener")} right={<ExternalLink size={16} />} chevron={false} />
                <Row title={t("webApp")} value={`web2 ${__APP_VERSION__}`} />
            </Section>
            {FEATURES.map(([title, items]) => (
                <Section key={title} title={t(title)}>
                    <ul className="feature-list">
                        {items.map((k) => (
                            <li key={k}>{t(k)}</li>
                        ))}
                    </ul>
                </Section>
            ))}
        </Page>
    );
}

/** the changes of web2, by day */
export function ChangesPage() {
    const days = useMemo(() => {
        const out = new Map<string, string[]>();
        for (const [date, text] of __CHANGES__) out.set(date, [...(out.get(date) ?? []), text]);
        return [...out];
    }, []);
    return (
        <Page title={t("changes")} subtitle={t("changesIntro")} back="/community" narrow>
            {days.map(([date, list]) => (
                <Section key={date} title={new Date(date).toLocaleDateString()}>
                    <ul className="feature-list">
                        {list.map((x, i) => (
                            <li key={i}>{x}</li>
                        ))}
                    </ul>
                </Section>
            ))}
        </Page>
    );
}

const CREDITS = [
    ["creditsOpenBox", "https://www.ifixit.com/Guide/Toniebox+Opening+Procedure/124139"],
    ["creditsFonts", "https://openfontlicense.org/"],
    ["creditsFlags", "https://gitlab.com/catamphetamine/country-flag-icons"],
    ["creditsIcons", "https://lucide.dev/"],
    ["creditsLogo", "https://www.flaticon.com/free-icon/dog_2829818"],
    ["creditsClassic", "https://github.com/toniebox-reverse-engineering/teddycloud_web"],
] as const;

/** what web2 took from others, and the legal notes */
export function CreditsPage() {
    return (
        <Page title={t("credits")} back="/community" narrow>
            <Section>
                {CREDITS.map(([key, url]) => (
                    <Row key={key} title={t(key)} sub={url} onClick={() => window.open(url, "_blank", "noopener")} right={<ExternalLink size={16} />} chevron={false} />
                ))}
            </Section>
            <Section title={t("legal")}>
                <p className="small muted" style={{ padding: "12px 16px", margin: 0 }}>
                    {t("legalText")}
                </p>
            </Section>
        </Page>
    );
}

/** a hidden party: the tonies of this server, all at once */
export function MeetingPage() {
    const tags = useAllTags();
    const guests = useMemo(
        () =>
            (tags.data ?? [])
                .filter((x) => x.type !== "system" && tagInfo(x).picture && !tagInfo(x).picture.endsWith("img_unknown.png"))
                .map((x) => ({ ruid: x.ruid, pic: tagInfo(x).picture, top: 5 + Math.random() * 75, left: 2 + Math.random() * 86, turn: Math.random() * 30 - 15 })),
        [tags.data],
    );
    return (
        <Page title={t("meeting")} back="/" compact>
            <div className="meeting">
                <div className="meeting-text">
                    <strong>{t("meeting")}</strong>
                    <span>{t("meetingText", { n: guests.length })}</span>
                </div>
                {guests.map((g) => (
                    <img key={g.ruid} src={picUrl(g.pic)} alt="" style={{ top: `${g.top}%`, left: `${g.left}%`, transform: `rotate(${g.turn}deg)` }} />
                ))}
            </div>
        </Page>
    );
}
