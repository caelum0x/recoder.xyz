import { currentOrganizationId } from "@repo/backend/auth/utils";
import { emitInteropAiJobEvent } from "@repo/backend/interop-analytics";
import { AI_JOB_NAMES, enqueueAiJob, type AiJobName } from "@repo/queue/jobs";
import { NextResponse } from "next/server";
import { database } from "@/lib/database";

const jobNameByType: Record<string, AiJobName> = {
  FEEDBACK_SENTIMENT: AI_JOB_NAMES.FEEDBACK_SENTIMENT,
  FEEDBACK_ANALYSIS: AI_JOB_NAMES.FEEDBACK_ANALYSIS,
  FEATURE_RICE: AI_JOB_NAMES.FEATURE_RICE,
  DIGEST_GENERATE: AI_JOB_NAMES.DIGEST_GENERATE,
  INSIGHTS_SYNTHESIZE: AI_JOB_NAMES.INSIGHTS_SYNTHESIZE,
  PROPOSAL_PRD: AI_JOB_NAMES.PROPOSAL_PRD,
  CONTRADICTIONS: AI_JOB_NAMES.CONTRADICTIONS,
  OPPORTUNITY_SCORING: AI_JOB_NAMES.OPPORTUNITY_SCORING,
  PROPOSALS_GENERATE: AI_JOB_NAMES.PROPOSALS_GENERATE,
};

export const POST = async (request: Request): Promise<Response> => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json()) as { jobId?: string };

  if (!body.jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }

  const job = await database.aiJob.findFirst({
    where: {
      id: body.jobId,
      organizationId,
    },
    select: {
      id: true,
      type: true,
      entityId: true,
      payload: true,
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const queueName = jobNameByType[job.type];

  if (!queueName) {
    return NextResponse.json(
      { error: "Unsupported job type" },
      { status: 400 }
    );
  }

  const payload = (job.payload ?? {}) as Record<string, unknown>;

  await database.aiJob.update({
    where: { id: job.id },
    data: {
      status: "QUEUED",
      error: null,
      startedAt: null,
      finishedAt: null,
    },
  });

  emitInteropAiJobEvent("TASK_QUEUED", {
    id: job.id,
    type: job.type,
    organizationId,
    entityId: job.entityId ?? null,
    payload: job.payload,
    status: "QUEUED",
    error: null,
  });

  await enqueueAiJob(
    queueName,
    { ...payload, aiJobId: job.id },
    { jobId: job.id }
  );

  return NextResponse.json({ success: true });
};
