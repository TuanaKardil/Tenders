import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, tenders, redirectClicks, users } from "@repo/db";
import { consumeQuota } from "@/server/quota";

export const runtime = "nodejs";

/** Tracked redirect to the original notice, gated by the free-plan click quota. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenderId: string }> }
) {
  const { tenderId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(tenderId)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [tender] = await db
    .select({ id: tenders.id, sourceUrl: tenders.sourceUrl, isPublished: tenders.isPublished })
    .from(tenders)
    .where(eq(tenders.id, tenderId))
    .limit(1);
  if (!tender || !tender.isPublished) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Resolve user if signed in (clicks are also tracked anonymously).
  let userId: string | null = null;
  try {
    const { userId: clerkId } = await auth();
    if (clerkId) {
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkId, clerkId))
        .limit(1);
      userId = user?.id ?? null;
    }
  } catch {
    // auth unavailable (e.g. during build) — treat as anonymous
  }

  // Free plan caps monthly original-source clicks. Over the cap → send to pricing.
  if (userId) {
    const quota = await consumeQuota(userId, "click");
    if (!quota.allowed) {
      return NextResponse.redirect(new URL("/pricing?limit=clicks", request.url), {
        status: 302,
      });
    }
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const salt = process.env.ICS_SIGNING_SECRET ?? "tenderlist";
  const ipHash = createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);

  // Fire-and-forget logging must not block the redirect.
  try {
    await db.insert(redirectClicks).values({
      tenderId: tender.id,
      userId,
      referrer: request.headers.get("referer"),
      ipHash,
      userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    });
  } catch {
    // never fail the redirect because logging failed
  }

  return NextResponse.redirect(tender.sourceUrl, { status: 302 });
}
