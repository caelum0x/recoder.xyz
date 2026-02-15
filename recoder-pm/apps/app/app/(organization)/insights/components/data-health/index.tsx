import { currentOrganizationId } from "@repo/backend/auth/utils";
import { Link } from "@repo/design-system/components/link";
import { StackCard } from "@repo/design-system/components/stack-card";
import { formatDate } from "@repo/lib/format";
import { database } from "@/lib/database";

export const DataHealthSection = async () => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return <div />;
  }

  const [analyticsLatest, sessionLatest, supportLatest] = await Promise.all([
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
  ]);

  return (
    <section className="space-y-4 p-4 sm:p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-medium text-sm">Data Health</p>
          <p className="text-muted-foreground text-sm">
            Check ingestion freshness across your data sources.
          </p>
        </div>
        <Link className="text-primary text-sm" href="/insights/data-health">
          Open dashboard →
        </Link>
      </div>

      <StackCard className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <p className="m-0 text-muted-foreground text-xs">Analytics</p>
          <p className="m-0 font-semibold text-base">
            {analyticsLatest?.occurredAt
              ? formatDate(analyticsLatest.occurredAt)
              : "No events"}
          </p>
        </div>
        <div className="space-y-1">
          <p className="m-0 text-muted-foreground text-xs">Session Insights</p>
          <p className="m-0 font-semibold text-base">
            {sessionLatest?.occurredAt
              ? formatDate(sessionLatest.occurredAt)
              : "No insights"}
          </p>
        </div>
        <div className="space-y-1">
          <p className="m-0 text-muted-foreground text-xs">Support Tickets</p>
          <p className="m-0 font-semibold text-base">
            {supportLatest?.createdAt
              ? formatDate(supportLatest.createdAt)
              : "No tickets"}
          </p>
        </div>
      </StackCard>
    </section>
  );
};
