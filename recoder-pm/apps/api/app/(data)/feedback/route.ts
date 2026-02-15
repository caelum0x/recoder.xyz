import { database } from "@repo/backend/database";
import type {
  FeedbackOrganization,
  FeedbackUser,
} from "@repo/backend/prisma/client";
import { textToContent } from "@repo/editor/lib/tiptap";
import { MAX_FREE_FEEDBACK } from "@repo/lib/consts";
import { getGravatarUrl } from "@repo/lib/gravatar";
import { NextResponse } from "next/server";
import { z } from "zod/v3";

const FeedbackProperties = z.object({
  title: z.string(),
  text: z.string(),
  user: z
    .object({
      name: z.string(),
      email: z.string(),
    })
    .optional(),
  organization: z
    .object({
      name: z.string(),
      domain: z.string(),
    })
    .optional(),
});

const getFeedbackOrganization = async ({
  organization,
  apiKey,
}: {
  organization?: { name: string; domain: string };
  apiKey: { id: string; organization: { id: string } };
}): Promise<{ id: FeedbackOrganization["id"] } | null> => {
  if (!organization) {
    return null;
  }

  const existing = await database.feedbackOrganization.findFirst({
    where: {
      domain: organization.domain,
      organizationId: apiKey.organization.id,
    },
    select: { id: true },
  });

  if (existing) {
    return existing;
  }

  return database.feedbackOrganization.create({
    data: {
      domain: organization.domain,
      name: organization.name,
      organizationId: apiKey.organization.id,
      source: "API",
      apiKeyId: apiKey.id,
    },
    select: { id: true },
  });
};

const getFeedbackUser = async ({
  user,
  apiKey,
  feedbackOrganizationId,
}: {
  user?: { name: string; email: string };
  apiKey: { id: string; organization: { id: string } };
  feedbackOrganizationId?: string | null;
}): Promise<{
  id: FeedbackUser["id"];
  feedbackOrganizationId: FeedbackUser["feedbackOrganizationId"];
} | null> => {
  if (!user) {
    return null;
  }

  const existing = await database.feedbackUser.findFirst({
    where: {
      email: user.email,
      organizationId: apiKey.organization.id,
    },
    select: { id: true, feedbackOrganizationId: true },
  });

  if (!existing) {
    return database.feedbackUser.create({
      data: {
        email: user.email,
        name: user.name,
        organizationId: apiKey.organization.id,
        feedbackOrganizationId,
        imageUrl: await getGravatarUrl(user.email),
        source: "API",
        apiKeyId: apiKey.id,
      },
      select: { id: true, feedbackOrganizationId: true },
    });
  }

  if (!existing.feedbackOrganizationId && feedbackOrganizationId) {
    return database.feedbackUser.update({
      where: { id: existing.id },
      data: { feedbackOrganizationId },
      select: { id: true, feedbackOrganizationId: true },
    });
  }

  return existing;
};

export const POST = async (request: Request): Promise<Response> => {
  const body = (await request.json()) as unknown;
  const parse = FeedbackProperties.safeParse(body);
  const authorization = request.headers.get("Authorization");
  const key = authorization?.split("Bearer ")[1];

  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = await database.apiKey.findFirst({
    where: { key },
    select: {
      id: true,
      organization: {
        select: {
          id: true,
          polarSubscriptionId: true,
        },
      },
    },
  });

  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!apiKey.organization.polarSubscriptionId) {
    return NextResponse.json(
      {
        error:
          "You need to have a subscription to use the API. Please upgrade your plan.",
      },
      { status: 403 }
    );
  }

  if (!parse.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const feedbackOrganization = await getFeedbackOrganization({
    organization: parse.data.organization,
    apiKey,
  });

  const feedbackUser = await getFeedbackUser({
    user: parse.data.user,
    apiKey,
    feedbackOrganizationId: feedbackOrganization?.id,
  });

  const organization = await database.organization.findFirst({
    where: { id: apiKey.organization.id },
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
    throw new Error(
      "You have reached the maximum number of feedback for your plan. Please upgrade to add more feedback."
    );
  }

  await database.feedback.create({
    data: {
      content: textToContent(parse.data.text),
      organizationId: apiKey.organization.id,
      title: parse.data.title,
      feedbackUserId: feedbackUser ? feedbackUser.id : null,
      source: "API",
      apiKeyId: apiKey.id,
    },
    select: { id: true },
  });

  return NextResponse.json({ success: true });
};
