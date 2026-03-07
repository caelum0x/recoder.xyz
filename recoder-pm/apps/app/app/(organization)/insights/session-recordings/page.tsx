import { currentOrganizationId } from "@repo/backend/auth/utils";
import type { session_recording_insight_type, session_recording_source } from "@repo/backend/prisma/client";
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

const sourceLabels: Record<string, string> = {
  FULLSTORY: "FullStory",
  HOTJAR: "Hotjar",
};

const types = ["ERROR", "RAGE_CLICK", "DEAD_CLICK", "LONG_TASK", "ABANDON"];
const sources = ["FULLSTORY", "HOTJAR"];
const pageSize = 50;

export const metadata: Metadata = createMetadata({
  title: "Session Insights",
  description: "Review session recording insights and UX friction signals.",
});

const buildHref = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query
    ? `/insights/session-recordings?${query}`
    : "/insights/session-recordings";
};

const SessionRecordingsInsightsPage = async ({
  searchParams,
}: {
  readonly searchParams?: Record<string, string | string[] | undefined>;
}) => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return notFound();
  }

  const typeParam = searchParams?.type;
  const sourceParam = searchParams?.source;
  const pageParam = searchParams?.page;
  const type =
    typeof typeParam === "string" && types.includes(typeParam)
      ? (typeParam as session_recording_insight_type)
      : undefined;
  const source =
    typeof sourceParam === "string" && sources.includes(sourceParam)
      ? (sourceParam as session_recording_source)
      : undefined;
  const page =
    typeof pageParam === "string" && Number.isFinite(Number(pageParam))
      ? Math.max(1, Number(pageParam))
      : 1;

  const filters = {
    organizationId,
    ...(type ? { insightType: type } : {}),
    ...(source ? { source } : {}),
  } as const;

  const [total, insights] = await Promise.all([
    database.sessionRecordingInsight.count({
      where: filters,
    }),
    database.sessionRecordingInsight.findMany({
      where: filters,
      orderBy: { occurredAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
      select: {
        id: true,
        insightType: true,
        source: true,
        occurredAt: true,
        pageUrl: true,
        description: true,
        severity: true,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const exportHref = buildHref({
    type,
    source,
  }).replace(
    "/insights/session-recordings",
    "/insights/session-recordings/export"
  );

  return (
    <div className="space-y-6 p-4 sm:p-8">
      <div className="space-y-2">
        <h1 className="m-0 font-semibold text-4xl tracking-tight">
          Session Insights
        </h1>
        <p className="text-muted-foreground">
          Review UX friction signals from session recordings.
        </p>
      </div>

      <StackCard className="grid gap-4">
        <div className="space-y-2">
          <p className="m-0 font-medium text-sm">Filter by type</p>
          <div className="flex flex-wrap gap-2">
            <Link href={buildHref({ source })}>
              <Badge variant={type ? "secondary" : "default"}>All</Badge>
            </Link>
            {types.map((item) => (
              <Link href={buildHref({ type: item, source })} key={item}>
                <Badge variant={type === item ? "default" : "secondary"}>
                  {typeLabels[item] ?? item}
                </Badge>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="m-0 font-medium text-sm">Filter by source</p>
          <div className="flex flex-wrap gap-2">
            <Link href={buildHref({ type })}>
              <Badge variant={source ? "secondary" : "default"}>All</Badge>
            </Link>
            {sources.map((item) => (
              <Link href={buildHref({ type, source: item })} key={item}>
                <Badge variant={source === item ? "default" : "secondary"}>
                  {sourceLabels[item] ?? item}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      </StackCard>

      <div className="flex items-center justify-between text-muted-foreground text-sm">
        <div>
          Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)}{" "}
          of {total}
        </div>
        <Link className="text-primary text-sm" href={exportHref}>
          Export CSV →
        </Link>
      </div>

      <StackCard className="divide-y p-0">
        {insights.length === 0 ? (
          <div className="p-6 text-muted-foreground text-sm">
            No session insights found for this filter.
          </div>
        ) : (
          insights.map((insight) => (
            <Link
              className="block px-4 py-5 transition hover:bg-muted/50"
              href={`/insights/session-recordings/${insight.id}`}
              key={insight.id}
            >
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                <Badge variant="secondary">
                  {typeLabels[insight.insightType] ?? insight.insightType}
                </Badge>
                <span>{sourceLabels[insight.source] ?? insight.source}</span>
                <span>{formatDate(insight.occurredAt)}</span>
                {insight.severity ? (
                  <span>Severity: {insight.severity}</span>
                ) : null}
              </div>
              <div className="mt-2 text-foreground text-sm">
                {insight.description || "No description available."}
              </div>
              {insight.pageUrl ? (
                <div className="mt-2 text-primary text-xs">
                  {insight.pageUrl}
                </div>
              ) : null}
            </Link>
          ))
        )}
      </StackCard>

      <div className="flex items-center justify-between text-sm">
        <Link
          className={
            page > 1
              ? "text-primary"
              : "pointer-events-none text-muted-foreground"
          }
          href={buildHref({ type, source, page: String(page - 1) })}
        >
          ← Previous
        </Link>
        <span className="text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Link
          className={
            page < totalPages
              ? "text-primary"
              : "pointer-events-none text-muted-foreground"
          }
          href={buildHref({ type, source, page: String(page + 1) })}
        >
          Next →
        </Link>
      </div>
    </div>
  );
};

export default SessionRecordingsInsightsPage;
