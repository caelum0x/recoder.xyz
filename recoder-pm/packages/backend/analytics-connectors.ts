import "server-only";
import {
  type AnalyticsEventPayload,
  fetchAmplitudeEvents,
  fetchMixpanelEvents,
  fetchPosthogEvents,
} from "@repo/analytics-connectors";
import { log } from "@repo/observability/log";
import { decryptApiKey } from "./ai-keys";
import { database } from "./database";
import type { AnalyticsConnector, PrismaClient } from "./prisma/client";

type ConnectorConfig = {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly projectId?: string;
  readonly maxEvents?: number;
};

const getSyncRange = (connector: AnalyticsConnector) => {
  const to = new Date();
  const from =
    connector.lastSyncedAt ?? new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);

  return { from, to };
};

const normalizeEvents = (
  connector: AnalyticsConnector,
  events: AnalyticsEventPayload[]
) =>
  events.map((event) => ({
    organizationId: connector.organizationId,
    connectorId: connector.id,
    provider: connector.provider,
    externalId: event.externalId ?? null,
    name: event.name,
    occurredAt: event.occurredAt,
    userId: event.userId ?? null,
    userEmail: event.userEmail ?? null,
    sessionId: event.sessionId ?? null,
    properties: event.properties ?? undefined,
    raw: event.raw ?? undefined,
  }));

const syncConnectorEvents = async (
  client: PrismaClient,
  connector: AnalyticsConnector
) => {
  const config = (connector.config ?? {}) as ConnectorConfig;
  const decryptedKey = connector.encryptedKey
    ? decryptApiKey(connector.encryptedKey)
    : null;

  if (!decryptedKey) {
    throw new Error("Missing analytics connector API key");
  }

  const range = getSyncRange(connector);
  let events: AnalyticsEventPayload[] = [];

  if (connector.provider === "MIXPANEL") {
    events = await fetchMixpanelEvents(
      {
        apiSecret: decryptedKey,
        baseUrl: config.baseUrl,
      },
      range
    );
  }

  if (connector.provider === "AMPLITUDE") {
    if (!config.apiKey) {
      throw new Error("Amplitude connector requires an API key");
    }

    events = await fetchAmplitudeEvents(
      {
        apiKey: config.apiKey,
        apiSecret: decryptedKey,
        baseUrl: config.baseUrl,
      },
      range
    );
  }

  if (connector.provider === "POSTHOG") {
    if (!config.projectId) {
      throw new Error("PostHog connector requires a project ID");
    }

    events = await fetchPosthogEvents(
      {
        apiKey: decryptedKey,
        projectId: config.projectId,
        baseUrl: config.baseUrl,
      },
      range
    );
  }

  const maxEvents = config.maxEvents ?? 5000;
  const trimmed = events.slice(0, maxEvents);

  if (trimmed.length > 0) {
    await client.analyticsEvent.createMany({
      data: normalizeEvents(connector, trimmed),
      skipDuplicates: true,
    });
  }

  await client.analyticsConnector.update({
    where: { id: connector.id },
    data: { lastSyncedAt: range.to, status: "ACTIVE" },
    select: { id: true },
  });

  return trimmed.length;
};

export const syncAnalyticsConnector = async (connectorId: string) => {
  const connector = await database.analyticsConnector.findUnique({
    where: { id: connectorId },
  });

  if (!connector) {
    return;
  }

  const syncLog = await database.analyticsSyncLog.create({
    data: {
      organizationId: connector.organizationId,
      connectorId: connector.id,
      provider: connector.provider,
      status: "RUNNING",
      startedAt: new Date(),
    },
    select: { id: true },
  });

  try {
    const eventsIngested = await syncConnectorEvents(database, connector);

    await database.analyticsSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        eventsIngested,
        error: null,
      },
      select: { id: true },
    });
  } catch (error) {
    log.error("Analytics connector sync failed", error);

    await database.analyticsSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      },
      select: { id: true },
    });

    await database.analyticsConnector.update({
      where: { id: connector.id },
      data: { status: "ERROR" },
      select: { id: true },
    });
  }
};

export const syncAllAnalyticsConnectors = async () => {
  const connectors = await database.analyticsConnector.findMany({
    where: { status: { in: ["ACTIVE", "ERROR"] } },
  });

  for (const connector of connectors) {
    await syncAnalyticsConnector(connector.id);
  }
};
