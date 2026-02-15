import { createClient } from "@repo/atlassian";
import { database } from "@repo/backend/database";
import type { release_state } from "@repo/backend/prisma/client";
import { parseError } from "@repo/lib/parse-error";
import { log } from "@repo/observability/log";
import { NextResponse } from "next/server";
import { z } from "zod/v3";

export const maxDuration = 300;
export const revalidate = 0;
export const dynamic = "force-dynamic";

const webhookEventSchema = z.object({
  matchedWebhookIds: z.array(z.number()),
  issue: z.object({
    id: z.string(),
    key: z.string(),
  }),
  webhookEvent: z.enum(["jira:issue_created", "jira:issue_updated"]),
});

const fieldsSchema = z
  .object({
    summary: z.string(),
    status: z.object({
      id: z.string(),
    }),
    fixVersions: z.array(
      z.object({
        self: z.string().url(),
        id: z.string(),
        description: z.string().optional(),
        name: z.string(),
        archived: z.boolean(),
        released: z.boolean(),
        releaseDate: z.string().optional(),
      })
    ),
    description: z.unknown(),
  })
  .catchall(z.unknown());

const buildIssueFields = (
  fieldMappings: Awaited<
    ReturnType<typeof database.installationFieldMapping.findMany>
  >
) => [
  "summary",
  "status",
  "fixVersions",
  "description",
  ...fieldMappings.map((field) => field.externalId),
];

const parseDateString = (value: unknown) => {
  if (typeof value !== "string") {
    return;
  }

  const parsed = new Date(value);
  return parsed.toString() === "Invalid Date" ? undefined : parsed;
};

const resolveCustomDates = (
  fieldMappings: Awaited<
    ReturnType<typeof database.installationFieldMapping.findMany>
  >,
  fields: z.infer<typeof fieldsSchema>
) => {
  let startAt: Date | undefined;
  let endAt: Date | undefined;

  for (const field of fieldMappings) {
    const fieldValue = fields[field.externalId];

    if (!fieldValue) {
      continue;
    }

    if (field.internalId === "STARTAT") {
      startAt = parseDateString(fieldValue);
    }

    if (field.internalId === "ENDAT") {
      endAt = parseDateString(fieldValue);
    }
  }

  return { startAt, endAt };
};

const resolveReleaseId = async ({
  fixVersion,
  organizationId,
}: {
  fixVersion: z.infer<typeof fieldsSchema>["fixVersions"][number];
  organizationId: string;
}) => {
  let existingRelease = await database.release.findFirst({
    where: {
      jiraId: fixVersion.id,
      organizationId,
    },
    select: {
      id: true,
    },
  });

  let state: release_state | undefined;

  if (fixVersion.released) {
    state = "COMPLETED";
  } else if (fixVersion.archived) {
    state = "CANCELLED";
  }

  if (existingRelease) {
    await database.release.update({
      where: {
        organizationId,
        jiraId: fixVersion.id,
      },
      data: {
        title: fixVersion.name,
        description: fixVersion.description,
        endAt: fixVersion.releaseDate
          ? new Date(fixVersion.releaseDate)
          : undefined,
        state,
      },
      select: {
        id: true,
      },
    });

    return existingRelease.id;
  }

  existingRelease = await database.release.create({
    data: {
      title: fixVersion.name,
      description: fixVersion.description,
      endAt: fixVersion.releaseDate
        ? new Date(fixVersion.releaseDate)
        : undefined,
      jiraId: fixVersion.id,
      state,
      organizationId,
    },
    select: {
      id: true,
    },
  });

  return existingRelease.id;
};

const handleIssueEvent = async (
  event: z.infer<typeof webhookEventSchema>,
  organizationId: string
) => {
  const [installation, fieldMappings] = await Promise.all([
    database.atlassianInstallation.findFirst({
      where: {
        organizationId,
      },
      select: {
        accessToken: true,
        email: true,
        siteUrl: true,
      },
    }),
    database.installationFieldMapping.findMany({
      where: {
        organizationId,
        type: "JIRA",
      },
    }),
  ]);

  if (!installation) {
    throw new Error("Installation not found");
  }

  const issueFields = buildIssueFields(fieldMappings);

  const atlassian = createClient(installation);
  const issue = await atlassian.GET("/rest/api/2/issue/{issueIdOrKey}", {
    params: {
      path: {
        issueIdOrKey: event.issue.key,
      },
      query: {
        fields: issueFields,
      },
    },
  });

  if (issue.error) {
    throw new Error(`Failed to get issue: ${event.issue.key}`);
  }

  if (!issue.data?.fields) {
    throw new Error(
      `Issue response does not contain fields: ${event.issue.key}`
    );
  }

  const validationResult = fieldsSchema.safeParse(issue.data.fields);

  if (!validationResult.success) {
    log.error("Invalid issue fields", {
      errors: validationResult.error.errors,
    });
    throw new Error(`Invalid issue fields for issue: ${event.issue.key}`);
  }

  const featureConnection = await database.featureConnection.findFirst({
    where: {
      externalId: event.issue.id,
      type: "JIRA",
      organizationId,
    },
    select: {
      id: true,
      featureId: true,
      organizationId: true,
    },
  });

  if (!featureConnection) {
    log.info("🧑‍💻 FeatureConnection not found");
    return NextResponse.json(
      { message: "FeatureConnection not found" },
      { status: 200 }
    );
  }

  // Fields to potentially update
  let releaseId: string | undefined;
  let statusId: string | undefined;
  const title = validationResult.data.summary;

  const fixVersion = validationResult.data.fixVersions.at(0);

  if (fixVersion) {
    log.info(
      `🧑‍💻 Updating release version for feature ${featureConnection.featureId}`
    );

    releaseId = await resolveReleaseId({
      fixVersion,
      organizationId: featureConnection.organizationId,
    });
  }

  log.info(`🧑‍💻 Updating status for feature ${featureConnection.featureId}`);
  const installationStatusMapping =
    await database.installationStatusMapping.findFirst({
      where: {
        organizationId: featureConnection.organizationId,
        eventId: validationResult.data.status.id,
        type: "JIRA",
      },
      select: { featureStatusId: true },
    });

  if (installationStatusMapping) {
    statusId = installationStatusMapping.featureStatusId;
  }

  log.info(
    `🧑‍💻 Updating feature fields: ${JSON.stringify({
      title,
      releaseId,
      statusId,
    })}`
  );

  // Handle custom fields
  const { startAt, endAt } = resolveCustomDates(
    fieldMappings,
    validationResult.data
  );

  await database.feature.update({
    where: { id: featureConnection.featureId },
    data: {
      title,
      releaseId,
      statusId,
      startAt,
      endAt,
      content:
        validationResult.data.description &&
        typeof validationResult.data.description === "object"
          ? (validationResult.data.description as object)
          : undefined,
    },
  });

  return NextResponse.json(
    { message: "🧑‍💻 Issue event handled" },
    { status: 200 }
  );
};

type JiraWebhookContext = {
  params: Promise<{
    slug: string;
  }>;
};

export const POST = async (
  request: Request,
  context: JiraWebhookContext
): Promise<Response> => {
  try {
    const { slug } = await context.params;
    const data = await request.json();

    const organization = await database.organization.findFirst({
      where: { slug },
    });

    if (!organization) {
      return NextResponse.json(
        { message: "Organization not found" },
        { status: 404 }
      );
    }

    const validationResult = webhookEventSchema.safeParse(data);
    if (!validationResult.success) {
      log.error("Invalid webhook event data", {
        errors: validationResult.error.errors,
      });
      return NextResponse.json(
        { message: "Invalid webhook event data" },
        { status: 400 }
      );
    }

    const validatedData = validationResult.data;

    switch (validatedData.webhookEvent) {
      case "jira:issue_created":
      case "jira:issue_updated": {
        return handleIssueEvent(data, organization.id);
      }
      default: {
        log.info("🧑‍💻 Unhandled Atlassian Issue event");
        return NextResponse.json(
          { message: "🧑‍💻 Unhandled Atlassian Issue event" },
          { status: 200 }
        );
      }
    }
  } catch (error) {
    const message = parseError(error);

    return NextResponse.json({ message }, { status: 500 });
  }
};
