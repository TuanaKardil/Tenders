import { Worker } from "bullmq";
import { and, eq, lte, gt, inArray, sql } from "drizzle-orm";
import { db, tenders } from "@repo/db";
import { QUEUES } from "@repo/config";
import { CLOSING_SOON_DAYS } from "@repo/config/constants";
import { connection } from "../connection";
import { enqueueIndexSync } from "../queues";

/**
 * Hourly lifecycle transitions:
 *   open -> closing_soon  (closing within CLOSING_SOON_DAYS)
 *   open|closing_soon -> closed  (closing date passed)
 * Changed tenders are re-synced to Meilisearch.
 */
export async function processStatusRefresh() {
  const now = new Date();
  const soonCutoff = new Date(now.getTime() + CLOSING_SOON_DAYS * 86_400_000);

  const toClosed = await db
    .update(tenders)
    .set({ status: "closed", updatedAt: now })
    .where(
      and(
        inArray(tenders.status, ["open", "closing_soon"]),
        sql`${tenders.closingAt} IS NOT NULL`,
        lte(tenders.closingAt, now)
      )
    )
    .returning({ id: tenders.id });

  const toClosingSoon = await db
    .update(tenders)
    .set({ status: "closing_soon", updatedAt: now })
    .where(
      and(
        eq(tenders.status, "open"),
        gt(tenders.closingAt, now),
        lte(tenders.closingAt, soonCutoff)
      )
    )
    .returning({ id: tenders.id });

  const changed = [...toClosed, ...toClosingSoon].map((r) => r.id);
  if (changed.length > 0) {
    await enqueueIndexSync({ tenderIds: changed });
  }

  return { closed: toClosed.length, closingSoon: toClosingSoon.length };
}

export function startStatusRefreshWorker() {
  return new Worker(QUEUES.statusRefresh, processStatusRefresh, {
    connection,
    concurrency: 1,
  });
}
