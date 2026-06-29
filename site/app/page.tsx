import Link from "next/link";
import { Nav, Footer, DownloadButton } from "@/components/site";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <DesktopConsole />
        <RunsWith />
        <HowItWorks />
        <Features />
        <KeysNote />
        <PlanTeaser />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="hero-glow pointer-events-none absolute inset-0" />
      <div className="grid-faint pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-6xl px-6 pb-10 pt-20 md:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-soft px-3 py-1 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            A desktop app for parallel coding agents
          </span>
          <h1 className="text-balance mt-6 text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Run your coding agents in parallel.
          </h1>
          <p className="text-balance mx-auto mt-5 max-w-2xl text-base text-muted md:text-lg">
            Recoder is a desktop app for running your own Claude Code, Codex,
            Cursor &amp; opencode agents in isolated git-worktree workspaces —
            see what they&apos;re doing, review their diffs, and merge.
          </p>
          <div className="mt-8 flex items-center justify-center gap-5">
            <DownloadButton className="px-6 py-3 text-[15px]" />
            <Link
              href="/#how"
              className="text-sm text-muted transition-colors hover:text-fg"
            >
              How it works →
            </Link>
          </div>
          <p className="mt-4 text-xs text-faint">
            Desktop app · macOS, Windows, Linux · bring your own agents and keys
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * 3-pane desktop console — an HONEST illustrated mockup of the app.
 * It is a CSS/SVG rendering, clearly labelled "Illustration", never a
 * live screenshot. Every value below is an example, not a captured run.
 * ------------------------------------------------------------------ */

interface Workspace {
  repo: string;
  branch: string;
  agent: string;
  status: "running" | "review" | "conflict" | "merged";
  add: number;
  del: number;
}

const WORKSPACES: Workspace[] = [
  {
    repo: "web-app",
    branch: "agent/auth-refactor",
    agent: "Claude Code",
    status: "running",
    add: 84,
    del: 31,
  },
  {
    repo: "web-app",
    branch: "agent/v2-routes",
    agent: "Codex",
    status: "review",
    add: 212,
    del: 9,
  },
  {
    repo: "billing-svc",
    branch: "agent/stripe-webhooks",
    agent: "Cursor",
    status: "conflict",
    add: 47,
    del: 63,
  },
  {
    repo: "docs-site",
    branch: "agent/migrate-mdx",
    agent: "opencode",
    status: "merged",
    add: 18,
    del: 4,
  },
];

const STATUS_META: Record<
  Workspace["status"],
  { label: string; dot: string; text: string; ring: string }
> = {
  running: {
    label: "Running",
    dot: "bg-emerald-400",
    text: "text-emerald-400",
    ring: "ring-emerald-400/30",
  },
  review: {
    label: "Ready to review",
    dot: "bg-accent",
    text: "text-accent",
    ring: "ring-accent/40",
  },
  conflict: {
    label: "Merge conflicts",
    dot: "bg-amber-400",
    text: "text-amber-400",
    ring: "ring-amber-400/30",
  },
  merged: {
    label: "Merged",
    dot: "bg-faint",
    text: "text-faint",
    ring: "ring-border",
  },
};

function DesktopConsole() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 pb-16">
      <figure className="mx-auto max-w-5xl">
        <div className="overflow-hidden rounded-xl border border-border-strong bg-bg-soft shadow-2xl">
          {/* Title bar */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span aria-hidden className="h-3 w-3 rounded-full bg-faint/50" />
            <span aria-hidden className="h-3 w-3 rounded-full bg-faint/40" />
            <span aria-hidden className="h-3 w-3 rounded-full bg-faint/30" />
            <span className="ml-3 text-xs text-muted">
              Recoder — Conductor · 4 workspaces · 3 agents running
            </span>
            <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-faint">
              Illustration
            </span>
          </div>

          {/* 3-pane layout */}
          <div className="grid bg-border md:grid-cols-[230px_1fr_1fr] md:gap-px">
            <WorkspacesSidebar />
            <CenterPane />
            <RightPane />
          </div>
        </div>
        <figcaption className="mt-3 text-center text-xs text-faint">
          Illustration of the Recoder desktop console — an example layout, not a
          live screen capture.
        </figcaption>
      </figure>
    </section>
  );
}

function WorkspacesSidebar() {
  return (
    <aside className="bg-bg-soft p-3">
      <div className="flex items-center justify-between px-2 pb-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-faint">
          Workspaces
        </span>
        <span
          aria-hidden
          className="flex h-5 w-5 items-center justify-center rounded border border-border text-muted"
        >
          +
        </span>
      </div>
      <ul className="space-y-1">
        {WORKSPACES.map((w, i) => {
          const meta = STATUS_META[w.status];
          const active = i === 1;
          return (
            <li
              key={w.branch}
              className={
                "rounded-md border px-2.5 py-2 " +
                (active
                  ? "border-border-strong bg-white/[0.04]"
                  : "border-transparent")
              }
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={"h-1.5 w-1.5 rounded-full " + meta.dot}
                />
                <span className="font-mono text-[11px] text-fg">{w.repo}</span>
                <span className="ml-auto font-mono text-[10px] text-emerald-400/80">
                  +{w.add}
                </span>
                <span className="font-mono text-[10px] text-rose-400/70">
                  −{w.del}
                </span>
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-muted">
                {w.branch}
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-faint">{w.agent}</span>
                <span className={"text-[10px] " + meta.text}>{meta.label}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function CenterPane() {
  return (
    <div className="bg-bg-soft p-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <div className="font-mono text-xs text-fg">agent/v2-routes</div>
          <div className="font-mono text-[10px] text-faint">
            Codex · web-app
          </div>
        </div>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent ring-1 ring-accent/40">
          Ready to review
        </span>
      </div>

      {/* Conversation */}
      <div className="mt-3 space-y-3">
        <ChatLine
          who="you"
          text="Add versioned /v2 API routes and keep /v1 stable."
        />
        <ChatLine
          who="agent"
          text="Created src/api/v2/router.ts, mounted under /v2, and left /v1 untouched. Added 6 handlers + tests."
        />
      </div>

      {/* Change summary */}
      <div className="mt-4 rounded-lg border border-border bg-bg p-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-faint">
          Change summary
        </div>
        <ul className="mt-2 space-y-1 text-[11px] text-muted">
          <li>+ src/api/v2/router.ts (new)</li>
          <li>+ src/api/v2/handlers.ts (new)</li>
          <li>~ src/api/index.ts (mount /v2)</li>
          <li>+ tests/v2.routes.test.ts (new)</li>
        </ul>
        <div className="mt-2 flex items-center gap-3 font-mono text-[10px]">
          <span className="text-emerald-400/80">+212</span>
          <span className="text-rose-400/70">−9</span>
          <span className="text-faint">4 files</span>
        </div>
      </div>
    </div>
  );
}

function ChatLine({ who, text }: { who: "you" | "agent"; text: string }) {
  const isYou = who === "you";
  return (
    <div className="flex gap-2.5">
      <span
        className={
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-medium " +
          (isYou
            ? "bg-white/[0.06] text-fg"
            : "bg-accent/15 text-accent ring-1 ring-accent/30")
        }
      >
        {isYou ? "Y" : "AI"}
      </span>
      <p className="text-[11px] leading-relaxed text-muted">{text}</p>
    </div>
  );
}

function RightPane() {
  return (
    <div className="bg-[#0b0b14] p-4">
      {/* Diff list */}
      <div className="text-[11px] font-medium uppercase tracking-wider text-faint">
        Diff · src/api/index.ts
      </div>
      <pre className="mt-2 overflow-hidden rounded-lg border border-border bg-bg p-3 font-mono text-[10px] leading-relaxed">
        <code>
          <span className="text-faint">{"  import { v1 } from './v1'"}</span>
          {"\n"}
          <span className="text-emerald-400/90">
            {"+ import { v2 } from './v2/router'"}
          </span>
          {"\n"}
          <span className="text-faint">{"  app.use('/v1', v1)"}</span>
          {"\n"}
          <span className="text-emerald-400/90">{"+ app.use('/v2', v2)"}</span>
        </code>
      </pre>

      {/* Terminal */}
      <div className="mt-3 text-[11px] font-medium uppercase tracking-wider text-faint">
        Terminal
      </div>
      <pre className="mt-2 overflow-hidden rounded-lg border border-border bg-black/40 p-3 font-mono text-[10px] leading-relaxed text-muted">
        <code>
          {"$ pnpm test v2\n"}
          <span className="text-emerald-400/90">{"✓ 6 passed"}</span>
          {"  (0.84s)\n"}
          {"$ git status\n"}
          {"4 files changed, +212 −9"}
        </code>
      </pre>

      {/* PR / merge status */}
      <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2.5">
        <div>
          <div className="text-[11px] text-fg">PR #482 · open</div>
          <div className="text-[10px] text-faint">checks passing · 0 conflicts</div>
        </div>
        <span className="rounded-md bg-emerald-400/10 px-2.5 py-1 text-[10px] text-emerald-400 ring-1 ring-emerald-400/30">
          Merge
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RunsWith() {
  const items = ["Claude Code", "Codex", "Cursor", "opencode"];
  return (
    <section className="border-y border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-6 py-6">
        <span className="text-xs uppercase tracking-wider text-faint">
          Runs your own
        </span>
        {items.map((i) => (
          <span key={i} className="text-sm text-muted">
            {i}
          </span>
        ))}
      </div>
    </section>
  );
}

interface Step {
  n: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    n: "01",
    title: "Add your repo",
    body: "Point Recoder at a local git repo. It stays on your machine — Recoder drives the agents and git you already have.",
  },
  {
    n: "02",
    title: "Deploy agents",
    body: "Spin up Claude Code, Codex, Cursor, or opencode. Each agent gets its own isolated git worktree, so they never fight over your working tree.",
  },
  {
    n: "03",
    title: "Conduct",
    body: "See who is working in the workspaces sidebar, read the change summary, review the diffs, and merge — or open a PR — when it's ready.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <div className="max-w-2xl">
        <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          From one repo to many agents — without the chaos.
        </h2>
        <p className="mt-4 text-muted">
          Recoder is the console that lets you launch parallel agents, watch
          them work in isolation, and bring the good changes home.
        </p>
      </div>
      <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="bg-bg p-7">
            <div className="font-mono text-sm text-accent">{s.n}</div>
            <h3 className="mt-3 text-lg font-medium">{s.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

interface Feature {
  title: string;
  body: string;
  foot: string;
  maturity?: string;
  link?: { href: string; label: string };
}

const FEATURES: Feature[] = [
  {
    title: "Parallel worktree isolation",
    body: "Every agent runs in its own git worktree on its own branch. They can all work at once without clobbering each other's files or your working tree.",
    foot: "git worktrees · per-agent branches",
  },
  {
    title: "Review and merge in one place",
    body: "Each workspace shows a change summary, the full diffs, and a terminal. Approve, merge, or open a pull request without leaving the console.",
    foot: "diffs · terminal · PR / merge",
  },
  {
    title: "One shared brain",
    body: "Agents read the repo once and reuse that context instead of re-paying for it on every run. The brain is designed to persist and compound across runs.",
    foot: "repo intel · memory · history",
  },
  {
    title: "BYOK economics",
    body: "Bring your own agents and your own provider keys. You pay Recoder for orchestration, seats, and control — never for tokens. We don't proxy models.",
    foot: "bring your own keys · no token resale",
  },
  {
    title: "Restart-survivable conductor",
    body: "The conductor keeps a state-of-record on top of tmux and git worktrees, so workspaces survive a restart and reconcile back to a known-good state.",
    foot: "tmux · worktrees · state-of-record",
  },
  {
    title: "Built to govern",
    body: "Approvals, deny-biased policy, and an audit trail are part of the model. Team and cross-machine sync are maturing — we frame them as such, not as shipped.",
    foot: "approvals · policy · audit",
    maturity: "Team sync in development",
    link: { href: "/enterprise", label: "See the enterprise moat" },
  },
];

function Features() {
  return (
    <section className="border-t border-border bg-bg-soft">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Isolation when they work. Coordination when you review.
          </h2>
          <p className="mt-4 text-muted">
            Worktrees keep agents apart so they don&apos;t collide. The console
            brings their work back together so you can ship it.
          </p>
        </div>
        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col bg-bg p-7">
              <h3 className="text-lg font-medium">{f.title}</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
                {f.body}
              </p>
              {f.maturity && (
                <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-400/30 px-2 py-0.5 text-[10px] text-amber-400">
                  <span className="h-1 w-1 rounded-full bg-amber-400" />
                  {f.maturity}
                </span>
              )}
              <p className="mt-4 font-mono text-[11px] text-faint">{f.foot}</p>
              {f.link && (
                <Link
                  href={f.link.href}
                  className="mt-3 inline-block text-sm text-accent transition-opacity hover:opacity-80"
                >
                  {f.link.label} →
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function KeysNote() {
  return (
    <section className="border-y border-border">
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h2 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
          Your agents. Your keys. Your code stays local.
        </h2>
        <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
          Recoder is a desktop app that drives the coding agents and git repos
          already on your machine. We don&apos;t proxy models or resell tokens —
          we&apos;re the console that lets you run them in parallel and merge the
          results.
        </p>
      </div>
    </section>
  );
}

interface PlanPeek {
  name: string;
  price: string;
  note: string;
}

const PLAN_PEEK: PlanPeek[] = [
  { name: "Free", price: "$0", note: "the local desktop console" },
  { name: "Pro", price: "Coming soon", note: "higher limits + retention" },
  { name: "Team", price: "Coming soon", note: "seats + shared approvals" },
  { name: "Enterprise", price: "Custom", note: "SSO, audit, self-host" },
];

function PlanTeaser() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
            Pay for orchestration, never for tokens.
          </h2>
          <p className="mt-3 text-muted">
            Free to start on one machine. Paid plans add limits, retention,
            seats, and governance — and they&apos;re framed honestly until
            they&apos;re purchasable.
          </p>
        </div>
        <Link
          href="/pricing"
          className="text-sm text-accent transition-opacity hover:opacity-80"
        >
          See all plans →
        </Link>
      </div>
      <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_PEEK.map((p) => (
          <div key={p.name} className="bg-bg p-5">
            <div className="text-sm text-muted">{p.name}</div>
            <div className="mt-1 text-xl font-semibold tracking-tight">
              {p.price}
            </div>
            <div className="mt-1 text-xs text-faint">{p.note}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface QA {
  q: string;
  a: string;
}

const FAQ: QA[] = [
  {
    q: "Does it use git worktrees?",
    a: "Yes. Each agent runs in its own isolated git worktree on its own branch, so parallel agents never collide on your working tree. You review and merge each workspace's branch when it's ready.",
  },
  {
    q: "Which agents are supported?",
    a: "Recoder runs your own coding agents — Claude Code, Codex, Cursor, and opencode — driving the CLIs you already have installed. The roster grows as we add adapters; we list what's wired today rather than what's aspirational.",
  },
  {
    q: "How does it pay for Claude Code? (BYOK)",
    a: "It doesn't. You bring your own agent subscriptions and provider keys. Recoder orchestrates the agents you already pay for and never proxies or resells tokens. You pay Recoder for the console and coordination, not for inference.",
  },
  {
    q: "Is my code local?",
    a: "Yes. Recoder is a desktop app that drives the git repos and agents on your own machine. Your code stays local unless you explicitly turn on a future team/cloud-sync feature.",
  },
  {
    q: "Is it a web app?",
    a: "No. Nobody codes on the web — Recoder is a desktop app. This site is the marketing page and the place to get the build. The app is a 3-pane console: workspaces, agent conversation, and diffs/terminal/PR status.",
  },
  {
    q: "Can I download it today?",
    a: "Public desktop builds aren't open to everyone yet. The Download button takes you to request access and get notified the moment a build lands — we won't pretend a build is ready when it isn't.",
  },
];

function Faq() {
  return (
    <section className="border-t border-border bg-bg-soft">
      <div className="mx-auto max-w-3xl px-6 py-20 md:py-24">
        <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Frequently asked questions
        </h2>
        <div className="mt-10 divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg">
          {FAQ.map((item) => (
            <details key={item.q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-fg">
                {item.q}
                <span
                  aria-hidden
                  className="text-muted transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 text-center">
      <h2 className="text-balance mx-auto max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl">
        Conduct your coding agents.
      </h2>
      <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
        Run them in parallel, watch them work, review the diffs, and merge — all
        from one desktop console.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-5">
        <DownloadButton className="px-6 py-3 text-[15px]" />
        <Link
          href="/pricing"
          className="text-sm text-muted transition-colors hover:text-fg"
        >
          See pricing →
        </Link>
        <Link
          href="/self-host"
          className="text-sm text-muted transition-colors hover:text-fg"
        >
          Self-host →
        </Link>
      </div>
      <p className="mt-4 text-xs text-faint">
        Desktop app · macOS, Windows, Linux · your agents, your keys.
      </p>
    </section>
  );
}
