import { database } from "./database";
import { emitInteropAiJobEvent } from "./interop-analytics";
import type { Prisma } from "./prisma/client";
import type { ai_job_status, ai_job_type } from "./prisma/client";

export const createAiJob = (input: {
  type: ai_job_type;
  organizationId?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown> | null;
  queueJobId?: string | null;
}) =>
  database.aiJob
    .create({
    data: {
      type: input.type,
      organizationId: input.organizationId ?? null,
      entityId: input.entityId ?? null,
      payload:
        input.payload == null
          ? undefined
          : (input.payload as unknown as Prisma.InputJsonValue),
      queueJobId: input.queueJobId ?? null,
    },
    select: {
      id: true,
      type: true,
      organizationId: true,
      entityId: true,
      payload: true,
      status: true,
      error: true,
    },
  })
    .then((job) => {
      emitInteropAiJobEvent("TASK_SUBMITTED", job);
      emitInteropAiJobEvent("TASK_QUEUED", job);
      emitInteropAiJobEvent("FUNNEL_DELEGATION_STARTED", job);
      return job;
    });

const updateAiJob = (
  id: string,
  data: {
    status?: ai_job_status;
    error?: string | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
  }
) =>
  database.aiJob.update({
    where: { id },
    data,
    select: {
      id: true,
      type: true,
      organizationId: true,
      entityId: true,
      payload: true,
      status: true,
      error: true,
    },
  });

export const markAiJobRunning = (id: string) =>
  updateAiJob(id, { status: "RUNNING", startedAt: new Date() }).then((job) => {
    emitInteropAiJobEvent("TASK_RUNNING", job);
    return job;
  });

export const markAiJobSucceeded = (id: string) =>
  updateAiJob(id, {
    status: "SUCCEEDED",
    finishedAt: new Date(),
    error: null,
  }).then((job) => {
    emitInteropAiJobEvent("TASK_SUCCEEDED", job);
    emitInteropAiJobEvent("FUNNEL_DELEGATION_SUCCEEDED", job);
    return job;
  });

export const markAiJobFailed = (id: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return updateAiJob(id, {
    status: "FAILED",
    finishedAt: new Date(),
    error: message,
  }).then((job) => {
    emitInteropAiJobEvent("TASK_FAILED", job);
    emitInteropAiJobEvent("FUNNEL_DELEGATION_FAILED", job);
    return job;
  });
};
