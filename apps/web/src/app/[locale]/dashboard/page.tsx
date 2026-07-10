import type { Metadata } from "next";
import { asc, desc, eq, and, gt, inArray } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db, savedSearches, watchlistItems, tenders, sources } from "@repo/db";
import { getCurrentUser } from "@/server/auth";
import { searchTenders } from "@/lib/meilisearch";
import { TenderCard } from "@/components/tenders/tender-card";
import { DeadlineChip } from "@/components/tenders/deadline-chip";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");
  const loc = locale === "tr" ? "tr" : "en";

  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-neutral-500">
        {t("signInRequired")}
      </main>
    );
  }
  if (!user.onboardingCompletedAt) {
    redirect(`/${locale === "en" ? "" : locale + "/"}onboarding`.replace("//", "/"));
  }

  const searches = await db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.userId, user.id))
    .orderBy(desc(savedSearches.createdAt))
    .limit(6);

  // Match feed: live results of the newest saved search.
  let feed: Awaited<ReturnType<typeof searchTenders>> | null = null;
  const primary = searches[0];
  if (primary) {
    try {
      feed = await searchTenders(
        {
          q: primary.query.q,
          countries: primary.query.countries,
          sectors: primary.query.sectors,
          status: primary.query.status ?? ["open", "closing_soon"],
        },
        1
      );
    } catch {
      // search down — dashboard still renders
    }
  }

  // Watchlist items closing soon.
  const closingSoon = await db
    .select({ tender: tenders, source: sources })
    .from(watchlistItems)
    .innerJoin(tenders, eq(watchlistItems.tenderId, tenders.id))
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .where(
      and(
        eq(watchlistItems.userId, user.id),
        inArray(tenders.status, ["open", "closing_soon"]),
        gt(tenders.closingAt, new Date())
      )
    )
    .orderBy(asc(tenders.closingAt))
    .limit(5);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-8 text-xl font-semibold text-neutral-900">
        {t("greeting", { name: user.name?.split(" ")[0] ?? "" })}
      </h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {/* Match feed */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900">
                {primary ? t("matchFeed", { name: primary.name }) : t("noSearches")}
              </h2>
              {primary && (
                <Link href="/alerts" className="text-xs text-neutral-500 underline">
                  {t("manageAlerts")}
                </Link>
              )}
            </div>
            {feed && feed.hits.length > 0 ? (
              <div className="space-y-3">
                {feed.hits.slice(0, 6).map((hit) => (
                  <TenderCard key={hit.id} tender={hit} locale={loc} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500">
                {t("emptyFeed")}
                <div className="mt-4">
                  <Button render={<Link href={primary ? "/search" : "/onboarding"} />}>
                    {primary ? t("browse") : t("setupCta")}
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-8">
          {/* Saved searches */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">{t("savedSearches")}</h2>
            {searches.length === 0 ? (
              <p className="text-sm text-neutral-500">{t("noSearches")}</p>
            ) : (
              <ul className="space-y-2">
                {searches.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2"
                  >
                    <span className="truncate text-sm text-neutral-800">{s.name}</span>
                    {s.lastResultCount > 0 && (
                      <span className="ml-2 shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        +{s.lastResultCount}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Closing soon (watchlist) */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900">{t("closingSoon")}</h2>
              <Link href="/watchlist" className="text-xs text-neutral-500 underline">
                {t("viewWatchlist")}
              </Link>
            </div>
            {closingSoon.length === 0 ? (
              <p className="text-sm text-neutral-500">{t("emptyWatchlist")}</p>
            ) : (
              <ul className="space-y-2">
                {closingSoon.map(({ tender }) => (
                  <li key={tender.id}>
                    <Link
                      href={`/tenders/${tender.slug}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 hover:bg-neutral-50"
                    >
                      <span className="truncate text-sm text-neutral-800">
                        {loc === "tr" && tender.titleTr ? tender.titleTr : tender.titleEn ?? tender.titleOriginal}
                      </span>
                      <DeadlineChip
                        closingAt={tender.closingAt}
                        status={tender.status}
                        locale={loc}
                        className="shrink-0"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
