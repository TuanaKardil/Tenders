import { eq, asc, isNotNull } from "drizzle-orm";
import { db, tenders, documents, sources } from "@repo/db";
import { TENDERS_INDEX } from "@repo/config/search";
import { getMeili } from "../meili";
import { tenderToDoc } from "../lib/tender-doc";
import { extractFields } from "../lib/ai";
import { mergeExtractedFields, joinDocTexts, STALE_DOCS_SQL } from "../lib/merge-tender";
import { sql } from "drizzle-orm";

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
// --max-cost <usd>: hard budget for unattended runs (GitHub Actions). If the
// deterministic estimate exceeds it, the script FAILS instead of spending.
const maxCostIdx = process.argv.indexOf("--max-cost");
const maxCost = maxCostIdx > -1 ? Number(process.argv[maxCostIdx + 1]) || null : null;
// --source <slug>: restrict to one source (targeted backfills).
const sourceIdx = process.argv.indexOf("--source");
const sourceFilter = sourceIdx > -1 ? process.argv[sourceIdx + 1] ?? null : null;
// Positional numeric limit — must NOT swallow a flag's value (e.g. "--max-cost 2").
const tenderLimit =
  Number(
    process.argv.find(
      (a, i) => /^\d+$/.test(a) && i !== maxCostIdx + 1 && i !== sourceIdx + 1
    ) ?? "0"
  ) || null;
// Measured upper bound per tender (document-bearing Kenya ones): ~$0.0024.
const EST_PER_TENDER = 0.003;

const DOC_CHAR_CAP = 100_000; // cap document text fed to the model (token guard)
const CONF_GATE = 0.7;
const SAMPLE_N = 3;
const COST_STOP = 5; // USD — stop and ask above this
// google/gemini-2.5-flash-lite (OpenRouter), USD per 1M tokens.
const PRICE_IN = 0.1;
const PRICE_OUT = 0.4;

function costUsd(promptTok: number, completionTok: number): number {
  return (promptTok * PRICE_IN + completionTok * PRICE_OUT) / 1_000_000;
}
// All fill/coalesce/provenance rules live in ONE place: lib/merge-tender.ts.

async function main() {
  const rows = await db
    .select({
      id: tenders.id,
      title: tenders.titleOriginal,
      description: tenders.summaryEn,
      noticeTypeAi: tenders.noticeTypeAi,
      unpublishReason: tenders.unpublishReason,
      closingAt: tenders.closingAt,
      estimatedValueMax: tenders.estimatedValueMax,
      currency: tenders.currency,
      eligibilityNotesEn: tenders.eligibilityNotesEn,
      fieldProvenance: tenders.fieldProvenance,
      sourceSlug: sources.slug,
    })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .orderBy(asc(tenders.firstSeenAt));

  // Stale set: documents extracted after the tender's last merge — a tender
  // whose attachment arrived LATE re-enters the pool automatically.
  const staleRes = await db.execute(sql.raw(STALE_DOCS_SQL));
  const staleIds = new Set(
    ((Array.isArray(staleRes) ? staleRes : (staleRes as { rows?: unknown[] }).rows ?? []) as {
      tender_id: string;
    }[]).map((r) => r.tender_id)
  );

  let pool = all ? rows : rows.filter((r) => r.noticeTypeAi === null || staleIds.has(r.id));
  if (staleIds.size > 0 && !all) console.log(`  (stale-docs: ${staleIds.size} tender re-queued)`);
  if (sourceFilter) pool = pool.filter((r) => r.sourceSlug === sourceFilter);
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

  // Pull + cap the combined text of ALL of a tender's documents.
  async function docTextFor(tenderId: string): Promise<string> {
    const docs = await db
      .select({ txt: documents.extractedText })
      .from(documents)
      .where(eq(documents.tenderId, tenderId));
    return joinDocTexts(docs.map((d) => d.txt), DOC_CHAR_CAP);
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

      // Single merge rule (fill priority + no-downgrade + provenance).
      const { update } = mergeExtractedFields(
        {
          closingAt: r.closingAt,
          estimatedValueMax: r.estimatedValueMax,
          currency: r.currency,
          eligibilityNotesEn: r.eligibilityNotesEn,
          fieldProvenance: r.fieldProvenance,
        },
        fields,
        documentText.length > 0,
        now
      );

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
