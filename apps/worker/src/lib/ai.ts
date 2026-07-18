import { loadPrompt } from "./prompts";

/** Minimal OpenRouter (OpenAI-compatible) client for translate + summarize. */
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-lite";
/** OCR / document reading uses the fuller Flash model (better at images/scans). */
const MODEL_OCR = "google/gemini-2.5-flash";

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

// The prompt text lives in the repo-root prompts/ folder (loaded at runtime).

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
        { role: "system", content: loadPrompt("translate-summarize") },
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

// ---------------------------------------------------------------------------
// Classification gate (PIPELINE.md stage 5) — AI tier for ambiguous notices.

export interface ClassifyInput {
  title: string;
  buyer?: string | null;
  noticeType?: string | null;
  sector?: string | null;
  source?: string | null;
  description?: string | null;
}

export interface ClassifyOutput {
  is_tender: boolean;
  category: string;
  reason: string;
}

export async function classifyTender(input: ClassifyInput): Promise<ClassifyOutput> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");

  const facts: Record<string, string> = { title: input.title };
  const add = (k: string, v: string | null | undefined) => {
    if (v && String(v).trim()) facts[k] = String(v).trim();
  };
  add("buyer", input.buyer);
  add("notice_type", input.noticeType);
  add("sector", input.sector);
  add("source_portal", input.source);
  add("description", input.description?.slice(0, 500));

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: loadPrompt("classification") },
        { role: "user", content: JSON.stringify(facts) },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("empty AI response");

  const parsed = JSON.parse(content) as Partial<ClassifyOutput>;
  return {
    is_tender: parsed.is_tender !== false, // lean towards keeping on malformed output
    category: parsed.category ?? "tender",
    reason: parsed.reason ?? "",
  };
}

// ---------------------------------------------------------------------------
// Notice-type learning — classify an unknown raw type label into the enum.

export interface LearnedNoticeType {
  enum: string;
  confidence: number;
  reasoning: string;
}

export async function learnNoticeType(
  rawText: string,
  sourceSlug: string,
  language?: string | null
): Promise<LearnedNoticeType> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: loadPrompt("notice-type-learn") },
        {
          role: "user",
          content: JSON.stringify({
            raw_label: rawText,
            source_portal: sourceSlug,
            language: language ?? undefined,
          }),
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("empty AI response");
  const p = JSON.parse(content) as { enum?: string; confidence?: number; reasoning_short?: string };
  const conf = typeof p.confidence === "number" ? Math.min(1, Math.max(0, p.confidence)) : 0;
  return { enum: p.enum ?? "unknown", confidence: conf, reasoning: p.reasoning_short ?? "" };
}

// ---------------------------------------------------------------------------
// Dedup judge (PIPELINE.md stage 7, Tier 2) — are two notices the same tender?

export interface JudgeNotice {
  title: string;
  buyer?: string | null;
  country: string;
  closing?: string | null;
  source?: string | null;
  summary?: string | null;
}

export interface JudgeVerdict {
  same_tender: boolean;
  reason: string;
}

export async function judgeDuplicate(a: JudgeNotice, b: JudgeNotice): Promise<JudgeVerdict> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");

  const strip = (n: JudgeNotice) => ({
    title: n.title,
    buyer: n.buyer ?? undefined,
    country: n.country,
    closing: n.closing ?? undefined,
    source_portal: n.source ?? undefined,
    summary: n.summary?.slice(0, 400) ?? undefined,
  });

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: loadPrompt("dedupe-judge") },
        { role: "user", content: JSON.stringify({ notice_a: strip(a), notice_b: strip(b) }) },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("empty AI response");
  const parsed = JSON.parse(content) as Partial<JudgeVerdict>;
  return {
    // Lean towards NOT merging on malformed output (a duplicate shown twice
    // beats a real tender hidden).
    same_tender: parsed.same_tender === true,
    reason: parsed.reason ?? "",
  };
}

// ---------------------------------------------------------------------------
// Document OCR (PIPELINE.md stage 4) — read text straight from an image or a
// scanned/text-less PDF via Gemini's multimodal ability. Text-layer PDFs and
// DOCX are handled locally (pdf-parse/mammoth); this is only the fallback.

/** Build the OpenRouter content part for a document buffer. */
function documentPart(buffer: Buffer, mime: string) {
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
  if (mime === "application/pdf") {
    // OpenRouter feeds PDFs to Gemini natively via a `file` part.
    return { type: "file" as const, file: { filename: "document.pdf", file_data: dataUrl } };
  }
  return { type: "image_url" as const, image_url: { url: dataUrl } };
}

/**
 * Extract raw text from an image (PNG/JPG) or a scanned PDF. Returns the
 * transcribed text (may be empty if the document truly has none).
 */
export async function extractTextFromDocument(buffer: Buffer, mime: string): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL_OCR,
      temperature: 0,
      messages: [
        { role: "system", content: loadPrompt("document-ocr") },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe every readable character in this document." },
            documentPart(buffer, mime),
          ],
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// AI field extraction (PIPELINE.md stage 5) — structured fields from the
// tender's title + description + extracted document text. The prompt forbids
// guessing; missing fields come back null.

export interface FieldInput {
  title: string;
  description?: string | null;
  documentText?: string | null; // already concatenated + capped by the caller
}

export interface ExtractedFields {
  estimated_value_min: number | null;
  estimated_value_max: number | null;
  currency: string | null;
  sector_primary: string | null;
  sectors_secondary: string[];
  cpv_codes: string[];
  eligibility_countries: string[];
  eligibility_notes_en: string | null;
  notice_type_ai: string | null;
  extraction_confidence: number | null;
}

/** Token usage the caller uses to compute cost. */
export interface FieldResult {
  fields: ExtractedFields;
  usage: { prompt_tokens: number; completion_tokens: number };
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

export async function extractFields(input: FieldInput): Promise<FieldResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");

  const facts: Record<string, string> = { title: input.title };
  if (input.description?.trim()) facts.description = input.description.trim();
  if (input.documentText?.trim()) facts.document_text = input.documentText.trim();

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: loadPrompt("field-extraction") },
        { role: "user", content: JSON.stringify(facts) },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("empty AI response");
  const p = JSON.parse(content) as Record<string, unknown>;

  const confidence = num(p.extraction_confidence);
  return {
    fields: {
      estimated_value_min: num(p.estimated_value_min),
      estimated_value_max: num(p.estimated_value_max),
      currency: typeof p.currency === "string" && p.currency.trim() ? p.currency.trim().toUpperCase() : null,
      sector_primary: typeof p.sector_primary === "string" && p.sector_primary.trim() ? p.sector_primary.trim() : null,
      sectors_secondary: strArr(p.sectors_secondary),
      cpv_codes: strArr(p.cpv_codes),
      eligibility_countries: strArr(p.eligibility_countries).map((c) => c.toUpperCase()),
      eligibility_notes_en:
        typeof p.eligibility_notes_en === "string" && p.eligibility_notes_en.trim()
          ? p.eligibility_notes_en.trim()
          : null,
      notice_type_ai: typeof p.notice_type_ai === "string" && p.notice_type_ai.trim() ? p.notice_type_ai.trim() : null,
      extraction_confidence: confidence === null ? null : Math.min(1, Math.max(0, confidence)),
    },
    usage: {
      prompt_tokens: json.usage?.prompt_tokens ?? 0,
      completion_tokens: json.usage?.completion_tokens ?? 0,
    },
  };
}
