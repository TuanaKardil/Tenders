/** Minimal OpenRouter (OpenAI-compatible) client for translate + summarize. */
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-lite";

export interface TsInput {
  title: string;
  language: string;
  description?: string | null;
  buyer?: string | null;
  country?: string | null;
  sector?: string | null;
}

export interface TsOutput {
  title_en: string;
  title_tr: string;
  summary_en: string;
  summary_tr: string;
}

const SYSTEM = `You clean, translate and summarize public procurement tender notices for a global tender platform.
Given a tender's original title (and optional details), output concise, factual English and Turkish.
Respond with ONLY a JSON object: {"title_en","title_tr","summary_en","summary_tr"}.
- Titles: clean, human-readable, no source reference codes; keep them faithful to the original.
- Summaries: 1-2 sentences, factual — what is being procured and by whom. No marketing fluff, no invented facts.
- If the details are thin (title only), keep the summary short and do not fabricate.`;

export async function translateSummarize(input: TsInput): Promise<TsOutput> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            original_language: input.language,
            title: input.title,
            description: input.description ?? null,
            buyer: input.buyer ?? null,
            country: input.country ?? null,
            sector: input.sector ?? null,
          }),
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("empty AI response");

  const parsed = JSON.parse(content) as Partial<TsOutput>;
  return {
    title_en: parsed.title_en?.trim() || input.title,
    title_tr: parsed.title_tr?.trim() || input.title,
    summary_en: parsed.summary_en?.trim() || "",
    summary_tr: parsed.summary_tr?.trim() || "",
  };
}
