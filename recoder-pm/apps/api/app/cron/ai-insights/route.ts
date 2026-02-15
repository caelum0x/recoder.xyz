import { createAiJob } from "@repo/backend/ai-jobs";
import { AI_JOB_NAMES, enqueueAiJob } from "@repo/queue/jobs";

export const maxDuration = 300;
export const revalidate = 0;
export const dynamic = "force-dynamic";

export const GET = async (): Promise<Response> => {
  const aiJob = await createAiJob({
    type: "INSIGHTS_SYNTHESIZE",
  });

  await enqueueAiJob(
    AI_JOB_NAMES.INSIGHTS_SYNTHESIZE,
    { aiJobId: aiJob.id },
    { jobId: aiJob.id }
  );

  return new Response("Queued", { status: 202 });
};
