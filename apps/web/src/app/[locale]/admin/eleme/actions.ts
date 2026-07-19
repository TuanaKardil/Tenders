"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Meilisearch } from "meilisearch";
import { db, tenders, sources } from "@repo/db";
import { tenderToDoc } from "@repo/db/tender-doc";
import { TENDERS_INDEX } from "@repo/config/search";
import { getCurrentUser } from "@/server/auth";

/**
 * Founder approval for "unknown"-typed tenders waiting in the queue
 * (unpublish_reason "pending-approval: ..."). Approving sets notice_type to
 * "tender" (provenance: manual), publishes the row and upserts it into
 * Meilisearch immediately.
 */
export async function approveAsTender(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("forbidden");

  const tenderId = String(formData.get("tenderId") ?? "");
  if (!tenderId) throw new Error("missing tenderId");

  const [row] = await db
    .select({ t: tenders, source: sources })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .where(eq(tenders.id, tenderId))
    .limit(1);
  if (!row) throw new Error("tender not found");
  // Only queue rows are approvable — classification drops need reclassification, not this button.
  if (!row.t.unpublishReason?.startsWith("pending-approval")) {
    throw new Error("not in the approval queue");
  }

  const update = {
    noticeType: "tender" as const,
    fieldProvenance: { ...row.t.fieldProvenance, notice_type: "manual" },
    unpublishReason: null,
    isPublished: true,
    updatedAt: new Date(),
  };
  await db.update(tenders).set(update).where(eq(tenders.id, tenderId));

  // Push into search immediately (admin key required for writes).
  const host = process.env.MEILISEARCH_HOST;
  const key = process.env.MEILISEARCH_ADMIN_KEY;
  if (host && key) {
    const meili = new Meilisearch({ host, apiKey: key });
    await meili
      .index(TENDERS_INDEX)
      .addDocuments([tenderToDoc({ ...row.t, ...update }, row.source)], { primaryKey: "id" });
  }

  revalidatePath("/admin/eleme");
}
