import { createAiJob } from "@repo/backend/ai-jobs";
import type { Feature } from "@repo/backend/prisma/client";
import { AI_JOB_NAMES, enqueueAiJob } from "@repo/queue/jobs";

export const maxDuration = 300;
export const revalidate = 0;
export const dynamic = "force-dynamic";

type InsertPayload = {
  type: "INSERT";
  table: string;
  schema: string;
  record: Feature;
  old_record: null;
};

export const POST = async (request: Request): Promise<Response> => {
  const body = (await request.json()) as InsertPayload;

  const payload = {
    featureId: body.record.id,
    organizationId: body.record.organizationId,
  };

  const aiJob = await createAiJob({
    type: "FEATURE_RICE",
    organizationId: body.record.organizationId,
    entityId: body.record.id,
    payload,
  });

  await enqueueAiJob(
    AI_JOB_NAMES.FEATURE_RICE,
    { ...payload, aiJobId: aiJob.id },
    { jobId: aiJob.id }
  );

  return new Response("Queued", { status: 202 });
};
