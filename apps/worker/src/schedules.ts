import { Queue } from "bullmq";
import { QUEUES } from "@repo/config";
import { connection } from "./connection";

/**
 * Registers repeatable jobs (idempotent — BullMQ dedupes by jobSchedulerId).
 *   alert-match-instant : every 5 minutes (debounced instant alerts, Pro)
 *   alert-daily         : 06:00 UTC daily
 *   alert-weekly        : 06:00 UTC Mondays
 *   status-refresh      : hourly
 *   index-sync          : 03:00 UTC nightly consistency sweep (full reindex)
 */
export async function registerSchedules() {
  const schedules: {
    queue: string;
    id: string;
    pattern: string;
    data?: Record<string, unknown>;
  }[] = [
    {
      queue: QUEUES.alertMatchInstant,
      id: "alert-instant-5m",
      pattern: "*/5 * * * *",
      data: { frequency: "instant" },
    },
    {
      queue: QUEUES.alertDaily,
      id: "alert-daily-06",
      pattern: "0 6 * * *",
      data: { frequency: "daily" },
    },
    {
      queue: QUEUES.alertWeekly,
      id: "alert-weekly-mon",
      pattern: "0 6 * * 1",
      data: { frequency: "weekly" },
    },
    {
      queue: QUEUES.statusRefresh,
      id: "status-refresh-hourly",
      pattern: "0 * * * *",
    },
    {
      queue: QUEUES.indexSync,
      id: "index-sweep-nightly",
      pattern: "0 3 * * *",
      data: { tenderIds: [], fullReindex: true },
    },
  ];

  for (const s of schedules) {
    const queue = new Queue(s.queue, { connection });
    await queue.upsertJobScheduler(
      s.id,
      { pattern: s.pattern, tz: "UTC" },
      { name: s.id, data: s.data ?? {} }
    );
    await queue.close();
  }
  console.log(`registered ${schedules.length} repeatable schedules`);
}
