import { useQuery } from "@tanstack/react-query";
import {
    Award,
    BookOpen,
    ExternalLink,
    GitBranch,
    Heart,
    History,
    Languages,
    LifeBuoy,
    MessageCircle,
    Sparkles,
    Users,
} from "lucide-react";
import { getJson } from "../../api/client";
import { t } from "../../lib/i18n";
import { Fold } from "../../ui/Fold";
import { TonieImage } from "../../ui/TonieImage";
import { Loading, Page, Row, Section } from "../../ui/kit";

const LINKS = {
    github: "https://github.com/toniebox-reverse-engineering",
    telegram: "https://t.me/toniebox_reverse_engineering",
    forum: "https://forum.revvox.de/",
    wiki: "https://tonies-wiki.revvox.de/docs/tools/teddycloud/",
    sponsor: "https://github.com/sponsors/toniebox-reverse-engineering",
    contributorsServer:
        "https://github.com/toniebox-reverse-engineering/teddycloud/graphs/contributors",
    contributorsWeb:
        "https://github.com/toniebox-reverse-engineering/teddycloud_web/graphs/contributors",
    toniesJson: "https://github.com/toniebox-reverse-engineering/tonies-json",
};

const open = (url: string) => () => window.open(url, "_blank", "noopener");

interface ToniesJsonEntry {
    model: string;
    series: string;
    episodes: string;
    pic: string;
    audio_id?: string[];
    category?: string;
    language: string;
}

const FAQ = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const SUPPORT = [1, 2, 3, 4, 5, 6] as const;

/** getting involved, help and the FAQ */
export function CommunityPage() {
    return (
        <Page
            title={t("common.communityTitle")}
            subtitle={t("community.communityIntro")}
            back="/system"
            narrow
        >
            <Section title={t("community.getInvolved")}>
                <Row
                    icon={<MessageCircle size={17} />}
                    title="Telegram"
                    sub={t("community.communityTelegram")}
                    onClick={open(LINKS.telegram)}
                    right={<ExternalLink size={16} />}
                    chevron={false}
                />
                <Row
                    icon={<Users size={17} />}
                    title="Forum"
                    sub={t("community.communityForum")}
                    onClick={open(LINKS.forum)}
                    right={<ExternalLink size={16} />}
                    chevron={false}
                />
                <Row
                    icon={<BookOpen size={17} />}
                    title="Wiki"
                    sub={t("community.communityWiki")}
                    onClick={open(LINKS.wiki)}
                    right={<ExternalLink size={16} />}
                    chevron={false}
                />
                <Row
                    icon={<GitBranch size={17} />}
                    title="GitHub"
                    sub={t("community.communityGithub")}
                    onClick={open(LINKS.github)}
                    right={<ExternalLink size={16} />}
                    chevron={false}
                />
            </Section>

            <Section title={t("community.aboutWeb2")}>
                <Row
                    icon={<Sparkles size={17} />}
                    title={t("community.features")}
                    sub={t("community.featuresHint")}
                    to="/community/features"
                />
                <Row
                    icon={<History size={17} />}
                    title={t("community.changes")}
                    sub={t("community.changesHint")}
                    to="/community/changes"
                />
                <Row
                    icon={<Languages size={17} />}
                    title={t("community.translations")}
                    sub={t("community.translationsHint")}
                    to="/community/translations"
                />
                <Row
                    icon={<Award size={17} />}
                    title={t("community.credits")}
                    sub={t("community.creditsHint")}
                    to="/community/credits"
                />
            </Section>

            <Section title={t("community.faqTitle")}>
                {FAQ.map((n) => (
                    <Fold key={n} title={t(`community.faqQ${n}`)} icon={<LifeBuoy size={17} />}>
                        <p>{t(`community.faqA${n}`)}</p>
                    </Fold>
                ))}
            </Section>

            <Section>
                <Fold title={t("community.supportTitle")} icon={<LifeBuoy size={17} />}>
                    <p>{t("community.supportIntro")}</p>
                    <ol>
                        {SUPPORT.map((n) => (
                            <li key={n}>{t(`community.support${n}`)}</li>
                        ))}
                    </ol>
                </Fold>
            </Section>

            <Section
                title={t("community.contributeToniesJson")}
                footer={t("community.contributeToniesJsonHint")}
            >
                <Row
                    icon={<GitBranch size={17} />}
                    title="tonies-json"
                    onClick={open(LINKS.toniesJson)}
                    right={<ExternalLink size={16} />}
                    chevron={false}
                />
                <Fold title={t("community.toniesWithoutAudioId")} icon={<BookOpen size={17} />}>
                    <MissingTonies />
                </Fold>
            </Section>

            <Section title={t("community.contributors")} footer={t("community.contributorsHint")}>
                <Row
                    icon={<Users size={17} />}
                    title="teddycloud"
                    sub={t("community.contributorsServer")}
                    onClick={open(LINKS.contributorsServer)}
                    right={<ExternalLink size={16} />}
                    chevron={false}
                />
                <Row
                    icon={<Users size={17} />}
                    title="teddycloud_web"
                    sub={t("community.contributorsWeb")}
                    onClick={open(LINKS.contributorsWeb)}
                    right={<ExternalLink size={16} />}
                    chevron={false}
                />
                <Row
                    icon={<Heart size={17} />}
                    title={t("community.sponsor")}
                    sub={t("community.sponsorHint")}
                    onClick={open(LINKS.sponsor)}
                    right={<ExternalLink size={16} />}
                    chevron={false}
                />
            </Section>
        </Page>
    );
}

/** tonies whose audio IDs tonies.json does not know yet; mounted, and so loaded, only when opened */
function MissingTonies() {
    const missing = useQuery({
        queryKey: ["toniesJsonMissing"],
        staleTime: Infinity,
        queryFn: () =>
            getJson<ToniesJsonEntry[]>("/api/toniesJson").then((all) =>
                all.filter(
                    (x) =>
                        x.audio_id?.length === 0 &&
                        !["creative-tonie", "system"].includes(x.category ?? "") &&
                        !x.model.includes("20000"),
                ),
            ),
    });
    if (missing.isLoading) return <Loading />;
    return (
        <div className="list">
            {(missing.data ?? []).slice(0, 300).map((x) => (
                <Row
                    key={x.model}
                    leading={<TonieImage src={x.pic} size={36} />}
                    title={x.series}
                    sub={[x.episodes, x.model, x.language].filter(Boolean).join(" · ")}
                    chevron={false}
                />
            ))}
        </div>
    );
}
