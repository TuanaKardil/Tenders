import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { countryFacetCounts } from "@/lib/meilisearch";
import { CountryMap } from "@/components/map/country-map";

export const metadata: Metadata = { title: "Tender map" };
export const revalidate = 900;

export default async function MapPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("map");
  const loc = locale === "tr" ? "tr" : "en";

  let counts: Record<string, number> = {};
  try {
    counts = await countryFacetCounts();
  } catch {
    // search unavailable — render empty map
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-neutral-900">{t("title")}</h1>
      <p className="mt-1 text-sm text-neutral-500">{t("subtitle")}</p>
      <div className="mt-6">
        <CountryMap counts={counts} locale={loc} viewAllLabel={t("viewAll")} />
      </div>
    </main>
  );
}
