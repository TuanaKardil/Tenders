import { eq, isNull, asc } from "drizzle-orm";
import { db, tenders, documents, sources } from "@repo/db";
import {
  fileKind,
  plannedMethod,
  headSize,
  downloadDocument,
  extractText,
  MAX_BYTES,
  type FileKind,
} from "../lib/doc-extract";

/**
 * Document text extraction (PIPELINE.md stage 4).
 *
 * RED LINE — we NEVER host the file. Each document is downloaded into memory,
 * its text is extracted, and the buffer is discarded (it never touches disk).
 * Only the extracted text is stored. This is the legal core; do not change it.
 *
 * DRY by default: reports how many documents, by which method, size buckets and
 * an estimated Gemini OCR cost — then STOPS. Re-run with --apply to write.
 *
 * Args:
 *   <N>       process only the first N tenders that have documents (staged rollout)
 *   --apply   download, extract, write extracted_text/method/extracted_at
 *   --all     re-extract documents that already have text (default: only new ones)
 */
const apply = process.argv.includes("--apply");
const all = process.argv.includes("--all");
const tenderLimit = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? "0") || null;

// Rough Gemini 2.5 Flash cost per OCR call (input image/pdf + transcribed output).
const GEMINI_COST_PER_DOC = 0.008; // USD, conservative upper estimate

function human(bytes: number | null): string {
  if (bytes === null) return "?";
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}

async function main() {
  // All documents for the current tenders, oldest tender first (stable order).
  const rows = await db
    .select({
      doc: documents,
      tenderId: tenders.id,
      tenderSlug: tenders.slug,
      sourceSlug: sources.slug,
    })
    .from(documents)
    .innerJoin(tenders, eq(documents.tenderId, tenders.id))
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .orderBy(asc(tenders.firstSeenAt));

  // Staged rollout: keep only the first N distinct tenders.
  let selected = rows;
  if (tenderLimit) {
    const keep = new Set<string>();
    for (const r of rows) {
      if (keep.size >= tenderLimit && !keep.has(r.tenderId)) continue;
      keep.add(r.tenderId);
    }
    selected = rows.filter((r) => keep.has(r.tenderId));
  }

  const skippedType: typeof selected = [];
  const alreadyDone: typeof selected = [];
  const todo: { row: (typeof selected)[number]; kind: FileKind }[] = [];

  for (const r of selected) {
    const kind = fileKind(r.doc.fileType, r.doc.url);
    if (!kind) {
      skippedType.push(r);
      continue;
    }
    if (!all && r.doc.extractedText !== null) {
      alreadyDone.push(r);
      continue;
    }
    todo.push({ row: r, kind });
  }

  const distinctTenders = new Set(selected.map((r) => r.tenderId)).size;
  console.log(
    `\n${apply ? "" : "[DRY] "}Document extraction — ${distinctTenders} tenders, ${selected.length} documents` +
      (tenderLimit ? ` (limited to first ${tenderLimit} tenders)` : "")
  );
  console.log(`  to process : ${todo.length}`);
  console.log(`  skipped (unsupported type): ${skippedType.length}`);
  console.log(`  already extracted: ${alreadyDone.length}${all ? " (will re-do: --all)" : ""}`);

  let mPdf = 0;
  let mDocx = 0;
  let mGemini = 0;
  for (const t of todo) {
    const m = plannedMethod(t.kind);
    if (m === "pdf-parse") mPdf++;
    else if (m === "mammoth") mDocx++;
    else mGemini++;
  }
  console.log(`  planned method — pdf-parse: ${mPdf}, mammoth: ${mDocx}, gemini(images): ${mGemini}`);
  console.log(
    `  note: text-less (scanned) PDFs also fall back to Gemini, so OCR calls may exceed the images count.`
  );

  // Estimated cost: images are definite Gemini calls; scanned-PDF fallbacks are unknown up front.
  const minGemini = mGemini;
  const maxGemini = mGemini + mPdf;
  console.log(
    `\n  Estimated Gemini OCR cost: $${(minGemini * GEMINI_COST_PER_DOC).toFixed(2)} – $${(maxGemini * GEMINI_COST_PER_DOC).toFixed(2)} ` +
      `(${minGemini}–${maxGemini} calls × ~$${GEMINI_COST_PER_DOC}/call)`
  );
  if (todo.length > 100) {
    console.log(`  ⚠ ${todo.length} documents (>100) — review the cost above before --apply.`);
  }

  if (!apply) {
    // Best-effort size distribution via HEAD (skipped for large batches to stay quick).
    if (todo.length <= 60) {
      const sizes = await Promise.all(todo.map((t) => headSize(t.row.doc.url)));
      const over = sizes.filter((s) => s !== null && s > MAX_BYTES).length;
      const known = sizes.filter((s): s is number => s !== null);
      const total = known.reduce((a, b) => a + b, 0);
      console.log(
        `\n  Size (HEAD): ${known.length}/${todo.length} known, total ~${human(total)}, ` +
          `largest ~${human(known.length ? Math.max(...known) : null)}, over 25MB: ${over}`
      );
    }
    console.log(`\n[DRY] Nothing downloaded or written. Re-run with --apply.`);
    process.exit(0);
  }

  // --apply
  let ok = 0;
  let failed = 0;
  let chars = 0;
  const now = new Date();

  for (const { row, kind } of todo) {
    const label = `[${row.sourceSlug}] ${row.doc.url.slice(-60)}`;
    try {
      const buffer = await downloadDocument(row.doc.url); // in memory only
      const { text, method } = await extractText(buffer, kind); // buffer discarded after this
      await db
        .update(documents)
        .set({ extractedText: text, extractionMethod: method, extractionError: null, extractedAt: now })
        .where(eq(documents.id, row.doc.id));
      ok++;
      chars += text.length;
      console.log(`  ✓ ${method.padEnd(16)} ${text.length} chars  ${label}`);
    } catch (err) {
      const msg = (err as Error).message.slice(0, 300);
      await db
        .update(documents)
        .set({ extractionMethod: "failed", extractionError: msg, extractedAt: now })
        .where(eq(documents.id, row.doc.id));
      failed++;
      console.log(`  ✗ failed          ${msg}  ${label}`);
    }
  }

  console.log(`\nApplied: ${ok} extracted (${chars.toLocaleString()} chars total), ${failed} failed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
