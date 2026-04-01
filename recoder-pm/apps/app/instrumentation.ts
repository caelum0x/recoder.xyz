import {
  captureRequestError,
  initializeSentry,
} from "@repo/observability/instrumentation";

export const register = async () => {
  initializeSentry();

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAiWorker } = await import("@repo/queue/workers");
    startAiWorker();
  }
};

export const onRequestError = captureRequestError;
