import { currentOrganizationId } from "@repo/backend/auth/utils";
import type { analytics_provider } from "@repo/backend/prisma/client";
import { Link } from "@repo/design-system/components/link";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Badge } from "@repo/design-system/components/ui/badge";
import { formatDate } from "@repo/lib/format";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { database } from "@/lib/database";

const providers = ["MIXPANEL", "AMPLITUDE", "POSTHOG"];
const providerLabels: Record<string, string> = {
  MIXPANEL: "Mixpanel",
  AMPLITUDE: "Amplitude",
  POSTHOG: "PostHog",
};

const pageSize = 50;

export const metadata: Metadata = createMetadata({
  title: "Analytics Events",
  description: "Review ingested product analytics events.",
});

const buildHref = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `/data/analytics-events?${query}` : "/data/analytics-events";
};

const AnalyticsEventsPage = async ({
  searchParams,
}: {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return notFound();
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const providerParam = resolvedSearchParams?.provider;
  const queryParam = resolvedSearchParams?.query;
  const pageParam = resolvedSearchParams?.page;

  const provider =
    typeof providerParam === "string" && providers.includes(providerParam)
      ? (providerParam as analytics_provider)
      : undefined;
  const query = typeof queryParam === "string" ? queryParam.trim() : "";
  const page =
    typeof pageParam === "string" && Number.isFinite(Number(pageParam))
      ? Math.max(1, Number(pageParam))
      : 1;

  const filters = {
    organizationId,
    ...(provider ? { provider } : {}),
    ...(query
      ? {
          name: {
            contains: query,
            mode: "insensitive" as const,
          },
        }
      : {}),
  } as const;

  const [total, events] = await Promise.all([
    database.analyticsEvent.count({ where: filters }),
    database.analyticsEvent.findMany({
      where: filters,
      orderBy: { occurredAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
      select: {
        id: true,
        name: true,
        provider: true,
        occurredAt: true,
        userId: true,
        userEmail: true,
        sessionId: true,
      },
    }),
  ]);

  if (total === 0) {
    return (
      <div className="px-6 py-16">
        <div className="mx-auto w-full max-w-4xl">
          <EmptyState
            description="Connect a product analytics provider to start ingesting events."
            title="No analytics events yet"
          />
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6 px-6 py-16">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="space-y-2">
          <h1 className="m-0 font-semibold text-4xl tracking-tight">
            Analytics Events
          </h1>
          <p className="text-muted-foreground">
            Review ingested product analytics events.
          </p>
        </div>

        <StackCard className="grid gap-4">
          <div className="space-y-2">
            <p className="m-0 font-medium text-sm">Filter by provider</p>
            <div className="flex flex-wrap gap-2">
              <Link href={buildHref({ query })}>
                <Badge variant={provider ? "secondary" : "default"}>All</Badge>
              </Link>
              {providers.map((item) => (
                <Link href={buildHref({ provider: item, query })} key={item}>
                  <Badge variant={provider === item ? "default" : "secondary"}>
                    {providerLabels[item] ?? item}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="m-0 font-medium text-sm">Search by event name</p>
            <div className="flex flex-wrap gap-2 text-muted-foreground text-sm">
              {query ? (
                <>
                  <span>Filtering by:</span>
                  <Badge variant="secondary">{query}</Badge>
                  <Link className="text-primary" href={buildHref({ provider })}>
                    Clear
                  </Link>
                </>
              ) : (
                <span>Add ?query=your-event-name to the URL to filter.</span>
              )}
            </div>
          </div>
        </StackCard>

        <div className="flex items-center justify-between text-muted-foreground text-sm">
          <div>
            Showing {(page - 1) * pageSize + 1}-
            {Math.min(page * pageSize, total)} of {total}
          </div>
        </div>

        <StackCard className="divide-y p-0">
          {events.map((event) => (
            <Link
              className="block px-4 py-5 transition hover:bg-muted/50"
              href={`/data/analytics-events/${event.id}`}
              key={event.id}
            >
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                <Badge variant="secondary">
                  {providerLabels[event.provider] ?? event.provider}
                </Badge>
                <span>{formatDate(event.occurredAt)}</span>
                {event.userEmail ? <span>{event.userEmail}</span> : null}
                {event.userId ? <span>User ID: {event.userId}</span> : null}
                {event.sessionId ? (
                  <span>Session: {event.sessionId}</span>
                ) : null}
              </div>
              <div className="mt-2 font-medium text-sm">{event.name}</div>
            </Link>
          ))}
        </StackCard>

        <div className="flex items-center justify-between text-sm">
          <Link
            className={
              page > 1
                ? "text-primary"
                : "pointer-events-none text-muted-foreground"
            }
            href={buildHref({ provider, query, page: String(page - 1) })}
          >
            ← Previous
          </Link>
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Link
            className={
              page < totalPages
                ? "text-primary"
                : "pointer-events-none text-muted-foreground"
            }
            href={buildHref({ provider, query, page: String(page + 1) })}
          >
            Next →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsEventsPage;
