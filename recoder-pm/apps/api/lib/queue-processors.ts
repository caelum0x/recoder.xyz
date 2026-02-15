import { getOrganizationTextModel } from "@repo/backend/ai";
import { synthesizeAiInsights } from "@repo/backend/ai-insights";
import { withOrganizationSystemPrompt } from "@repo/backend/ai-prompts";
import { detectContradictions } from "@repo/backend/contradiction-detector";
import { database, getJsonColumnFromTable } from "@repo/backend/database";
import { runOpportunityScoring } from "@repo/backend/opportunity-scoring";
import { generateProposalPrd } from "@repo/backend/prd-generator";
import { generateProposals } from "@repo/backend/proposal-generator";
import { contentToText } from "@repo/editor/lib/tiptap";
import { log } from "@repo/observability/log";
import { generateObject, generateText } from "ai";
import { subDays } from "date-fns";
import { z } from "zod/v3";

export const processFeedbackSentiment = async ({
  feedbackId,
  organizationId,
}: {
  feedbackId: string;
  organizationId: string;
}) => {
  const content = await getJsonColumnFromTable(
    "feedback",
    "content",
    feedbackId
  );

  if (!content) {
    return;
  }

  if (
    JSON.stringify(content) ===
    JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })
  ) {
    return;
  }

  const { object } = await generateObject({
    model: await getOrganizationTextModel(organizationId),
    system: await withOrganizationSystemPrompt(
      organizationId,
      [
        "You are an AI that detect the sentiment of user feedback.",
        "You are given a user feedback message and a prompt to perform sentiment analysis on it.",
      ].join("\n")
    ),
    prompt: content ? contentToText(content) : "No content provided.",
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
};

export const processFeedbackAnalysis = async ({
  feedbackId,
  organizationId,
}: {
  feedbackId: string;
  organizationId: string;
}) => {
  const content = await getJsonColumnFromTable(
    "feedback",
    "content",
    feedbackId
  );

  if (!content) {
    return;
  }

  const { object } = await generateObject({
    model: await getOrganizationTextModel(organizationId),
    system: await withOrganizationSystemPrompt(
      organizationId,
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
    prompt: contentToText(content),
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
};

export const processFeatureRice = async ({
  featureId,
  organizationId,
}: {
  featureId: string;
  organizationId: string;
}) => {
  const [organization, feature] = await Promise.all([
    database.organization.findUnique({
      where: { id: organizationId },
      select: { productDescription: true },
    }),
    database.feature.findUnique({
      where: { id: featureId },
      select: {
        id: true,
        title: true,
        aiRice: { select: { id: true } },
      },
    }),
  ]);

  if (!(organization && feature)) {
    return;
  }

  if (feature.aiRice) {
    return;
  }

  const content = await getJsonColumnFromTable("feature", "content", featureId);

  if (!content) {
    return;
  }

  const { object } = await generateObject({
    model: await getOrganizationTextModel(organizationId),
    system: await withOrganizationSystemPrompt(
      organizationId,
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

  await database.feature.update({
    where: { id: featureId },
    data: {
      aiRice: {
        create: {
          reach: object.reach.score,
          impact: object.impact.score,
          confidence: object.confidence.score,
          effort: object.effort.score,
          reachReason: object.reach.reason,
          impactReason: object.impact.reason,
          confidenceReason: object.confidence.reason,
          effortReason: object.effort.reason,
          organizationId,
        },
      },
    },
    select: { id: true },
  });
};

export const processDigestGenerate = async () => {
  log.info("🤖 Looking for organizations to create digests for...");

  const yesterday = subDays(new Date(), 1);
  const where = {
    createdAt: {
      gte: yesterday,
    },
  };

  const organizations = await database.organization.findMany({
    where: {
      polarSubscriptionId: { not: null },
      digests: {
        none: where,
      },
    },
    take: 10,
    select: {
      id: true,
      feedback: {
        where,
        select: {
          title: true,
          feedbackUser: {
            select: {
              name: true,
              feedbackOrganization: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
      features: {
        where,
        select: {
          title: true,
          product: {
            select: {
              name: true,
            },
          },
          group: {
            select: {
              name: true,
            },
          },
        },
      },
      changelog: {
        where,
        select: {
          title: true,
        },
      },
      initiatives: {
        where,
        select: {
          title: true,
        },
      },
      initiativePages: {
        where,
        select: {
          title: true,
        },
      },
      initiativeCanvases: {
        where,
        select: {
          title: true,
        },
      },
      portalFeatureVotes: {
        where,
        select: {
          portalFeature: {
            select: {
              title: true,
            },
          },
          feedbackUser: {
            select: {
              name: true,
              feedbackOrganization: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
      releases: {
        where: {
          endAt: {
            gte: new Date(),
          },
        },
        take: 1,
        orderBy: {
          endAt: "asc",
        },
        select: {
          title: true,
        },
      },
    },
  });

  if (!organizations.length) {
    log.error("📰 No organizations found.");
    return;
  }

  log.info(
    `🤖 Found ${organizations.length} organizations, creating digests...`
  );

  const transactions = await Promise.all(
    organizations.map(async (organization) => {
      const prompt = [
        "Feedback created:",
        JSON.stringify(organization.feedback),
        "------",
        "Features created:",
        JSON.stringify(organization.features),
        "------",
        "Changelogs created:",
        JSON.stringify(organization.changelog),
        "------",
        "Next release:",
        JSON.stringify(organization.releases),
      ].join("\n");

      const model = await getOrganizationTextModel(organization.id);

      const [text, summary] = await Promise.all([
        generateText({
          model,
          system: await withOrganizationSystemPrompt(
            organization.id,
            [
              "You are an AI that creates a digest of the most important things that happened in the last 24 hours.",
              "Be as comprehensive as possible.",
              "Use markdown formatting to highlight important parts of the digest.",
            ].join("\n")
          ),
          prompt,
        }),
        generateText({
          model,
          system: await withOrganizationSystemPrompt(
            organization.id,
            [
              "You are an AI that creates a digest of the most important things that happened in the last 24 hours.",
              "You have maximum 2000 characters to describe the digest.",
              "Do not include any markdown formatting.",
            ].join("\n")
          ),
          prompt,
        }),
      ]);

      return database.digest.create({
        data: {
          text: text.text,
          organizationId: organization.id,
          summary: summary.text,
        },
      });
    })
  );

  await Promise.all(transactions);
};

export const processInsightsSynthesize = async () => {
  await synthesizeAiInsights();
};

export const processProposalPrd = async ({
  proposalId,
}: {
  proposalId: string;
}) => {
  await generateProposalPrd(proposalId);
};

export const processContradictions = async () => {
  await detectContradictions();
};

export const processOpportunityScoring = async () => {
  await runOpportunityScoring();
};

export const processProposalsGenerate = async () => {
  await generateProposals();
};
