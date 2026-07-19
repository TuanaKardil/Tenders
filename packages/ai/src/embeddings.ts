/**
 * Embeddings for the tender QA assistant (RAG). Same provider as the rest of
 * the platform (gemini-embedding-001 — multilingual, so a French question
 * retrieves from an English document), but a SEPARATE embedding space from the
 * dedup/alert vectors: chunks and questions use Gemini task types
 * (RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY), which the recommendation pipeline
 * deliberately does not.
 */
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMS = 768;

const BASE = "https://generativelanguage.googleapis.com/v1beta";

type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

async function embedOne(text: string, taskType: TaskType, attempt = 0): Promise<number[]> {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_AI_API_KEY not set");
  const res = await fetch(`${BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text: text.slice(0, 6000) }] },
      taskType,
      outputDimensionality: EMBEDDING_DIMS,
    }),
  });
  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 10_000 * (attempt + 1)));
    return embedOne(text, taskType, attempt + 1);
  }
  if (!res.ok) throw new Error(`Google AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { embedding?: { values?: number[] } };
  const values = json.embedding?.values;
  if (!values || values.length !== EMBEDDING_DIMS) {
    throw new Error(`unexpected embedding size ${values?.length}`);
  }
  return values;
}

/** Embed a document chunk for storage (RETRIEVAL_DOCUMENT space). */
export function embedDocumentChunk(text: string): Promise<number[]> {
  return embedOne(text, "RETRIEVAL_DOCUMENT");
}

/** Embed a user question for retrieval (RETRIEVAL_QUERY space). */
export function embedUserQuestion(text: string): Promise<number[]> {
  return embedOne(text, "RETRIEVAL_QUERY");
}

/** Embed many chunks with bounded parallelism (free-tier friendly). */
export async function embedDocumentChunks(texts: string[]): Promise<number[][]> {
  const out: number[][] = new Array(texts.length);
  const CONCURRENCY = 8;
  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const batch = texts.slice(i, i + CONCURRENCY);
    const vecs = await Promise.all(batch.map((t) => embedDocumentChunk(t)));
    vecs.forEach((v, j) => (out[i + j] = v));
  }
  return out;
}

export function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** ~1000-char chunks with 150 overlap, cut at sentence-ish boundaries. */
export function chunkText(text: string, size = 1000, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      // Prefer breaking after a sentence end near the boundary.
      const window = clean.slice(start + Math.floor(size * 0.6), end);
      const lastStop = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
      if (lastStop > -1) end = start + Math.floor(size * 0.6) + lastStop + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return chunks.filter((c) => c.length > 40);
}
