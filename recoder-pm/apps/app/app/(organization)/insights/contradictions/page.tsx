import { currentOrganizationId } from "@repo/backend/auth/utils";
import { Link } from "@repo/design-system/components/link";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Badge } from "@repo/design-system/components/ui/badge";
import { formatDate } from "@repo/lib/format";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";
import { ContradictionActions } from "./components/contradiction-actions";
import { ContradictionsStatus } from "./components/contradictions-status";
import { RunContradictionsButton } from "./components/run-contradictions-button";


const typeLabels: Record<string, string> = {
  FEEDBACK_VS_USAGE: "Feedback vs Usage",
  SUPPORT_VS_USAGE: "Support vs Usage",
  RECORDING_VS_USAGE: "Recording vs Usage",
  INTERVIEW_VS_USAGE: "Interview vs Usage",
};

export const dynamic = "force-dynamic";
const statuses = ["all", "active", "acknowledged", "dismissed", "snoozed"];
const statusLabels: Record<string, string> = {
  all: "All",
  active: "Active",
  acknowledged: "Acknowledged",
  dismissed: "Dismissed",
  snoozed: "Snoozed",
};

const sourceKeys: Record<string, string> = {
  feedbackCount: "feedback",
  supportCount: "tickets",
  recordingCount: "recordings",
  interviewCount: "interviews",
  analyticsCount: "analytics",
};

const formatSources = (sources: unknown): string | null => {
  if (!sources || typeof sources !== "object") {
    return null;
  }

  const record = sources as Record<string, unknown>;
  const parts: string[] = [];

  for (const [key, label] of Object.entries(sourceKeys)) {
    const count = record[key];

    if (typeof count === "number" && count > 0) {
      parts.push(`${count} ${label}`);
    }
  }

  return parts.length > 0 ? parts.join(", ") : null;
};

const buildHref = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && value !== "active") {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query
    ? `/insights/contradictions?${query}`
    : "/insights/contradictions";
};

export const metadata: Metadata = createMetadata({
  title: "Contradictions",
  description: "Review where qualitative signals diverge from usage data.",
});

const ContradictionsPage = async ({
  searchParams,
}: {
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
}) => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return notFound();
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const statusParam = resolvedSearchParams?.status;
  const statusFilter =
    typeof statusParam === "string" && statuses.includes(statusParam)
      ? statusParam
      : "active";

  const now = new Date();

  const whereClause =
    statusFilter === "all"
      ? { organizationId }
      : statusFilter === "snoozed"
        ? { organizationId, status: "snoozed" }
        : statusFilter === "active"
          ? {
              organizationId,
              OR: [
                { status: "active" },
                { status: "snoozed", snoozedUntil: { lt: now } },
              ],
            }
          : { organizationId, status: statusFilter };

  const contradictionSelect = {
    id: true,
    title: true,
    description: true,
    type: true,
    confidence: true,
    createdAt: true,
    sources: true,
    status: true,
    snoozedUntil: true,
  };

  const [contradictions, job] = await Promise.all([
    database.contradiction.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: contradictionSelect,
    }),
    database.aiJob.findFirst({
      where: { organizationId, type: "CONTRADICTIONS" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        error: true,
        createdAt: true,
        updatedAt: true,
        startedAt: true,
        finishedAt: true,
      },
    }),
  ]);

  const initialJob = job
    ? {
        id: job.id,
        status: job.status,
        error: job.error,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        startedAt: job.startedAt?.toISOString() ?? null,
        finishedAt: job.finishedAt?.toISOString() ?? null,
      }
    : null;

  return (
    <div className="space-y-6 px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 font-semibold text-4xl tracking-tight">
            Contradictions
          </h1>
          <p className="text-muted-foreground">
            Review where qualitative signals diverge from usage data.
          </p>
        </div>
        <RunContradictionsButton />
      </div>

      <ContradictionsStatus initialJob={initialJob} />

      <StackCard className="grid gap-4">
        <div className="space-y-2">
          <p className="m-0 font-medium text-sm">Filter by status</p>
          <div className="flex flex-wrap gap-2">
            {statuses.map((item) => (
              <Link
                href={buildHref({ status: item === "active" ? undefined : item })}
                key={item}
              >
                <Badge
                  variant={statusFilter === item ? "default" : "secondary"}
                >
                  {statusLabels[item]}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      </StackCard>

      <StackCard className="divide-y p-0">
        {contradictions.length === 0 ? (
          <div className="p-6 text-muted-foreground text-sm">
            {statusFilter === "active"
              ? "No active contradictions. Run detection to generate insights."
              : `No ${statusFilter} contradictions found.`}
          </div>
        ) : (
          contradictions.map((item) => {
            const sourceSummary = formatSources(item.sources);

            return (
              <div className="p-4" key={item.id}>
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                  <Badge variant="secondary">
                    {typeLabels[item.type] ?? item.type}
                  </Badge>
                  <span>{formatDate(item.createdAt)}</span>
                  <span>Confidence {item.confidence}%</span>
                  {item.status !== "active" ? (
                    <Badge
                      variant={
                        item.status === "acknowledged" ? "default" : "outline"
                      }
                    >
                      {item.status}
                    </Badge>
                  ) : null}
                  {item.status === "snoozed" && item.snoozedUntil ? (
                    <span>until {formatDate(item.snoozedUntil)}</span>
                  ) : null}
                </div>
                <h3 className="mt-2 font-semibold text-base">{item.title}</h3>
                <p className="mt-2 text-foreground/90 text-sm">
                  {item.description}
                </p>
                {sourceSummary ? (
                  <div className="mt-3 text-muted-foreground text-xs">
                    Sources: {sourceSummary}
                  </div>
                ) : null}
                <div className="mt-3">
                  <ContradictionActions id={item.id} status={item.status} />
                </div>
              </div>
            );
          })
        )}
      </StackCard>
    </div>
  );
};

export default ContradictionsPage;
