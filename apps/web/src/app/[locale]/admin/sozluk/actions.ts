"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, noticeTypeMappings } from "@repo/db";
import { NOTICE_TYPES } from "@repo/config/constants";
import { getCurrentUser } from "@/server/auth";

/**
 * Approve or correct a pending notice-type mapping. "approve" keeps the AI's
 * enum; "correct" takes the admin-chosen one. Both flip the row to
 * active/origin=human — the next pipeline run resolves with it.
 */
export async function reviewMapping(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("forbidden");

  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  const chosen = String(formData.get("enum") ?? "");
  if (!id) throw new Error("missing id");

  const [row] = await db
    .select()
    .from(noticeTypeMappings)
    .where(eq(noticeTypeMappings.id, id))
    .limit(1);
  if (!row) throw new Error("mapping not found");

  const mappedEnum =
    action === "correct" && (NOTICE_TYPES as readonly string[]).includes(chosen)
      ? (chosen as (typeof NOTICE_TYPES)[number])
      : row.mappedEnum;

  await db
    .update(noticeTypeMappings)
    .set({ mappedEnum, status: "active", origin: "human", reviewedAt: new Date() })
    .where(eq(noticeTypeMappings.id, id));

  revalidatePath("/admin/sozluk");
}
