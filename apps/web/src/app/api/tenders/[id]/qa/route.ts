import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, tenders, documents } from "@repo/db";
import {
  answerTenderQuestion,
  MAX_QUESTION_CHARS,
  type TenderQaContext,
} from "@repo/ai/tender-qa";
import { getCurrentUser } from "@/server/auth";

export const dynamic = "force-dynamic";

/**
 * Tender Q&A endpoint (AI assistant on the detail page).
 *
 * SECURITY MODEL
 * - Signed-in users only (Clerk) — anonymous gets 401 (scrape protection).
 * - The tender context is built SERVER-SIDE from the route's tender id; the
 *   model only ever sees THIS tender's data — no cross-tender retrieval path
 *   exists in this handler at all.
 * - Unpublished tenders answer 404 (same invisibility as the detail page).
 * - Question is length-capped; document text is treated as data (the system
 *   prompt forbids following instructions inside it).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let question: string;
  try {
    const body = (await req.json()) as { question?: unknown };
    question = typeof body.question === "string" ? body.question.trim() : "";
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!question) {
    return NextResponse.json({ error: "empty_question" }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json({ error: "question_too_long", max: MAX_QUESTION_CHARS }, { status: 400 });
  }

  // Server-side tender lookup — published only (unpublished = invisible 404).
  const [t] = await db
    .select()
    .from(tenders)
    .where(and(eq(tenders.id, id), eq(tenders.isPublished, true)))
    .limit(1);
  if (!t) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const docs = await db
    .select({ title: documents.title, url: documents.url })
    .from(documents)
    .where(eq(documents.tenderId, t.id));

  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const context: TenderQaContext = {
    title: t.titleEn ?? t.titleOriginal,
    summary: t.summaryEn,
    buyer: t.buyerNameRaw,
    country: t.country,
    city: t.city,
    sector: t.sectorPrimary,
    notice_type: t.noticeType,
    procurement_method: t.procurementMethod,
    contract_type: t.contractType,
    published_at: iso(t.publishedAt),
    closing_at: iso(t.closingAt),
    question_deadline: iso(t.questionDeadline),
    estimated_value: t.estimatedValueMax,
    currency: t.currency,
    eligibility_notes: t.eligibilityNotesEn,
    eligibility_countries: t.eligibilityCountries,
    lots: t.lots ?? undefined,
    documents: docs.map((d) => ({ title: d.title ?? d.url.split("/").pop() ?? "document" })),
    source_url: t.sourceUrl,
    status: t.status,
  };

  try {
    const result = await answerTenderQuestion(context, question);
    return NextResponse.json({
      status: result.status,
      language: result.language,
      answer: result.answer,
      citations: result.citations,
    });
  } catch (err) {
    console.error(`[tender-qa] ${t.id}: ${(err as Error).message.slice(0, 200)}`);
    return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
  }
}
