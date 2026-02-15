"use server";

import { createAiJob } from "@repo/backend/ai-jobs";
import { currentOrganizationId } from "@repo/backend/auth/utils";
import { parseError } from "@repo/lib/parse-error";
import { AI_JOB_NAMES, enqueueAiJob } from "@repo/queue/jobs";

export const generateProposalPrdAction = async (proposalId: string) => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    const payload = { proposalId, organizationId };

    const aiJob = await createAiJob({
      type: "PROPOSAL_PRD",
      organizationId,
      entityId: proposalId,
      payload,
    });

    await enqueueAiJob(
      AI_JOB_NAMES.PROPOSAL_PRD,
      { ...payload, aiJobId: aiJob.id },
      { jobId: aiJob.id }
    );

    return { success: true, aiJobId: aiJob.id };
  } catch (error) {
    return { error: parseError(error) };
  }
};
