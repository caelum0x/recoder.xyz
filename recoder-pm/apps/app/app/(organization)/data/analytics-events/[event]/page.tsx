import { currentOrganizationId } from "@repo/backend/auth/utils";
import { Link } from "@repo/design-system/components/link";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Badge } from "@repo/design-system/components/ui/badge";
import { formatDate } from "@repo/lib/format";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";

const providerLabels: Record<string, string> = {
  MIXPANEL: "Mixpanel",
  AMPLITUDE: "Amplitude",
  POSTHOG: "PostHog",
};

export const dynamic = "force-dynamic";
type AnalyticsEventPageProps = {
  readonly params: Promise<{ event: string }>;
};

export const generateMetadata = async (
  props: AnalyticsEventPageProps
): Promise<Metadata> => {
  const params = await props.params;
  const event = await database.analyticsEvent.findUnique({
    where: { id: params.event },
    select: { name: true },
  });

  return createMetadata({
    title: event?.name ?? "Analytics Event",
    description: "Analytics event details.",
  });
};

const AnalyticsEventPage = async (props: AnalyticsEventPageProps) => {
  const params = await props.params;
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    notFound();
  }

  const event = await database.analyticsEvent.findFirst({
    where: {
      id: params.event,
      organizationId,
    },
    select: {
      id: true,
      name: true,
      provider: true,
      occurredAt: true,
      userId: true,
      userEmail: true,
      sessionId: true,
      properties: true,
      raw: true,
    },
  });

  if (!event) {
    notFound();
  }

  return (
    <div className="px-6 py-16">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div className="space-y-2">
          <Link
            className="text-muted-foreground text-sm"
            href="/data/analytics-events"
          >
            ← Back to analytics events
          </Link>
          <h1 className="m-0 font-semibold text-4xl tracking-tight">
            {event.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            <Badge variant="secondary">
              {providerLabels[event.provider] ?? event.provider}
            </Badge>
            <span>{formatDate(event.occurredAt)}</span>
            {event.userEmail ? <span>{event.userEmail}</span> : null}
            {event.userId ? <span>User ID: {event.userId}</span> : null}
            {event.sessionId ? <span>Session: {event.sessionId}</span> : null}
          </div>
        </div>

        <StackCard className="space-y-4">
          <h2 className="font-semibold text-lg">Properties</h2>
          <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-foreground text-xs">
            {JSON.stringify(event.properties ?? {}, null, 2)}
          </pre>
        </StackCard>

        <StackCard className="space-y-4">
          <h2 className="font-semibold text-lg">Raw Payload</h2>
          <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-foreground text-xs">
            {JSON.stringify(event.raw ?? {}, null, 2)}
          </pre>
        </StackCard>
      </div>
    </div>
  );
};

export default AnalyticsEventPage;
