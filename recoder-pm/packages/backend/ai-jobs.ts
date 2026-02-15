import { database } from "./database";
import type { ai_job_status, ai_job_type } from "./prisma/client";

export const createAiJob = (input: {
  type: ai_job_type;
  organizationId?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown> | null;
  queueJobId?: string | null;
}) =>
  database.aiJob.create({
    data: {
      type: input.type,
      organizationId: input.organizationId ?? null,
      entityId: input.entityId ?? null,
      payload: input.payload ?? null,
      queueJobId: input.queueJobId ?? null,
    },
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
  });

export const markAiJobRunning = (id: string) =>
  updateAiJob(id, { status: "RUNNING", startedAt: new Date() });

export const markAiJobSucceeded = (id: string) =>
  updateAiJob(id, {
    status: "SUCCEEDED",
    finishedAt: new Date(),
    error: null,
  });

export const markAiJobFailed = (id: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return updateAiJob(id, {
    status: "FAILED",
    finishedAt: new Date(),
    error: message,
  });
};
