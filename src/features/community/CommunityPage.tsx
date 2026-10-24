import { useQuery } from "@tanstack/react-query";
import { Award, BookOpen, ExternalLink, GitBranch, Heart, History, Languages, LifeBuoy, MessageCircle, Sparkles, Users } from "lucide-react";
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
    contributorsServer: "https://github.com/toniebox-reverse-engineering/teddycloud/graphs/contributors",
    contributorsWeb: "https://github.com/toniebox-reverse-engineering/teddycloud_web/graphs/contributors",
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
        <Page title={t("communityTitle")} subtitle={t("communityIntro")} back="/system" narrow>
            <Section title={t("getInvolved")}>
                <Row icon={<MessageCircle size={17} />} title="Telegram" sub={t("communityTelegram")} onClick={open(LINKS.telegram)} right={<ExternalLink size={16} />} chevron={false} />
                <Row icon={<Users size={17} />} title="Forum" sub={t("communityForum")} onClick={open(LINKS.forum)} right={<ExternalLink size={16} />} chevron={false} />
                <Row icon={<BookOpen size={17} />} title="Wiki" sub={t("communityWiki")} onClick={open(LINKS.wiki)} right={<ExternalLink size={16} />} chevron={false} />
                <Row icon={<GitBranch size={17} />} title="GitHub" sub={t("communityGithub")} onClick={open(LINKS.github)} right={<ExternalLink size={16} />} chevron={false} />
            </Section>

            <Section title={t("aboutWeb2")}>
                <Row icon={<Sparkles size={17} />} title={t("features")} sub={t("featuresHint")} to="/community/features" />
                <Row icon={<History size={17} />} title={t("changes")} sub={t("changesHint")} to="/community/changes" />
                <Row icon={<Languages size={17} />} title={t("translations")} sub={t("translationsHint")} to="/community/translations" />
                <Row icon={<Award size={17} />} title={t("credits")} sub={t("creditsHint")} to="/community/credits" />
            </Section>

            <Section title={t("faqTitle")}>
                {FAQ.map((n) => (
                    <Fold key={n} title={t(`faqQ${n}`)} icon={<LifeBuoy size={17} />}>
                        <p>{t(`faqA${n}`)}</p>
                    </Fold>
                ))}
            </Section>

            <Section>
                <Fold title={t("supportTitle")} icon={<LifeBuoy size={17} />}>
                    <p>{t("supportIntro")}</p>
                    <ol>
                        {SUPPORT.map((n) => (
                            <li key={n}>{t(`support${n}`)}</li>
                        ))}
                    </ol>
                </Fold>
            </Section>

            <Section title={t("contributeToniesJson")} footer={t("contributeToniesJsonHint")}>
                <Row icon={<GitBranch size={17} />} title="tonies-json" onClick={open(LINKS.toniesJson)} right={<ExternalLink size={16} />} chevron={false} />
                <Fold title={t("toniesWithoutAudioId")} icon={<BookOpen size={17} />}>
                    <MissingTonies />
                </Fold>
            </Section>

            <Section title={t("contributors")} footer={t("contributorsHint")}>
                <Row icon={<Users size={17} />} title="teddycloud" sub={t("contributorsServer")} onClick={open(LINKS.contributorsServer)} right={<ExternalLink size={16} />} chevron={false} />
                <Row icon={<Users size={17} />} title="teddycloud_web" sub={t("contributorsWeb")} onClick={open(LINKS.contributorsWeb)} right={<ExternalLink size={16} />} chevron={false} />
                <Row icon={<Heart size={17} />} title={t("sponsor")} sub={t("sponsorHint")} onClick={open(LINKS.sponsor)} right={<ExternalLink size={16} />} chevron={false} />
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
                all.filter((x) => x.audio_id?.length === 0 && !["creative-tonie", "system"].includes(x.category ?? "") && !x.model.includes("20000")),
            ),
    });
    if (missing.isLoading) return <Loading />;
    return (
        <div className="list">
            {(missing.data ?? []).slice(0, 300).map((x) => (
                <Row key={x.model} leading={<TonieImage src={x.pic} size={36} />} title={x.series} sub={[x.episodes, x.model, x.language].filter(Boolean).join(" · ")} chevron={false} />
            ))}
        </div>
    );
}
