import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

type DbInstance = ReturnType<typeof createClient>;

declare global {
  var __dbClient: DbInstance | undefined;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  // Supabase pooled connection runs pgbouncer in transaction mode:
  // prepared statements must be disabled.
  const sql = postgres(url, { prepare: false, max: 10 });
  return drizzle(sql, { schema });
}

let cached: DbInstance | undefined;

function getClient(): DbInstance {
  // globalThis survives Next.js dev-mode module reloads; module scope covers prod.
  if (globalThis.__dbClient) return globalThis.__dbClient;
  if (!cached) {
    cached = createClient();
    if (process.env.NODE_ENV !== "production") {
      globalThis.__dbClient = cached;
    }
  }
  return cached;
}

/**
 * Lazily-initialized Drizzle client: connecting (and requiring DATABASE_URL)
 * happens on first use, not at import time, so Next.js can build without env.
 */
export const db: DbInstance = new Proxy({} as DbInstance, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getClient(), prop, receiver);
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
});

export type Db = DbInstance;
