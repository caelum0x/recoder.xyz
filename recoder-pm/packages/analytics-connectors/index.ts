/// <reference path="./adm-zip.d.ts" />
import AdmZip from "adm-zip";

export type AnalyticsDateRange = {
  readonly from: Date;
  readonly to: Date;
};

export type AnalyticsEventPayload = {
  readonly externalId?: string;
  readonly name: string;
  readonly occurredAt: Date;
  readonly userId?: string | null;
  readonly userEmail?: string | null;
  readonly sessionId?: string | null;
  readonly properties?: Record<string, unknown>;
  readonly raw?: Record<string, unknown>;
};

export type MixpanelConfig = {
  readonly apiSecret: string;
  readonly baseUrl?: string;
};

export type AmplitudeConfig = {
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly baseUrl?: string;
};

export type PosthogConfig = {
  readonly apiKey: string;
  readonly projectId: string;
  readonly baseUrl?: string;
  readonly apiKeyPrefix?: string;
};

const formatMixpanelDate = (date: Date) => date.toISOString().slice(0, 10);

const formatAmplitudeDate = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `${year}${month}${day}T${hour}`;
};

const parseJsonLines = (content: string): Record<string, unknown>[] =>
  content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

export const fetchMixpanelEvents = async (
  config: MixpanelConfig,
  range: AnalyticsDateRange
): Promise<AnalyticsEventPayload[]> => {
  const url = new URL(
    config.baseUrl ?? "https://data.mixpanel.com/api/2.0/export"
  );

  url.searchParams.set("from_date", formatMixpanelDate(range.from));
  url.searchParams.set("to_date", formatMixpanelDate(range.to));

  const auth = Buffer.from(`${config.apiSecret}:`).toString("base64");
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Mixpanel export failed: ${response.status}`);
  }

  const body = await response.text();
  const records = parseJsonLines(body);

  return records
    .map((record) => {
      const eventName = record.event;
      const properties = record.properties as
        | Record<string, unknown>
        | undefined;
      const timeValue =
        (properties?.time as number | undefined) ??
        (properties?.$time as number | undefined);

      if (!(eventName && timeValue)) {
        return null;
      }

      const occurredAt = new Date(timeValue * 1000);

      return {
        name: String(eventName),
        occurredAt,
        externalId: properties?.$insert_id
          ? String(properties.$insert_id)
          : undefined,
        userId: properties?.distinct_id
          ? String(properties.distinct_id)
          : undefined,
        userEmail: properties?.email ? String(properties.email) : undefined,
        sessionId: properties?.$session_id
          ? String(properties.$session_id)
          : undefined,
        properties,
        raw: record,
      };
    })
    .filter((event): event is NonNullable<typeof event> => event !== null);
};

export const fetchAmplitudeEvents = async (
  config: AmplitudeConfig,
  range: AnalyticsDateRange
): Promise<AnalyticsEventPayload[]> => {
  const url = new URL(config.baseUrl ?? "https://amplitude.com/api/2/export");
  url.searchParams.set("start", formatAmplitudeDate(range.from));
  url.searchParams.set("end", formatAmplitudeDate(range.to));

  const auth = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString(
    "base64"
  );

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Amplitude export failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  let records: Record<string, unknown>[] = [];

  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    for (const entry of entries) {
      if (entry.isDirectory) {
        continue;
      }

      const content = entry.getData().toString("utf8");
      records = records.concat(parseJsonLines(content));
    }
  } catch {
    const fallback = buffer.toString("utf8");
    records = parseJsonLines(fallback);
  }

  return records
    .map((record) => {
      const eventName = record.event_type ?? record.eventName;
      const timeValue =
        (record.event_time as string | undefined) ??
        (record.client_event_time as string | undefined);

      if (!(eventName && timeValue)) {
        return null;
      }

      const occurredAt = new Date(String(timeValue));

      return {
        name: String(eventName),
        occurredAt,
        externalId: record.event_id ? String(record.event_id) : undefined,
        userId: record.user_id ? String(record.user_id) : undefined,
        userEmail: record.user_email ? String(record.user_email) : undefined,
        sessionId: record.session_id ? String(record.session_id) : undefined,
        properties: record.event_properties as
          | Record<string, unknown>
          | undefined,
        raw: record,
      };
    })
    .filter((event): event is NonNullable<typeof event> => event !== null);
};

export const fetchPosthogEvents = async (
  config: PosthogConfig,
  range: AnalyticsDateRange
): // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
Promise<AnalyticsEventPayload[]> => {
  const baseUrl = config.baseUrl ?? "https://app.posthog.com";
  const apiPrefix = config.apiKeyPrefix ?? "Bearer";
  let nextUrl: string | null = new URL(
    `/api/projects/${config.projectId}/events/`,
    baseUrl
  ).toString();

  const events: AnalyticsEventPayload[] = [];
  const limit = 1000;

  while (nextUrl) {
    const url = new URL(nextUrl);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("after", range.from.toISOString());
    url.searchParams.set("before", range.to.toISOString());

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `${apiPrefix} ${config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`PostHog events failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      results?: Record<string, unknown>[];
      next?: string | null;
    };

    for (const record of payload.results ?? []) {
      const eventName = record.event ?? record.name;
      const timeValue = record.timestamp ?? record.occurred_at;

      if (!(eventName && timeValue)) {
        continue;
      }

      events.push({
        name: String(eventName),
        occurredAt: new Date(String(timeValue)),
        externalId: record.id ? String(record.id) : undefined,
        userId: record.distinct_id ? String(record.distinct_id) : undefined,
        userEmail: record.email ? String(record.email) : undefined,
        sessionId: record.session_id ? String(record.session_id) : undefined,
        properties: record.properties as Record<string, unknown> | undefined,
        raw: record,
      });
    }

    nextUrl = payload.next ?? null;
  }

  return events;
};
