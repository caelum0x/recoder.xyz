import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { database } from "@/lib/database";
import { GenerateProposalsButton } from "./components/generate-proposals-button";

const title = "Proposals";
export const dynamic = "force-dynamic";
const description = "AI-generated product change proposals.";

export const metadata: Metadata = createMetadata({ title, description });

const ProposalsPage = async () => {
  const [user, organizationId] = await Promise.all([
    currentUser(),
    currentOrganizationId(),
  ]);

  if (!(user && organizationId)) {
    return notFound();
  }

  const proposals = await database.proposal.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      createdAt: true,
    },
  });

  return (
    <div className="px-6 py-16">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="m-0 font-semibold text-4xl tracking-tight">
              {title}
            </h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
          <GenerateProposalsButton />
        </div>

        {proposals.length === 0 ? (
          <EmptyState
            description="Generate your first AI proposal to start shaping your roadmap."
            title="No proposals yet"
          />
        ) : (
          <div className="grid gap-4">
            {proposals.map((proposal) => (
              <Link
                className="rounded-lg border bg-background p-4 transition hover:border-foreground/20"
                href={`/proposals/${proposal.id}`}
                key={proposal.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <h2 className="font-semibold text-lg">{proposal.title}</h2>
                    <p className="text-muted-foreground text-sm">
                      {proposal.description}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 text-muted-foreground text-xs">
                    <span className="rounded-full bg-muted px-2 py-1">
                      {proposal.status}
                    </span>
                    <Link
                      className="text-primary"
                      href={`/proposals/${proposal.id}/pipeline`}
                    >
                      Pipeline →
                    </Link>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProposalsPage;
