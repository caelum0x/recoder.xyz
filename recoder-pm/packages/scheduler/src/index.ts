import "server-only";
import { log } from "@repo/observability/log";
import { Cron } from "croner";

export type ScheduledTask = {
  name: string;
  schedule: string;
  handler: () => Promise<unknown>;
};

type SchedulerOptions = {
  enabled?: boolean;
};

const globalKey = "__recoderPmSchedulerStarted" as const;

declare global {
  // eslint-disable-next-line no-var
  var __recoderPmSchedulerStarted: boolean | undefined;
}

export const startScheduler = (
  tasks: ScheduledTask[],
  options: SchedulerOptions = {}
) => {
  if (options.enabled === false) {
    log.warn("⏱️ Scheduler explicitly disabled via options.");
    return;
  }

  if (globalThis[globalKey]) {
    log.warn("⏱️ Scheduler already started — skipping duplicate startup.");
    return;
  }

  globalThis[globalKey] = true;

  for (const task of tasks) {
    new Cron(task.schedule, async () => {
      try {
        log.info(`⏱️ Running scheduled task: ${task.name}`);
        await task.handler();
        log.info(`⏱️ Completed scheduled task: ${task.name}`);
      } catch (error) {
        log.error(`⏱️ Failed scheduled task: ${task.name}`, error);
      }
    });
  }
};
