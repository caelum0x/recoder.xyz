import type { Metadata } from "next";
import { Button } from "@repo/design-system/components/ui/button";
import { decideAgentOsApproval } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agent Approvals",
  description: "Review Recoder Agent OS approval gates and decisions.",
};

type AgentOsApproval = {
  approvalId?: string;
  taskId?: string;
  runId?: string;
  status?: string;
  reason?: string;
  requestedBy?: string;
  requestedAt?: string;
  requiredAt?: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionReason?: string;
  target?: {
    path?: string;
    command?: string;
    toolName?: string;
  };
};

type AgentOsResponse<T> = {
  success?: boolean;
  data?: T;
  error?: string;
};

async function loadApprovals(): Promise<{
  source: string;
  approvals: AgentOsApproval[];
  error?: string;
}> {
  const baseUrl = process.env.RECODER_AGENT_OS_API_URL ?? process.env.NEXT_PUBLIC_RECODER_API_URL;

  if (!baseUrl) {
    return {
      source: "not_configured",
      approvals: [],
      error: "RECODER_AGENT_OS_API_URL is not configured for this PM deployment.",
    };
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/agent-os/approvals`, {
      cache: "no-store",
      headers: process.env.RECODER_API_TOKEN
        ? { authorization: `Bearer ${process.env.RECODER_API_TOKEN}` }
        : undefined,
    });
    const body = (await response.json()) as AgentOsResponse<AgentOsApproval[]>;
    return {
      source: baseUrl,
      approvals: Array.isArray(body.data) ? body.data : [],
      error: response.ok ? body.error : body.error ?? `Agent OS API returned ${response.status}`,
    };
  } catch (error) {
    return {
      source: baseUrl,
      approvals: [],
      error: error instanceof Error ? error.message : "Failed to load Agent OS approvals.",
    };
  }
}

const ApprovalsPage = async () => {
  const { source, approvals, error } = await loadApprovals();
  const pendingCount = approvals.filter((approval) =>
    approval.status === "pending" || approval.status === "escalated"
  ).length;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 p-6 py-16">
      <div className="grid gap-2">
        <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.2em]">
          Recoder Agent OS
        </p>
        <h1 className="m-0 font-semibold text-4xl tracking-tight">
          Approval Gates
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          PM approval, rejection, pause, and handoff checkpoints backed by the
          shared Agent OS run lifecycle.
        </p>
      </div>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 font-semibold text-xl">Pending Review</h2>
            <p className="text-muted-foreground text-sm">
              Source: {source}
            </p>
          </div>
          <div className="rounded-full border px-3 py-1 font-medium text-sm">
            {pendingCount} pending · {approvals.length} total
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
            {error}
          </p>
        ) : null}

        <div className="mt-5 grid gap-3">
          {approvals.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
              No Agent OS approvals are currently available from the configured
              control-plane API.
            </p>
          ) : (
            approvals.map((approval) => (
              <article
                className="rounded-lg border p-4"
                key={approval.approvalId ?? `${approval.taskId}-${approval.requestedAt}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <h3 className="m-0 font-medium">{approval.reason ?? "Approval request"}</h3>
                    <p className="text-muted-foreground text-sm">
                      Task {approval.taskId ?? "unknown"} · Required {approval.requiredAt ?? "by policy"}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs">
                    {approval.status ?? "unknown"}
                  </span>
                </div>

                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Requested by</dt>
                    <dd>{approval.requestedBy ?? "unknown"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Requested at</dt>
                    <dd>{approval.requestedAt ?? "unknown"}</dd>
                  </div>
                  {approval.target?.toolName || approval.target?.command || approval.target?.path ? (
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Target</dt>
                      <dd className="font-mono text-xs">
                        {approval.target.toolName ?? approval.target.command ?? approval.target.path}
                      </dd>
                    </div>
                  ) : null}
                  {approval.decidedAt ? (
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Decision</dt>
                      <dd>
                        {approval.decidedBy ?? "unknown"} · {approval.decidedAt}
                        {approval.decisionReason ? ` · ${approval.decisionReason}` : ""}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {approval.approvalId && (approval.status === "pending" || approval.status === "escalated") ? (
                  <form action={decideAgentOsApproval} className="mt-4 grid gap-3 border-t pt-4">
                    <input name="approvalId" type="hidden" value={approval.approvalId} />
                    <label className="grid gap-1 text-sm">
                      <span className="text-muted-foreground">Decision reason</span>
                      <input
                        className="rounded-md border bg-background px-3 py-2"
                        name="reason"
                        placeholder="Optional"
                        type="text"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button name="decision" type="submit" value="approve">
                        Approve
                      </Button>
                      <Button name="decision" type="submit" value="reject" variant="destructive">
                        Reject
                      </Button>
                    </div>
                  </form>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default ApprovalsPage;
