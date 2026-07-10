"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, users } from "@repo/db";
import { getCurrentUser } from "@/server/auth";
import { createSavedSearch, type ActionResult } from "./saved-searches";

const onboardingSchema = z.object({
  sectors: z.array(z.string().max(40)).min(1).max(10),
  countries: z.array(z.string().length(2)).min(1).max(20),
  keywords: z.array(z.string().min(2).max(60)).max(10),
});

/**
 * Completes onboarding: creates the user's first saved search + weekly alert
 * from their picks and stamps onboarding_completed_at.
 */
export async function completeOnboarding(
  input: z.infer<typeof onboardingSchema>
): Promise<ActionResult<{ savedSearchId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in required", code: "auth" };

  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input", code: "invalid" };
  const { sectors, countries, keywords } = parsed.data;

  const name =
    keywords.length > 0
      ? keywords.slice(0, 3).join(", ")
      : `${sectors[0]} · ${countries.slice(0, 3).join(", ")}`;

  const result = await createSavedSearch({
    name: name.slice(0, 80),
    query: {
      q: keywords.join(" ") || undefined,
      sectors,
      countries,
      status: ["open", "closing_soon"],
    },
    alertEnabled: true,
    frequency: "weekly",
  });
  if (!result.ok) return result;

  await db
    .update(users)
    .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return { ok: true, data: { savedSearchId: result.data!.id } };
}
