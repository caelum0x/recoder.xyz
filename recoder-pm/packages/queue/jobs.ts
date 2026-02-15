import { createQueue, type EnqueueOptions } from "./index";

export const AI_QUEUE_NAME = "ai-jobs";

export const AI_JOB_NAMES = {
  FEEDBACK_SENTIMENT: "feedback.sentiment",
  FEEDBACK_ANALYSIS: "feedback.analysis",
  FEATURE_RICE: "feature.rice",
  DIGEST_GENERATE: "digest.generate",
  INSIGHTS_SYNTHESIZE: "insights.synthesize",
  PROPOSAL_PRD: "proposal.prd",
  CONTRADICTIONS: "contradictions.detect",
  OPPORTUNITY_SCORING: "opportunity.scoring",
  PROPOSALS_GENERATE: "proposals.generate",
} as const;

export type AiJobName = (typeof AI_JOB_NAMES)[keyof typeof AI_JOB_NAMES];

export type FeedbackSentimentJob = {
  feedbackId: string;
  organizationId: string;
};

export type FeedbackAnalysisJob = {
  feedbackId: string;
  organizationId: string;
};

export type FeatureRiceJob = {
  featureId: string;
  organizationId: string;
};

export type ProposalPrdJob = {
  proposalId: string;
};

export type DigestGenerateJob = { aiJobId: string };
export type InsightsSynthesizeJob = { aiJobId: string };
export type ContradictionsJob = { aiJobId: string };
export type OpportunityScoringJob = { aiJobId: string };
export type ProposalsGenerateJob = { aiJobId: string };

export const enqueueAiJob = <T>(
  name: AiJobName,
  data: T,
  options?: EnqueueOptions
) => {
  const queue = createQueue({ name: AI_QUEUE_NAME });
  return queue.add(name, data, {
    removeOnComplete: 100,
    removeOnFail: 100,
    ...options,
  });
};
