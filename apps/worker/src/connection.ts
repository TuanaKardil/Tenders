import { Redis } from "ioredis";

/**
 * BullMQ Redis connection — LAZY. Direct scripts (GitHub Actions pipeline)
 * import modules that reference this without ever using Redis; they must not
 * crash at import time when REDIS_URL is absent. Only actually touching the
 * connection (starting a BullMQ worker / enqueuing) throws.
 */
const url = process.env.REDIS_URL;

function makeConnection(): Redis {
  if (!url) {
    // Reached only when something really uses Redis without configuration.
    throw new Error("REDIS_URL is not set (BullMQ workers need it; direct scripts don't)");
  }
  /** BullMQ requires maxRetriesPerRequest: null on its connection. */
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export const connection: Redis = url
  ? makeConnection()
  : (new Proxy(
      {},
      {
        get() {
          throw new Error("REDIS_URL is not set (BullMQ workers need it; direct scripts don't)");
        },
      }
    ) as unknown as Redis);
