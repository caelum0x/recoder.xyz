import type { Job } from "bullmq";
import { createWorker } from "./index";
import {
  AI_JOB_NAMES,
  AI_QUEUE_NAME,
  type FeedbackSentimentJob,
  type FeedbackAnalysisJob,
  type FeatureRiceJob,
} from "./jobs";

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
        const { feedbackId, organizationId } =
          job.data as FeedbackSentimentJob;
        const { database } = await import("@repo/backend/database");
        const { generateObject } = await import("ai");
        const { z } = await import("zod/v3");
        const { getOrganizationTextModel } = await import("@repo/backend/ai");
        const { withOrganizationSystemPrompt } = await import(
          "@repo/backend/ai-prompts"
        );

        const feedback = await database.feedback.findUnique({
          where: { id: feedbackId },
          select: {
            id: true,
            title: true,
            content: true,
            organizationId: true,
          },
        });
        if (!feedback) {
          throw new Error(`Feedback ${feedbackId} not found`);
        }

        const { contentToText } = await import("@repo/editor/lib/tiptap");
        const contentText = feedback.content
          ? contentToText(feedback.content)
          : "";

        const { object } = await generateObject({
          model: await getOrganizationTextModel(organizationId),
          system: await withOrganizationSystemPrompt(organizationId, [
            "You are an AI that detect the sentiment of user feedback.",
            "You are given a user feedback message and a prompt to perform sentiment analysis on it.",
          ].join("\n")),
          prompt: `${feedback.title}: ${contentText || "No content provided."}`,
          schema: z.object({
            sentiment: z.enum([
              "ANGRY",
              "CONFUSED",
              "NEGATIVE",
              "POSITIVE",
              "INFORMATIVE",
              "NEUTRAL",
            ]),
            reason: z.string(),
          }),
        });

        await database.feedback.update({
          where: { id: feedbackId },
          data: {
            aiSentiment: object.sentiment,
            aiSentimentReason: object.reason,
          },
          select: { id: true },
        });
        break;
      }
      case AI_JOB_NAMES.FEEDBACK_ANALYSIS: {
        const { feedbackId, organizationId } =
          job.data as FeedbackAnalysisJob;
        const { database } = await import("@repo/backend/database");
        const { generateObject } = await import("ai");
        const { z } = await import("zod/v3");
        const { getOrganizationTextModel } = await import("@repo/backend/ai");
        const { withOrganizationSystemPrompt } = await import(
          "@repo/backend/ai-prompts"
        );

        const feedback = await database.feedback.findUnique({
          where: { id: feedbackId },
          select: { id: true, content: true, organizationId: true },
        });
        if (!feedback) {
          throw new Error(`Feedback ${feedbackId} not found`);
        }

        const { contentToText } = await import("@repo/editor/lib/tiptap");
        const contentText = feedback.content
          ? contentToText(feedback.content)
          : "";

        // Delete existing analysis so we can regenerate
        await database.feedbackAnalysis
          .delete({ where: { feedbackId } })
          .catch(() => {
            // ignore if no existing analysis
          });

        const { object } = await generateObject({
          model: await getOrganizationTextModel(organizationId),
          system: await withOrganizationSystemPrompt(organizationId, [
            "You are an AI that analyzes user feedback.",
            "You are given a user feedback message by a user.",
            "You are to analyze the feedback into a short summary, pain points, recommendations for the product manager, and desired outcomes for the user.",
            "Do not include any markdown formatting in your response.",
          ].join("\n")),
          prompt: contentText,
          schema: z.object({
            summary: z.string(),
            painPoints: z.string(),
            recommendations: z.string(),
            outcomes: z.string(),
          }),
        });

        await database.feedbackAnalysis.create({
          data: {
            summary: object.summary,
            painPoints: object.painPoints,
            recommendations: object.recommendations,
            outcomes: object.outcomes,
            feedbackId,
            organizationId,
          },
          select: { id: true },
        });
        break;
      }
      case AI_JOB_NAMES.FEATURE_RICE: {
        const { runOpportunityScoring } = await import(
          "@repo/backend/opportunity-scoring"
        );
        await runOpportunityScoring();
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
