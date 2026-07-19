/**
 * THE OpenRouter client — the single HTTP primitive every AI chat call in the
 * monorepo goes through (worker pipeline + web tender-QA). Extracted from
 * apps/worker/src/lib/ai.ts so web can reuse it; do not create parallel
 * clients elsewhere.
 */
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type ChatContent =
  | string
  | (
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
      | { type: "file"; file: { filename: string; file_data: string } }
    )[];

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ChatContent;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  /** true → response_format json_object */
  json?: boolean;
  maxTokens?: number;
  /** Reasoning-model effort hint (e.g. {effort:"minimal"} for gpt-5 family). */
  reasoning?: { effort: "minimal" | "low" | "medium" | "high" };
  /** ms; request is aborted past this. */
  timeoutMs?: number;
}

export interface ChatResult {
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export async function openRouterChat(opts: ChatOptions): Promise<ChatResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");

  const ctrl = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : null;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        // Reasoning models (gpt-5 family) reject non-default temperature —
        // only send it when explicitly set by the caller.
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.reasoning ? { reasoning: opts.reasoning } : {}),
        messages: opts.messages,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("empty AI response");
    return {
      content,
      usage: {
        prompt_tokens: json.usage?.prompt_tokens ?? 0,
        completion_tokens: json.usage?.completion_tokens ?? 0,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`OpenRouter timeout after ${opts.timeoutMs}ms`);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
