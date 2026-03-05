import "server-only";
import { contentToText, textToContent } from "@repo/editor/lib/tiptap";
import { baseUrl } from "@repo/lib/consts";
import { log } from "@repo/observability/log";
import { polar } from "@repo/payments";
import { generateObject, experimental_transcribe as transcribe } from "ai";
import { z } from "zod/v3";
import { getOrganizationTextModel, getTranscriptionModel } from "../ai";
import {
  createAiJob,
  markAiJobFailed,
  markAiJobRunning,
  markAiJobSucceeded,
} from "../ai-jobs";
import { withOrganizationSystemPrompt } from "../ai-prompts";
import { toUser } from "../auth";
import { getUserName } from "../auth/format";
import type {
  AuthUser,
  Feature,
  Feedback,
  Interview,
  Organization,
  PrismaClient,
  SupportTicket,
} from "./client";

const runAsync = (name: string, task: () => Promise<void>) => {
  // biome-ignore lint/complexity/noVoid: fire-and-forget async pattern
  void (async () => {
    try {
      await task();
    } catch (error) {
      const details =
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : { error };
      log.error(`Database middleware failed: ${name}`, details);
    }
  })();
};

const toLogDetails = (error: unknown) =>
  error instanceof Error
    ? { message: error.message, stack: error.stack }
    : { error };

const handleFeedbackCreate = async (
  client: PrismaClient,
  feedback: Feedback
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
) => {
  const content = feedback.content;
  const contentText = content ? contentToText(content) : "";

  if (contentText.trim().length > 0 && !feedback.aiSentiment) {
    let sentimentJob: { id: string } | null = null;

    try {
      sentimentJob = await createAiJob({
        type: "FEEDBACK_SENTIMENT",
        organizationId: feedback.organizationId,
        entityId: feedback.id,
      });
      await markAiJobRunning(sentimentJob.id);
    } catch (error) {
      log.error(
        "Failed to create FEEDBACK_SENTIMENT AiJob",
        toLogDetails(error)
      );
    }

    try {
      const { object } = await generateObject({
        model: await getOrganizationTextModel(feedback.organizationId),
        system: await withOrganizationSystemPrompt(
          feedback.organizationId,
          [
            "You are an AI that detect the sentiment of user feedback.",
            "You are given a user feedback message and a prompt to perform sentiment analysis on it.",
          ].join("\n")
        ),
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

      await client.feedback.update({
        where: { id: feedback.id },
        data: {
          aiSentiment: object.sentiment,
          aiSentimentReason: object.reason,
        },
        select: { id: true },
      });

      if (sentimentJob) {
        await markAiJobSucceeded(sentimentJob.id);
      }
    } catch (error) {
      if (sentimentJob) {
        await markAiJobFailed(sentimentJob.id, error);
      }
      throw error;
    }
  }

  if (contentText.trim().length > 0) {
    const existingAnalysis = await client.feedbackAnalysis.findUnique({
      where: { feedbackId: feedback.id },
      select: { id: true },
    });

    if (!existingAnalysis) {
      let analysisJob: { id: string } | null = null;

      try {
        analysisJob = await createAiJob({
          type: "FEEDBACK_ANALYSIS",
          organizationId: feedback.organizationId,
          entityId: feedback.id,
        });
        await markAiJobRunning(analysisJob.id);
      } catch (error) {
        log.error(
          "Failed to create FEEDBACK_ANALYSIS AiJob",
          toLogDetails(error)
        );
      }

      try {
        const { object } = await generateObject({
          model: await getOrganizationTextModel(feedback.organizationId),
          system: await withOrganizationSystemPrompt(
            feedback.organizationId,
            [
              "You are an AI that analyzes user feedback.",
              "You are given a user feedback message by a user.",
              "You are to analyze the feedback into a short summary, pain points, recommendations for the product manager, and desired outcomes for the user.",
              "Do not include any markdown formatting in your response.",
              "Summary should be between 0 and 65535 characters.",
              "Pain points should be between 0 and 65535 characters.",
              "Recommendations should be between 0 and 65535 characters.",
              "Outcomes should be between 0 and 65535 characters.",
            ].join("\n")
          ),
          prompt: contentText,
          schema: z.object({
            summary: z.string(),
            painPoints: z.string(),
            recommendations: z.string(),
            outcomes: z.string(),
          }),
        });

        await client.feedbackAnalysis.create({
          data: {
            summary: object.summary,
            painPoints: object.painPoints,
            recommendations: object.recommendations,
            outcomes: object.outcomes,
            feedbackId: feedback.id,
            organizationId: feedback.organizationId,
          },
          select: { id: true },
        });

        if (analysisJob) {
          await markAiJobSucceeded(analysisJob.id);
        }
      } catch (error) {
        if (analysisJob) {
          await markAiJobFailed(analysisJob.id, error);
        }
        throw error;
      }
    }
  }

  if ((feedback.videoUrl || feedback.audioUrl) && !feedback.transcribedAt) {
    const transcript = await transcribe({
      model: getTranscriptionModel(),
      audio: new URL(feedback.videoUrl ?? (feedback.audioUrl as string)),
    });

    await client.feedback.update({
      where: { id: feedback.id },
      data: {
        transcript: transcript.text,
        content: textToContent(transcript.text ?? ""),
        transcribedAt: new Date(),
      },
      select: { id: true },
    });
  }

  if (!feedback.slackMessagePublishedAt) {
    const slackInstallations = await client.slackInstallation.findMany({
      where: { organizationId: feedback.organizationId },
      select: { id: true, webhookUrl: true },
    });

    if (slackInstallations.length > 0) {
      const [slackInstallation] = slackInstallations;
      const response = await fetch(slackInstallation.webhookUrl, {
        method: "POST",
        body: JSON.stringify({
          text: `New feedback on Recoder PM: *${feedback.title}*`,
          blocks: [
            {
              type: "rich_text",
              elements: [
                {
                  type: "rich_text_section",
                  elements: [
                    {
                      type: "text",
                      style: { bold: true },
                      text: `New feedback on Recoder PM: ${feedback.title}`,
                    },
                    {
                      type: "text",
                      text: `\n${contentText || "No content provided."}`,
                    },
                  ],
                },
              ],
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "View Feedback",
                  },
                  url: new URL(`/feedback/${feedback.id}`, baseUrl).toString(),
                },
              ],
            },
          ],
        }),
      });

      if (response.ok) {
        await client.feedback.update({
          where: { id: feedback.id },
          data: {
            slackMessagePublishedAt: new Date(),
          },
          select: { id: true },
        });
      }
    }
  }
};

const handleFeatureCreate = async (client: PrismaClient, feature: Feature) => {
  const existing = await client.aiFeatureRice.findUnique({
    where: { featureId: feature.id },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  const organization = await client.organization.findUnique({
    where: { id: feature.organizationId },
    select: { productDescription: true },
  });

  if (!organization) {
    return;
  }

  const content = feature.content;

  if (!content) {
    return;
  }

  let riceJob: { id: string } | null = null;

  try {
    riceJob = await createAiJob({
      type: "FEATURE_RICE",
      organizationId: feature.organizationId,
      entityId: feature.id,
    });
    await markAiJobRunning(riceJob.id);
  } catch (error) {
    log.error("Failed to create FEATURE_RICE AiJob", toLogDetails(error));
  }

  try {
    const { object } = await generateObject({
      model: await getOrganizationTextModel(feature.organizationId),
      system: await withOrganizationSystemPrompt(
        feature.organizationId,
        [
          "You are an AI that determines the RICE score of a new product feature, where:",
          "- Reach is the number of people who will be affected by the feature. This can be between 0 and 100.",
          "- Impact is the impact the feature will have on the users. This can be 1 (minimal), 2 (low), 3 (medium), 4 (high), or 5 (massive).",
          "- Confidence is the level of confidence in your estimates. This can be between 0 (0%) and 100 (100%).",
          "- Effort is the level of effort required to build and ship the feature. This can be between 0 (0%) and 10 (100%).",
          "You are given a new feature idea and asked to determine the RICE score.",
          "You may also be given a product description to help you.",
        ].join("\n")
      ),
      prompt: [
        `Feature name: ${feature.title}`,
        "------",
        "Feature description:",
        content ? contentToText(content) : "None provided.",
        "------",
        "Product description:",
        organization.productDescription ?? "None provided.",
      ].join("\n"),
      schema: z.object({
        reach: z.object({
          score: z.number(),
          reason: z.string(),
        }),
        impact: z.object({
          score: z.number(),
          reason: z.string(),
        }),
        confidence: z.object({
          score: z.number(),
          reason: z.string(),
        }),
        effort: z.object({
          score: z.number(),
          reason: z.string(),
        }),
      }),
    });

    await client.aiFeatureRice.create({
      data: {
        reach: object.reach.score,
        impact: object.impact.score,
        confidence: object.confidence.score,
        effort: object.effort.score,
        reachReason: object.reach.reason,
        impactReason: object.impact.reason,
        confidenceReason: object.confidence.reason,
        effortReason: object.effort.reason,
        organizationId: feature.organizationId,
        featureId: feature.id,
      },
      select: { id: true },
    });

    if (riceJob) {
      await markAiJobSucceeded(riceJob.id);
    }
  } catch (error) {
    if (riceJob) {
      await markAiJobFailed(riceJob.id, error);
    }
    throw error;
  }
};

const handleInterviewCreate = async (
  client: PrismaClient,
  interview: Interview
) => {
  let transcriptText = interview.transcript
    ? contentToText(interview.transcript)
    : "";

  if (!transcriptText.trim() && interview.audioUrl) {
    const transcript = await transcribe({
      model: getTranscriptionModel(),
      audio: new URL(interview.audioUrl),
    });

    transcriptText = transcript.text ?? "";

    if (transcriptText.trim()) {
      await client.interview.update({
        where: { id: interview.id },
        data: {
          transcript: textToContent(transcriptText),
          transcribedAt: new Date(),
        },
        select: { id: true },
      });
    }
  }

  if (!transcriptText.trim()) {
    return;
  }

  const { object } = await generateObject({
    model: await getOrganizationTextModel(interview.organizationId),
    system: await withOrganizationSystemPrompt(
      interview.organizationId,
      [
        "You analyze interview transcripts to extract actionable insights for product managers.",
        "Provide a concise summary and bullet lists of themes, pain points, and feature requests.",
        "Keep responses short and clear, without markdown.",
      ].join("\n")
    ),
    prompt: transcriptText,
    schema: z.object({
      summary: z.string(),
      themes: z.array(z.string()),
      painPoints: z.array(z.string()),
      featureRequests: z.array(z.string()),
    }),
  });

  await client.interview.update({
    where: { id: interview.id },
    data: {
      analysis: {
        summary: object.summary,
        themes: object.themes,
        painPoints: object.painPoints,
        featureRequests: object.featureRequests,
      },
    },
    select: { id: true },
  });
};

const handleSupportTicketCreate = async (
  client: PrismaClient,
  ticket: SupportTicket
) => {
  const content = ticket.content?.trim() ?? "";
  const subject = ticket.subject?.trim() ?? "";
  const prompt = [subject, content].filter(Boolean).join("\n\n");

  if (!prompt.trim()) {
    return;
  }

  const { object } = await generateObject({
    model: await getOrganizationTextModel(ticket.organizationId),
    system: await withOrganizationSystemPrompt(
      ticket.organizationId,
      [
        "You analyze support tickets to extract actionable insights for product managers.",
        "Provide a concise summary and bullet lists of themes, pain points, and feature requests.",
        "Add a short urgency label (low, medium, high).",
        "Keep responses short and clear, without markdown.",
      ].join("\n")
    ),
    prompt,
    schema: z.object({
      summary: z.string(),
      themes: z.array(z.string()),
      painPoints: z.array(z.string()),
      featureRequests: z.array(z.string()),
      urgency: z.enum(["low", "medium", "high"]),
    }),
  });

  await client.supportTicket.update({
    where: { id: ticket.id },
    data: {
      analysis: {
        summary: object.summary,
        themes: object.themes,
        painPoints: object.painPoints,
        featureRequests: object.featureRequests,
        urgency: object.urgency,
      },
    },
    select: { id: true },
  });
};

const handleAuthUserUpsert = async (
  client: PrismaClient,
  authUser: AuthUser
) => {
  if (!authUser.organizationId) {
    return;
  }

  const organization = await client.organization.findUnique({
    where: { id: authUser.organizationId },
    select: { name: true },
  });

  if (!organization) {
    return;
  }

  const coreUser = {
    id: authUser.id,
    email: authUser.email,
    emailVerified: authUser.emailVerified,
    name: authUser.name ?? authUser.email,
    image: authUser.imageUrl,
    createdAt: authUser.createdAt,
    updatedAt: authUser.updatedAt,
  };

  const user = toUser(coreUser, authUser);
  const userName = getUserName(user);
  const [, domain] = user.email.split("@");

  let feedbackOrganization = await client.feedbackOrganization.findFirst({
    where: {
      organizationId: authUser.organizationId,
      domain,
      name: organization.name,
    },
    select: { id: true },
  });

  if (!feedbackOrganization) {
    feedbackOrganization = await client.feedbackOrganization.create({
      data: {
        name: organization.name,
        domain,
        organizationId: authUser.organizationId,
      },
      select: { id: true },
    });
  }

  const existingFeedbackUser = await client.feedbackUser.findFirst({
    where: {
      email: user.email,
      organizationId: authUser.organizationId,
    },
    select: { id: true },
  });

  if (!existingFeedbackUser) {
    await client.feedbackUser.create({
      data: {
        email: user.email,
        name: userName,
        imageUrl: user.user_metadata.image_url ?? "",
        organizationId: authUser.organizationId,
        feedbackOrganizationId: feedbackOrganization.id,
      },
      select: { id: true },
    });
  }
};

const handleOrganizationDelete = async (organization: Organization) => {
  if (!organization.polarSubscriptionId) {
    return;
  }

  await polar.subscriptions.update({
    id: organization.polarSubscriptionId,
    subscriptionUpdate: {
      cancelAtPeriodEnd: true,
    },
  });

  log.info(
    `Polar subscription ${organization.polarSubscriptionId} has been canceled`
  );
};

export const registerDatabaseMiddleware = (client: PrismaClient) => {
  const middlewareClient = client as PrismaClient & {
    $use: (
      handler: (
        params: { model?: string; action: string },
        next: (params: unknown) => Promise<unknown>
      ) => Promise<unknown>
    ) => void;
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
  middlewareClient.$use(async (params, next) => {
    const result = await next(params);

    if (params.model === "Feedback" && params.action === "create") {
      runAsync("feedback.create", () =>
        handleFeedbackCreate(client, result as Feedback)
      );
    }

    if (params.model === "Feature" && params.action === "create") {
      runAsync("feature.create", () =>
        handleFeatureCreate(client, result as Feature)
      );
    }

    if (params.model === "Interview" && params.action === "create") {
      runAsync("interview.create", () =>
        handleInterviewCreate(client, result as Interview)
      );
    }

    if (params.model === "SupportTicket" && params.action === "create") {
      runAsync("supportTicket.create", () =>
        handleSupportTicketCreate(client, result as SupportTicket)
      );
    }

    if (
      params.model === "AuthUser" &&
      (params.action === "create" || params.action === "update")
    ) {
      runAsync("authUser.upsert", () =>
        handleAuthUserUpsert(client, result as AuthUser)
      );
    }

    if (params.model === "Organization" && params.action === "delete") {
      runAsync("organization.delete", async () => {
        const organization = result as Organization;
        await handleOrganizationDelete(organization);
      });
    }

    return result;
  });
};
