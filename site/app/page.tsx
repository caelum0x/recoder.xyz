import Link from "next/link";
import { Nav, Footer, DownloadButton } from "@/components/site";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <WorksWith />
        <Pillars />
        <KeysNote />
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
      <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-20 md:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-soft px-3 py-1 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            The control plane for coding agents
          </span>
          <h1 className="text-balance mt-6 text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Run your coding agents as a team.
          </h1>
          <p className="text-balance mx-auto mt-5 max-w-xl text-base text-muted md:text-lg">
            Recoder runs your own Claude Code, Codex, and opencode in parallel and
            gives them one shared brain, so they stop colliding, repeating work,
            and burning tokens.
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
            Free for solo devs · macOS, Windows, Linux · your agents, your keys
          </p>
        </div>

        <Cockpit />
      </div>
    </section>
  );
}

/** CSS mock of the product — the agent board. The UI is the design. */
function Cockpit() {
  return (
    <div className="mx-auto mt-16 max-w-5xl">
      <div className="overflow-hidden rounded-xl border border-border-strong bg-bg-soft shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-faint/50" />
          <span className="h-3 w-3 rounded-full bg-faint/40" />
          <span className="h-3 w-3 rounded-full bg-faint/30" />
          <span className="ml-3 text-xs text-faint">recoder · 3 agents · 1 shared brain</span>
        </div>
        <div className="grid gap-px bg-border md:grid-cols-[1fr_1fr_1fr_0.9fr]">
          <AgentPane
            name="claude-code"
            status="running"
            tone="text-emerald-400"
            task="auth/session.ts — refactor token check"
          />
          <AgentPane
            name="codex"
            status="running"
            tone="text-emerald-400"
            task="api/routes.ts — add /v2 handlers"
          />
          <AgentPane
            name="claude-code #2"
            status="waiting · lock"
            tone="text-amber-400"
            task="api/routes.ts held by codex"
          />
          <BrainPane />
        </div>
      </div>
    </div>
  );
}

function AgentPane({
  name,
  status,
  tone,
  task,
}: {
  name: string;
  status: string;
  tone: string;
  task: string;
}) {
  return (
    <div className="bg-bg-soft p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-fg">{name}</span>
        <span className={`text-[11px] ${tone}`}>{status}</span>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="h-1.5 w-4/5 rounded bg-white/[0.06]" />
        <div className="h-1.5 w-3/5 rounded bg-white/[0.06]" />
        <div className="h-1.5 w-2/3 rounded bg-white/[0.06]" />
      </div>
      <p className="mt-3 font-mono text-[11px] leading-relaxed text-faint">{task}</p>
    </div>
  );
}

function BrainPane() {
  return (
    <div className="bg-[#0b0b14] p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-accent">shared brain</span>
        <span className="text-[11px] text-accent/70">live</span>
      </div>
      <ul className="mt-3 space-y-2 text-[11px] text-muted">
        <li>repo indexed · read once</li>
        <li>2 work-locks held</li>
        <li>3 handoffs on the bus</li>
        <li className="text-emerald-400/80">~41% tokens saved</li>
      </ul>
    </div>
  );
}

function WorksWith() {
  const items = ["Claude Code", "Codex", "opencode", "pi"];
  return (
    <section className="border-y border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-6 py-6">
        <span className="text-xs uppercase tracking-wider text-faint">
          Works with
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

const PILLARS = [
  {
    title: "One shared brain",
    body: "Every agent reads the repo once and reuses it. No more paying three times for the same context. The brain persists and compounds across runs.",
    foot: "memory · repo intel · docs · history",
  },
  {
    title: "Real coordination",
    body: "Work-locks stop two agents editing the same file. A live bus lets them hand off and stay consistent. Semantic checks catch the conflicts git can't see.",
    foot: "work-locks · A2A bus · coherence",
  },
  {
    title: "Built for teams",
    body: "Approvals, permission rubrics, audit trails, and session replay. Coordinate agents across machines and orgs over a zero-trust mesh. Self-host it.",
    foot: "approvals · audit · self-host",
  },
];

function Pillars() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <div className="max-w-2xl">
        <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Don&apos;t isolate your agents. Coordinate them.
        </h2>
        <p className="mt-4 text-muted">
          Running agents in separate worktrees just keeps them apart. Recoder
          gives them shared state, so they work like a team instead of a mob.
        </p>
      </div>
      <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
        {PILLARS.map((p) => (
          <div key={p.title} className="bg-bg p-7">
            <h3 className="text-lg font-medium">{p.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">{p.body}</p>
            <p className="mt-5 font-mono text-[11px] text-faint">{p.foot}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function KeysNote() {
  return (
    <section className="border-y border-border bg-bg-soft">
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h2 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
          Your agents. Your keys. We never touch your tokens.
        </h2>
        <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
          Recoder runs the Claude Code and Codex you already pay for. We don&apos;t
          proxy models or resell tokens. We&apos;re the layer that makes the agents
          you run work together.
        </p>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 text-center">
      <h2 className="text-balance mx-auto max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl">
        Stop your agents from stepping on each other.
      </h2>
      <div className="mt-8 flex justify-center">
        <DownloadButton className="px-6 py-3 text-[15px]" />
      </div>
      <p className="mt-4 text-xs text-faint">Free for solo devs. No account required.</p>
    </section>
  );
}
