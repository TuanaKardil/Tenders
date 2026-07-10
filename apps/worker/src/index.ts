import { startNormalizeWorker } from "./workers/normalize";
import { startIndexSyncWorker } from "./workers/index-sync";

const workers = [startNormalizeWorker(), startIndexSyncWorker()];

for (const worker of workers) {
  worker.on("completed", (job) => {
    console.log(`[${worker.name}] job ${job.id} completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[${worker.name}] job ${job?.id} failed:`, err.message);
  });
}

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
