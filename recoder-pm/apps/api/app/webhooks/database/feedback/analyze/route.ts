import { createAiJob } from "@repo/backend/ai-jobs";
import type { Feedback } from "@repo/backend/prisma/client";
import { log } from "@repo/observability/log";
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
  const webhookSecret = request.headers.get('x-webhook-secret') ?? request.headers.get('authorization');
  if (webhookSecret !== process.env.WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = (await request.json()) as InsertPayload;

    if (!body.record?.id || !body.record?.organizationId) {
      return new Response('Missing required fields in record', { status: 400 });
    }

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
  } catch (error) {
    log.error('Feedback analyze webhook failed', { error });
    return new Response('Internal server error', { status: 500 });
  }
};
