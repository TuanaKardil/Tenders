import { Worker, type Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { db, rawNotices, tenders, sources } from "@repo/db";
import { QUEUES, type NormalizeJob, ingestNoticeSchema } from "@repo/config";
import { createNoticeTypeResolver } from "../lib/notice-type-resolver";
import { sourceProvenance } from "../lib/merge-tender";
import { connection } from "../connection";
import { enqueueIndexSync } from "../queues";
import {
  coalesceUpdate,
  computeSourceHash,
  extractionConfidence,
  qualityScore,
  statusFromClosingAt,
  tenderSlug,
  toDate,
} from "../lib/normalize";

/**
 * raw_notice -> tender upsert keyed on (source_id, source_notice_id).
 * - unchanged source_hash: touch last_seen_at, mark notice duplicate
 * - changed: update fields
 * - new: insert; auto-publish when confidence >= 0.7, else review queue
 */
export async function processNormalizeJob(job: Job<NormalizeJob>) {
  const { rawNoticeId } = job.data;

  const [notice] = await db
    .select()
    .from(rawNotices)
    .where(eq(rawNotices.id, rawNoticeId))
    .limit(1);
  if (!notice) throw new Error(`raw_notice ${rawNoticeId} not found`);
  if (notice.status === "normalized") return { skipped: "already normalized" };

  const parsed = ingestNoticeSchema.safeParse(notice.payload);
  if (!parsed.success) {
    await db
      .update(rawNotices)
      .set({ status: "failed", error: parsed.error.message.slice(0, 2000) })
      .where(eq(rawNotices.id, rawNoticeId));
    return { failed: "invalid payload" };
  }
  const data = parsed.data;

  // Source slug selects the right notice_type dictionary.
  const [src] = await db
    .select({ slug: sources.slug })
    .from(sources)
    .where(eq(sources.id, notice.sourceId))
    .limit(1);
  const sourceSlug = src?.slug ?? "";

  const sourceHash = computeSourceHash(data);
  const confidence = extractionConfidence(data);
  const now = new Date();

  const [existing] = await db
    .select({
      id: tenders.id,
      sourceHash: tenders.sourceHash,
      closingAt: tenders.closingAt,
      extractionConfidence: tenders.extractionConfidence,
    })
    .from(tenders)
    .where(
      and(
        eq(tenders.sourceId, notice.sourceId),
        eq(tenders.sourceNoticeId, data.source_notice_id)
      )
    )
    .limit(1);

  let tenderId: string;
  let outcome: "created" | "updated" | "unchanged";

  const fieldValues = {
    sourceUrl: data.source_url,
    sourceHash,
    titleOriginal: data.title,
    languageOriginal: data.language ?? "en",
    country: (data.country ?? "ZZ").toUpperCase(),
    region: data.region ?? null,
    city: data.city ?? null,
    buyerNameRaw: data.buyer_name ?? null,
    funderName: data.funder_name ?? null,
    sectorPrimary: data.sector ?? null,
    cpvCodes: data.cpv_codes ?? [],
    noticeType: await createNoticeTypeResolver()
      .resolve(data.notice_type, sourceSlug, data.language),
    noticeTypeRaw: data.notice_type ?? null,
    procurementMethod: data.procurement_method ?? null,
    contractType: data.contract_type ?? null,
    publishedAt: toDate(data.published_at),
    closingAt: toDate(data.closing_at),
    questionDeadline: toDate(data.question_deadline),
    estimatedValueMin: data.estimated_value_min?.toString() ?? null,
    estimatedValueMax: data.estimated_value_max?.toString() ?? null,
    currency: data.currency ?? null,
    eligibilityCountries: data.eligibility_countries ?? [],
    eligibilityNotesEn: data.eligibility_notes ?? null,
    documentsCount: data.documents?.length ?? 0,
    fieldProvenance: sourceProvenance(data),
    status: statusFromClosingAt(toDate(data.closing_at), now),
    extractionConfidence: confidence,
    qualityScore: qualityScore(data),
    lastSeenAt: now,
    updatedAt: now,
  };

  if (existing) {
    tenderId = existing.id;
    if (existing.sourceHash === sourceHash) {
      await db.update(tenders).set({ lastSeenAt: now }).where(eq(tenders.id, tenderId));
      outcome = "unchanged";
    } else {
      // A degraded re-scrape must not clobber good data: nulls/empty arrays
      // are dropped, confidence only moves up, and status uses the effective
      // (incoming or existing) closing date.
      const merged = coalesceUpdate(fieldValues, [
        "sourceUrl",
        "sourceHash",
        "titleOriginal",
        "lastSeenAt",
        "updatedAt",
        "status",
      ]);
      merged.status = statusFromClosingAt(
        toDate(data.closing_at) ?? existing.closingAt,
        now
      );
      merged.extractionConfidence = Math.max(
        confidence,
        existing.extractionConfidence ?? 0
      );
      await db.update(tenders).set(merged).where(eq(tenders.id, tenderId));
      outcome = "updated";
    }
  } else {
    const [inserted] = await db
      .insert(tenders)
      .values({
        ...fieldValues,
        slug: tenderSlug(data.title),
        sourceId: notice.sourceId,
        sourceNoticeId: data.source_notice_id,
        // English-language notices with enough confidence publish immediately;
        // others wait for the extract/translate pipeline (Phase 1b) or review.
        isPublished: confidence >= 0.7,
        titleEn: (data.language ?? "en") === "en" ? data.title : null,
        summaryEn: (data.language ?? "en") === "en" ? (data.description ?? null) : null,
        firstSeenAt: now,
      })
      .returning({ id: tenders.id });
    if (!inserted) throw new Error("tender insert returned no row");
    tenderId = inserted.id;
    outcome = "created";
  }

  await db
    .update(rawNotices)
    .set({ status: outcome === "unchanged" ? "duplicate" : "normalized", tenderId })
    .where(eq(rawNotices.id, rawNoticeId));

  if (outcome !== "unchanged") {
    // Upserts published docs / removes unpublished ones from Meilisearch.
    await enqueueIndexSync({ tenderIds: [tenderId] });
  }

  // TODO(phase 1b+): chain extract/translate jobs for low-confidence and non-EN notices.
  return { outcome, tenderId };
}

export function startNormalizeWorker() {
  return new Worker<NormalizeJob>(QUEUES.normalize, processNormalizeJob, {
    connection,
    concurrency: 5,
  });
}
