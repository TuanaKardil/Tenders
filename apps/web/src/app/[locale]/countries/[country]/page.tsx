import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { COUNTRY_CODES } from "@repo/config/constants";
import { searchTenders } from "@/lib/meilisearch";
import { countryName } from "@/lib/format";
import { TenderLanding } from "@/components/landings/tender-landing";
import { alternatesFor, absoluteUrl, SEO_LIVE } from "@/lib/seo";

export const revalidate = 3600;

interface Props {
  params: Promise<{ locale: string; country: string }>;
}

function resolveCode(country: string): string | null {
  const code = country.toUpperCase();
  return (COUNTRY_CODES as readonly string[]).includes(code) ? code : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, country } = await params;
  const code = resolveCode(country);
  if (!code) return {};
  const loc = locale === "tr" ? "tr" : "en";
  const t = await getTranslations("landings");
  const name = countryName(code, loc);
  return {
    title: t("countryTitle", { name }),
    description: t("countryIntro", { name }).slice(0, 160),
    alternates: alternatesFor(`/countries/${country.toLowerCase()}`, locale),
    robots: SEO_LIVE ? undefined : { index: false, follow: true },
  };
}

export default async function CountryLandingPage({ params }: Props) {
  const { locale, country } = await params;
  const code = resolveCode(country);
  if (!code) notFound();
  setRequestLocale(locale);
  const loc = locale === "tr" ? "tr" : "en";
  const t = await getTranslations("landings");
  const name = countryName(code, loc);

  let res: Awaited<ReturnType<typeof searchTenders>> | null = null;
  try {
    res = await searchTenders({ countries: [code], status: ["open", "closing_soon"] }, 1);
  } catch {
    // search unavailable — landing still renders with empty state
  }

  const path = `/countries/${country.toLowerCase()}`;
  return (
    <TenderLanding
      heading={t("countryTitle", { name })}
      intro={t("countryIntro", { name })}
      stats={[
        { value: res?.totalHits ?? 0, label: t("statOpen") },
        { value: res ? Object.keys(res.facets.sector_primary).length : 0, label: t("statSectors") },
      ]}
      tenders={res?.hits ?? []}
      faq={[
        { question: t("faqQ1", { name }), answer: t("faqA1", { name }) },
        { question: t("faqQ2", { name }), answer: t("faqA2", { name }) },
        { question: t("faqQ3", { name }), answer: t("faqA3", { name }) },
      ]}
      breadcrumb={[
        { name: "Tenderlist", url: absoluteUrl("/") },
        { name, url: absoluteUrl(path) },
      ]}
      locale={loc}
      browseHref={`/search?country=${code}`}
      browseLabel={t("browse")}
      emptyLabel={t("empty")}
      faqTitle={t("faqTitle")}
    />
  );
}
