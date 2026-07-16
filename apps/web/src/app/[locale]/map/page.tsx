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
    <main className="bg-[#050d1f]">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-semibold text-white">{t("title")}</h1>
        <p className="mt-2 text-base text-white/70">{t("subtitle")}</p>
        <div className="mt-6">
          <CountryMap counts={counts} locale={loc} viewAllLabel={t("viewAll")} />
        </div>
      </div>
    </main>
  );
}
