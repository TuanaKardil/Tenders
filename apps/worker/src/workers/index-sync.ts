import { Worker, type Job } from "bullmq";
import { eq, inArray } from "drizzle-orm";
import { db, tenders, sources } from "@repo/db";
import { QUEUES, type IndexSyncJob, TENDERS_INDEX } from "@repo/config";
import { connection } from "../connection";
import { getMeili } from "../meili";
import { tenderToDoc } from "../lib/tender-doc";

const BATCH = 500;

async function syncTenderIds(tenderIds: string[]) {
  if (tenderIds.length === 0) return { upserted: 0, removed: 0 };
  const index = getMeili().index(TENDERS_INDEX);

  const rows = await db
    .select({ tender: tenders, source: sources })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .where(inArray(tenders.id, tenderIds));

  const toUpsert = rows
    .filter(({ tender }) => tender.isPublished)
    .map(({ tender, source }) => tenderToDoc(tender, source));
  // Unpublished/missing tenders get removed from the index.
  const foundPublished = new Set(toUpsert.map((d) => d.id));
  const toRemove = tenderIds.filter((id) => !foundPublished.has(id));

  if (toUpsert.length > 0) await index.addDocuments(toUpsert, { primaryKey: "id" });
  if (toRemove.length > 0) await index.deleteDocuments(toRemove);

  return { upserted: toUpsert.length, removed: toRemove.length };
}

export async function fullReindex() {
  const index = getMeili().index(TENDERS_INDEX);
  let offset = 0;
  let upserted = 0;

  for (;;) {
    const rows = await db
      .select({ tender: tenders, source: sources })
      .from(tenders)
      .innerJoin(sources, eq(tenders.sourceId, sources.id))
      .where(eq(tenders.isPublished, true))
      .limit(BATCH)
      .offset(offset);
    if (rows.length === 0) break;
    const docs = rows.map(({ tender, source }) => tenderToDoc(tender, source));
    await index.addDocuments(docs, { primaryKey: "id" });
    upserted += docs.length;
    offset += BATCH;
  }

  return { upserted, removed: 0 };
}

export async function processIndexSyncJob(job: Job<IndexSyncJob>) {
  if (job.data.fullReindex) return fullReindex();
  return syncTenderIds(job.data.tenderIds);
}

export function startIndexSyncWorker() {
  return new Worker<IndexSyncJob>(QUEUES.indexSync, processIndexSyncJob, {
    connection,
    concurrency: 2,
  });
}
