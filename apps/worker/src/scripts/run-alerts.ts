import { and, eq, inArray, sql } from "drizzle-orm";
import { db, savedSearches, alertDeliveries, users } from "@repo/db";
import { type TenderDoc } from "@repo/config";
import { searchUrlFor, ensureSearchEmbedding, matchSavedSearch } from "../lib/alerts";
import { processEmailDispatch } from "../workers/email-dispatch";

/**
 * Redis-less alert runner (PIPELINE.md stages 10–11) for the GitHub Actions
 * daily pipeline. Matching is TWO-PATH per saved search:
 *   keyword (Meili, as before) ∪ semantic (embedding cosine ≥ threshold),
 * with hard filters (country/date/value) applied to BOTH paths — semantic
 * similarity can never smuggle a tender past a hard filter.
 * Semantic-only matches render in the digest's "possibly relevant" section.
 *
 * - instant+daily run every day; weekly on Mondays (UTC).
 * - published_at > last_run_at keeps deliveries new-only.
 * - Saved searches embed lazily here (created/edited → re-embedded next run).
 * - --dry: print matches per search (with match types), write/send NOTHING.
 * - No RESEND_API_KEY → dispatcher logs "(dev, not sent)" and continues.
 */
const dry = process.argv.includes("--dry");

function toEmailTender(h: TenderDoc, locale: string) {
  return {
    slug: h.slug,
    title: locale === "tr" && h.title_tr ? h.title_tr : h.title_en,
    country: h.country,
    buyerName: h.buyer_name,
    closingAt: h.closing_at ? new Date(h.closing_at * 1000).toISOString().slice(0, 10) : null,
    valueUsd: h.value_usd_est ? `$${Math.round(h.value_usd_est).toLocaleString("en-US")}` : null,
  };
}

async function main() {
  const frequencies: ("instant" | "daily" | "weekly")[] = ["instant", "daily"];
  if (new Date().getUTCDay() === 1) frequencies.push("weekly");
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://tenderlist.app";

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

  console.log(`${dry ? "[DRY] " : ""}Alert run: ${searches.length} enabled searches (${frequencies.join(", ")})`);

  for (const { search, user } of searches) {
    const runStartedAt = new Date();
    try {
      const embedding = await ensureSearchEmbedding(search);
      const { hits, matchTypes, totalKeyword } = await matchSavedSearch(
        search.query,
        search.lastRunAt,
        embedding
      );

      const main = hits.filter((h) => matchTypes[h.id] !== "semantic");
      const related = hits.filter((h) => matchTypes[h.id] === "semantic");

      if (dry) {
        console.log(`\n── "${search.name}" (${user.email}) — ${hits.length} eşleşme`);
        for (const h of hits) {
          console.log(`   [${matchTypes[h.id]}] ${(h.title_en ?? "").slice(0, 70)}`);
        }
        continue; // no writes, no emails, no lastRunAt bump
      }

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
              totalCount: totalKeyword + related.length,
              tenders: main.map((h) => toEmailTender(h, user.locale)),
              relatedTenders: related.map((h) => toEmailTender(h, user.locale)),
            },
          },
        });
        // Record per-tender match origin on the delivery row the dispatcher
        // just inserted (the newest one for this search).
        await db.execute(sql`
          update alert_deliveries set match_types = ${JSON.stringify(matchTypes)}::jsonb
          where id = (select id from alert_deliveries
                      where saved_search_id = ${search.id} and user_id = ${user.id}
                      order by sent_at desc limit 1)`);
        sent++;
        console.log(
          `  ✓ "${search.name}" → ${main.length} keyword/both + ${related.length} semantic → ${user.email}`
        );
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

  console.log(`${dry ? "[DRY] nothing written." : `Done: ${sent} sent, ${empty} empty, ${failed} failed.`}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
