import type { Metadata } from "next";
import { Nav, Footer, DownloadButton, SecondaryButton } from "@/components/site";

export const metadata: Metadata = {
  title: "How Recoder works",
  description:
    "The parallel-agents loop: spin up workspaces, give each agent its own isolated git worktree, run your own coding agents side by side, then review the diffs and merge — all from one desktop console.",
};

interface Step {
  n: string;
  title: string;
  body: string;
  foot: string;
}

/**
 * The four beats of the parallel-agents loop, in order. These mirror the
 * landing page's #how section but stand on their own as a full page.
 */
const LOOP: Step[] = [
  {
    n: "01",
    title: "Open a workspace",
    body: "Point Recoder at a local git repo and open a workspace for the change you want. Your code stays on your machine — Recoder drives the agents and git you already have.",
    foot: "local repo · stays on your machine",
  },
  {
    n: "02",
    title: "Isolated worktrees",
    body: "Each workspace gets its own git worktree on its own branch. Agents can all work at once without clobbering each other's files or your working tree.",
    foot: "git worktrees · per-agent branches",
  },
  {
    n: "03",
    title: "Run your own agents",
    body: "Spin up Claude Code, Codex, Cursor, or opencode — in parallel. You bring your own agents and your own provider keys; Recoder never resells tokens.",
    foot: "Claude Code · Codex · Cursor · opencode",
  },
  {
    n: "04",
    title: "Review & merge",
    body: "Watch each workspace in the sidebar, read its change summary, review the full diffs in the console, then merge — or open a pull request — when it's ready.",
    foot: "diffs · terminal · PR / merge",
  },
];

interface Detail {
  title: string;
  body: string;
  foot: string;
}

const DETAILS: Detail[] = [
  {
    title: "Isolation when they work",
    body: "Every agent runs in its own worktree on its own branch, so parallel agents never collide on your working tree. They move fast in parallel without stepping on each other.",
    foot: "git worktrees · parallel branches",
  },
  {
    title: "Coordination when you review",
    body: "The console brings every workspace back into one place: a change summary, the full diffs, and a live terminal. Approve, merge, or open a PR without leaving Recoder.",
    foot: "change summary · diffs · terminal",
  },
  {
    title: "Restart-survivable",
    body: "Recoder keeps a state-of-record on top of tmux and git worktrees, so your workspaces survive a restart and reconcile back to a known-good state instead of vanishing.",
    foot: "tmux · worktrees · state-of-record",
  },
];

export default function HowItWorks() {
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
              The parallel-agents loop
            </span>
            <h1 className="text-balance mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
              From one repo to many agents — without the chaos.
            </h1>
            <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
              Recoder is the desktop console that lets you launch parallel
              coding agents in isolated git worktrees, watch them work, review
              their diffs, and merge — all in one place.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <DownloadButton
                label="Download"
                className="px-6 py-3 text-[15px]"
              />
              <SecondaryButton href="/self-host" label="Self-host it →" />
            </div>
          </div>
        </section>

        {/* The loop, step by step */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-2xl">
            <div className="text-xs font-medium uppercase tracking-wider text-accent">
              The loop
            </div>
            <h2 className="text-balance mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
              Workspaces, worktrees, your agents, then review.
            </h2>
            <p className="mt-4 text-muted">
              Four beats, every time: open a workspace, give each agent an
              isolated worktree, run your own agents in parallel, then bring the
              good changes home.
            </p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
            {LOOP.map((s) => (
              <div key={s.n} className="flex flex-col bg-bg p-7">
                <div className="font-mono text-sm text-accent">{s.n}</div>
                <h3 className="mt-3 text-lg font-medium">{s.title}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
                  {s.body}
                </p>
                <p className="mt-5 font-mono text-[11px] text-faint">{s.foot}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Why it holds together */}
        <section className="border-y border-border bg-bg-soft">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <div className="text-xs font-medium uppercase tracking-wider text-accent">
                Why it holds together
              </div>
              <h2 className="text-balance mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
                Isolation when they work. Coordination when you review.
              </h2>
              <p className="mt-4 text-muted">
                Worktrees keep agents apart so they don&apos;t collide. The
                console brings their work back together so you can ship it.
              </p>
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
              {DETAILS.map((d) => (
                <div key={d.title} className="flex flex-col bg-bg p-7">
                  <h3 className="font-medium">{d.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
                    {d.body}
                  </p>
                  <p className="mt-5 font-mono text-[11px] text-faint">
                    {d.foot}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-3xl px-6 py-20 text-center">
            <h2 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
              Run your coding agents in parallel.
            </h2>
            <p className="text-balance mx-auto mt-3 max-w-xl text-muted">
              Bring your own agents and keys. Recoder gives them isolated
              worktrees, then brings the diffs back so you can review and merge.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <DownloadButton
                label="Download"
                className="px-6 py-3 text-[15px]"
              />
              <SecondaryButton href="/enterprise" label="For teams →" />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
