"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, savedSearches } from "@repo/db";
import type { AlertFrequency } from "@repo/config/entitlements";
import { getCurrentUser } from "@/server/auth";
import { entitlementsForUser } from "@/server/plan";

const querySchema = z.object({
  q: z.string().max(200).optional(),
  countries: z.array(z.string().length(2)).max(20).optional(),
  sectors: z.array(z.string().max(40)).max(20).optional(),
  status: z.array(z.string().max(20)).max(5).optional(),
  sources: z.array(z.string().max(60)).max(20).optional(),
  valueMin: z.number().nonnegative().optional(),
  valueMax: z.number().nonnegative().optional(),
  closingBefore: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(80),
  query: querySchema,
  alertEnabled: z.boolean().default(true),
  frequency: z.enum(["instant", "daily", "weekly"]).default("weekly"),
});

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; code?: "limit" | "plan" | "auth" | "invalid" };

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw Object.assign(new Error("auth"), { code: "auth" as const });
  return user;
}

export async function createSavedSearch(
  input: z.infer<typeof createSchema>
): Promise<ActionResult<{ id: string }>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return { ok: false, error: "Sign in required", code: "auth" };
  }

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input", code: "invalid" };
  const data = parsed.data;

  const ent = await entitlementsForUser(user.id);

  if (data.alertEnabled) {
    if (!ent.allowedFrequencies.includes(data.frequency as AlertFrequency)) {
      return {
        ok: false,
        error: `Your plan does not include ${data.frequency} alerts`,
        code: "plan",
      };
    }
    const [row] = await db
      .select({ n: count() })
      .from(savedSearches)
      .where(
        and(eq(savedSearches.userId, user.id), eq(savedSearches.alertEnabled, true))
      );
    if ((row?.n ?? 0) >= ent.maxAlerts) {
      return {
        ok: false,
        error: `Your plan allows ${ent.maxAlerts} alert${ent.maxAlerts === 1 ? "" : "s"}`,
        code: "limit",
      };
    }
  }

  const [created] = await db
    .insert(savedSearches)
    .values({
      userId: user.id,
      name: data.name,
      query: data.query,
      alertEnabled: data.alertEnabled,
      frequency: data.frequency,
      // Alerts only cover tenders published after creation.
      lastRunAt: new Date(),
    })
    .returning({ id: savedSearches.id });

  revalidatePath("/alerts");
  revalidatePath("/dashboard");
  return { ok: true, data: { id: created!.id } };
}

export async function updateSavedSearch(input: {
  id: string;
  name?: string;
  alertEnabled?: boolean;
  frequency?: "instant" | "daily" | "weekly";
}): Promise<ActionResult> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return { ok: false, error: "Sign in required", code: "auth" };
  }

  const [existing] = await db
    .select()
    .from(savedSearches)
    .where(and(eq(savedSearches.id, input.id), eq(savedSearches.userId, user.id)))
    .limit(1);
  if (!existing) return { ok: false, error: "Not found", code: "invalid" };

  const ent = await entitlementsForUser(user.id);
  const frequency = input.frequency ?? existing.frequency;
  const alertEnabled = input.alertEnabled ?? existing.alertEnabled;

  if (alertEnabled && !ent.allowedFrequencies.includes(frequency)) {
    return { ok: false, error: `Your plan does not include ${frequency} alerts`, code: "plan" };
  }

  await db
    .update(savedSearches)
    .set({
      name: input.name ?? existing.name,
      alertEnabled,
      frequency,
      updatedAt: new Date(),
    })
    .where(eq(savedSearches.id, existing.id));

  revalidatePath("/alerts");
  return { ok: true };
}

export async function deleteSavedSearch(id: string): Promise<ActionResult> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return { ok: false, error: "Sign in required", code: "auth" };
  }
  await db
    .delete(savedSearches)
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, user.id)));
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
  return { ok: true };
}
