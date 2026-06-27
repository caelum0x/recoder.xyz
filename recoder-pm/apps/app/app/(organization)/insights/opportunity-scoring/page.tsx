import { currentOrganizationId } from "@repo/backend/auth/utils";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";
import { RiceTable } from "./components/rice-table";
import { RunScoringButton } from "./components/run-scoring-button";

export const metadata: Metadata = createMetadata({
  title: "Opportunity Scoring",
  description:
    "RICE scores for your features — prioritize by reach, impact, confidence, and effort.",
});

export const dynamic = "force-dynamic";
const OpportunityScoringPage = async () => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return notFound();
  }

  const riceScores = await database.aiFeatureRice.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
    include: {
      feature: {
        select: {
          id: true,
          title: true,
          status: {
            select: { name: true },
          },
        },
      },
    },
  });

  const rows = riceScores.map((rice) => {
    const effort = rice.effort === 0 ? 1 : rice.effort;
    const compositeScore =
      (rice.reach * rice.impact * rice.confidence) / effort;

    return {
      id: rice.id,
      featureId: rice.featureId,
      featureTitle: rice.feature.title,
      featureStatus: rice.feature.status.name,
      reach: rice.reach,
      impact: rice.impact,
      confidence: rice.confidence,
      effort: rice.effort,
      compositeScore,
      reachReason: rice.reachReason,
      impactReason: rice.impactReason,
      confidenceReason: rice.confidenceReason,
      effortReason: rice.effortReason,
    };
  });

  return (
    <div className="space-y-6 px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 font-semibold text-4xl tracking-tight">
            Opportunity Scoring
          </h1>
          <p className="text-muted-foreground">
            RICE scores for your features — prioritize by reach, impact,
            confidence, and effort.
          </p>
        </div>
        <RunScoringButton />
      </div>

      <RiceTable rows={rows} />
    </div>
  );
};

export default OpportunityScoringPage;
