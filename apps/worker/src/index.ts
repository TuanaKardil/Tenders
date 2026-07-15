import { Sentry } from "./sentry";
import { startNormalizeWorker } from "./workers/normalize";
import { startIndexSyncWorker } from "./workers/index-sync";
import { startAlertWorkers } from "./workers/alerts";
import { startEmailDispatchWorker } from "./workers/email-dispatch";
import { startStatusRefreshWorker } from "./workers/status-refresh";
import { registerSchedules } from "./schedules";

const workers = [
  startNormalizeWorker(),
  startIndexSyncWorker(),
  ...startAlertWorkers(),
  startEmailDispatchWorker(),
  startStatusRefreshWorker(),
];

registerSchedules().catch((err) => {
  console.error("failed to register schedules:", err);
});

for (const worker of workers) {
  worker.on("completed", (job) => {
    console.log(`[${worker.name}] job ${job.id} completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[${worker.name}] job ${job?.id} failed:`, err.message);
    Sentry.captureException(err, { extra: { worker: worker.name, jobId: job?.id } });
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
  Sentry.captureException(reason);
});

console.log(
  `worker started — queues: ${workers.map((w) => w.name).join(", ")}`
);

async function shutdown() {
  console.log("shutting down workers...");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
