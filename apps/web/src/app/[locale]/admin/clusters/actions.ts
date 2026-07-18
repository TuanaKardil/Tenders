"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, tenders, dedupeClusters } from "@repo/db";
import { getCurrentUser } from "@/server/auth";

/**
 * Detach a tender from its dedupe cluster (wrong-merge fix). Reversible-safe:
 * only dedupe_cluster_id changes; if the cluster is left with ≤1 member the
 * cluster row is removed and the survivor freed. The detached tender becomes
 * independent again (it will reappear in search on the next reindex).
 */
export async function detachFromCluster(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("forbidden");

  const tenderId = String(formData.get("tenderId") ?? "");
  if (!tenderId) throw new Error("missing tenderId");

  const [t] = await db
    .select({ id: tenders.id, clusterId: tenders.dedupeClusterId })
    .from(tenders)
    .where(eq(tenders.id, tenderId))
    .limit(1);
  if (!t?.clusterId) return; // already detached

  await db.update(tenders).set({ dedupeClusterId: null }).where(eq(tenders.id, tenderId));

  const [rest] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tenders)
    .where(eq(tenders.dedupeClusterId, t.clusterId));
  const remaining = rest?.n ?? 0;

  if (remaining <= 1) {
    // Free the last member and drop the now-meaningless cluster.
    await db
      .update(tenders)
      .set({ dedupeClusterId: null })
      .where(eq(tenders.dedupeClusterId, t.clusterId));
    await db.delete(dedupeClusters).where(eq(dedupeClusters.id, t.clusterId));
  } else {
    await db
      .update(dedupeClusters)
      .set({ memberCount: remaining })
      .where(eq(dedupeClusters.id, t.clusterId));
  }

  revalidatePath("/admin/clusters");
}
