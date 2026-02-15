import { currentOrganizationId } from "@repo/backend/auth/utils";
import { Link } from "@repo/design-system/components/link";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Badge } from "@repo/design-system/components/ui/badge";
import { formatDate } from "@repo/lib/format";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";

const sourceLabels: Record<string, string> = {
  ZENDESK: "Zendesk",
  INTERCOM: "Intercom",
  EMAIL: "Email",
};

type SupportTicketPageProps = {
  readonly params: Promise<{ ticket: string }>;
};

export const generateMetadata = async (
  props: SupportTicketPageProps
): Promise<Metadata> => {
  const params = await props.params;
  const ticket = await database.supportTicket.findUnique({
    where: { id: params.ticket },
    select: { subject: true },
  });

  return createMetadata({
    title: ticket?.subject ?? "Support Ticket",
    description: "Support ticket details and AI analysis.",
  });
};

const SupportTicketPage = async (props: SupportTicketPageProps) => {
  const params = await props.params;
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    notFound();
  }

  const ticket = await database.supportTicket.findFirst({
    where: {
      id: params.ticket,
      organizationId,
    },
    select: {
      id: true,
      subject: true,
      content: true,
      createdAt: true,
      status: true,
      source: true,
      requesterName: true,
      requesterEmail: true,
      analysis: true,
    },
  });

  if (!ticket) {
    notFound();
  }

  const analysis = (ticket.analysis ?? {}) as {
    summary?: string;
    themes?: string[];
    painPoints?: string[];
    featureRequests?: string[];
    urgency?: "low" | "medium" | "high";
  };

  return (
    <div className="px-6 py-16">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div className="space-y-2">
          <Link
            className="text-muted-foreground text-sm"
            href="/data/support-tickets"
          >
            ← Back to support tickets
          </Link>
          <h1 className="m-0 font-semibold text-4xl tracking-tight">
            {ticket.subject || "Untitled ticket"}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            <Badge variant="secondary">
              {sourceLabels[ticket.source] ?? ticket.source}
            </Badge>
            <span>{formatDate(ticket.createdAt)}</span>
            {ticket.status ? <span>Status: {ticket.status}</span> : null}
            {analysis.urgency ? <span>Urgency: {analysis.urgency}</span> : null}
          </div>
          <p className="text-muted-foreground text-sm">
            {ticket.requesterName ?? "Unknown requester"}
            {ticket.requesterEmail ? ` · ${ticket.requesterEmail}` : ""}
          </p>
        </div>

        <StackCard className="space-y-4">
          <h2 className="font-semibold text-lg">Ticket Content</h2>
          <p className="whitespace-pre-wrap text-foreground/90 text-sm">
            {ticket.content || "No description provided."}
          </p>
        </StackCard>

        <StackCard className="space-y-4">
          <h2 className="font-semibold text-lg">AI Analysis</h2>
          {analysis.summary ? (
            <p className="text-foreground/90 text-sm">{analysis.summary}</p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Analysis is still processing.
            </p>
          )}
          {analysis.themes?.length ? (
            <div className="space-y-2">
              <h3 className="font-medium">Themes</h3>
              <ul className="list-disc pl-5 text-foreground/90 text-sm">
                {analysis.themes.map((theme) => (
                  <li key={theme}>{theme}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {analysis.painPoints?.length ? (
            <div className="space-y-2">
              <h3 className="font-medium">Pain Points</h3>
              <ul className="list-disc pl-5 text-foreground/90 text-sm">
                {analysis.painPoints.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {analysis.featureRequests?.length ? (
            <div className="space-y-2">
              <h3 className="font-medium">Feature Requests</h3>
              <ul className="list-disc pl-5 text-foreground/90 text-sm">
                {analysis.featureRequests.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </StackCard>
      </div>
    </div>
  );
};

export default SupportTicketPage;
