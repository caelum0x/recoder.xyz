import { createClient } from "@repo/atlassian";
import { database } from "@repo/backend/database";
import { log } from "@repo/observability/log";
import { NextResponse } from "next/server";

export const maxDuration = 300;
export const revalidate = 0;
export const dynamic = "force-dynamic";

const loadWebhookIds = async (installation: {
  accessToken: string;
  email: string;
  siteUrl: string;
}): Promise<number[]> => {
  const atlassian = createClient(installation);
  const webhookIds: number[] = [];

  let startAt = 0;
  const maxResults = 100;
  let isLast = false;

  while (!isLast) {
    const response = await atlassian.GET("/rest/api/2/webhook", {
      params: {
        query: {
          startAt,
          maxResults,
        },
      },
    });

    if (response.error || !response.data) {
      throw new Error("Failed to list Atlassian webhooks.");
    }

    const data = response.data as {
      values?: Array<{ id?: number }>;
      isLast?: boolean;
      maxResults?: number;
      startAt?: number;
    };

    for (const webhook of data.values ?? []) {
      if (typeof webhook.id === "number") {
        webhookIds.push(webhook.id);
      }
    }

    if (data.isLast) {
      isLast = true;
    } else {
      startAt += data.maxResults ?? maxResults;
    }
  }

  return webhookIds;
};

export const GET = async (): Promise<Response> => {
  const installations = await database.atlassianInstallation.findMany({
    select: {
      id: true,
      organizationId: true,
      accessToken: true,
      email: true,
      siteUrl: true,
    },
  });

  if (!installations.length) {
    return NextResponse.json({ message: "No Atlassian installations." });
  }

  let refreshed = 0;
  let failed = 0;

  for (const installation of installations) {
    try {
      const webhookIds = await loadWebhookIds(installation);

      if (!webhookIds.length) {
        continue;
      }

      const atlassian = createClient(installation);
      const response = await atlassian.PUT("/rest/api/2/webhook/refresh", {
        body: {
          webhookIds,
        },
      });

      if (response.error) {
        failed += 1;
        log.warn("Atlassian webhook refresh failed", {
          installationId: installation.id,
          organizationId: installation.organizationId,
        });
        continue;
      }

      refreshed += 1;
    } catch (error) {
      failed += 1;
      log.error("Atlassian webhook refresh crashed", {
        installationId: installation.id,
        organizationId: installation.organizationId,
        error,
      });
    }
  }

  return NextResponse.json({
    message: "Atlassian webhook refresh complete.",
    total: installations.length,
    refreshed,
    failed,
  });
};
