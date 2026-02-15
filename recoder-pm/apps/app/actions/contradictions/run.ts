"use server";

import { createAiJob } from "@repo/backend/ai-jobs";
import { currentOrganizationId } from "@repo/backend/auth/utils";
import { parseError } from "@repo/lib/parse-error";
import { AI_JOB_NAMES, enqueueAiJob } from "@repo/queue/jobs";

export const runContradictions = async () => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    const aiJob = await createAiJob({
      type: "CONTRADICTIONS",
      organizationId,
      payload: { organizationId },
    });

    await enqueueAiJob(
      AI_JOB_NAMES.CONTRADICTIONS,
      { aiJobId: aiJob.id, organizationId },
      { jobId: aiJob.id }
    );

    return { success: true, aiJobId: aiJob.id };
  } catch (error) {
    return { error: parseError(error) };
  }
};
