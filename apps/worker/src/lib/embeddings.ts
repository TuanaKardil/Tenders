/**
 * Text embeddings for Tier 2 dedup — Google AI (AI Studio) REST API.
 * OpenRouter has no embeddings endpoint, so this is the one AI call that
 * doesn't go through it. Model + dims defined here ONLY.
 *
 * Model: gemini-embedding-001 (text-embedding-004 was retired in 2026).
 * We request 768 output dims to match the pgvector column.
 *
 * Needs GOOGLE_AI_API_KEY in .env (aistudio.google.com → Get API key).
 */
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMS = 768;

const BASE = "https://generativelanguage.googleapis.com/v1beta";

async function embedOne(text: string, key: string, attempt = 0): Promise<number[]> {
  const res = await fetch(`${BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text: text.slice(0, 6000) }] },
      outputDimensionality: EMBEDDING_DIMS,
    }),
  });
  if (res.status === 429 && attempt < 3) {
    // Free-tier rate limit — back off and retry.
    await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
    return embedOne(text, key, attempt + 1);
  }
  if (!res.ok) throw new Error(`Google AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { embedding?: { values?: number[] } };
  const values = json.embedding?.values;
  if (!values || values.length !== EMBEDDING_DIMS) {
    throw new Error(`unexpected embedding size ${values?.length}`);
  }
  return values;
}

/** Embed a list of texts (sequential; free-tier friendly). Order preserved. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_AI_API_KEY not set (aistudio.google.com → Get API key)");

  const out: number[][] = [];
  for (const text of texts) {
    out.push(await embedOne(text, key));
  }
  return out;
}

/** Cosine similarity between two equal-length vectors. */
export function cosine(a: number[], b: number[]): number {
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
