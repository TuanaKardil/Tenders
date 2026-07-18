import { eq } from "drizzle-orm";
import { db, tenders, sources } from "@repo/db";
import { TENDERS_INDEX } from "@repo/config/search";
import { getMeili } from "../meili";
import { classifyTender } from "../lib/ai";

/**
 * Classification gate (PIPELINE.md stage 5, classification part). Two tiers:
 *  Tier 1 — cheap rules on notice_type + title keywords (no AI):
 *           clear tender types pass; award/disposal/vacancy/cancellation drop.
 *  Tier 2 — AI (gemini-2.5-flash-lite) only for ambiguous notices.
 *
 * DRY by default: prints what would be dropped and why, writes NOTHING.
 * Run with --apply (after founder approval) to set is_published=false +
 * unpublish_reason on dropped rows and remove them from Meilisearch.
 * Rows are never deleted — fully reversible.
 */
const apply = process.argv.includes("--apply");

/** notice_type values that are clearly tender solicitations (from real data). */
const TENDER_TYPES = [
  "open tender", "open", "open domestic", "open international", "cn-standard",
  "framework agreements", "framework agreement", "restricted tendering", "restricted",
  "prequalification", "pre-qualification", "direct procurement",
  "request for quotations/proposals", "rfq", "rfp", "eoi", "tender",
  "invitation to bid", "request for proposal", "request for quotation",
  "expression of interest",
];

/** notice_type values that clearly are NOT open tenders. */
const DROP_TYPES = ["award", "cancellation", "cancelled", "disposal", "vacancy", "termination"];

/** Title keywords that clearly signal a non-tender. */
const DROP_TITLE = [
  /\bvacancy\b/i, /\brecruitment\b/i, /\binternship\b/i,
  /\baward notification\b/i, /\bnotification of award\b/i, /\bbest evaluated bidder\b/i,
];

/**
 * Title keywords that are suspicious enough to ask the AI. Note: "disposal of"
 * is NOT a hard drop — e.g. "Disposal of Hazardous Waste" is a real service
 * tender; only asset-sale disposals should go (the AI tells them apart).
 */
const SUSPECT_TITLE = [
  /\bdisposal\b/i, /\bsale of\b/i, /\bauction\b/i,
  /\baward\b/i, /\bcancel/i,
];

type Verdict =
  | { decision: "keep"; tier: 1 | 2; reason: string }
  | { decision: "drop"; tier: 1 | 2; reason: string }
  | { decision: "ai" };

function tier1(t: typeof tenders.$inferSelect): Verdict {
  const nt = (t.noticeType ?? "").trim().toLowerCase();
  const title = t.titleOriginal;

  for (const re of DROP_TITLE) {
    if (re.test(title)) return { decision: "drop", tier: 1, reason: `title matches ${re}` };
  }
  if (nt && DROP_TYPES.some((d) => nt.includes(d))) {
    return { decision: "drop", tier: 1, reason: `notice_type "${t.noticeType}" is a non-tender type` };
  }
  if (SUSPECT_TITLE.some((re) => re.test(title))) return { decision: "ai" };
  if (nt && TENDER_TYPES.includes(nt)) {
    return { decision: "keep", tier: 1, reason: `notice_type "${t.noticeType}" is a tender type` };
  }
  // Unknown/missing notice_type → let the AI decide.
  return { decision: "ai" };
}

async function main() {
  const rows = await db
    .select({ t: tenders, sourceSlug: sources.slug })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id));

  let keptRule = 0;
  let keptAi = 0;
  const drops: { t: typeof tenders.$inferSelect; sourceSlug: string; tier: 1 | 2; reason: string }[] = [];
  let aiCalls = 0;

  for (const { t, sourceSlug } of rows) {
    const v = tier1(t);
    if (v.decision === "keep") {
      keptRule++;
      continue;
    }
    if (v.decision === "drop") {
      drops.push({ t, sourceSlug, tier: v.tier, reason: v.reason });
      continue;
    }
    // Ambiguous → AI tier.
    aiCalls++;
    try {
      const out = await classifyTender({
        title: t.titleOriginal,
        buyer: t.buyerNameRaw,
        noticeType: t.noticeType,
        sector: t.sectorPrimary,
        source: sourceSlug,
        description: t.summaryEn,
      });
      if (out.is_tender) {
        keptAi++;
      } else {
        drops.push({ t, sourceSlug, tier: 2, reason: `AI: ${out.category} — ${out.reason}` });
      }
    } catch (err) {
      // AI failure → keep (never silently hide a tender on an error).
      keptAi++;
      console.error(`  AI failed for ${t.id} (kept): ${(err as Error).message}`);
    }
  }

  console.log(`\n${apply ? "" : "[DRY] "}Classification gate over ${rows.length} tenders`);
  console.log(`  kept by rules : ${keptRule}`);
  console.log(`  sent to AI    : ${aiCalls} (kept: ${keptAi}, dropped: ${drops.filter((d) => d.tier === 2).length})`);
  console.log(`  TO DROP       : ${drops.length}\n`);

  for (const d of drops) {
    console.log(`  ✗ [${d.sourceSlug}] ${d.t.titleOriginal.slice(0, 90)}`);
    console.log(`      tier ${d.tier} — ${d.reason}`);
  }

  if (!apply) {
    console.log(`\n[DRY] Nothing written. After approval, re-run with --apply.`);
    process.exit(0);
  }

  // --apply: unpublish + record reason + remove from Meili. Never delete rows.
  const now = new Date();
  for (const d of drops) {
    await db
      .update(tenders)
      .set({ isPublished: false, unpublishReason: d.reason, updatedAt: now })
      .where(eq(tenders.id, d.t.id));
  }
  if (drops.length > 0) {
    await getMeili().index(TENDERS_INDEX).deleteDocuments(drops.map((d) => d.t.id));
  }
  console.log(`\nApplied: ${drops.length} unpublished (reason recorded) + removed from Meilisearch.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
