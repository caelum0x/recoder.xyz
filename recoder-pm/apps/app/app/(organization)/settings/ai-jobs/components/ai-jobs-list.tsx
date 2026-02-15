import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { RetryButton } from "./retry-button";

export type AiJobRow = {
  id: string;
  type: string;
  status: string;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  entityId: string | null;
};

type AiJobsListProps = {
  readonly jobs: AiJobRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly query: Record<string, string | undefined>;
};

const statusStyles: Record<string, string> = {
  QUEUED: "bg-muted text-muted-foreground",
  RUNNING: "bg-blue-500/10 text-blue-600",
  SUCCEEDED: "bg-emerald-500/10 text-emerald-600",
  FAILED: "bg-red-500/10 text-red-600",
};

const formatJobType = (type: string) =>
  type
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

const getEntityLink = (type: string, entityId: string | null) => {
  if (!entityId) {
    return null;
  }

  if (type === "PROPOSAL_PRD") {
    return `/proposals/${entityId}`;
  }

  if (type === "FEATURE_RICE") {
    return `/features/${entityId}`;
  }

  if (type === "FEEDBACK_SENTIMENT" || type === "FEEDBACK_ANALYSIS") {
    return `/feedback/${entityId}`;
  }

  return null;
};

const buildQuery = (
  query: Record<string, string | undefined>,
  page: number
) => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  params.set("page", String(page));
  return params.toString();
};

export const AiJobsList = ({
  jobs,
  total,
  page,
  pageSize,
  query,
}: AiJobsListProps) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="rounded-xl border bg-background">
      <div className="grid gap-4 border-b px-6 py-4 text-muted-foreground text-xs uppercase tracking-wide sm:grid-cols-[1.5fr_1.2fr_1fr_1fr]">
        <span>Job</span>
        <span>Status</span>
        <span>Started</span>
        <span>Finished</span>
      </div>
      {jobs.length === 0 && (
        <div className="px-6 py-10 text-muted-foreground text-sm">
          No AI jobs match the current filters.
        </div>
      )}
      {jobs.map((job) => (
        <div
          className="grid gap-4 border-b px-6 py-4 text-sm last:border-b-0 sm:grid-cols-[1.5fr_1.2fr_1fr_1fr]"
          key={job.id}
        >
          <div className="space-y-1">
            <div className="font-medium">{formatJobType(job.type)}</div>
            {!!job.entityId && (
              <div className="text-muted-foreground text-xs">
                Entity: {(() => {
                  const href = getEntityLink(job.type, job.entityId);
                  if (href) {
                    return (
                      <Link className="text-primary" href={href}>
                        {job.entityId}
                      </Link>
                    );
                  }
                  return job.entityId;
                })()}
              </div>
            )}
            {!!job.error && (
              <div className="text-red-600 text-xs">{job.error}</div>
            )}
          </div>
          <div className="space-y-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium text-xs ${
                statusStyles[job.status] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {job.status}
            </span>
            {job.status === "FAILED" && <RetryButton jobId={job.id} />}
          </div>
          <div className="text-muted-foreground">
            {job.startedAt
              ? formatDistanceToNow(job.startedAt, { addSuffix: true })
              : "—"}
          </div>
          <div className="text-muted-foreground">
            {job.finishedAt
              ? formatDistanceToNow(job.finishedAt, { addSuffix: true })
              : "—"}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between px-6 py-4 text-sm">
        <div className="text-muted-foreground">
          Page {page} of {totalPages} · {total} jobs
        </div>
        <div className="flex gap-2">
          <Link
            className={`rounded-md border px-3 py-1.5 ${
              hasPrev
                ? "text-foreground"
                : "pointer-events-none text-muted-foreground"
            }`}
            href={`/settings/ai-jobs?${buildQuery(query, Math.max(1, page - 1))}`}
          >
            Previous
          </Link>
          <Link
            className={`rounded-md border px-3 py-1.5 ${
              hasNext
                ? "text-foreground"
                : "pointer-events-none text-muted-foreground"
            }`}
            href={`/settings/ai-jobs?${buildQuery(query, Math.min(totalPages, page + 1))}`}
          >
            Next
          </Link>
        </div>
      </div>
    </div>
  );
};
