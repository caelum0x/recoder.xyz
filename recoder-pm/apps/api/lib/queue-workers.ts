import {
  markAiJobFailed,
  markAiJobRunning,
  markAiJobSucceeded,
} from "@repo/backend/ai-jobs";
import { log } from "@repo/observability/log";
import { createWorker } from "@repo/queue";
import { AI_JOB_NAMES, AI_QUEUE_NAME } from "@repo/queue/jobs";
import {
  processContradictions,
  processDigestGenerate,
  processFeatureRice,
  processFeedbackAnalysis,
  processFeedbackSentiment,
  processInsightsSynthesize,
  processOpportunityScoring,
  processProposalPrd,
  processProposalsGenerate,
} from "@/lib/queue-processors";

const getAiJobId = (jobId: string | number | undefined, data: unknown) => {
  if (typeof jobId === "string") {
    return jobId;
  }

  if (typeof jobId === "number") {
    return String(jobId);
  }

  const payload = data as { aiJobId?: string };
  return payload?.aiJobId;
};

const runProcessor = async (name: string, data: unknown) => {
  const payload = data as Record<string, unknown>;

  switch (name) {
    case AI_JOB_NAMES.FEEDBACK_SENTIMENT:
      await processFeedbackSentiment(
        data as {
          feedbackId: string;
          organizationId: string;
        }
      );
      return;
    case AI_JOB_NAMES.FEEDBACK_ANALYSIS:
      await processFeedbackAnalysis(
        data as {
          feedbackId: string;
          organizationId: string;
        }
      );
      return;
    case AI_JOB_NAMES.FEATURE_RICE:
      await processFeatureRice(
        payload as { featureId: string; organizationId: string }
      );
      return;
    case AI_JOB_NAMES.DIGEST_GENERATE:
      await processDigestGenerate();
      return;
    case AI_JOB_NAMES.INSIGHTS_SYNTHESIZE:
      await processInsightsSynthesize();
      return;
    case AI_JOB_NAMES.PROPOSAL_PRD:
      await processProposalPrd(payload as { proposalId: string });
      return;
    case AI_JOB_NAMES.CONTRADICTIONS:
      await processContradictions();
      return;
    case AI_JOB_NAMES.OPPORTUNITY_SCORING:
      await processOpportunityScoring();
      return;
    case AI_JOB_NAMES.PROPOSALS_GENERATE:
      await processProposalsGenerate();
      return;
    default:
      log.warn("Unknown AI job", { name });
  }
};

export const registerQueueWorkers = () => {
  const enabled = !process.env.VERCEL && process.env.NEXT_RUNTIME !== "edge";

  if (!enabled) {
    return;
  }

  createWorker({ name: AI_QUEUE_NAME }, async (job) => {
    const aiJobId = getAiJobId(job.id, job.data);

    if (aiJobId) {
      await markAiJobRunning(aiJobId);
    }

    try {
      await runProcessor(job.name, job.data);

      if (aiJobId) {
        await markAiJobSucceeded(aiJobId);
      }
    } catch (error) {
      if (aiJobId) {
        await markAiJobFailed(aiJobId, error);
      }

      throw error;
    }
  });
};
