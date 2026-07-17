/** Minimal OpenRouter (OpenAI-compatible) client for translate + summarize. */
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-lite";

export interface TsInput {
  title: string;
  language: string;
  description?: string | null;
  buyer?: string | null;
  funder?: string | null;
  country?: string | null;
  city?: string | null;
  sector?: string | null;
  noticeType?: string | null;
  method?: string | null;
  deadline?: string | null; // human date, e.g. "2026-07-20"
  published?: string | null;
  value?: string | null; // e.g. "$120,000" or "KES 4,000,000"
}

export interface TsOutput {
  title_en: string;
  title_tr: string;
  summary_en: string;
  summary_tr: string;
}

const SYSTEM = `You prepare public procurement tender notices for a global tender platform, for busy professionals scanning many tenders.

Output ONLY a JSON object: {"title_en","title_tr","summary_en","summary_tr"}.

Titles: clean and human-readable, faithful to the original, no source reference codes.

Summaries (both languages): a clear, plain-language explanation of 2-4 sentences that a person can understand at a glance. Cover, in natural prose, whatever facts are provided:
- what is being procured (the goods/works/services),
- who the buyer is (and funder if given),
- where — country and city/location if given,
- the tender/notice type and procurement method if given,
- the submission deadline if given ("bids are due by …" / "son teklif tarihi …").

Rules: Use ONLY the facts provided below — NEVER invent details, prices, requirements or dates. If a fact is missing, simply omit it; do not write "not specified". Avoid jargon and copy-pasted codes. Turkish must read naturally, not like a machine translation.`;

export async function translateSummarize(input: TsInput): Promise<TsOutput> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");

  // Only send fields that are present, so the model isn't nudged to fill blanks.
  const facts: Record<string, string> = { original_language: input.language, title: input.title };
  const add = (k: string, v: string | null | undefined) => {
    if (v && String(v).trim()) facts[k] = String(v).trim();
  };
  add("description", input.description);
  add("buyer", input.buyer);
  add("funder", input.funder);
  add("country", input.country);
  add("city_or_location", input.city);
  add("sector", input.sector);
  add("notice_type", input.noticeType);
  add("procurement_method", input.method);
  add("submission_deadline", input.deadline);
  add("published_date", input.published);
  add("estimated_value", input.value);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(facts) },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
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
