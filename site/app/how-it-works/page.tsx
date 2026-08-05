import type { Metadata } from "next";
import { Nav, Footer, DownloadButton, SecondaryButton } from "@/components/site";

export const metadata: Metadata = {
  title: "How Recoder works",
  description:
    "Give one task to several AI coding agents at once, watch them diverge in isolated git worktrees, then converge the best result into one governed merge — all from one terminal.",
};

interface Step {
  n: string;
  title: string;
  body: string;
  foot: string;
}

/**
 * The four beats of the converge loop, in order. These mirror the landing
 * page's #how section but stand on their own as a full page. The payoff beat
 * is convergence — the thing that separates Recoder from "run agents in
 * parallel" tooling, so it leads the story rather than hiding behind "review".
 */
const LOOP: Step[] = [
  {
    n: "01",
    title: "One task, several agents",
    body: "Point Recoder at a local git repo and hand the same task to Claude Code, Codex, Cursor, or opencode — at once, from one terminal. Your code stays on your machine.",
    foot: "one prompt · many agents",
  },
  {
    n: "02",
    title: "Isolated worktrees",
    body: "Each agent gets its own git worktree on its own branch, so they run in parallel without ever touching each other's files or your working tree.",
    foot: "git worktrees · per-agent branches",
  },
  {
    n: "03",
    title: "See where they diverge",
    body: "When the agents finish, Recoder lines the results up and shows you exactly which files they agree on and which they contest — instead of diffing five branches by hand.",
    foot: "agreed vs. contested files",
  },
  {
    n: "04",
    title: "Converge into one",
    body: "Pick the best result, or let Recoder synthesize a merge from the parts the agents agree on. Land it with a governed merge and a sealed evidence trail you can hand to a teammate.",
    foot: "pick · synthesize · governed merge",
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
    body: "Every agent runs in its own worktree on its own branch, so parallel agents never collide on your working tree. They move fast without stepping on each other.",
    foot: "git worktrees · parallel branches",
  },
  {
    title: "Convergence when they finish",
    body: "The terminal turns several divergent runs into one trusted change: compare what the agents did, converge the best of it, and merge — without leaving the keyboard.",
    foot: "compare · converge · merge",
  },
  {
    title: "Survives restarts",
    body: "Your workspaces reconcile back to a known-good state after a restart instead of vanishing, so a long parallel run is never lost to a crash or a reboot.",
    foot: "durable workspaces",
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
              The terminal IDE for AI agents
            </span>
            <h1 className="text-balance mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
              Run every agent on one task. Merge the best result.
            </h1>
            <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
              Recoder is the terminal IDE for AI coding agents. Give one task to
              Claude Code, Codex, and Cursor at once, watch them diverge in
              isolated git worktrees, then converge the best into one governed
              merge.
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

        {/* The loop, step by step */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-2xl">
            <div className="text-xs font-medium uppercase tracking-wider text-accent">
              The loop
            </div>
            <h2 className="text-balance mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
              One task, many agents, one converged change.
            </h2>
            <p className="mt-4 text-muted">
              Four beats, every time: give one task to several agents, let each
              work in its own isolated worktree, see exactly where they diverge,
              then converge the best result into one.
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
                Isolation when they work. Convergence when they finish.
              </h2>
              <p className="mt-4 text-muted">
                Worktrees keep agents apart so they don&apos;t collide. The
                terminal brings their work back together so you can converge it
                into one change and ship it.
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
              The next decade of coding happens in the terminal.
            </h2>
            <p className="text-balance mx-auto mt-3 max-w-xl text-muted">
              Give one task to several agents, converge the best result, and
              merge it with a trail you can trust.
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
