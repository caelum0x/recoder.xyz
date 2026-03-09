import { createAiJob } from "@repo/backend/ai-jobs";
import { database } from "@repo/backend/database";
import { AI_JOB_NAMES, enqueueAiJob } from "@repo/queue/jobs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const maxDuration = 300;
export const revalidate = 0;
export const dynamic = "force-dynamic";

export const POST = async (request: NextRequest): Promise<Response> => {
  const authorization = request.headers.get("Authorization");
  const key = authorization?.split("Bearer ")[1];

  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = await database.apiKey.findFirst({
    where: { key },
    select: {
      organizationId: true,
    },
  });

  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const aiJob = await createAiJob({
    type: "OPPORTUNITY_SCORING",
    organizationId: apiKey.organizationId,
    payload: {
      organizationId: apiKey.organizationId,
      connectorId: "recoder-pm-ai",
      traceId: crypto.randomUUID(),
    },
  });

  await enqueueAiJob(
    AI_JOB_NAMES.OPPORTUNITY_SCORING,
    { aiJobId: aiJob.id, organizationId: apiKey.organizationId },
    { jobId: aiJob.id }
  );

  return NextResponse.json(
    { jobId: aiJob.id, status: "QUEUED" },
    { status: 202 }
  );
};
