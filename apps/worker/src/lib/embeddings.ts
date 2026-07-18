/**
 * Text embeddings for Tier 2 dedup — Google AI (AI Studio) REST API.
 * OpenRouter has no embeddings endpoint, so this is the one AI call that
 * doesn't go through it. Model + dims defined here ONLY.
 *
 * Needs GOOGLE_AI_API_KEY in .env (aistudio.google.com → Get API key).
 */
export const EMBEDDING_MODEL = "text-embedding-004";
export const EMBEDDING_DIMS = 768;

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const BATCH_SIZE = 100; // API max per batchEmbedContents call

/** Embed a list of texts (batched). Order of results matches input order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_AI_API_KEY not set (aistudio.google.com → Get API key)");

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${BASE}/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: batch.map((text) => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text: text.slice(0, 8000) }] },
        })),
      }),
    });
    if (!res.ok) throw new Error(`Google AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { embeddings?: { values?: number[] }[] };
    for (const e of json.embeddings ?? []) {
      if (!e.values || e.values.length !== EMBEDDING_DIMS) {
        throw new Error(`unexpected embedding size ${e.values?.length}`);
      }
      out.push(e.values);
    }
  }
  if (out.length !== texts.length) throw new Error(`embedding count mismatch: ${out.length}/${texts.length}`);
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
