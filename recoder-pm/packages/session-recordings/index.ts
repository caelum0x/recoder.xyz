export type SessionRecordingInsightPayload = {
  readonly externalId: string;
  readonly occurredAt: string;
  readonly type:
    | "ERROR"
    | "RAGE_CLICK"
    | "DEAD_CLICK"
    | "LONG_TASK"
    | "ABANDON";
  readonly pageUrl?: string;
  readonly description?: string;
  readonly severity?: string;
  readonly raw: Record<string, unknown>;
};

const createAuthHeader = (apiKey: string) => `Bearer ${apiKey}`;

const INSIGHT_TYPE_MAP: Record<string, SessionRecordingInsightPayload["type"]> =
  {
    rage_click: "RAGE_CLICK",
    dead_click: "DEAD_CLICK",
    long_task: "LONG_TASK",
    abandon: "ABANDON",
  };

const resolveInsightType = (
  rawType: unknown
): SessionRecordingInsightPayload["type"] => {
  if (typeof rawType !== "string") {
    return "ERROR";
  }

  return INSIGHT_TYPE_MAP[rawType] ?? "ERROR";
};

export const fetchHotjarInsights = async ({
  apiKey,
  siteId,
  from,
  to,
}: {
  readonly apiKey: string;
  readonly siteId: string;
  readonly from: string;
  readonly to: string;
}): Promise<SessionRecordingInsightPayload[]> => {
  const url = new URL(
    `https://insights.hotjar.com/api/v1/sites/${siteId}/insights`
  );
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: createAuthHeader(apiKey),
    },
  });

  if (!response.ok) {
    throw new Error(`Hotjar insights failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    insights?: Record<string, unknown>[];
  };

  return (payload.insights ?? []).map((insight) => ({
    externalId: String(insight.id ?? insight.insight_id ?? ""),
    occurredAt: String(
      insight.date ?? insight.created_at ?? new Date().toISOString()
    ),
    type: resolveInsightType(insight.type),
    pageUrl: insight.url ? String(insight.url) : undefined,
    description: insight.description ? String(insight.description) : undefined,
    severity: insight.severity ? String(insight.severity) : undefined,
    raw: insight,
  }));
};

export const fetchFullStoryInsights = async ({
  apiKey,
  from,
  to,
}: {
  readonly apiKey: string;
  readonly from: string;
  readonly to: string;
}): Promise<SessionRecordingInsightPayload[]> => {
  const url = new URL("https://api.fullstory.com/v2/insights");
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: createAuthHeader(apiKey),
    },
  });

  if (!response.ok) {
    throw new Error(`FullStory insights failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    insights?: Record<string, unknown>[];
  };

  return (payload.insights ?? []).map((insight) => ({
    externalId: String(insight.id ?? ""),
    occurredAt: String(
      insight.timestamp ?? insight.created_at ?? new Date().toISOString()
    ),
    type: resolveInsightType(insight.type),
    pageUrl: insight.pageUrl ? String(insight.pageUrl) : undefined,
    description: insight.description ? String(insight.description) : undefined,
    severity: insight.severity ? String(insight.severity) : undefined,
    raw: insight,
  }));
};
