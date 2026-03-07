import "server-only";
import { log } from "@repo/observability/log";
import {
  fetchFullStoryInsights,
  fetchHotjarInsights,
  type SessionRecordingInsightPayload,
} from "@repo/session-recordings";
import { decryptApiKey } from "./ai-keys";
import { database } from "./database";
import type { Prisma, PrismaClient } from "./prisma/client";

type Provider = "FULLSTORY" | "HOTJAR";

type SessionRecordingConnector = {
  readonly provider: Provider;
  readonly organizationId: string;
  readonly encryptedKey: string;
  readonly config: Record<string, unknown> | null;
  readonly lastSyncedAt: Date | null;
};

const getRange = (connector: SessionRecordingConnector) => {
  const to = new Date();
  const from =
    connector.lastSyncedAt ?? new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);

  return { from, to };
};

const toIso = (date: Date) => date.toISOString();

const normalizeInsights = (
  connector: SessionRecordingConnector,
  insights: SessionRecordingInsightPayload[]
) =>
  insights.map((insight) => ({
    organizationId: connector.organizationId,
    source: connector.provider,
    insightType: insight.type,
    occurredAt: new Date(insight.occurredAt),
    pageUrl: insight.pageUrl ?? null,
    description: insight.description ?? null,
    severity: insight.severity ?? null,
    externalId: insight.externalId ?? null,
    raw: (insight.raw ?? undefined) as Prisma.InputJsonValue | undefined,
  }));

const syncProvider = async (
  client: PrismaClient,
  connector: SessionRecordingConnector
) => {
  const apiKey = decryptApiKey(connector.encryptedKey);
  const range = getRange(connector);

  let insights: SessionRecordingInsightPayload[] = [];

  if (connector.provider === "HOTJAR") {
    const siteId = String(connector.config?.siteId ?? "");

    if (!siteId) {
      throw new Error("Hotjar connector requires site ID");
    }

    insights = await fetchHotjarInsights({
      apiKey,
      siteId,
      from: toIso(range.from),
      to: toIso(range.to),
    });
  }

  if (connector.provider === "FULLSTORY") {
    insights = await fetchFullStoryInsights({
      apiKey,
      from: toIso(range.from),
      to: toIso(range.to),
    });
  }

  let ingested = 0;

  for (const insight of insights) {
    const externalId = insight.externalId ?? null;

    if (!externalId) {
      continue;
    }

    const existing = await client.sessionRecordingInsight.findUnique({
      where: {
        organizationId_source_externalId: {
          organizationId: connector.organizationId,
          source: connector.provider,
          externalId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    const normalized = normalizeInsights(connector, [insight])[0];

    if (normalized) {
      await client.sessionRecordingInsight.create({
        data: normalized,
        select: { id: true },
      });
      ingested += 1;
    }
  }

  await client.organization.update({
    where: { id: connector.organizationId },
    data: {
      sessionRecordingLastSyncedAt: range.to,
    },
    select: { id: true },
  });

  return ingested;
};

export const syncSessionRecordingInsights = async () => {
  const organizations = await database.organization.findMany({
    where: {
      sessionRecordingProvider: { in: ["FULLSTORY", "HOTJAR"] },
      sessionRecordingEncryptedKey: { not: null },
    },
    select: {
      id: true,
      sessionRecordingProvider: true,
      sessionRecordingEncryptedKey: true,
      sessionRecordingConfig: true,
      sessionRecordingLastSyncedAt: true,
    },
  });

  for (const org of organizations) {
    const syncLog = await database.sessionRecordingSyncLog.create({
      data: {
        organizationId: org.id,
        provider: org.sessionRecordingProvider as Provider,
        status: "RUNNING",
        startedAt: new Date(),
      },
      select: { id: true },
    });

    try {
      const ingested = await syncProvider(database, {
        provider: org.sessionRecordingProvider as Provider,
        organizationId: org.id,
        encryptedKey: org.sessionRecordingEncryptedKey as string,
        config: (org.sessionRecordingConfig as Record<string, unknown>) ?? null,
        lastSyncedAt: org.sessionRecordingLastSyncedAt,
      });

      await database.sessionRecordingSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: "SUCCESS",
          finishedAt: new Date(),
          insightsIngested: ingested,
          error: null,
        },
        select: { id: true },
      });
    } catch (error) {
      log.error("Session recording sync failed", error as Record<string, unknown>);

      await database.sessionRecordingSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: "ERROR",
          finishedAt: new Date(),
          error: error instanceof Error ? error.message : String(error),
        },
        select: { id: true },
      });
    }
  }
};
