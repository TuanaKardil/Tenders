import { and, eq, inArray } from "drizzle-orm";
import { db, savedSearches, alertDeliveries, users } from "@repo/db";
import { TENDERS_INDEX, buildMeiliFilter, type TenderDoc } from "@repo/config";
import { getMeili } from "../meili";
import { queryToFilters, searchUrlFor } from "../lib/alerts";
import { processEmailDispatch } from "../workers/email-dispatch";

/**
 * Redis-less alert runner (PIPELINE.md stages 10–11) for the GitHub Actions
 * daily pipeline. Same matching logic as the BullMQ alert worker, but emails
 * are dispatched inline instead of being queued.
 *
 * - Runs "instant" + "daily" saved searches every day; "weekly" on Mondays
 *   (UTC) — with a daily cron those are the natural cadences.
 * - New-only guarantee: matching filters on published_at > last_run_at, so a
 *   search never re-alerts tenders it already delivered.
 * - No RESEND_API_KEY → the dispatcher logs "(dev, not sent)" and continues;
 *   a single failed email skips that search, never the whole run.
 */
async function main() {
  const frequencies: ("instant" | "daily" | "weekly")[] = ["instant", "daily"];
  if (new Date().getUTCDay() === 1) frequencies.push("weekly");
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://tenderlist.app";
  const index = getMeili().index<TenderDoc>(TENDERS_INDEX);

  let sent = 0;
  let empty = 0;
  let failed = 0;

  const searches = await db
    .select({ search: savedSearches, user: users })
    .from(savedSearches)
    .innerJoin(users, eq(savedSearches.userId, users.id))
    .where(
      and(eq(savedSearches.alertEnabled, true), inArray(savedSearches.frequency, frequencies))
    );

  console.log(`Alert run: ${searches.length} enabled searches (${frequencies.join(", ")})`);

  for (const { search, user } of searches) {
    const runStartedAt = new Date();
    try {
      const filters = queryToFilters(search.query, search.lastRunAt);
      const result = await index.search(filters.q ?? "", {
        filter: buildMeiliFilter(filters),
        limit: 20,
        sort: ["published_at:desc"],
      });
      const hits = result.hits;

      if (hits.length === 0) {
        empty++;
        await db.insert(alertDeliveries).values({
          savedSearchId: search.id,
          userId: user.id,
          tenderIds: [],
          status: "skipped_empty",
        });
      } else {
        await processEmailDispatch({
          data: {
            template: "alert-digest",
            to: user.email,
            locale: user.locale,
            savedSearchId: search.id,
            userId: user.id,
            tenderIds: hits.map((h) => h.id),
            props: {
              searchName: search.name,
              searchUrl: searchUrlFor(search.query, APP_URL),
              totalCount: result.estimatedTotalHits ?? hits.length,
              tenders: hits.map((h) => ({
                slug: h.slug,
                title: user.locale === "tr" && h.title_tr ? h.title_tr : h.title_en,
                country: h.country,
                buyerName: h.buyer_name,
                closingAt: h.closing_at
                  ? new Date(h.closing_at * 1000).toISOString().slice(0, 10)
                  : null,
                valueUsd: h.value_usd_est
                  ? `$${Math.round(h.value_usd_est).toLocaleString("en-US")}`
                  : null,
              })),
            },
          },
        });
        sent++;
        console.log(`  ✓ "${search.name}" → ${hits.length} matches → ${user.email}`);
      }

      await db
        .update(savedSearches)
        .set({ lastRunAt: runStartedAt, lastResultCount: hits.length, updatedAt: runStartedAt })
        .where(eq(savedSearches.id, search.id));
    } catch (err) {
      failed++;
      console.error(`  ✗ "${search.name}" failed: ${(err as Error).message.slice(0, 150)}`);
    }
  }

  console.log(`Done: ${sent} sent, ${empty} empty, ${failed} failed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
