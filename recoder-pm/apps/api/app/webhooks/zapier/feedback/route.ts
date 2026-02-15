import { database } from "@repo/backend/database";
import type {
  FeedbackOrganization,
  FeedbackUser,
} from "@repo/backend/prisma/client";
import { textToContent } from "@repo/editor/lib/tiptap";
import { MAX_FREE_FEEDBACK } from "@repo/lib/consts";
import { getGravatarUrl } from "@repo/lib/gravatar";
import { friendlyWords } from "friendlier-words";
import { NextResponse } from "next/server";
import { z } from "zod/v3";

const FeedbackProperties = z.object({
  title: z.string(),
  text: z.string(),
  user_name: z.string().optional(),
  user_email: z.string().optional(),
  organization_name: z.string().optional(),
  organization_domain: z.string().optional(),
});

const getApiKey = (request: Request) => {
  const authorization = request.headers.get("Authorization");
  const key = authorization?.split("Bearer ")[1];

  if (!key) {
    return null;
  }

  return database.apiKey.findFirst({
    where: { key },
    select: {
      id: true,
      organizationId: true,
    },
  });
};

const findOrCreateFeedbackOrganization = async ({
  organizationDomain,
  organizationName,
  apiKey,
}: {
  organizationDomain?: string;
  organizationName?: string;
  apiKey: { id: string; organizationId: string };
}): Promise<{ id: FeedbackOrganization["id"] } | null> => {
  if (!(organizationDomain && organizationName)) {
    return null;
  }

  const existingOrganization = await database.feedbackOrganization.findFirst({
    where: {
      domain: organizationDomain,
      organizationId: apiKey.organizationId,
    },
    select: { id: true },
  });

  if (existingOrganization) {
    return existingOrganization;
  }

  return database.feedbackOrganization.create({
    data: {
      domain: organizationDomain,
      name: organizationName,
      organizationId: apiKey.organizationId,
      source: "API",
      apiKeyId: apiKey.id,
    },
    select: { id: true },
  });
};

const findOrCreateFeedbackUser = async ({
  email,
  name,
  apiKey,
  feedbackOrganizationId,
}: {
  email?: string;
  name?: string;
  apiKey: { id: string; organizationId: string };
  feedbackOrganizationId?: FeedbackUser["feedbackOrganizationId"];
}): Promise<{
  id: FeedbackUser["id"];
  feedbackOrganizationId: FeedbackUser["feedbackOrganizationId"];
} | null> => {
  if (!email) {
    return null;
  }

  const existingUser = await database.feedbackUser.findFirst({
    where: {
      email,
      organizationId: apiKey.organizationId,
    },
    select: { id: true, feedbackOrganizationId: true },
  });

  if (!existingUser) {
    return database.feedbackUser.create({
      data: {
        email,
        name: name ?? friendlyWords(2, " "),
        organizationId: apiKey.organizationId,
        feedbackOrganizationId,
        imageUrl: await getGravatarUrl(email),
        source: "API",
        apiKeyId: apiKey.id,
      },
      select: { id: true, feedbackOrganizationId: true },
    });
  }

  if (!existingUser.feedbackOrganizationId && feedbackOrganizationId) {
    return database.feedbackUser.update({
      where: { id: existingUser.id },
      data: { feedbackOrganizationId },
      select: { id: true, feedbackOrganizationId: true },
    });
  }

  return existingUser;
};

const enforceFeedbackLimit = async (organizationId: string) => {
  const organization = await database.organization.findFirst({
    where: { id: organizationId },
    select: {
      polarSubscriptionId: true,
      _count: {
        select: { feedback: true },
      },
    },
  });

  if (!organization) {
    throw new Error("Organization not found");
  }

  if (
    !organization.polarSubscriptionId &&
    organization._count.feedback >= MAX_FREE_FEEDBACK
  ) {
    throw new Error("FREE_LIMIT_REACHED");
  }
};

export const POST = async (request: Request): Promise<Response> => {
  const body = (await request.json()) as unknown;
  const parse = FeedbackProperties.safeParse(body);

  if (!parse.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const apiKey = await getApiKey(request);

  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const feedbackOrganization = await findOrCreateFeedbackOrganization({
    organizationDomain: parse.data.organization_domain,
    organizationName: parse.data.organization_name,
    apiKey,
  });

  const feedbackUser = await findOrCreateFeedbackUser({
    email: parse.data.user_email,
    name: parse.data.user_name,
    apiKey,
    feedbackOrganizationId: feedbackOrganization?.id,
  });

  try {
    await enforceFeedbackLimit(apiKey.organizationId);
  } catch (error) {
    if (error instanceof Error && error.message === "FREE_LIMIT_REACHED") {
      return new Response("Upgrade your subscription to create more feedback", {
        status: 402,
      });
    }

    throw error;
  }

  await database.feedback.create({
    data: {
      content: textToContent(parse.data.text),
      organizationId: apiKey.organizationId,
      title: parse.data.title,
      feedbackUserId: feedbackUser ? feedbackUser.id : null,
      source: "ZAPIER",
      apiKeyId: apiKey.id,
    },
    select: { id: true },
  });

  return NextResponse.json({ success: true });
};
