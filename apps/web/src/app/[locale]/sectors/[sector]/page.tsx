import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { SECTOR_SLUGS } from "@repo/config/constants";
import { searchTenders } from "@/lib/meilisearch";
import { sectorName } from "@/lib/format";
import { TenderLanding } from "@/components/landings/tender-landing";
import { alternatesFor, absoluteUrl, SEO_LIVE } from "@/lib/seo";

export const revalidate = 3600;

interface Props {
  params: Promise<{ locale: string; sector: string }>;
}

function resolveSlug(sector: string): string | null {
  const slug = sector.toLowerCase();
  return (SECTOR_SLUGS as readonly string[]).includes(slug) ? slug : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, sector } = await params;
  const slug = resolveSlug(sector);
  if (!slug) return {};
  const loc = locale === "tr" ? "tr" : "en";
  const t = await getTranslations("landings");
  const name = sectorName(slug, loc);
  return {
    title: t("sectorTitle", { name }),
    description: t("sectorIntro", { name }).slice(0, 160),
    alternates: alternatesFor(`/sectors/${slug}`, locale),
    robots: SEO_LIVE ? undefined : { index: false, follow: true },
  };
}

export default async function SectorLandingPage({ params }: Props) {
  const { locale, sector } = await params;
  const slug = resolveSlug(sector);
  if (!slug) notFound();
  setRequestLocale(locale);
  const loc = locale === "tr" ? "tr" : "en";
  const t = await getTranslations("landings");
  const name = sectorName(slug, loc);

  let res: Awaited<ReturnType<typeof searchTenders>> | null = null;
  try {
    res = await searchTenders({ sectors: [slug], status: ["open", "closing_soon"] }, 1);
  } catch {
    // search unavailable — landing still renders with empty state
  }

  return (
    <TenderLanding
      heading={t("sectorTitle", { name })}
      intro={t("sectorIntro", { name })}
      stats={[
        { value: res?.totalHits ?? 0, label: t("statOpen") },
        { value: res ? Object.keys(res.facets.country).length : 0, label: t("statCountries") },
      ]}
      tenders={res?.hits ?? []}
      faq={[
        { question: t("faqQ1", { name }), answer: t("faqA1", { name }) },
        { question: t("faqQ2", { name }), answer: t("faqA2", { name }) },
        { question: t("faqQ3", { name }), answer: t("faqA3", { name }) },
      ]}
      breadcrumb={[
        { name: "Tenderlist", url: absoluteUrl("/") },
        { name, url: absoluteUrl(`/sectors/${slug}`) },
      ]}
      locale={loc}
      browseHref={`/search?sector=${slug}`}
      browseLabel={t("browse")}
      emptyLabel={t("empty")}
      faqTitle={t("faqTitle")}
    />
  );
}
