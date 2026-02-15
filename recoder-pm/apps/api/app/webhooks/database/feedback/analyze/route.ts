import { createAiJob } from "@repo/backend/ai-jobs";
import type { Feedback } from "@repo/backend/prisma/client";
import { AI_JOB_NAMES, enqueueAiJob } from "@repo/queue/jobs";

export const maxDuration = 300;
export const revalidate = 0;
export const dynamic = "force-dynamic";

type InsertPayload = {
  type: "INSERT";
  table: string;
  schema: string;
  record: Feedback;
  old_record: null;
};

export const POST = async (request: Request): Promise<Response> => {
  const body = (await request.json()) as InsertPayload;

  const payload = {
    feedbackId: body.record.id,
    organizationId: body.record.organizationId,
  };

  const aiJob = await createAiJob({
    type: "FEEDBACK_ANALYSIS",
    organizationId: body.record.organizationId,
    entityId: body.record.id,
    payload,
  });

  await enqueueAiJob(
    AI_JOB_NAMES.FEEDBACK_ANALYSIS,
    { ...payload, aiJobId: aiJob.id },
    { jobId: aiJob.id }
  );

  return new Response("Queued", { status: 202 });
};
