import { currentOrganizationId } from "@repo/backend/auth/utils";
import type { ai_job_status, ai_job_type } from "@repo/backend/prisma/client";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";
import { AiJobsList } from "./components/ai-jobs-list";

export const metadata: Metadata = createMetadata({
  title: "AI Jobs",
  description: "Track AI background jobs for your organization.",
});

const formatJobType = (type: string) =>
  type
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

const statusOptions = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"] as const;
const typeOptions = [
  "FEEDBACK_SENTIMENT",
  "FEEDBACK_ANALYSIS",
  "FEATURE_RICE",
  "DIGEST_GENERATE",
  "INSIGHTS_SYNTHESIZE",
  "PROPOSAL_PRD",
  "CONTRADICTIONS",
  "OPPORTUNITY_SCORING",
  "PROPOSALS_GENERATE",
] as const;

const AiJobsSettingsPage = async ({
  searchParams,
}: {
  readonly searchParams?: Promise<{
    status?: string;
    type?: string;
    q?: string;
    page?: string;
  }>;
}) => {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return notFound();
  }

  const page = Number(resolvedSearchParams?.page ?? "1") || 1;
  const pageSize = 25;
  const skip = (page - 1) * pageSize;

  const statusFilter = resolvedSearchParams?.status?.toUpperCase();
  const typeFilter = resolvedSearchParams?.type?.toUpperCase();
  const searchQuery = resolvedSearchParams?.q?.trim();

  const validStatus =
    statusFilter && (statusOptions as readonly string[]).includes(statusFilter)
      ? (statusFilter as ai_job_status)
      : undefined;
  const validType =
    typeFilter && (typeOptions as readonly string[]).includes(typeFilter)
      ? (typeFilter as ai_job_type)
      : undefined;

  const where = {
    organizationId,
    ...(validStatus ? { status: validStatus } : {}),
    ...(validType ? { type: validType } : {}),
    ...(searchQuery
      ? {
          OR: [
            {
              id: {
                contains: searchQuery,
                mode: "insensitive" as const,
              },
            },
            {
              entityId: {
                contains: searchQuery,
                mode: "insensitive" as const,
              },
            },
            {
              error: {
                contains: searchQuery,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };

  const [jobs, total] = await Promise.all([
    database.aiJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip,
      select: {
        id: true,
        type: true,
        status: true,
        error: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
        entityId: true,
      },
    }),
    database.aiJob.count({ where }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl">AI Jobs</h1>
        <p className="text-muted-foreground text-sm">
          Monitor background AI jobs like PRD generation, sentiment analysis,
          and insights synthesis.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border bg-background p-4"
        method="get"
      >
        <div className="flex flex-col gap-1">
          <label
            className="font-medium text-muted-foreground text-xs"
            htmlFor="ai-jobs-search"
          >
            Search
          </label>
          <input
            className="h-9 w-64 rounded-md border bg-background px-3 text-sm"
            defaultValue={searchQuery ?? ""}
            id="ai-jobs-search"
            name="q"
            placeholder="Job ID, entity ID, error..."
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            className="font-medium text-muted-foreground text-xs"
            htmlFor="ai-jobs-status"
          >
            Status
          </label>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            defaultValue={validStatus ?? ""}
            id="ai-jobs-status"
            name="status"
          >
            <option value="">All statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label
            className="font-medium text-muted-foreground text-xs"
            htmlFor="ai-jobs-type"
          >
            Type
          </label>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            defaultValue={validType ?? ""}
            id="ai-jobs-type"
            name="type"
          >
            <option value="">All types</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {formatJobType(type)}
              </option>
            ))}
          </select>
        </div>
        <button
          className="h-9 rounded-md border bg-primary px-4 text-primary-foreground text-sm"
          type="submit"
        >
          Apply
        </button>
        <Link
          className="h-9 rounded-md border px-4 text-muted-foreground text-sm leading-9"
          href="/settings/ai-jobs"
        >
          Clear
        </Link>
      </form>

      <AiJobsList
        jobs={jobs}
        page={page}
        pageSize={pageSize}
        query={{
          status: validStatus,
          type: validType,
          q: searchQuery ?? undefined,
        }}
        total={total}
      />
    </div>
  );
};

export default AiJobsSettingsPage;
