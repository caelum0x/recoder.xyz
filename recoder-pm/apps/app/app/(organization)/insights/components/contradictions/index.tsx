import { currentOrganizationId } from "@repo/backend/auth/utils";
import { Link } from "@repo/design-system/components/link";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Badge } from "@repo/design-system/components/ui/badge";
import { formatDate } from "@repo/lib/format";
import { database } from "@/lib/database";

const typeLabels: Record<string, string> = {
  FEEDBACK_VS_USAGE: "Feedback vs Usage",
  SUPPORT_VS_USAGE: "Support vs Usage",
  RECORDING_VS_USAGE: "Recording vs Usage",
  INTERVIEW_VS_USAGE: "Interview vs Usage",
};

export const ContradictionsSection = async () => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return <div />;
  }

  const contradictions = await database.contradiction.findMany({
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

  if (!contradictions.length) {
    return null;
  }

  return (
    <section className="space-y-4 p-4 sm:p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-medium text-sm">Contradictions</p>
          <p className="text-muted-foreground text-sm">
            Where qualitative signals diverge from usage data.
          </p>
        </div>
        <Link className="text-primary text-sm" href="/insights/contradictions">
          Open detector →
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {contradictions.map((item) => (
          <StackCard key={item.id}>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Badge variant="secondary">
                {typeLabels[item.type] ?? item.type}
              </Badge>
              <span>{formatDate(item.createdAt)}</span>
              <span>Confidence {item.confidence}%</span>
            </div>
            <h3 className="mt-3 font-semibold text-lg">{item.title}</h3>
            <p className="mt-2 text-foreground/90 text-sm">
              {item.description}
            </p>
          </StackCard>
        ))}
      </div>
    </section>
  );
};
