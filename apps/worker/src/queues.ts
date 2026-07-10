import { Queue } from "bullmq";
import {
  QUEUES,
  type EmailDispatchJob,
  type IndexSyncJob,
  type QueueName,
} from "@repo/config";
import { connection } from "./connection";

const registry = new Map<QueueName, Queue>();

function getQueue(name: QueueName): Queue {
  let queue = registry.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
    registry.set(name, queue);
  }
  return queue;
}

export async function enqueueIndexSync(job: IndexSyncJob) {
  await getQueue(QUEUES.indexSync).add("index-sync", job, {
    attempts: 5,
    backoff: { type: "exponential", delay: 10_000 },
  });
}

export async function enqueueEmailDispatch(job: EmailDispatchJob) {
  await getQueue(QUEUES.emailDispatch).add("email", job, {
    attempts: 5,
    backoff: { type: "exponential", delay: 60_000 },
  });
}
