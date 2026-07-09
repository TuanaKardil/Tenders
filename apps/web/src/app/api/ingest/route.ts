import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, sources, rawNotices, ingestionRuns } from "@repo/db";
import { ingestBatchSchema } from "@repo/config/ingest";
import { enqueueNormalize } from "@/server/queues";

export const runtime = "nodejs";
export const maxDuration = 60;

function keyIsValid(request: NextRequest): boolean {
  const provided = request.headers.get("x-api-key") ?? "";
  const expected = process.env.INGEST_API_KEY ?? "";
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function payloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Ingestion endpoint for the external Python scraper service.
 * Accepts a batch of notices for a single source, stores them as raw_notices
 * and enqueues normalize jobs. Returns 202 with per-batch stats.
 */
export async function POST(request: NextRequest) {
  if (!keyIsValid(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = ingestBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const batch = parsed.data;

  // All notices in one batch must belong to one source.
  const slugs = new Set(batch.notices.map((n) => n.source_slug));
  if (slugs.size > 1) {
    return NextResponse.json(
      { error: "a batch must contain notices from a single source_slug" },
      { status: 422 }
    );
  }
  const sourceSlug = batch.notices[0]!.source_slug;

  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.slug, sourceSlug))
    .limit(1);
  if (!source) {
    return NextResponse.json(
      { error: `unknown source_slug "${sourceSlug}" — register the source first` },
      { status: 404 }
    );
  }
  if (!source.isActive) {
    return NextResponse.json(
      { error: `source "${sourceSlug}" is disabled` },
      { status: 409 }
    );
  }

  const [run] = await db
    .insert(ingestionRuns)
    .values({
      sourceId: source.id,
      scraperVersion: batch.run?.scraper_version,
    })
    .returning({ id: ingestionRuns.id });
  if (!run) {
    return NextResponse.json({ error: "failed to create run" }, { status: 500 });
  }

  let received = 0;
  let duplicates = 0;
  const toNormalize: { rawNoticeId: string }[] = [];

  for (const notice of batch.notices) {
    received += 1;
    const inserted = await db
      .insert(rawNotices)
      .values({
        sourceId: source.id,
        ingestionRunId: run.id,
        externalId: notice.source_notice_id,
        payload: notice,
        payloadHash: payloadHash(notice),
      })
      .onConflictDoNothing()
      .returning({ id: rawNotices.id });
    const row = inserted[0];
    if (row) {
      toNormalize.push({ rawNoticeId: row.id });
    } else {
      duplicates += 1; // identical payload already seen
    }
  }

  if (toNormalize.length > 0) {
    await enqueueNormalize(toNormalize);
  }

  const counts = {
    received,
    created: toNormalize.length,
    updated: 0,
    failed: 0,
    duplicates,
  };

  await db
    .update(ingestionRuns)
    .set({ status: "success", finishedAt: new Date(), counts })
    .where(eq(ingestionRuns.id, run.id));
  await db
    .update(sources)
    .set({ lastRunAt: new Date() })
    .where(eq(sources.id, source.id));

  return NextResponse.json({ run_id: run.id, ...counts }, { status: 202 });
}
