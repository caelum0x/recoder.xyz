import { currentOrganizationId } from "@repo/backend/auth/utils";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Badge } from "@repo/design-system/components/ui/badge";
import { formatDate } from "@repo/lib/format";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";
import { ContradictionsStatus } from "./components/contradictions-status";
import { RunContradictionsButton } from "./components/run-contradictions-button";

const typeLabels: Record<string, string> = {
  FEEDBACK_VS_USAGE: "Feedback vs Usage",
  SUPPORT_VS_USAGE: "Support vs Usage",
  RECORDING_VS_USAGE: "Recording vs Usage",
  INTERVIEW_VS_USAGE: "Interview vs Usage",
};

export const metadata: Metadata = createMetadata({
  title: "Contradictions",
  description: "Review where qualitative signals diverge from usage data.",
});

const ContradictionsPage = async () => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return notFound();
  }

  const [contradictions, job] = await Promise.all([
    database.contradiction.findMany({
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
        sources: true,
      },
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

      <StackCard className="divide-y p-0">
        {contradictions.length === 0 ? (
          <div className="p-6 text-muted-foreground text-sm">
            No contradictions yet. Run detection to generate insights.
          </div>
        ) : (
          contradictions.map((item) => (
            <div className="p-4" key={item.id}>
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                <Badge variant="secondary">
                  {typeLabels[item.type] ?? item.type}
                </Badge>
                <span>{formatDate(item.createdAt)}</span>
                <span>Confidence {item.confidence}%</span>
              </div>
              <h3 className="mt-2 font-semibold text-base">{item.title}</h3>
              <p className="mt-2 text-foreground/90 text-sm">
                {item.description}
              </p>
              {item.sources ? (
                <div className="mt-3 rounded-md bg-muted p-3 text-muted-foreground text-xs">
                  <div className="font-medium text-foreground">Sources</div>
                  <pre className="mt-2 whitespace-pre-wrap">
                    {JSON.stringify(item.sources, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          ))
        )}
      </StackCard>
    </div>
  );
};

export default ContradictionsPage;
