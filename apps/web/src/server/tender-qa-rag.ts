import { eq, sql } from "drizzle-orm";
import { db, documents, tenderDocumentChunks } from "@repo/db";
import {
  chunkText,
  embedDocumentChunks,
  embedUserQuestion,
  cosineSim,
} from "@repo/ai/embeddings";

/**
 * Lazy RAG for the tender assistant.
 *
 * On a tender's FIRST question its documents (extracted_text, already in the
 * DB) are chunked (~1000 chars / 150 overlap), embedded and stored; later
 * questions reuse the stored chunks. Every read/write here is keyed by the
 * server-resolved tender id — there is no cross-tender query path.
 *
 * Failure policy (spec): if embedding fails (quota etc.), return null — the
 * caller answers from structured fields instead of erroring.
 */
const MAX_CHUNKS_PER_TENDER = 150; // first-question latency + storage bound
const TOP_K = 6;
const MIN_SIM = 0.35;
const EXCERPT_TOTAL_CHAR_CAP = 8000;

export interface RetrievedExcerpt {
  document: string;
  page?: number;
  text: string;
}

/** Ensure chunks exist for the tender; returns count (0 = no documents). */
async function ensureChunks(tenderId: string, language: string | null): Promise<number> {
  const [existing] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tenderDocumentChunks)
    .where(eq(tenderDocumentChunks.tenderId, tenderId));
  if ((existing?.n ?? 0) > 0) return existing!.n;

  const docs = await db
    .select({ id: documents.id, title: documents.title, url: documents.url, txt: documents.extractedText })
    .from(documents)
    .where(eq(documents.tenderId, tenderId));

  let total = 0;
  let truncated = false;
  for (const d of docs) {
    if (!d.txt || d.txt.length < 40) continue;
    let chunks = chunkText(d.txt);
    if (total + chunks.length > MAX_CHUNKS_PER_TENDER) {
      chunks = chunks.slice(0, MAX_CHUNKS_PER_TENDER - total);
      truncated = true;
    }
    if (chunks.length === 0) break;
    const vectors = await embedDocumentChunks(chunks);
    const rows = chunks.map((c, i) => ({
      tenderId,
      documentId: d.id,
      chunkText: c,
      embedding: vectors[i]!,
      language: language,
    }));
    // Batch insert per document.
    await db.insert(tenderDocumentChunks).values(rows);
    total += chunks.length;
    if (truncated) break;
  }
  if (truncated) {
    console.warn(`[tender-qa-rag] ${tenderId}: chunk cap ${MAX_CHUNKS_PER_TENDER} hit — largest documents partially indexed`);
  }
  return total;
}

/**
 * Retrieve the most relevant document excerpts for a question.
 * Returns null on embedding failure (caller falls back to structured-only),
 * [] when the tender simply has no usable document text.
 */
export async function retrieveExcerpts(
  tenderId: string,
  question: string,
  language: string | null
): Promise<RetrievedExcerpt[] | null> {
  try {
    const count = await ensureChunks(tenderId, language);
    if (count === 0) return [];

    const qVec = await embedUserQuestion(question);
    const rows = await db
      .select({
        chunk: tenderDocumentChunks.chunkText,
        emb: tenderDocumentChunks.embedding,
        page: tenderDocumentChunks.pageNumber,
        docTitle: documents.title,
        docUrl: documents.url,
      })
      .from(tenderDocumentChunks)
      .innerJoin(documents, eq(tenderDocumentChunks.documentId, documents.id))
      .where(eq(tenderDocumentChunks.tenderId, tenderId)); // hard tender filter

    const scored = rows
      .map((r) => ({ r, sim: cosineSim(qVec, r.emb) }))
      .filter((s) => s.sim >= MIN_SIM)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, TOP_K);

    const out: RetrievedExcerpt[] = [];
    let chars = 0;
    for (const { r } of scored) {
      if (chars + r.chunk.length > EXCERPT_TOTAL_CHAR_CAP) break;
      out.push({
        document: r.docTitle ?? r.docUrl.split("/").pop() ?? "document",
        page: r.page ?? undefined,
        text: r.chunk,
      });
      chars += r.chunk.length;
    }
    return out;
  } catch (err) {
    console.error(`[tender-qa-rag] ${tenderId}: ${(err as Error).message.slice(0, 150)}`);
    return null; // structured-only fallback
  }
}
