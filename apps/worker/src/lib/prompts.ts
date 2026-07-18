import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Loads AI prompts from the repo-root `prompts/` folder at runtime — one file
 * per task (`prompts/<name>.md`, the whole file is the prompt). Edit a prompt
 * there and it takes effect on the next run, with no code change.
 */
const PROMPTS_DIR = new URL("../../../../prompts/", import.meta.url);

const cache = new Map<string, string>();

export function loadPrompt(name: string): string {
  const cached = cache.get(name);
  if (cached) return cached;

  const path = fileURLToPath(new URL(`${name}.md`, PROMPTS_DIR));
  const prompt = readFileSync(path, "utf8").trim();
  if (!prompt) throw new Error(`Prompt "${name}" (prompts/${name}.md) is empty`);
  cache.set(name, prompt);
  return prompt;
}
