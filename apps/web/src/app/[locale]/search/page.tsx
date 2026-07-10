import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { parseSearchParams } from "@repo/config/search";
import { searchTenders } from "@/lib/meilisearch";
import { getCurrentUser } from "@/server/auth";
import { entitlementsForUser } from "@/server/plan";
import { consumeQuota } from "@/server/quota";
import { SearchBar } from "@/components/search/search-bar";
import { FacetSidebar } from "@/components/search/facet-sidebar";
import { FilterChips } from "@/components/search/filter-chips";
import { SaveSearchButton } from "@/components/search/save-search-button";
import { TenderCard } from "@/components/tenders/tender-card";
import { UpgradePrompt } from "@/components/plan/upgrade-prompt";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Search tenders",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

interface SearchPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchPage({ params, searchParams }: SearchPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("search");
  const tu = await getTranslations("upgrade");
  const loc = locale === "tr" ? "tr" : "en";

  const filters = parseSearchParams(sp);
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);

  // Plan gating: free users get a daily search cap and a limited archive window.
  const user = await getCurrentUser();
  let overSearchQuota = false;
  if (user) {
    const ent = await entitlementsForUser(user.id);
    if (ent.archiveDays !== null) filters.publishedWithinDays = ent.archiveDays;
    const quota = await consumeQuota(user.id, "search", ent);
    overSearchQuota = !quota.allowed;
  }

  let result: Awaited<ReturnType<typeof searchTenders>> | null = null;
  let searchError = false;
  if (!overSearchQuota) {
    try {
      result = await searchTenders(filters, page);
    } catch {
      searchError = true;
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <Suspense>
          <SearchBar placeholder={t("placeholder")} buttonLabel={t("button")} />
        </Suspense>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        <Suspense>
          <FacetSidebar
            locale={loc}
            groups={[
              { param: "status", title: t("facets.status"), kind: "status", values: result?.facets.status ?? {} },
              { param: "country", title: t("facets.country"), kind: "country", values: result?.facets.country ?? {} },
              { param: "sector", title: t("facets.sector"), kind: "sector", values: result?.facets.sector_primary ?? {} },
              { param: "source", title: t("facets.source"), kind: "source", values: result?.facets.source_slug ?? {} },
            ]}
          />
        </Suspense>

        <div className="min-w-0 flex-1">
          {overSearchQuota ? (
            <UpgradePrompt
              title={tu("searchLimitTitle")}
              description={tu("searchLimitHint")}
              ctaLabel={tu("cta")}
            />
          ) : (
          <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-500">
              {searchError
                ? t("unavailable")
                : t("resultCount", { count: result?.totalHits ?? 0 })}
            </p>
            <div className="flex items-center gap-3">
              <Suspense>
                <FilterChips locale={loc} clearLabel={t("clearAll")} />
              </Suspense>
              <Suspense>
                <SaveSearchButton
                  labels={{
                    button: t("saveSearch.button"),
                    title: t("saveSearch.title"),
                    namePlaceholder: t("saveSearch.namePlaceholder"),
                    save: t("saveSearch.save"),
                    saved: t("saveSearch.saved"),
                    goToAlerts: t("saveSearch.goToAlerts"),
                  }}
                />
              </Suspense>
            </div>
          </div>

          {searchError && (
            <div className="rounded-xl border border-dashed border-neutral-300 p-12 text-center text-sm text-neutral-500">
              {t("unavailableHint")}
            </div>
          )}

          {result && result.hits.length === 0 && (
            <div className="rounded-xl border border-dashed border-neutral-300 p-12 text-center">
              <p className="text-sm font-medium text-neutral-700">{t("empty.title")}</p>
              <p className="mt-1 text-sm text-neutral-500">{t("empty.hint")}</p>
            </div>
          )}

          <div className="space-y-3">
            {result?.hits.map((hit) => (
              <TenderCard key={hit.id} tender={hit} locale={loc} />
            ))}
          </div>

          {result && result.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              {page > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href={buildPageHref(sp, page - 1)} />}
                >
                  {t("prev")}
                </Button>
              )}
              <span className="px-3 text-sm text-neutral-500">
                {t("pageOf", { page: result.page, total: result.totalPages })}
              </span>
              {page < result.totalPages && (
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href={buildPageHref(sp, page + 1)} />}
                >
                  {t("next")}
                </Button>
              )}
            </div>
          )}
          </>
          )}
        </div>
      </div>
    </main>
  );
}

function buildPageHref(
  sp: Record<string, string | string[] | undefined>,
  page: number
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string" && value) next.set(key, value);
  }
  next.set("page", String(page));
  return `/search?${next.toString()}`;
}
