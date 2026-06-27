import { decryptApiKey, maskApiKey } from "@repo/backend/ai-keys";
import { currentOrganizationId } from "@repo/backend/auth/utils";
import { formatDate } from "@repo/lib/format";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";
import { AnalyticsConnectorSettings } from "./components/analytics-connector-settings";

export const metadata: Metadata = createMetadata({
  title: "Product Analytics",
  description:
    "Connect Mixpanel, Amplitude, or PostHog to ingest product usage data.",
});

export const dynamic = "force-dynamic";
const AnalyticsIntegrationSettings = async () => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return notFound();
  }

  const connectors = await database.analyticsConnector.findMany({
    where: { organizationId },
  });

  const [stats, logs] = await Promise.all([
    database.analyticsEvent.groupBy({
      by: ["connectorId"],
      where: { organizationId },
      _count: { _all: true },
      _max: { occurredAt: true },
    }),
    database.analyticsSyncLog.findMany({
      where: { organizationId },
      orderBy: { startedAt: "desc" },
      take: 100,
      select: {
        id: true,
        connectorId: true,
        status: true,
        eventsIngested: true,
        startedAt: true,
        finishedAt: true,
        error: true,
      },
    }),
  ]);

  const statsByConnector = new Map(
    stats.map((item) => [
      item.connectorId,
      {
        count: item._count._all,
        lastEventAt: item._max.occurredAt ?? null,
      },
    ])
  );

  const logsByConnector = new Map<string, typeof logs>();
  for (const log of logs) {
    const existing = logsByConnector.get(log.connectorId) ?? [];
    existing.push(log);
    logsByConnector.set(log.connectorId, existing);
  }

  const connectorData = connectors.map((connector) => {
    let keyPreview: string | null = null;

    if (connector.encryptedKey) {
      try {
        keyPreview = maskApiKey(decryptApiKey(connector.encryptedKey));
      } catch {
        keyPreview = null;
      }
    }

    const config = (connector.config ?? {}) as Record<string, unknown>;
    const statsEntry = statsByConnector.get(connector.id);
    const connectorLogs = logsByConnector.get(connector.id) ?? [];

    return {
      provider: connector.provider,
      status: connector.status,
      baseUrl: (config.baseUrl as string | undefined) ?? "",
      apiKey: (config.apiKey as string | undefined) ?? "",
      projectId: (config.projectId as string | undefined) ?? "",
      lastSyncedAt: connector.lastSyncedAt
        ? formatDate(connector.lastSyncedAt)
        : null,
      eventsCount: statsEntry?.count ?? 0,
      lastEventAt: statsEntry?.lastEventAt
        ? formatDate(statsEntry.lastEventAt)
        : null,
      keyPreview,
      logs: connectorLogs.map((entry) => ({
        id: entry.id,
        status: entry.status,
        eventsIngested: entry.eventsIngested ?? 0,
        startedAt: formatDate(entry.startedAt),
        finishedAt: entry.finishedAt ? formatDate(entry.finishedAt) : null,
        error: entry.error ?? null,
      })),
    };
  });

  return <AnalyticsConnectorSettings connectors={connectorData} />;
};

export default AnalyticsIntegrationSettings;
