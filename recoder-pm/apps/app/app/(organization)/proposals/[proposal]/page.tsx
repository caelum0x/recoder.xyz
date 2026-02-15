import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";

type ImpactPrediction = {
  userImpact?: string;
  businessImpact?: string;
  effort?: string;
  risk?: string;
};

export const metadata: Metadata = createMetadata({
  title: "Proposal",
  description: "AI-generated product change proposal.",
});

const ProposalPage = async ({
  params,
}: {
  readonly params: { proposal: string };
}) => {
  const [user, organizationId] = await Promise.all([
    currentUser(),
    currentOrganizationId(),
  ]);

  if (!(user && organizationId)) {
    return notFound();
  }

  const proposal = await database.proposal.findFirst({
    where: {
      id: params.proposal,
      organizationId,
    },
    select: {
      id: true,
      title: true,
      description: true,
      impactPrediction: true,
      status: true,
      insightIds: true,
      createdAt: true,
    },
  });

  if (!proposal) {
    return notFound();
  }

  const impact = (proposal.impactPrediction ?? {}) as ImpactPrediction;
  const linkedInsights = proposal.insightIds.length
    ? await database.aiInsight.findMany({
        where: { id: { in: proposal.insightIds } },
        select: { id: true, title: true },
      })
    : [];

  return (
    <div className="px-6 py-16">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div className="space-y-2">
          <Link className="text-muted-foreground text-sm" href="/proposals">
            ← Back to proposals
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="m-0 font-semibold text-4xl tracking-tight">
              {proposal.title}
            </h1>
            <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground text-xs">
              {proposal.status}
            </span>
          </div>
          <p className="text-muted-foreground">{proposal.description}</p>
        </div>

        <div className="rounded-lg border bg-background p-6">
          <h2 className="font-semibold text-lg">Impact prediction</h2>
          <div className="mt-4 grid gap-4 text-foreground/90 text-sm">
            <div>
              <p className="text-muted-foreground">User impact</p>
              <p>{impact.userImpact ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Business impact</p>
              <p>{impact.businessImpact ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Effort</p>
              <p>{impact.effort ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Risk</p>
              <p>{impact.risk ?? "—"}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-background p-6">
          <h2 className="font-semibold text-lg">Source insights</h2>
          {linkedInsights.length ? (
            <ul className="mt-4 list-disc pl-5 text-foreground/90 text-sm">
              {linkedInsights.map((insight) => (
                <li key={insight.id}>{insight.title}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-muted-foreground text-sm">
              No linked insights.
            </p>
          )}
        </div>

        <div className="rounded-lg border bg-background p-6">
          <h2 className="font-semibold text-lg">PRD</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            Turn this proposal into a product requirements document.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              className="inline-flex text-primary text-sm"
              href={`/proposals/${proposal.id}/prd`}
            >
              Open PRD →
            </Link>
            <Link
              className="inline-flex text-primary text-sm"
              href={`/proposals/${proposal.id}/pipeline`}
            >
              Open pipeline →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProposalPage;
