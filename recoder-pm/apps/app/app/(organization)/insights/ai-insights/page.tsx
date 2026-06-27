import { currentOrganizationId } from "@repo/backend/auth/utils";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Badge } from "@repo/design-system/components/ui/badge";
import { formatDate } from "@repo/lib/format";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";
import { RunSynthesisButton } from "./components/run-synthesis-button";
import { SynthesisStatus } from "./components/synthesis-status";

const typeLabels: Record<string, string> = {
  FEEDBACK: "Feedback",
  USAGE: "Usage",
  SUPPORT: "Support",
  RECORDING: "Recordings",
  INTERVIEW: "Interviews",
  MIXED: "Mixed",
};

export const dynamic = "force-dynamic";
export const metadata: Metadata = createMetadata({
  title: "AI Insights",
  description:
    "Synthesize insights across feedback, usage, support, and recordings.",
});

const AiInsightsPage = async () => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return notFound();
  }

  const [insights, job] = await Promise.all([
    database.aiInsight.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        confidence: true,
        createdAt: true,
      },
    }),
    database.aiJob.findFirst({
      where: { organizationId, type: "INSIGHTS_SYNTHESIZE" },
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
            AI Insights
          </h1>
          <p className="text-muted-foreground">
            Synthesize insights across feedback, usage, support, and recordings.
          </p>
        </div>
        <RunSynthesisButton />
      </div>

      <SynthesisStatus active initialJob={initialJob} />

      <StackCard className="divide-y p-0">
        {insights.length === 0 ? (
          <div className="p-6 text-muted-foreground text-sm">
            No AI insights yet. Run synthesis to generate insights.
          </div>
        ) : (
          insights.map((insight) => (
            <div className="p-4" key={insight.id}>
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                <Badge variant="secondary">
                  {typeLabels[insight.type] ?? insight.type}
                </Badge>
                <span>{formatDate(insight.createdAt)}</span>
                <span>Confidence {insight.confidence}%</span>
              </div>
              <h3 className="mt-2 font-semibold text-base">{insight.title}</h3>
              <p className="mt-2 text-foreground/90 text-sm">
                {insight.description}
              </p>
            </div>
          ))
        )}
      </StackCard>
    </div>
  );
};

export default AiInsightsPage;
