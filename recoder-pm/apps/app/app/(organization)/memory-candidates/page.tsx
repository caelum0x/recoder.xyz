import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Memory Candidates",
  description: "Review proposed Recoder Agent OS memory updates.",
};

type MemoryCandidate = {
  candidateId?: string;
  scope?: string;
  title?: string;
  body?: string;
  status?: string;
  proposedBy?: string;
  proposedAt?: string;
};

type AgentOsMemoryResponse = {
  success?: boolean;
  data?: {
    candidates?: MemoryCandidate[];
  };
  error?: string;
};

async function loadMemoryCandidates(): Promise<{
  source: string;
  candidates: MemoryCandidate[];
  error?: string;
}> {
  const baseUrl = process.env.RECODER_AGENT_OS_API_URL ?? process.env.NEXT_PUBLIC_RECODER_API_URL;

  if (!baseUrl) {
    return {
      source: "not_configured",
      candidates: [],
      error: "RECODER_AGENT_OS_API_URL is not configured for this PM deployment.",
    };
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/agent-os/memory`, {
      cache: "no-store",
      headers: process.env.RECODER_API_TOKEN
        ? { authorization: `Bearer ${process.env.RECODER_API_TOKEN}` }
        : undefined,
    });
    const body = (await response.json()) as AgentOsMemoryResponse;
    return {
      source: baseUrl,
      candidates: Array.isArray(body.data?.candidates) ? body.data.candidates : [],
      error: response.ok ? body.error : body.error ?? `Agent OS API returned ${response.status}`,
    };
  } catch (error) {
    return {
      source: baseUrl,
      candidates: [],
      error: error instanceof Error ? error.message : "Failed to load Agent OS memory candidates.",
    };
  }
}

const MemoryCandidatesPage = async () => {
  const { source, candidates, error } = await loadMemoryCandidates();

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 p-6 py-16">
      <div className="grid gap-2">
        <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.2em]">
          Recoder Agent OS
        </p>
        <h1 className="m-0 font-semibold text-4xl tracking-tight">
          Memory Candidates
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Reviewable, scoped, provenance-linked operational memories proposed
          by agents after runs complete.
        </p>
      </div>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 font-semibold text-xl">Review Queue</h2>
            <p className="text-muted-foreground text-sm">
              Source: {source}
            </p>
          </div>
          <div className="rounded-full border px-3 py-1 font-medium text-sm">
            {candidates.length} candidates
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
            {error}
          </p>
        ) : null}

        <div className="mt-5 grid gap-3">
          {candidates.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
              No Agent OS memory candidates are currently available from the
              configured control-plane API.
            </p>
          ) : (
            candidates.map((candidate) => (
              <article
                className="rounded-lg border p-4"
                key={candidate.candidateId ?? `${candidate.scope}-${candidate.proposedAt}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="m-0 font-medium">{candidate.title ?? "Memory candidate"}</h3>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs">
                    {candidate.status ?? "unknown"}
                  </span>
                </div>
                <p className="mt-2 text-muted-foreground text-sm">
                  Scope {candidate.scope ?? "unknown"} · Proposed by {candidate.proposedBy ?? "unknown"}
                </p>
                {candidate.body ? (
                  <p className="mt-3 text-sm">{candidate.body}</p>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default MemoryCandidatesPage;
