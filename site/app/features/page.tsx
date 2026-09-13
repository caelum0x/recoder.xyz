import type { Metadata } from "next";
import { Nav, Footer, DownloadButton, SecondaryButton } from "@/components/site";

export const metadata: Metadata = {
  title: "Features — Recoder",
  description:
    "Run coding agents in isolated git worktrees, compare their changes, and converge the best result into one reviewed, governed merge.",
  alternates: { canonical: "https://recoder.xyz/features" },
};

interface Feature {
  title: string;
  body: string;
  foot: string;
  maturity?: string;
  link?: { href: string; label: string };
}

/**
 * The full feature set, convergence-framed. Mirrors the landing page's #features
 * section but stands on its own — grouped so the page reads isolation → review →
 * economics → durability → governance.
 */
const FEATURES: Feature[] = [
  {
    title: "Parallel worktree isolation",
    body: "Every agent runs in its own git worktree on its own branch. They can all work at once without clobbering each other's files or your working tree.",
    foot: "git worktrees · per-agent branches",
  },
  {
    title: "Your agents, your keys",
    body: "Bring the coding agents you already run — Claude Code, Codex, Cursor, opencode, pi — and your own provider keys. You pay Recoder for orchestration, never for tokens; we don't proxy models.",
    foot: "BYOK · no token resale",
  },
  {
    title: "Review and merge in one place",
    body: "Each workspace shows a change summary, the full diffs, and a live terminal. Comment on any changed line and send it straight back to the agent; approve, merge, or open a PR without leaving the console.",
    foot: "diffs · line comments · PR / merge",
  },
  {
    title: "Evidence-backed merge readiness",
    body: "Before you merge, Recoder folds the signals that matter — a trial-merge preflight, uncommitted-work check, CI checks, PR state, and preview verification — into one truthful verdict. It never fakes a green.",
    foot: "mergeability · checks · PR metadata",
  },
  {
    title: "One shared brain",
    body: "Agents read the repo once and reuse that context instead of re-paying for it on every run. Session transcripts are searchable, and the brain is designed to persist and compound across runs.",
    foot: "repo intel · memory · transcript search",
  },
  {
    title: "Restart-survivable workspaces",
    body: "Recoder keeps a state-of-record on top of tmux and git worktrees, so workspaces survive a restart and reconcile back to a known-good state instead of vanishing.",
    foot: "tmux · worktrees · state-of-record",
  },
  {
    title: "Runs on your machine",
    body: "The control plane is a local desktop app. Your code, your agents, and your keys stay on your box; nothing is proxied through us. It runs fail-closed with a durable local credential store.",
    foot: "local-first · fail-closed auth",
  },
  {
    title: "Built to govern",
    body: "Approvals, deny-biased policy, and a signed audit trail are part of the model, not a bolt-on. Team and cross-machine sync are maturing — we frame them as such, not as shipped.",
    foot: "approvals · policy · audit",
    maturity: "Team sync in development",
    link: { href: "/enterprise", label: "See the enterprise moat" },
  },
];

export default function Features() {
  return (
    <>
      <Nav />
      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div className="hero-glow pointer-events-none absolute inset-0" />
          <div className="grid-faint pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-3xl px-6 py-20 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-soft px-3 py-1 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Everything in the console
            </span>
            <h1 className="text-balance mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
              N divergent agents. One trusted merge.
            </h1>
            <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
              Isolation while they work, convergence when they finish. Recoder
              runs your coding agents in parallel and converges their work into
              a merge you can actually trust — on your machine.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <DownloadButton />
              <SecondaryButton href="/how-it-works" label="See how it works" />
            </div>
          </div>
        </section>

        <section className="bg-bg-soft">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
            <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex flex-col gap-3 bg-bg p-8">
                  <h2 className="text-lg font-semibold tracking-tight">{f.title}</h2>
                  <p className="text-sm leading-relaxed text-muted">{f.body}</p>
                  <div className="mt-auto flex flex-col gap-2 pt-2">
                    <span className="text-xs text-muted/80">{f.foot}</span>
                    {f.maturity ? (
                      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                        {f.maturity}
                      </span>
                    ) : null}
                    {f.link ? (
                      <a href={f.link.href} className="text-sm text-accent hover:underline">
                        {f.link.label} →
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-3xl px-6 py-20 text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              Run your coding agents in parallel.
            </h2>
            <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
              Launch them in isolated worktrees, watch them work, review the
              diffs, and merge — all from one desktop console.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <DownloadButton />
              <SecondaryButton href="/self-host" label="Self-host" />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
