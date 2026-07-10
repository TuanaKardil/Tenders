import { eq } from "drizzle-orm";
import { db, subscriptions } from "@repo/db";
import { entitlementsFor, type Entitlements, type Plan } from "@repo/config/entitlements";

/** Resolves the effective plan for a user (free unless an active/trialing sub exists). */
export async function planFor(userId: string): Promise<Plan> {
  const [sub] = await db
    .select({ plan: subscriptions.plan, status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  if (!sub) return "free";
  if (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due") {
    return sub.plan;
  }
  return "free";
}

export async function entitlementsForUser(userId: string): Promise<Entitlements> {
  return entitlementsFor(await planFor(userId));
}
