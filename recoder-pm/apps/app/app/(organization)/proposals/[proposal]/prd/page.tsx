import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { contentToText, textToContent } from "@repo/editor/lib/tiptap";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";
import { CodingAgentExport } from "./components/coding-agent-export";
import { GeneratePrdButton } from "./components/generate-prd-button";
import { PrdEditor } from "./components/prd-editor";
import { PrdJobStatus } from "./components/prd-job-status";
import { SendToTrackerDialog } from "./components/send-to-tracker-dialog";
import { TaskBreakdownSection } from "./components/task-breakdown";

export const metadata: Metadata = createMetadata({
  title: "PRD",
  description: "Product requirements document.",
});

export const dynamic = "force-dynamic";
const ProposalPrdPage = async ({
  params,
}: {
  readonly params: Promise<{ proposal: string }>;
}) => {
  const { proposal: proposalId } = await params;
  const [user, organizationId] = await Promise.all([
    currentUser(),
    currentOrganizationId(),
  ]);

  if (!(user && organizationId)) {
    return notFound();
  }

  const proposal = await database.proposal.findFirst({
    where: { id: proposalId, organizationId },
    select: {
      id: true,
      title: true,
      prdContent: true,
      prdUpdatedAt: true,
      taskBreakdown: true,
      taskBreakdownUpdatedAt: true,
    },
  });

  const prdJob = await database.aiJob.findFirst({
    where: {
      type: "PROPOSAL_PRD",
      entityId: proposalId,
    },
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
  });

  if (!proposal) {
    return notFound();
  }

  const defaultContent =
    proposal.prdContent ??
    textToContent(
      [
        "Overview",
        "\n",
        "Problem",
        "\n",
        "Goals",
        "\n",
        "Non-Goals",
        "\n",
        "User Stories",
        "\n",
        "Requirements",
        "\n",
        "UX Notes",
        "\n",
        "Metrics",
        "\n",
        "Risks",
        "\n",
        "Rollout",
      ].join("\n")
    );

  const prdText = proposal.prdContent ? contentToText(proposal.prdContent) : "";

  return (
    <div className="px-6 py-10">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Link
              className="text-muted-foreground text-sm"
              href={`/proposals/${proposal.id}`}
            >
              ← Back to proposal
            </Link>
            <h1 className="m-0 font-semibold text-3xl tracking-tight">
              PRD: {proposal.title}
            </h1>
            <p className="text-muted-foreground text-sm">
              {proposal.prdUpdatedAt
                ? `Last updated ${proposal.prdUpdatedAt.toLocaleDateString()}`
                : "No PRD generated yet."}
            </p>
          </div>
          <GeneratePrdButton proposalId={proposal.id} />
        </div>

        {!proposal.prdContent && (
          <PrdJobStatus
            active={!proposal.prdContent}
            initialJob={
              prdJob
                ? {
                    id: prdJob.id,
                    status: prdJob.status,
                    error: prdJob.error,
                    createdAt: prdJob.createdAt.toISOString(),
                    updatedAt: prdJob.updatedAt.toISOString(),
                    startedAt: prdJob.startedAt?.toISOString() ?? null,
                    finishedAt: prdJob.finishedAt?.toISOString() ?? null,
                  }
                : null
            }
            proposalId={proposal.id}
          />
        )}

        <div className="rounded-lg border bg-background p-4">
          <PrdEditor
            defaultValue={defaultContent as never}
            proposalId={proposal.id}
          />
        </div>

        {!prdText && (
          <p className="text-muted-foreground text-sm">
            Generate a PRD to populate this document with AI suggestions.
          </p>
        )}

        <TaskBreakdownSection
          breakdown={proposal.taskBreakdown as { tasks?: [] } | null}
          proposalId={proposal.id}
          updatedAt={proposal.taskBreakdownUpdatedAt}
        />

        <div className="rounded-lg border bg-background p-6">
          <h2 className="font-semibold text-lg">Ship Tasks</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            Create issues in GitHub or Linear from the task list.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <SendToTrackerDialog
              proposalId={proposal.id}
              tasks={
                ((
                  proposal.taskBreakdown as {
                    tasks?: { title: string }[];
                  } | null
                )?.tasks ?? []) as { title: string }[]
              }
              tasksCount={
                (proposal.taskBreakdown as { tasks?: [] } | null)?.tasks
                  ?.length ?? 0
              }
              type="github"
            />
            <SendToTrackerDialog
              proposalId={proposal.id}
              tasks={
                ((
                  proposal.taskBreakdown as {
                    tasks?: { title: string }[];
                  } | null
                )?.tasks ?? []) as { title: string }[]
              }
              tasksCount={
                (proposal.taskBreakdown as { tasks?: [] } | null)?.tasks
                  ?.length ?? 0
              }
              type="linear"
            />
          </div>
        </div>

        <CodingAgentExport proposalId={proposal.id} />

        <div className="rounded-lg border bg-background p-6">
          <h2 className="font-semibold text-lg">Spec-to-Code</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            Run the pipeline or export a structured JSON spec.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              className="inline-flex text-primary text-sm"
              href={`/proposals/${proposal.id}/pipeline`}
            >
              Open pipeline →
            </Link>
            <Link
              className="inline-flex text-primary text-sm"
              href={`/proposals/${proposal.id}/spec`}
            >
              Open spec export →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProposalPrdPage;
