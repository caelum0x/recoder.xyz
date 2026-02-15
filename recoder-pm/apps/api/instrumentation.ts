import {
  captureRequestError,
  initializeSentry,
} from "@repo/observability/instrumentation";

export const register = async () => {
  initializeSentry();

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerScheduler } = await import("@/lib/scheduler");
    registerScheduler();

    const { registerQueueWorkers } = await import("@/lib/queue-workers");
    registerQueueWorkers();
  }
};

export const onRequestError = captureRequestError;
