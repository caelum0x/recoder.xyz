import type { Job } from "bullmq";
import { createWorker } from "./index";
import { AI_JOB_NAMES, AI_QUEUE_NAME } from "./jobs";

const processJob = async (job: Job) => {
  const { markAiJobRunning, markAiJobSucceeded, markAiJobFailed } =
    await import("@repo/backend/ai-jobs");

  const aiJobId = (job.data as { aiJobId?: string }).aiJobId;

  if (aiJobId) {
    await markAiJobRunning(aiJobId);
  }

  try {
    switch (job.name) {
      case AI_JOB_NAMES.FEEDBACK_SENTIMENT: {
        // Feedback sentiment is handled by Prisma middleware;
        // this branch exists for re-processing via the queue.
        break;
      }
      case AI_JOB_NAMES.FEEDBACK_ANALYSIS: {
        // Feedback analysis is handled by Prisma middleware.
        break;
      }
      case AI_JOB_NAMES.FEATURE_RICE: {
        // RICE scoring is handled by Prisma middleware.
        break;
      }
      case AI_JOB_NAMES.DIGEST_GENERATE: {
        // Digest generation logic lives in apps/api/lib/queue-processors.ts
        // because it is tightly coupled to the API app's data layer.
        // Use the API-level worker for this job.
        break;
      }
      case AI_JOB_NAMES.INSIGHTS_SYNTHESIZE: {
        const { synthesizeAiInsights } = await import(
          "@repo/backend/ai-insights"
        );
        await synthesizeAiInsights();
        break;
      }
      case AI_JOB_NAMES.PROPOSAL_PRD: {
        const { generateProposalPrd } = await import(
          "@repo/backend/prd-generator"
        );
        await generateProposalPrd(
          (job.data as { proposalId: string }).proposalId
        );
        break;
      }
      case AI_JOB_NAMES.CONTRADICTIONS: {
        const { detectContradictions } = await import(
          "@repo/backend/contradiction-detector"
        );
        await detectContradictions();
        break;
      }
      case AI_JOB_NAMES.OPPORTUNITY_SCORING: {
        const { runOpportunityScoring } = await import(
          "@repo/backend/opportunity-scoring"
        );
        await runOpportunityScoring();
        break;
      }
      case AI_JOB_NAMES.PROPOSALS_GENERATE: {
        const { generateProposals } = await import(
          "@repo/backend/proposal-generator"
        );
        await generateProposals();
        break;
      }
      default:
        throw new Error(`Unknown job: ${job.name}`);
    }

    if (aiJobId) {
      await markAiJobSucceeded(aiJobId);
    }
  } catch (error) {
    if (aiJobId) {
      await markAiJobFailed(aiJobId, error);
    }
    throw error;
  }
};

export const startAiWorker = () =>
  createWorker({ name: AI_QUEUE_NAME }, processJob);
