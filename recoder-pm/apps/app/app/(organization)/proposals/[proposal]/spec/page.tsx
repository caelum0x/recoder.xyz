import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";

export const metadata: Metadata = createMetadata({
  title: "Spec Export",
  description: "Export a structured spec for coding agents.",
});

const SpecExportPage = async ({
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
    where: { id: params.proposal, organizationId },
    select: { id: true, title: true },
  });

  if (!proposal) {
    return notFound();
  }

  return (
    <div className="px-6 py-16">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="space-y-2">
          <Link
            className="text-muted-foreground text-sm"
            href={`/proposals/${proposal.id}/prd`}
          >
            ← Back to PRD
          </Link>
          <h1 className="m-0 font-semibold text-3xl tracking-tight">
            Export Spec: {proposal.title}
          </h1>
          <p className="text-muted-foreground">
            Download a structured JSON spec for downstream coding pipelines.
          </p>
        </div>

        <div className="rounded-lg border bg-background p-6">
          <p className="text-muted-foreground text-sm">
            The export includes the PRD text, task breakdown, and proposal
            metadata.
          </p>
          <Link
            className="mt-4 inline-flex text-primary text-sm"
            href={`/proposals/${proposal.id}/spec/download`}
          >
            Download JSON →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SpecExportPage;
