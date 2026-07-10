import { Meilisearch } from "meilisearch";

let client: Meilisearch | undefined;

export function getMeili(): Meilisearch {
  if (!client) {
    const host = process.env.MEILISEARCH_HOST;
    const apiKey = process.env.MEILISEARCH_ADMIN_KEY;
    if (!host || !apiKey) {
      throw new Error("MEILISEARCH_HOST / MEILISEARCH_ADMIN_KEY are not set");
    }
    client = new Meilisearch({ host, apiKey });
  }
  return client;
}
