import "server-only";
import type { JobsOptions, Processor } from "bullmq";
import { Queue, QueueEvents, Worker } from "bullmq";
import IORedis from "ioredis";

export type QueueConfig = {
  readonly name: string;
  readonly prefix?: string;
};

export type QueueConnectionOptions = {
  readonly url?: string;
};

export type EnqueueOptions = JobsOptions;

let connection: IORedis | null = null;

const getRedisUrl = () => process.env.REDIS_URL ?? "redis://localhost:6379";

export const getQueueConnection = (
  options?: QueueConnectionOptions
): IORedis => {
  if (connection) {
    return connection;
  }

  const redisUrl = options?.url ?? getRedisUrl();
  connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  return connection;
};

export const createQueue = ({ name, prefix }: QueueConfig) =>
  new Queue(name, {
    connection: getQueueConnection(),
    prefix,
  });

export const createQueueEvents = ({ name, prefix }: QueueConfig) =>
  new QueueEvents(name, {
    connection: getQueueConnection(),
    prefix,
  });

export const createWorker = <TData, TResult>(
  config: QueueConfig,
  processor: Processor<TData, TResult>
) =>
  new Worker<TData, TResult>(config.name, processor, {
    connection: getQueueConnection(),
    prefix: config.prefix,
  });
