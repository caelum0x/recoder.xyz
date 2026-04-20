import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";
import { PipelineRunner } from "./components/pipeline-runner";

export const metadata: Metadata = createMetadata({
  title: "Spec-to-Code Pipeline",
  description: "Run the spec-to-code pipeline for this proposal.",
});

export const dynamic = "force-dynamic";
const PipelinePage = async ({
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
      taskBreakdown: true,
      prdUpdatedAt: true,
      taskBreakdownUpdatedAt: true,
    },
  });

  if (!proposal) {
    return notFound();
  }

  return (
    <div className="px-6 py-16">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="space-y-2">
          <Link
            className="text-muted-foreground text-sm"
            href={`/proposals/${proposal.id}/prd`}
          >
            ← Back to PRD
          </Link>
          <h1 className="m-0 font-semibold text-3xl tracking-tight">
            Spec-to-Code Pipeline: {proposal.title}
          </h1>
          <p className="text-muted-foreground text-sm">
            Generate the PRD, task breakdown, and export artifacts for coding
            agents.
          </p>
          <div className="text-muted-foreground text-xs">
            <div>
              PRD last updated:{" "}
              {proposal.prdUpdatedAt?.toLocaleDateString() ?? "Never"}
            </div>
            <div>
              Tasks last updated:{" "}
              {proposal.taskBreakdownUpdatedAt?.toLocaleDateString() ?? "Never"}
            </div>
          </div>
        </div>

        <PipelineRunner
          hasPrd={Boolean(proposal.prdContent)}
          hasTasks={Boolean(proposal.taskBreakdown)}
          proposalId={proposal.id}
        />
      </div>
    </div>
  );
};

export default PipelinePage;
