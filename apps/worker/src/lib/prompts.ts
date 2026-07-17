import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Loads prompts from the repo-root PROMPTS.md at runtime, so prompts can be
 * edited there without touching code. Extracts the text between
 * `<!-- prompt:<name>:start -->` and `<!-- prompt:<name>:end -->`.
 */
const PROMPTS_PATH = fileURLToPath(new URL("../../../../PROMPTS.md", import.meta.url));

const cache = new Map<string, string>();

export function loadPrompt(name: string): string {
  const cached = cache.get(name);
  if (cached) return cached;

  const md = readFileSync(PROMPTS_PATH, "utf8");
  const re = new RegExp(
    `<!--\\s*prompt:${name}:start\\s*-->\\s*\\n([\\s\\S]*?)\\n\\s*<!--\\s*prompt:${name}:end\\s*-->`
  );
  const match = md.match(re);
  if (!match || !match[1]) {
    throw new Error(`Prompt "${name}" not found in PROMPTS.md`);
  }
  const prompt = match[1].trim();
  cache.set(name, prompt);
  return prompt;
}
