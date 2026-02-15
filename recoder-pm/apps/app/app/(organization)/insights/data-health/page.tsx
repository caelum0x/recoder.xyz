import { currentOrganizationId } from "@repo/backend/auth/utils";
import { Link } from "@repo/design-system/components/link";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Badge } from "@repo/design-system/components/ui/badge";
import { formatDate } from "@repo/lib/format";
import { createMetadata } from "@repo/seo/metadata";
import { subDays } from "date-fns";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";
import { SyncActions } from "./components/sync-actions";

export const metadata: Metadata = createMetadata({
  title: "Data Health",
  description:
    "Monitor ingestion freshness across analytics, support, and session recordings.",
});

const analyticsStatus = (status?: string | null) =>
  status === "ERROR" ? "destructive" : "secondary";

const getStaleBadge = (date?: Date | null) => {
  if (!date) {
    return "secondary" as const;
  }

  const staleCutoff = subDays(new Date(), 7);
  return date < staleCutoff ? ("destructive" as const) : ("secondary" as const);
};

const staleLabel = (date?: Date | null) => {
  if (!date) {
    return "No data";
  }

  const staleCutoff = subDays(new Date(), 7);
  return date < staleCutoff ? "Stale" : "Fresh";
};

const DataHealthPage = async () => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return notFound();
  }

  const [
    analyticsConnectors,
    analyticsLatest,
    sessionLatest,
    supportLatest,
    organization,
    sessionSyncLogs,
    supportInstallations,
  ] = await Promise.all([
    database.analyticsConnector.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        provider: true,
        status: true,
        lastSyncedAt: true,
      },
    }),
    database.analyticsEvent.findFirst({
      where: { organizationId },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    }),
    database.sessionRecordingInsight.findFirst({
      where: { organizationId },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    }),
    database.supportTicket.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    database.organization.findUnique({
      where: { id: organizationId },
      select: {
        sessionRecordingProvider: true,
        sessionRecordingLastSyncedAt: true,
      },
    }),
    database.sessionRecordingSyncLog.findMany({
      where: { organizationId },
      orderBy: { startedAt: "desc" },
      take: 5,
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
    database.zendeskInstallation.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        subdomain: true,
        lastSyncedAt: true,
      },
    }),
  ]);

  const sessionProviderValue = organization?.sessionRecordingProvider ?? null;
  const sessionLastSyncedValue =
    organization?.sessionRecordingLastSyncedAt ?? null;

  const hasConnectorErrors =
    analyticsConnectors.some((connector) => connector.status === "ERROR") ||
    supportInstallations.some(
      (installation) => installation.status === "ERROR"
    );

  return (
    <div className="space-y-8 px-6 py-12">
      <div className="space-y-2">
        <h1 className="m-0 font-semibold text-4xl tracking-tight">
          Data Health
        </h1>
        <p className="text-muted-foreground">
          Monitor ingestion freshness across analytics, support, and session
          recordings.
        </p>
      </div>

      {hasConnectorErrors ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-900">
          <p className="m-0 font-medium text-sm">Connector errors detected</p>
          <p className="m-0 text-red-800 text-xs">
            One or more connectors are in an error state. Review the statuses
            below and resync or reconnect.
          </p>
        </div>
      ) : null}

      <StackCard className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <p className="m-0 text-muted-foreground text-xs">
            Analytics latest event
          </p>
          <p className="m-0 font-semibold text-base">
            {analyticsLatest?.occurredAt
              ? formatDate(analyticsLatest.occurredAt)
              : "No events"}
          </p>
          <Badge variant={getStaleBadge(analyticsLatest?.occurredAt)}>
            {staleLabel(analyticsLatest?.occurredAt)}
          </Badge>
          <Link
            className="text-primary text-xs"
            href="/settings/integrations/analytics"
          >
            Manage connectors →
          </Link>
        </div>
        <div className="space-y-1">
          <p className="m-0 text-muted-foreground text-xs">
            Session insights latest
          </p>
          <p className="m-0 font-semibold text-base">
            {sessionLatest?.occurredAt
              ? formatDate(sessionLatest.occurredAt)
              : "No insights"}
          </p>
          <Badge variant={getStaleBadge(sessionLatest?.occurredAt)}>
            {staleLabel(sessionLatest?.occurredAt)}
          </Badge>
          <Link
            className="text-primary text-xs"
            href="/settings/integrations/session-recordings"
          >
            Manage session recordings →
          </Link>
        </div>
        <div className="space-y-1">
          <p className="m-0 text-muted-foreground text-xs">
            Support tickets latest
          </p>
          <p className="m-0 font-semibold text-base">
            {supportLatest?.createdAt
              ? formatDate(supportLatest.createdAt)
              : "No tickets"}
          </p>
          <Badge variant={getStaleBadge(supportLatest?.createdAt)}>
            {staleLabel(supportLatest?.createdAt)}
          </Badge>
          <Link
            className="text-primary text-xs"
            href="/settings/integrations/zendesk"
          >
            Manage support →
          </Link>
        </div>
      </StackCard>

      <StackCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 font-semibold text-lg">Analytics connectors</h2>
            <p className="text-muted-foreground text-sm">
              Provider status and last sync.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SyncActions
              analyticsConnectors={analyticsConnectors.map((connector) => ({
                id: connector.id,
                provider: connector.provider,
                status: connector.status,
              }))}
              hasSessionProvider={Boolean(sessionProviderValue)}
            />
            <Link
              className="text-primary text-sm"
              href="/settings/integrations/analytics"
            >
              Configure →
            </Link>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          {analyticsConnectors.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              No analytics connectors configured yet.
            </div>
          ) : (
            analyticsConnectors.map((connector) => (
              <div
                className="flex flex-wrap items-center gap-3 text-sm"
                key={connector.id}
              >
                <Badge variant={analyticsStatus(connector.status)}>
                  {connector.status ?? "UNKNOWN"}
                </Badge>
                <span>{connector.provider}</span>
                <span className="text-muted-foreground">
                  Last synced{" "}
                  {connector.lastSyncedAt
                    ? formatDate(connector.lastSyncedAt)
                    : "Never"}
                </span>
              </div>
            ))
          )}
        </div>
      </StackCard>

      <StackCard>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="m-0 font-semibold text-lg">Session recordings</h2>
            <p className="text-muted-foreground text-sm">
              Provider configuration and recent syncs.
            </p>
          </div>
          <Link
            className="text-primary text-sm"
            href="/settings/integrations/session-recordings"
          >
            Configure →
          </Link>
        </div>
        <div className="mt-4 grid gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Provider:</span>{" "}
            {sessionProviderValue ?? "Not configured"}
          </div>
          <div>
            <span className="text-muted-foreground">Last synced:</span>{" "}
            {sessionLastSyncedValue
              ? formatDate(sessionLastSyncedValue)
              : "Never"}
          </div>
          <div className="mt-2 grid gap-2">
            {sessionSyncLogs.length === 0 ? (
              <div className="text-muted-foreground text-sm">
                No sync logs yet.
              </div>
            ) : (
              sessionSyncLogs.map((log) => (
                <div
                  className="flex flex-wrap items-center gap-2 text-xs"
                  key={log.id}
                >
                  <Badge
                    variant={
                      log.status === "ERROR" ? "destructive" : "secondary"
                    }
                  >
                    {log.status}
                  </Badge>
                  <span>{log.provider}</span>
                  <span>{formatDate(log.startedAt)}</span>
                  <span>Insights: {log.insightsIngested ?? 0}</span>
                  {log.error ? (
                    <span className="text-red-600">{log.error}</span>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </StackCard>

      <StackCard>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="m-0 font-semibold text-lg">Support connectors</h2>
            <p className="text-muted-foreground text-sm">
              Zendesk installation status.
            </p>
          </div>
          <Link
            className="text-primary text-sm"
            href="/settings/integrations/zendesk"
          >
            Configure →
          </Link>
        </div>
        <div className="mt-4 grid gap-3">
          {supportInstallations.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              No support connectors configured.
            </div>
          ) : (
            supportInstallations.map((installation) => (
              <div
                className="flex flex-wrap items-center gap-3 text-sm"
                key={installation.id}
              >
                <Badge variant={analyticsStatus(installation.status)}>
                  {installation.status ?? "UNKNOWN"}
                </Badge>
                <span>{installation.subdomain}</span>
                <span className="text-muted-foreground">
                  Last synced{" "}
                  {installation.lastSyncedAt
                    ? formatDate(installation.lastSyncedAt)
                    : "Never"}
                </span>
              </div>
            ))
          )}
        </div>
      </StackCard>
    </div>
  );
};

export default DataHealthPage;
