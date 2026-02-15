import { currentOrganizationId } from "@repo/backend/auth/utils";
import { database } from "@/lib/database";

const types = ["ERROR", "RAGE_CLICK", "DEAD_CLICK", "LONG_TASK", "ABANDON"];
const sources = ["FULLSTORY", "HOTJAR"];

const escapeCsv = (value: string) => {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
};

const toCsvRow = (values: (string | number | null | undefined)[]) =>
  values
    .map((value) => {
      if (value === null || value === undefined) {
        return '""';
      }

      return escapeCsv(String(value));
    })
    .join(",");

export const GET = async (request: Request): Promise<Response> => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const typeParam = searchParams.get("type");
  const sourceParam = searchParams.get("source");

  const type = typeParam && types.includes(typeParam) ? typeParam : undefined;
  const source =
    sourceParam && sources.includes(sourceParam) ? sourceParam : undefined;

  const insights = await database.sessionRecordingInsight.findMany({
    where: {
      organizationId,
      ...(type ? { insightType: type } : {}),
      ...(source ? { source } : {}),
    },
    orderBy: { occurredAt: "desc" },
    select: {
      id: true,
      insightType: true,
      source: true,
      occurredAt: true,
      pageUrl: true,
      description: true,
      severity: true,
      occurrences: true,
      externalId: true,
    },
  });

  const rows = [
    toCsvRow([
      "insight_id",
      "type",
      "source",
      "occurred_at",
      "page_url",
      "severity",
      "occurrences",
      "description",
      "external_id",
    ]),
    ...insights.map((insight) =>
      toCsvRow([
        insight.id,
        insight.insightType,
        insight.source,
        insight.occurredAt.toISOString(),
        insight.pageUrl,
        insight.severity,
        insight.occurrences,
        insight.description,
        insight.externalId,
      ])
    ),
  ];

  return new Response(rows.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=session-insights-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`,
    },
  });
};
