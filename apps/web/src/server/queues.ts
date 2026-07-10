import { Queue } from "bullmq";
import { Redis } from "ioredis";
import {
  QUEUES,
  type NormalizeJob,
  type EmailDispatchJob,
  type QueueName,
} from "@repo/config";

/**
 * Enqueue-only BullMQ clients for the web app.
 * Workers (apps/worker) consume; web never processes jobs.
 */

declare global {
  var __queueRegistry: Map<QueueName, Queue> | undefined;
}

function getConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  return new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: false });
}

function getQueue(name: QueueName): Queue {
  const registry = (globalThis.__queueRegistry ??= new Map());
  let queue = registry.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: getConnection(),
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

export async function enqueueNormalize(jobs: NormalizeJob[]) {
  const queue = getQueue(QUEUES.normalize);
  await queue.addBulk(
    jobs.map((data) => ({ name: "normalize", data }))
  );
}

export async function enqueueEmail(job: EmailDispatchJob) {
  const queue = getQueue(QUEUES.emailDispatch);
  await queue.add("email", job);
}
