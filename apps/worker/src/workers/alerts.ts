import { Worker, type Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { db, savedSearches, alertDeliveries, users } from "@repo/db";
import {
  QUEUES,
  TENDERS_INDEX,
  buildMeiliFilter,
  type AlertBatchJob,
  type TenderDoc,
} from "@repo/config";
import { connection } from "../connection";
import { getMeili } from "../meili";
import { enqueueEmailDispatch } from "../queues";
import {
  queryToFilters,
  searchUrlFor,
  ensureSearchEmbedding,
  matchSavedSearch,
} from "../lib/alerts";

function emailTender(h: TenderDoc, locale: string) {
  return {
    slug: h.slug,
    title: locale === "tr" && h.title_tr ? h.title_tr : h.title_en,
    country: h.country,
    buyerName: h.buyer_name,
    closingAt: h.closing_at ? new Date(h.closing_at * 1000).toISOString().slice(0, 10) : null,
    valueUsd: h.value_usd_est ? `$${Math.round(h.value_usd_est).toLocaleString("en-US")}` : null,
  };
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://tenderlist.app";

/**
 * Runs all enabled saved searches of one frequency against Meilisearch and
 * enqueues digest emails for those with new results since last_run_at.
 */
export async function processAlertBatch(job: Job<AlertBatchJob> | { data: AlertBatchJob }) {
  const { frequency } = job.data;
  const index = getMeili().index<TenderDoc>(TENDERS_INDEX);

  const searches = await db
    .select({ search: savedSearches, user: users })
    .from(savedSearches)
    .innerJoin(users, eq(savedSearches.userId, users.id))
    .where(
      and(
        eq(savedSearches.alertEnabled, true),
        eq(savedSearches.frequency, frequency)
      )
    );

  let sent = 0;
  let empty = 0;

  for (const { search, user } of searches) {
    const runStartedAt = new Date();

    // Two-path matching (keyword ∪ semantic) — same engine as run-alerts.ts.
    const embedding = await ensureSearchEmbedding(search);
    const { hits, matchTypes, totalKeyword } = await matchSavedSearch(
      search.query,
      search.lastRunAt,
      embedding
    );
    const mainHits = hits.filter((h) => matchTypes[h.id] !== "semantic");
    const related = hits.filter((h) => matchTypes[h.id] === "semantic");
    const total = totalKeyword + related.length;

    if (hits.length === 0) {
      empty += 1;
      await db.insert(alertDeliveries).values({
        savedSearchId: search.id,
        userId: user.id,
        tenderIds: [],
        status: "skipped_empty",
      });
    } else {
      await enqueueEmailDispatch({
        template: "alert-digest",
        to: user.email,
        locale: user.locale,
        savedSearchId: search.id,
        userId: user.id,
        tenderIds: hits.map((h) => h.id),
        props: {
          searchName: search.name,
          searchUrl: searchUrlFor(search.query, APP_URL),
          totalCount: total,
          tenders: mainHits.map((h) => emailTender(h, user.locale)),
          relatedTenders: related.map((h) => emailTender(h, user.locale)),
        },
      });
      sent += 1;
    }

    await db
      .update(savedSearches)
      .set({
        lastRunAt: runStartedAt,
        lastResultCount: hits.length,
        updatedAt: runStartedAt,
      })
      .where(eq(savedSearches.id, search.id));
  }

  return { frequency, searches: searches.length, sent, empty };
}

export function startAlertWorkers() {
  const opts = { connection, concurrency: 1 };
  return [
    new Worker<AlertBatchJob>(QUEUES.alertMatchInstant, processAlertBatch, opts),
    new Worker<AlertBatchJob>(QUEUES.alertDaily, processAlertBatch, opts),
    new Worker<AlertBatchJob>(QUEUES.alertWeekly, processAlertBatch, opts),
  ];
}
