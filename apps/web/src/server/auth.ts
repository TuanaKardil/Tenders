import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db, users } from "@repo/db";

export async function getCurrentUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (existing) return existing;

  // Lazy provision: the Clerk webhook mirrors users in prod, but with no public
  // webhook in local dev the row is created here on first authenticated access.
  // Idempotent — also acts as a safety net if the webhook is delayed in prod.
  const cu = await currentUser();
  const primaryEmail =
    cu?.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ??
    cu?.emailAddresses[0]?.emailAddress;
  if (!primaryEmail) return null;
  const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || null;
  const [created] = await db
    .insert(users)
    .values({ clerkId, email: primaryEmail, name })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: { email: primaryEmail, updatedAt: new Date() },
    })
    .returning();
  return created ?? null;
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    throw new Error("forbidden");
  }
  return user;
}
