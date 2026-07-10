import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db, watchlistItems, tenders } from "@repo/db";
import { buildWatchlistIcs, verifyIcsToken } from "@/lib/ics";

export const runtime = "nodejs";

/**
 * Signed calendar feed (works in calendar apps without cookies):
 * /api/watchlist/ics?uid=<userId>&token=<hmac>
 */
export async function GET(request: NextRequest) {
  const uid = request.nextUrl.searchParams.get("uid") ?? "";
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const secret = process.env.ICS_SIGNING_SECRET;

  if (!secret || !uid || !token || !verifyIcsToken(uid, token, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({ tender: tenders })
    .from(watchlistItems)
    .innerJoin(tenders, eq(watchlistItems.tenderId, tenders.id))
    .where(and(eq(watchlistItems.userId, uid), gt(tenders.closingAt, new Date())));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tenderlist.app";
  const ics = buildWatchlistIcs(
    rows
      .filter((r) => r.tender.closingAt)
      .map((r) => ({
        id: r.tender.id,
        title: r.tender.titleEn ?? r.tender.titleOriginal,
        slug: r.tender.slug,
        closingAt: r.tender.closingAt!,
        buyerName: r.tender.buyerNameRaw,
        country: r.tender.country,
      })),
    appUrl
  );

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="tenderlist-watchlist.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
