export type ZendeskTicket = {
  readonly id: number;
  readonly subject?: string;
  readonly description?: string;
  readonly status?: string;
  readonly requester_id?: number;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly raw: Record<string, unknown>;
};

export type ZendeskIncrementalResponse = {
  readonly end_of_stream: boolean;
  readonly end_time: number;
  readonly next_page?: string | null;
  readonly tickets: Record<string, unknown>[];
};

const createAuthHeader = (email: string, apiToken: string) => {
  const auth = Buffer.from(`${email}/token:${apiToken}`).toString("base64");
  return `Basic ${auth}`;
};

export const fetchZendeskTickets = async ({
  subdomain,
  email,
  apiToken,
  startTime,
}: {
  readonly subdomain: string;
  readonly email: string;
  readonly apiToken: string;
  readonly startTime: number;
}): Promise<{ tickets: ZendeskTicket[]; endTime: number }> => {
  const baseUrl = `https://${subdomain}.zendesk.com/api/v2/incremental/tickets.json`;
  const url = new URL(baseUrl);
  url.searchParams.set("start_time", String(startTime));

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: createAuthHeader(email, apiToken),
    },
  });

  if (!response.ok) {
    throw new Error(`Zendesk export failed: ${response.status}`);
  }

  const payload = (await response.json()) as ZendeskIncrementalResponse;

  const tickets = (payload.tickets ?? []).map((ticket) => ({
    id: Number(ticket.id),
    subject: ticket.subject ? String(ticket.subject) : undefined,
    description: ticket.description ? String(ticket.description) : undefined,
    status: ticket.status ? String(ticket.status) : undefined,
    requester_id: ticket.requester_id ? Number(ticket.requester_id) : undefined,
    created_at: ticket.created_at ? String(ticket.created_at) : undefined,
    updated_at: ticket.updated_at ? String(ticket.updated_at) : undefined,
    raw: ticket,
  }));

  return {
    tickets,
    endTime: payload.end_time ?? startTime,
  };
};
