import { eq } from "drizzle-orm";
import { db, documents } from "@repo/db";
import { fileKind, downloadDocument, extractText } from "../lib/doc-extract";

/**
 * One-off retry for documents left at extraction_method='failed' by
 * extract-documents.ts. Uses looser limits — 150 MB and a 60s timeout — but
 * still NEVER hosts the file (in-memory only). On success it fills
 * extracted_text; on repeated failure it records a specific extraction_error
 * (e.g. "size limit: 150MB", "request timeout (60s)", "HTTP 404",
 * "pdf-parse: <reason>") instead of a bare "failed".
 *
 * DRY by default; --apply writes.
 */
const apply = process.argv.includes("--apply");
const RETRY_MAX_BYTES = 150 * 1024 * 1024;
const RETRY_TIMEOUT_MS = 60_000;

async function main() {
  const failed = await db
    .select()
    .from(documents)
    .where(eq(documents.extractionMethod, "failed"));

  console.log(`\n${apply ? "" : "[DRY] "}Retrying ${failed.length} failed documents (limit 150MB, timeout 60s)\n`);

  const now = new Date();
  let ok = 0;
  let stillFailed = 0;

  for (const doc of failed) {
    const kind = fileKind(doc.fileType, doc.url);
    const label = doc.url.slice(-70);
    if (!kind) {
      console.log(`  ✗ unsupported type — ${label}`);
      if (apply) {
        await db
          .update(documents)
          .set({ extractionMethod: "failed", extractionError: "unsupported file type", extractedAt: now })
          .where(eq(documents.id, doc.id));
      }
      stillFailed++;
      continue;
    }

    if (!apply) {
      console.log(`  · would retry [${kind}] previous error "${doc.extractionError}" — ${label}`);
      continue;
    }

    try {
      const buffer = await downloadDocument(doc.url, {
        maxBytes: RETRY_MAX_BYTES,
        timeoutMs: RETRY_TIMEOUT_MS,
      });
      let result;
      try {
        result = await extractText(buffer, kind);
      } catch (err) {
        throw new Error(`pdf-parse: ${(err as Error).message}`);
      }
      await db
        .update(documents)
        .set({
          extractedText: result.text,
          extractionMethod: result.method,
          extractionError: null,
          extractedAt: now,
        })
        .where(eq(documents.id, doc.id));
      ok++;
      console.log(`  ✓ ${result.method} — ${result.text.length} chars — ${label}`);
    } catch (err) {
      const msg = (err as Error).message.slice(0, 300);
      await db
        .update(documents)
        .set({ extractionMethod: "failed", extractionError: msg, extractedAt: now })
        .where(eq(documents.id, doc.id));
      stillFailed++;
      console.log(`  ✗ ${msg} — ${label}`);
    }
  }

  if (!apply) {
    console.log(`\n[DRY] Nothing written. Re-run with --apply.`);
  } else {
    console.log(`\nDone: ${ok} recovered, ${stillFailed} still failed (with a specific reason recorded).`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
