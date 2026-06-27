import { currentOrganizationId } from "@repo/backend/auth/utils";
import { Link } from "@repo/design-system/components/link";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Badge } from "@repo/design-system/components/ui/badge";
import { formatDate } from "@repo/lib/format";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";

const typeLabels: Record<string, string> = {
  ERROR: "Errors",
  RAGE_CLICK: "Rage clicks",
  DEAD_CLICK: "Dead clicks",
  LONG_TASK: "Long tasks",
  ABANDON: "Abandons",
};

export const dynamic = "force-dynamic";
const sourceLabels: Record<string, string> = {
  FULLSTORY: "FullStory",
  HOTJAR: "Hotjar",
};

type SessionInsightPageProps = {
  readonly params: Promise<{ insight: string }>;
};

export const generateMetadata = async (
  props: SessionInsightPageProps
): Promise<Metadata> => {
  const params = await props.params;
  const insight = await database.sessionRecordingInsight.findUnique({
    where: { id: params.insight },
    select: { insightType: true },
  });

  return createMetadata({
    title: insight
      ? `Session Insight: ${typeLabels[insight.insightType] ?? insight.insightType}`
      : "Session Insight",
    description: "Session recording insight details.",
  });
};

const SessionInsightPage = async (props: SessionInsightPageProps) => {
  const params = await props.params;
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    notFound();
  }

  const insight = await database.sessionRecordingInsight.findFirst({
    where: { id: params.insight, organizationId },
    select: {
      id: true,
      insightType: true,
      source: true,
      occurredAt: true,
      pageUrl: true,
      description: true,
      severity: true,
      occurrences: true,
      externalId: true,
      raw: true,
    },
  });

  if (!insight) {
    notFound();
  }

  return (
    <div className="px-6 py-16">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div className="space-y-2">
          <Link
            className="text-muted-foreground text-sm"
            href="/insights/session-recordings"
          >
            ← Back to session insights
          </Link>
          <h1 className="m-0 font-semibold text-4xl tracking-tight">
            {typeLabels[insight.insightType] ?? insight.insightType}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            <Badge variant="secondary">
              {sourceLabels[insight.source] ?? insight.source}
            </Badge>
            <span>{formatDate(insight.occurredAt)}</span>
            {insight.severity ? (
              <span>Severity: {insight.severity}</span>
            ) : null}
            <span>Occurrences: {insight.occurrences}</span>
          </div>
        </div>

        <StackCard className="space-y-2">
          <h2 className="font-semibold text-lg">Summary</h2>
          <p className="text-muted-foreground text-sm">
            {insight.description || "No description available."}
          </p>
          {insight.pageUrl ? (
            <Link className="text-primary text-sm" href={insight.pageUrl}>
              {insight.pageUrl}
            </Link>
          ) : null}
          {insight.externalId ? (
            <p className="text-muted-foreground text-xs">
              External ID: {insight.externalId}
            </p>
          ) : null}
        </StackCard>

        <StackCard className="space-y-4">
          <h2 className="font-semibold text-lg">Raw Payload</h2>
          <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-foreground text-xs">
            {JSON.stringify(insight.raw ?? {}, null, 2)}
          </pre>
        </StackCard>
      </div>
    </div>
  );
};

export default SessionInsightPage;
