import { eq, asc, isNotNull } from "drizzle-orm";
import { db, tenders, documents, sources } from "@repo/db";
import { SECTOR_SLUGS } from "@repo/config/constants";
import { TENDERS_INDEX } from "@repo/config/search";
import { getMeili } from "../meili";
import { tenderToDoc } from "../lib/tender-doc";
import { extractFields, type ExtractedFields } from "../lib/ai";

/**
 * AI structured field extraction (PIPELINE.md stage 5, second half).
 * Input = title + description + concatenated document text (capped). The prompt
 * forbids guessing, so absent fields come back null and we never overwrite good
 * existing data with a blank (coalesce).
 *
 * Publish gate (stage 8): extraction_confidence < 0.7 → is_published = false
 * (admin review queue). Classification-dropped tenders stay unpublished.
 *
 * DRY by default: runs on 3 samples, prints the fields, and extrapolates the
 * total token cost. If the estimate exceeds $5 it STOPS for approval.
 *
 * Args: <N> only first N tenders · --apply write · --all re-extract done ones ·
 *       --with-docs only tenders that have extracted document text (staged check).
 */
const apply = process.argv.includes("--apply");
const all = process.argv.includes("--all");
const withDocs = process.argv.includes("--with-docs");
const tenderLimit = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? "0") || null;
// --max-cost <usd>: hard budget for unattended runs (GitHub Actions). If the
// deterministic estimate exceeds it, the script FAILS instead of spending.
const maxCostIdx = process.argv.indexOf("--max-cost");
const maxCost = maxCostIdx > -1 ? Number(process.argv[maxCostIdx + 1]) || null : null;
// Measured upper bound per tender (document-bearing Kenya ones): ~$0.0024.
const EST_PER_TENDER = 0.003;

const DOC_CHAR_CAP = 100_000; // cap document text fed to the model (token guard)
const CONF_GATE = 0.7;
const SAMPLE_N = 3;
const COST_STOP = 5; // USD — stop and ask above this
// google/gemini-2.5-flash-lite (OpenRouter), USD per 1M tokens.
const PRICE_IN = 0.1;
const PRICE_OUT = 0.4;

const VALID_SECTORS = new Set<string>(SECTOR_SLUGS);

function costUsd(promptTok: number, completionTok: number): number {
  return (promptTok * PRICE_IN + completionTok * PRICE_OUT) / 1_000_000;
}

/** Build the update object — only fields the AI actually returned (coalesce). */
function buildUpdate(f: ExtractedFields) {
  const u: Record<string, unknown> = {};
  if (f.estimated_value_min !== null) u.estimatedValueMin = String(f.estimated_value_min);
  if (f.estimated_value_max !== null) u.estimatedValueMax = String(f.estimated_value_max);
  if (f.currency) u.currency = f.currency.slice(0, 3);
  // Only accept a real, known sector slug; ignore "unknown" and hallucinated slugs.
  if (f.sector_primary && f.sector_primary !== "unknown" && VALID_SECTORS.has(f.sector_primary)) {
    u.sectorPrimary = f.sector_primary;
  }
  const secondary = f.sectors_secondary.filter((s) => VALID_SECTORS.has(s) && s !== f.sector_primary);
  if (secondary.length) u.sectorsSecondary = secondary;
  if (f.cpv_codes.length) u.cpvCodes = f.cpv_codes;
  if (f.eligibility_countries.length) {
    u.eligibilityCountries = f.eligibility_countries.filter((c) => /^[A-Z]{2}$/.test(c));
  }
  if (f.eligibility_notes_en) u.eligibilityNotesEn = f.eligibility_notes_en;
  if (f.notice_type_ai) u.noticeTypeAi = f.notice_type_ai;
  if (f.extraction_confidence !== null) u.extractionConfidence = f.extraction_confidence;
  return u;
}

async function main() {
  const rows = await db
    .select({
      id: tenders.id,
      title: tenders.titleOriginal,
      description: tenders.summaryEn,
      noticeTypeAi: tenders.noticeTypeAi,
      unpublishReason: tenders.unpublishReason,
    })
    .from(tenders)
    .orderBy(asc(tenders.firstSeenAt));

  let pool = all ? rows : rows.filter((r) => r.noticeTypeAi === null);
  if (withDocs) {
    const withText = await db
      .selectDistinct({ id: documents.tenderId })
      .from(documents)
      .where(isNotNull(documents.extractedText));
    const ids = new Set(withText.map((d) => d.id));
    pool = pool.filter((r) => ids.has(r.id));
  }
  if (tenderLimit) pool = pool.slice(0, tenderLimit);

  console.log(
    `\n${apply ? "" : "[DRY] "}AI field extraction — ${pool.length} tenders queued` +
      `${all ? " (--all)" : " (not yet extracted)"}${tenderLimit ? `, limited to ${tenderLimit}` : ""}`
  );
  if (pool.length === 0) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  // Unattended budget guard: fail loudly rather than spend past the cap.
  if (maxCost !== null) {
    const est = pool.length * EST_PER_TENDER;
    if (est > maxCost) {
      console.error(
        `✗ Estimated cost $${est.toFixed(2)} (${pool.length} × $${EST_PER_TENDER}) exceeds --max-cost $${maxCost}. Aborting.`
      );
      process.exit(1);
    }
    console.log(`  budget: est $${est.toFixed(2)} ≤ cap $${maxCost} ✓`);
  }

  // Pull + cap the document text for a tender.
  async function docTextFor(tenderId: string): Promise<string> {
    const docs = await db
      .select({ txt: documents.extractedText })
      .from(documents)
      .where(eq(documents.tenderId, tenderId));
    const joined = docs.map((d) => d.txt ?? "").filter(Boolean).join("\n\n---\n\n");
    return joined.slice(0, DOC_CHAR_CAP);
  }

  // ---- DRY: sample a few, print fields, extrapolate cost, stop. ----
  if (!apply) {
    const sample = pool.slice(0, Math.min(SAMPLE_N, pool.length));
    let promptTok = 0;
    let completionTok = 0;

    for (const r of sample) {
      const documentText = await docTextFor(r.id);
      const { fields, usage } = await extractFields({
        title: r.title,
        description: r.description,
        documentText,
      });
      promptTok += usage.prompt_tokens;
      completionTok += usage.completion_tokens;
      console.log(`\n  ── ${r.title.slice(0, 80)}`);
      console.log(`     tokens: ${usage.prompt_tokens} in / ${usage.completion_tokens} out (doc ${documentText.length} chars)`);
      console.log(`     ${JSON.stringify(fields)}`);
    }

    const avgCost = costUsd(promptTok, completionTok) / sample.length;
    const estTotal = avgCost * pool.length;
    console.log(
      `\n  Sample avg: $${avgCost.toFixed(4)}/tender → estimated total for ${pool.length}: $${estTotal.toFixed(2)}`
    );
    if (estTotal > COST_STOP) {
      console.log(`  ⚠ Estimate exceeds $${COST_STOP}. STOP — confirm before --apply.`);
    } else {
      console.log(`  Under $${COST_STOP}. Re-run with --apply (or "<N> --apply" for a staged batch).`);
    }
    console.log(`\n[DRY] Nothing written.`);
    process.exit(0);
  }

  // ---- APPLY ----
  let done = 0;
  let published = 0;
  let unpublished = 0;
  let failed = 0;
  let promptTok = 0;
  let completionTok = 0;
  const now = new Date();

  for (const r of pool) {
    try {
      const documentText = await docTextFor(r.id);
      const { fields, usage } = await extractFields({
        title: r.title,
        description: r.description,
        documentText,
      });
      promptTok += usage.prompt_tokens;
      completionTok += usage.completion_tokens;

      const update = buildUpdate(fields);

      // Publish gate. Classification-dropped tenders stay down no matter what.
      const conf = fields.extraction_confidence;
      if (r.unpublishReason) {
        update.isPublished = false;
      } else if (conf !== null) {
        update.isPublished = conf >= CONF_GATE;
      }
      if (update.isPublished === true) published++;
      else if (update.isPublished === false) unpublished++;

      update.updatedAt = now;
      await db.update(tenders).set(update).where(eq(tenders.id, r.id));
      done++;
      const c = conf === null ? "?" : conf.toFixed(2);
      console.log(`  ✓ conf ${c} ${update.isPublished === false ? "[review]" : "        "} ${r.title.slice(0, 70)}`);
    } catch (err) {
      failed++;
      console.log(`  ✗ ${(err as Error).message.slice(0, 120)} — ${r.title.slice(0, 60)}`);
    }
  }

  console.log(
    `\nApplied: ${done} extracted (${published} published, ${unpublished} → review), ${failed} failed.`
  );
  console.log(`Tokens: ${promptTok} in / ${completionTok} out → cost ~$${costUsd(promptTok, completionTok).toFixed(3)}`);

  // Reindex published tenders so the new facets (sector, value, cpv) are fresh.
  const pub = await db
    .select({ t: tenders, source: sources })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .where(eq(tenders.isPublished, true));
  if (pub.length > 0) {
    const docs = pub.map(({ t, source }) => tenderToDoc(t, source));
    await getMeili().index(TENDERS_INDEX).addDocuments(docs, { primaryKey: "id" });
    console.log(`Reindexed ${pub.length} published tenders in Meilisearch.`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
