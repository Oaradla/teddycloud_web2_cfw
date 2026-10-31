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
    [
        "community.featContent",
        [
            "community.featContent1",
            "community.featContent2",
            "community.featContent3",
            "community.featContent4",
            "community.featContent5",
            "community.featContent6",
        ],
    ],
    [
        "community.featTonies",
        [
            "community.featTonies1",
            "community.featTonies2",
            "community.featTonies3",
            "community.featTonies4",
            "community.featTonies5",
        ],
    ],
    [
        "community.featLibrary",
        [
            "community.featLibrary1",
            "community.featLibrary2",
            "community.featLibrary3",
            "community.featLibrary4",
        ],
    ],
    [
        "community.featBoxes",
        [
            "community.featBoxes1",
            "community.featBoxes2",
            "community.featBoxes3",
            "community.featBoxes4",
        ],
    ],
    [
        "community.featSetup",
        ["community.featSetup1", "community.featSetup2", "community.featSetup3"],
    ],
    [
        "community.featMore",
        [
            "community.featMore1",
            "community.featMore2",
            "community.featMore3",
            "community.featMore4",
        ],
    ],
] as const;

/** what teddyCloud and this web app do, with the version running */
export function FeaturesPage() {
    const id = useQuery({
        queryKey: ["versionId"],
        queryFn: () => tc.getSetting("internal.version.id"),
    });
    const sha = useQuery({
        queryKey: ["versionSha"],
        queryFn: () => tc.getSetting("internal.version.git_sha"),
    });
    const version = useQuery({ queryKey: ["version"], queryFn: tc.version });
    const build = id.data?.endsWith("X.X.X")
        ? GITHUB + "tree/" + sha.data
        : GITHUB + "releases/tag/tc_" + id.data;
    return (
        <Page
            title={t("community.features")}
            subtitle={t("community.featuresIntro")}
            back="/community"
            narrow
        >
            <Section title={t("common.version")}>
                <Row
                    title="teddyCloud"
                    sub={version.data}
                    onClick={() => window.open(build, "_blank", "noopener")}
                    right={<ExternalLink size={16} />}
                    chevron={false}
                />
                <Row title={t("common.webApp")} value={`web2 ${__APP_VERSION__}`} />
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
        <Page
            title={t("community.changes")}
            subtitle={t("community.changesIntro")}
            back="/community"
            narrow
        >
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
    ["community.creditsOpenBox", "https://www.ifixit.com/Guide/Toniebox+Opening+Procedure/124139"],
    ["community.creditsFonts", "https://openfontlicense.org/"],
    ["community.creditsFlags", "https://gitlab.com/catamphetamine/country-flag-icons"],
    ["community.creditsIcons", "https://lucide.dev/"],
    ["community.creditsLogo", "https://www.flaticon.com/free-icon/dog_2829818"],
    ["community.creditsClassic", "https://github.com/toniebox-reverse-engineering/teddycloud_web"],
] as const;

/** what web2 took from others, and the legal notes */
export function CreditsPage() {
    return (
        <Page title={t("community.credits")} back="/community" narrow>
            <Section>
                {CREDITS.map(([key, url]) => (
                    <Row
                        key={key}
                        title={t(key)}
                        sub={url}
                        onClick={() => window.open(url, "_blank", "noopener")}
                        right={<ExternalLink size={16} />}
                        chevron={false}
                    />
                ))}
            </Section>
            <Section title={t("community.legal")}>
                <p className="small muted" style={{ padding: "12px 16px", margin: 0 }}>
                    {t("community.legalText")}
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
                .filter(
                    (x) =>
                        x.type !== "system" &&
                        tagInfo(x).picture &&
                        !tagInfo(x).picture.endsWith("img_unknown.png"),
                )
                .map((x) => ({
                    ruid: x.ruid,
                    pic: tagInfo(x).picture,
                    top: 5 + Math.random() * 75,
                    left: 2 + Math.random() * 86,
                    turn: Math.random() * 30 - 15,
                })),
        [tags.data],
    );
    return (
        <Page title={t("community.meeting")} back="/" compact>
            <div className="meeting">
                <div className="meeting-text">
                    <strong>{t("community.meeting")}</strong>
                    <span>{t("community.meetingText", { n: guests.length })}</span>
                </div>
                {guests.map((g) => (
                    <img
                        key={g.ruid}
                        src={picUrl(g.pic)}
                        alt=""
                        style={{
                            top: `${g.top}%`,
                            left: `${g.left}%`,
                            transform: `rotate(${g.turn}deg)`,
                        }}
                    />
                ))}
            </div>
        </Page>
    );
}
