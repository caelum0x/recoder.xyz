import { currentOrganizationId } from "@repo/backend/auth/utils";
import { Link } from "@repo/design-system/components/link";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Badge } from "@repo/design-system/components/ui/badge";
import { formatDate } from "@repo/lib/format";
import { database } from "@/lib/database";

const typeLabels: Record<string, string> = {
  FEEDBACK: "Feedback",
  USAGE: "Usage",
  SUPPORT: "Support",
  RECORDING: "Recordings",
  INTERVIEW: "Interviews",
  MIXED: "Mixed",
};

export const AiInsightsSection = async () => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return <div />;
  }

  const insights = await database.aiInsight.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      confidence: true,
      createdAt: true,
    },
  });

  if (!insights.length) {
    return null;
  }

  return (
    <section className="space-y-4 p-4 sm:p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-medium text-sm">AI Insights</p>
          <p className="text-muted-foreground text-sm">
            Synthesized insights across feedback, usage, support, and
            recordings.
          </p>
        </div>
        <Link className="text-primary text-sm" href="/insights/ai-insights">
          Open pipeline →
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {insights.map((insight) => (
          <StackCard key={insight.id}>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Badge variant="secondary">
                {typeLabels[insight.type] ?? insight.type}
              </Badge>
              <span>{formatDate(insight.createdAt)}</span>
              <span>Confidence {insight.confidence}%</span>
            </div>
            <h3 className="mt-3 font-semibold text-lg">{insight.title}</h3>
            <p className="mt-2 text-foreground/90 text-sm">
              {insight.description}
            </p>
          </StackCard>
        ))}
      </div>
    </section>
  );
};
