import { PostHog } from "posthog-node";
import { z } from "zod";
import type { ai_job_type } from "./prisma/client";

export const InteropEvents = {
  TASK_SUBMITTED: "interop_task_submitted",
  TASK_QUEUED: "interop_task_queued",
  TASK_RUNNING: "interop_task_running",
  TASK_SUCCEEDED: "interop_task_succeeded",
  TASK_FAILED: "interop_task_failed",
  FUNNEL_DELEGATION_STARTED: "interop_funnel_delegation_started",
  FUNNEL_DELEGATION_SUCCEEDED: "interop_funnel_delegation_succeeded",
  FUNNEL_DELEGATION_FAILED: "interop_funnel_delegation_failed",
} as const;

const InteropPayloadSchema = z.object({
  event: z.enum([
    InteropEvents.TASK_SUBMITTED,
    InteropEvents.TASK_QUEUED,
    InteropEvents.TASK_RUNNING,
    InteropEvents.TASK_SUCCEEDED,
    InteropEvents.TASK_FAILED,
    InteropEvents.FUNNEL_DELEGATION_STARTED,
    InteropEvents.FUNNEL_DELEGATION_SUCCEEDED,
    InteropEvents.FUNNEL_DELEGATION_FAILED,
  ]),
  jobId: z.string().min(1),
  jobType: z.string().min(1),
  organizationId: z.string().min(1).nullable(),
  connectorId: z.string().min(1),
  traceId: z.string().min(1),
  entityId: z.string().nullable(),
  status: z.string().min(1).nullable(),
  error: z.string().nullable(),
});

const analytics = process.env.NEXT_PUBLIC_POSTHOG_KEY
  ? new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    })
  : null;

type JobContext = {
  id: string;
  type: ai_job_type;
  organizationId: string | null;
  entityId: string | null;
  payload: unknown;
  status?: string | null;
  error?: string | null;
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readString = (
  data: Record<string, unknown> | null,
  keys: string[]
): string | null => {
  if (!data) {
    return null;
  }
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
};

const getConnectorId = (payload: unknown): string => {
  const data = asObject(payload);
  return (
    readString(data, ["connectorId", "connector_id", "provider", "connector"]) ??
    "recoder-pm-ai"
  );
};

const getTraceId = (payload: unknown, fallbackJobId: string): string => {
  const data = asObject(payload);
  return readString(data, ["traceId", "trace_id", "requestId", "request_id"]) ?? fallbackJobId;
};

const getDistinctId = (job: JobContext): string =>
  job.organizationId ? `org:${job.organizationId}` : `job:${job.id}`;

const safeCapture = (event: string, properties: Record<string, unknown>, distinctId: string) => {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return;
  }

  void analytics?.capture({
    distinctId,
    event,
    properties,
  });
};

export const emitInteropAiJobEvent = (event: keyof typeof InteropEvents, job: JobContext) => {
  const connectorId = getConnectorId(job.payload);
  const traceId = getTraceId(job.payload, job.id);
  const eventName = InteropEvents[event];

  const parsed = InteropPayloadSchema.safeParse({
    event: eventName,
    jobId: job.id,
    jobType: job.type,
    organizationId: job.organizationId,
    connectorId,
    traceId,
    entityId: job.entityId,
    status: job.status ?? null,
    error: job.error ?? null,
  });

  if (!parsed.success) {
    return;
  }

  safeCapture(
    eventName,
    {
      interop: true,
      task_id: parsed.data.jobId,
      task_type: parsed.data.jobType,
      status: parsed.data.status,
      error: parsed.data.error,
      connector_id: parsed.data.connectorId,
      trace_id: parsed.data.traceId,
      entity_id: parsed.data.entityId,
      organization_id: parsed.data.organizationId,
    },
    getDistinctId(job)
  );
};
