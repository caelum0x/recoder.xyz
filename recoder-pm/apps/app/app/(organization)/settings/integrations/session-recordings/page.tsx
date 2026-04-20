import { decryptApiKey, maskApiKey } from "@repo/backend/ai-keys";
import { currentOrganizationId } from "@repo/backend/auth/utils";
import { formatDate } from "@repo/lib/format";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";
import { SessionRecordingSettings } from "./components/session-recording-settings";

export const metadata: Metadata = createMetadata({
  title: "Session Recordings",
  description:
    "Connect FullStory or Hotjar to ingest session recording insights.",
});

export const dynamic = "force-dynamic";
const SessionRecordingsSettingsPage = async () => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return notFound();
  }

  const organization = await database.organization.findUnique({
    where: { id: organizationId },
    select: {
      sessionRecordingProvider: true,
      sessionRecordingEncryptedKey: true,
      sessionRecordingConfig: true,
      sessionRecordingLastSyncedAt: true,
    },
  });

  if (!organization) {
    return notFound();
  }

  const [insightStats, logs] = await Promise.all([
    database.sessionRecordingInsight.aggregate({
      where: { organizationId },
      _count: { _all: true },
      _max: { occurredAt: true },
    }),
    database.sessionRecordingSyncLog.findMany({
      where: { organizationId },
      orderBy: { startedAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        provider: true,
        startedAt: true,
        finishedAt: true,
        insightsIngested: true,
        error: true,
      },
    }),
  ]);

  let keyPreview: string | null = null;

  if (organization.sessionRecordingEncryptedKey) {
    try {
      keyPreview = maskApiKey(
        decryptApiKey(organization.sessionRecordingEncryptedKey)
      );
    } catch {
      keyPreview = null;
    }
  }

  const config = (organization.sessionRecordingConfig ?? {}) as Record<
    string,
    unknown
  >;

  return (
    <SessionRecordingSettings
      config={config}
      keyPreview={keyPreview}
      lastInsightAt={insightStats._max.occurredAt}
      lastSyncedAt={organization.sessionRecordingLastSyncedAt}
      logs={logs.map((log) => ({
        id: log.id,
        status: log.status,
        provider: log.provider,
        startedAt: formatDate(log.startedAt),
        finishedAt: log.finishedAt ? formatDate(log.finishedAt) : null,
        insightsIngested: log.insightsIngested ?? 0,
        error: log.error ?? null,
      }))}
      provider={organization.sessionRecordingProvider}
      totalInsights={insightStats._count._all}
    />
  );
};

export default SessionRecordingsSettingsPage;
