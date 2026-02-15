import { currentOrganizationId } from "@repo/backend/auth/utils";
import { Link } from "@repo/design-system/components/link";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Badge } from "@repo/design-system/components/ui/badge";
import { formatDate } from "@repo/lib/format";
import { database } from "@/lib/database";

const typeLabels: Record<string, string> = {
  ERROR: "Errors",
  RAGE_CLICK: "Rage clicks",
  DEAD_CLICK: "Dead clicks",
  LONG_TASK: "Long tasks",
  ABANDON: "Abandons",
};

export const SessionRecordingsSection = async () => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return <div />;
  }

  const [total, grouped, latest] = await Promise.all([
    database.sessionRecordingInsight.count({
      where: { organizationId },
    }),
    database.sessionRecordingInsight.groupBy({
      by: ["insightType"],
      where: { organizationId },
      _count: { _all: true },
    }),
    database.sessionRecordingInsight.findMany({
      where: { organizationId },
      orderBy: { occurredAt: "desc" },
      take: 6,
      select: {
        id: true,
        insightType: true,
        occurredAt: true,
        pageUrl: true,
        description: true,
        source: true,
      },
    }),
  ]);

  if (!total) {
    return (
      <section className="space-y-4 p-4 sm:p-8">
        <div>
          <p className="font-medium text-sm">Session Insights</p>
          <p className="text-muted-foreground text-sm">
            Connect FullStory or Hotjar to surface top UX issues.
          </p>
        </div>
        <StackCard>
          <div className="flex flex-col gap-3">
            <p className="m-0 text-muted-foreground text-sm">
              No session insights yet. Connect a provider to start syncing.
            </p>
            <Link
              className="text-primary text-sm"
              href="/settings/integrations/session-recordings"
            >
              Configure session recordings →
            </Link>
          </div>
        </StackCard>
      </section>
    );
  }

  return (
    <section className="space-y-4 p-4 sm:p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-medium text-sm">Session Insights</p>
          <p className="text-muted-foreground text-sm">
            UX friction signals from session recordings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            className="text-primary text-sm"
            href="/insights/session-recordings"
          >
            View all →
          </Link>
          <Link
            className="text-primary text-sm"
            href="/insights/session-recordings/export"
          >
            Export CSV →
          </Link>
          <Link
            className="text-primary text-sm"
            href="/settings/integrations/session-recordings"
          >
            Manage →
          </Link>
        </div>
      </div>

      <StackCard className="grid gap-4 sm:grid-cols-5">
        {grouped.map((item) => (
          <div className="flex flex-col gap-1" key={item.insightType}>
            <p className="m-0 font-semibold text-lg">{item._count._all}</p>
            <p className="m-0 text-muted-foreground text-sm">
              {typeLabels[item.insightType] ?? item.insightType}
            </p>
          </div>
        ))}
      </StackCard>

      <StackCard className="divide-y p-0">
        {latest.map((insight) => (
          <div className="flex flex-col gap-2 p-4" key={insight.id}>
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
              <Badge variant="secondary">
                {typeLabels[insight.insightType] ?? insight.insightType}
              </Badge>
              <span>{insight.source}</span>
              <span>{formatDate(insight.occurredAt)}</span>
            </div>
            <p className="m-0 text-foreground text-sm">
              {insight.description || "No description available."}
            </p>
            {insight.pageUrl ? (
              <Link className="text-primary text-xs" href={insight.pageUrl}>
                {insight.pageUrl}
              </Link>
            ) : null}
          </div>
        ))}
      </StackCard>
    </section>
  );
};
