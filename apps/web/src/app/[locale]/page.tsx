import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { COUNTRIES } from "@repo/config/constants";
import { searchTenders } from "@/lib/meilisearch";
import { SearchBar } from "@/components/search/search-bar";
import { TenderCard } from "@/components/tenders/tender-card";
import { JsonLd } from "@/components/seo/json-ld";
import { alternatesFor, organizationLd, websiteLd } from "@/lib/seo";

export const revalidate = 900;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: alternatesFor("/", locale) };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  const common = await getTranslations("common");
  const searchT = await getTranslations("search");
  const loc = locale === "tr" ? "tr" : "en";

  let latest: Awaited<ReturnType<typeof searchTenders>> | null = null;
  try {
    latest = await searchTenders({ status: ["open", "closing_soon"] }, 1);
  } catch {
    // search unavailable — landing still renders
  }

  const stats = latest
    ? [
        { value: latest.totalHits, label: t("statsTenders") },
        { value: Object.keys(latest.facets.country).length, label: t("statsCountries") },
        { value: Object.keys(latest.facets.source_slug).length, label: t("statsSources") },
      ]
    : [
        { value: 200, label: t("statsTenders") },
        { value: COUNTRIES.length, label: t("statsCountries") },
        { value: 10, label: t("statsSources") },
      ];

  return (
    <main>
      <JsonLd data={organizationLd()} />
      <JsonLd data={websiteLd()} />
      {/* Hero */}
      <section className="border-b border-neutral-100 bg-gradient-to-b from-neutral-50 to-white">
        <div className="mx-auto max-w-4xl px-6 pb-16 pt-20 text-center">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-neutral-500">
            {common("appName")}
          </p>
          <h1 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-neutral-600">
            {t("heroSubtitle")}
          </p>

          <div className="mx-auto mt-8 max-w-xl">
            <Suspense>
              <SearchBar placeholder={t("searchPlaceholder")} buttonLabel={searchT("button")} />
            </Suspense>
          </div>

          <div className="mt-10 flex items-center justify-center gap-10">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="text-2xl font-semibold tabular-nums text-neutral-900">
                  {stat.value.toLocaleString(loc === "tr" ? "tr-TR" : "en-US")}
                </div>
                <div className="text-xs text-neutral-500">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/onboarding"
              className="rounded-lg bg-neutral-900 px-5 py-3 text-sm font-semibold text-white hover:bg-neutral-700"
            >
              {t("ctaPrimary")}
            </Link>
            <Link
              href="/search"
              className="rounded-lg border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
            >
              {t("ctaSecondary")}
            </Link>
          </div>
        </div>
      </section>

      {/* Latest tenders */}
      {latest && latest.hits.length > 0 && (
        <section className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="mb-6 text-lg font-semibold text-neutral-900">
            {t("latestTitle")}
          </h2>
          <div className="space-y-3">
            {latest.hits.slice(0, 5).map((hit) => (
              <TenderCard key={hit.id} tender={hit} locale={loc} />
            ))}
          </div>
          <div className="mt-6 text-center">
            <Link
              href="/search"
              className="text-sm font-medium text-neutral-600 underline hover:text-neutral-900"
            >
              {t("ctaSecondary")} →
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
