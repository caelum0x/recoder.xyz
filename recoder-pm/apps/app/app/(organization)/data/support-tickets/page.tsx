import { currentOrganizationId } from "@repo/backend/auth/utils";
import type { support_ticket_source } from "@repo/backend/prisma/client";
import { Link } from "@repo/design-system/components/link";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Badge } from "@repo/design-system/components/ui/badge";
import { formatDate } from "@repo/lib/format";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { database } from "@/lib/database";

const sources = ["ZENDESK", "INTERCOM", "EMAIL"];
const sourceLabels: Record<string, string> = {
  ZENDESK: "Zendesk",
  INTERCOM: "Intercom",
  EMAIL: "Email",
};

const pageSize = 50;

export const metadata: Metadata = createMetadata({
  title: "Support Tickets",
  description: "Review customer support tickets and AI analysis.",
});

const buildHref = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `/data/support-tickets?${query}` : "/data/support-tickets";
};

const SupportTicketsPage = async ({
  searchParams,
}: {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return notFound();
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const sourceParam = resolvedSearchParams?.source;
  const pageParam = resolvedSearchParams?.page;

  const source =
    typeof sourceParam === "string" && sources.includes(sourceParam)
      ? (sourceParam as support_ticket_source)
      : undefined;
  const page =
    typeof pageParam === "string" && Number.isFinite(Number(pageParam))
      ? Math.max(1, Number(pageParam))
      : 1;

  const filters = {
    organizationId,
    ...(source ? { source } : {}),
  } as const;

  const [total, tickets] = await Promise.all([
    database.supportTicket.count({ where: filters }),
    database.supportTicket.findMany({
      where: filters,
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
      select: {
        id: true,
        subject: true,
        content: true,
        createdAt: true,
        status: true,
        requesterName: true,
        requesterEmail: true,
        source: true,
        analysis: true,
      },
    }),
  ]);

  if (total === 0) {
    return (
      <div className="px-6 py-16">
        <div className="mx-auto w-full max-w-4xl">
          <EmptyState
            description="Connect Zendesk or Intercom to start ingesting tickets."
            title="No support tickets yet"
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
            Support Tickets
          </h1>
          <p className="text-muted-foreground">
            Review customer support tickets and AI analysis.
          </p>
        </div>

        <StackCard className="grid gap-4">
          <div className="space-y-2">
            <p className="m-0 font-medium text-sm">Filter by source</p>
            <div className="flex flex-wrap gap-2">
              <Link href={buildHref({})}>
                <Badge variant={source ? "secondary" : "default"}>All</Badge>
              </Link>
              {sources.map((item) => (
                <Link href={buildHref({ source: item })} key={item}>
                  <Badge variant={source === item ? "default" : "secondary"}>
                    {sourceLabels[item] ?? item}
                  </Badge>
                </Link>
              ))}
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
          {tickets.map((ticket) => (
            <Link
              className="block px-4 py-5 transition hover:bg-muted/50"
              href={`/data/support-tickets/${ticket.id}`}
              key={ticket.id}
            >
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                <Badge variant="secondary">
                  {sourceLabels[ticket.source] ?? ticket.source}
                </Badge>
                <span>{formatDate(ticket.createdAt)}</span>
                {ticket.status ? <span>Status: {ticket.status}</span> : null}
                {ticket.analysis ? (
                  <span>Analyzed</span>
                ) : (
                  <span>Analyzing</span>
                )}
              </div>
              <div className="mt-2 font-medium text-sm">
                {ticket.subject || "Untitled ticket"}
              </div>
              <p className="mt-1 text-muted-foreground text-sm">
                {(ticket.content ?? "").slice(0, 180) ||
                  "No description provided."}
              </p>
              <p className="mt-2 text-muted-foreground text-xs">
                {ticket.requesterName ?? "Unknown requester"}
                {ticket.requesterEmail ? ` · ${ticket.requesterEmail}` : ""}
              </p>
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
            href={buildHref({ source, page: String(page - 1) })}
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
            href={buildHref({ source, page: String(page + 1) })}
          >
            Next →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SupportTicketsPage;
