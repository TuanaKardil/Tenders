"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { db, watchlistItems } from "@repo/db";
import { getCurrentUser } from "@/server/auth";
import { entitlementsForUser } from "@/server/plan";
import type { ActionResult } from "./saved-searches";

export async function addToWatchlist(tenderId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in required", code: "auth" };

  const ent = await entitlementsForUser(user.id);
  if (ent.maxWatchlistItems !== null) {
    const [row] = await db
      .select({ n: count() })
      .from(watchlistItems)
      .where(eq(watchlistItems.userId, user.id));
    if ((row?.n ?? 0) >= ent.maxWatchlistItems) {
      return {
        ok: false,
        error: `Your plan allows ${ent.maxWatchlistItems} watchlist items`,
        code: "limit",
      };
    }
  }

  await db
    .insert(watchlistItems)
    .values({ userId: user.id, tenderId })
    .onConflictDoNothing();
  revalidatePath("/watchlist");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function removeFromWatchlist(tenderId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in required", code: "auth" };
  await db
    .delete(watchlistItems)
    .where(
      and(eq(watchlistItems.userId, user.id), eq(watchlistItems.tenderId, tenderId))
    );
  revalidatePath("/watchlist");
  revalidatePath("/dashboard");
  return { ok: true };
}
