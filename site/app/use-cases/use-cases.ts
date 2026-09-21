// Use-case pages, authored as typed data (same convention as
// compare/comparisons.ts and alternatives/alternatives.ts — no markdown
// dependency). Each UseCase is its own route at /use-cases/[slug].
//
// Editorial rules (shared with comparisons.ts): every claim about Recoder must
// be verifiable from the product (see features/page.tsx and docs/content.ts).
// Maturing capabilities (team sync, cross-machine sync) are framed as such, not
// as shipped. No invented metrics.

export interface UseCaseSection {
  h: string;
  body: string[];
  bullets?: string[];
}

export interface UseCaseFaq {
  q: string;
  a: string;
}

export interface UseCase {
  slug: string;
  /** H1. */
  title: string;
  /** <title>. */
  metaTitle: string;
  /** <meta name="description">, ~150-160 chars. */
  description: string;
  keywords: string[];
  /** Hero subtitle. */
  tagline: string;
  /** Opening context paragraphs (the problem + the gist). */
  intro: string[];
  /** Substantive body sections. */
  sections: UseCaseSection[];
  /** How Recoder does it, as ordered steps. */
  steps: string[];
  faq: UseCaseFaq[];
  /** Cross-links into the mesh. */
  relatedCompare: string[];
  relatedAlternatives: string[];
  related: string[];
}

export const USE_CASES: UseCase[] = [
  {
    slug: "parallel-ai-coding-agents",
    title: "Run multiple AI coding agents in parallel",
    metaTitle: "Run AI coding agents in parallel — Recoder",
    description:
      "Run Claude Code, Codex, Aider, and opencode on the same task at once, each in its own isolated git worktree, then merge the best result. No clobbering, no lost attempts.",
    keywords: [
      "parallel AI coding agents",
      "run coding agents in parallel",
      "multi-agent coding",
      "git worktree agents",
      "concurrent AI agents",
    ],
    tagline: "N agents, one task, zero clobbering.",
    intro: [
      "A single AI coding agent gives you exactly one attempt at a task. If you want a second opinion you re-run it and lose the first; if you launch several agents by hand they trample each other's files and your working tree. The result is either one fragile attempt or an unmanageable pile of divergent branches.",
      "Running agents in parallel — properly isolated — turns that into an advantage. Different agents have different strengths and fail on different problems, so the run where one flails is often the run where another nails it. The trick is isolation while they work and a principled way to converge afterward.",
    ],
    sections: [
      {
        h: "Why isolation is the hard part",
        body: [
          "Two agents editing the same checkout at once is a race condition: overlapping writes, half-applied edits, and a working tree nobody can trust. Recoder solves this with git worktrees — every agent runs in its own worktree on its own branch, so they can all work simultaneously without touching each other's files or your main checkout.",
        ],
      },
      {
        h: "Bring the agents you already run",
        body: [
          "Recoder is agent-agnostic and BYOK. It launches the coding-agent CLIs you already have on your PATH — Claude Code, Codex CLI, Cursor's CLI agent, opencode, Aider, Gemini CLI, and pi — using your own provider keys. It orchestrates them; it never proxies or resells model tokens, so you keep paying providers directly.",
        ],
        bullets: [
          "Claude Code and Codex CLI for deep, autonomous multi-file work.",
          "Aider and opencode for git-native, model-agnostic runs.",
          "Gemini CLI when you want a large context window or free-tier headroom.",
        ],
      },
      {
        h: "One shared brain, not N cold starts",
        body: [
          "Agents read the repo once and reuse that context instead of re-paying to re-derive it on every run. Session transcripts are searchable, and the memory layer is designed to persist and compound across runs — so parallel agents start informed rather than from scratch.",
        ],
      },
    ],
    steps: [
      "Give one task to several agents; Recoder creates an isolated git worktree and branch for each.",
      "Watch them work in parallel from one desktop console — live terminals, no context switching.",
      "Compare the diffs side by side to see where they agree, diverge, and contest the same files.",
      "Converge: take one agent's version of a file wholesale, or synthesize non-overlapping edits into one branch.",
      "Land a single reviewed, governed merge with a tamper-evident audit trail.",
    ],
    faq: [
      {
        q: "How do parallel agents avoid overwriting each other?",
        a: "Each agent runs in its own git worktree on its own branch. Worktrees give every agent an isolated checkout, so simultaneous edits never collide and your main working tree is untouched.",
      },
      {
        q: "Which agents can I run in parallel?",
        a: "Any coding-agent CLI you have installed on your PATH — Claude Code, Codex CLI, Cursor's CLI agent, opencode, Aider, Gemini CLI, and pi. Recoder uses your own provider keys and does not resell tokens.",
      },
      {
        q: "Do I pay Recoder for model usage?",
        a: "No. Recoder is BYOK: you pay your model providers directly for inference. You pay Recoder for orchestration, review, and governance — never for tokens.",
      },
    ],
    relatedCompare: ["recoder-vs-claude-code", "recoder-vs-conductor", "claude-code-vs-codex"],
    relatedAlternatives: ["cursor-alternatives", "aider-alternatives"],
    related: ["compare-and-merge-agent-diffs", "byok-ai-coding"],
  },
  {
    slug: "compare-and-merge-agent-diffs",
    title: "Compare and merge AI agent output",
    metaTitle: "Compare & merge AI agent diffs — Recoder",
    description:
      "Turn several AI agents' divergent branches into one trusted merge. Compare diffs side by side, pick the best version per file or synthesize edits, and merge with confidence.",
    keywords: [
      "compare AI agent output",
      "merge AI code changes",
      "AI code review",
      "converge agent branches",
      "diff review AI agents",
    ],
    tagline: "N divergent branches. One trusted merge.",
    intro: [
      "Once several agents have taken a swing at the same task, you're left with N branches that overlap in some files and diverge in others. Eyeballing them one terminal at a time doesn't scale, and blindly picking a single agent's whole branch throws away good work the others did.",
      "Convergence is the missing step: a structured way to see where agents agree, where they diverge, and which files are contested — then compose the best of each into one branch you can actually merge.",
    ],
    sections: [
      {
        h: "See agreement, divergence, and contested files",
        body: [
          "Recoder shows the agents' changes side by side. It surfaces where they agree (safe to accept), where they diverge (a real decision), and which files are contested by more than one agent — so your attention goes to the choices that matter instead of scrolling raw diffs.",
        ],
      },
      {
        h: "Pick or synthesize, per file",
        body: [
          "Convergence is per file, not all-or-nothing. For each file you can take one agent's version wholesale (pick), or synthesize non-overlapping edits from several agents into a single branch. You keep the best implementation of each file rather than betting the whole task on one agent.",
        ],
      },
      {
        h: "Review and merge in one place",
        body: [
          "Every workspace shows a change summary, the full diffs, and a live terminal. You can comment on any changed line and send it straight back to the agent, then approve, merge, or open a PR without leaving the console.",
        ],
      },
      {
        h: "Merge readiness that never fakes a green",
        body: [
          "Before you merge, Recoder folds the signals that matter into one truthful verdict: a trial-merge preflight, an uncommitted-work check, CI checks, PR state, and preview verification. If something isn't actually green, it says so — it never fabricates a passing result.",
        ],
      },
    ],
    steps: [
      "Open the side-by-side comparison of every agent's branch for the task.",
      "Review agreement, divergence, and contested files at a glance.",
      "Per file, pick one agent's version or synthesize non-overlapping edits into one branch.",
      "Leave line-level comments and send them back to an agent to revise.",
      "Check the merge-readiness verdict, then approve, merge, or open a PR.",
    ],
    faq: [
      {
        q: "How does Recoder combine changes from multiple agents?",
        a: "Per file. For each file you either take one agent's version wholesale or synthesize non-overlapping edits from several agents into a single branch — so you keep the best implementation of each file rather than one agent's entire branch.",
      },
      {
        q: "Can I send feedback back to an agent during review?",
        a: "Yes. You can comment on any changed line and send it straight back to the agent to revise, then re-review — all inside the same console, alongside the diffs and a live terminal.",
      },
      {
        q: "How do I know a merge is actually safe?",
        a: "Recoder folds a trial-merge preflight, uncommitted-work check, CI checks, PR state, and preview verification into one verdict. It never fakes a green: if a signal isn't passing, it shows that honestly.",
      },
    ],
    relatedCompare: ["recoder-vs-cursor", "recoder-vs-claude-code", "recoder-vs-aider"],
    relatedAlternatives: ["cursor-alternatives", "aider-alternatives"],
    related: ["parallel-ai-coding-agents", "governed-ai-code-merges"],
  },
  {
    slug: "governed-ai-code-merges",
    title: "Governance and audit for AI-written code",
    metaTitle: "Governed, audited AI code merges — Recoder",
    description:
      "Put a policy gate, human approvals, and a tamper-evident audit trail around AI agent merges. Export compliance evidence mapped to SOC 2, the EU AI Act, and DORA.",
    keywords: [
      "AI code governance",
      "audit trail AI agents",
      "policy gate AI merges",
      "SOC 2 AI coding",
      "compliant AI agents",
    ],
    tagline: "Every AI merge, governed and provable.",
    intro: [
      "As AI agents write more of the code that reaches production, teams need more than good diffs — they need to prove who changed what, which policy allowed it, and that a human reviewed it. Ungoverned agent output is a compliance and security problem waiting to happen.",
      "Governance shouldn't be a bolt-on you remember to add later. In Recoder, approvals, policy, and audit are part of the merge model itself, so every agent change is accountable by construction.",
    ],
    sections: [
      {
        h: "A deny-biased policy gate",
        body: [
          "Every merge passes a policy gate that is deny-biased by design: risky actions are blocked unless explicitly allowed, rather than permitted unless caught. Policy decisions are deterministic, so the same situation is judged the same way every time.",
        ],
      },
      {
        h: "Human approvals where they matter",
        body: [
          "Merges can require explicit human approval before they land. The approval is recorded as part of the run, so there's a durable record that a person signed off — not an inference from runtime state.",
        ],
      },
      {
        h: "A tamper-evident, signed audit trail",
        body: [
          "Every run is sealed into a tamper-evident audit chain with signed evidence. You can export that evidence as compliance artifacts mapped to common frameworks, so an auditor can trace an agent's change end to end.",
        ],
        bullets: [
          "SOC 2 — evidence that changes were reviewed and controlled.",
          "EU AI Act — a record of human oversight over automated changes.",
          "DORA — traceability and operational-resilience evidence.",
        ],
      },
      {
        h: "Local-first, self-hostable, no vendor cloud in the loop",
        body: [
          "The control plane runs on your own machine and is self-hostable, with a durable local credential store and fail-closed auth. Regulated teams can keep agent work — and its audit trail — inside their own boundary.",
        ],
      },
    ],
    steps: [
      "Define the policy for a task: what agents may do and what requires approval.",
      "Agents run in isolated worktrees; every action is captured as evidence.",
      "The deny-biased policy gate evaluates the merge deterministically.",
      "A required human approval is recorded before the merge lands.",
      "The run is sealed into a signed audit chain and exported as compliance evidence.",
    ],
    faq: [
      {
        q: "How does Recoder make AI code changes auditable?",
        a: "Every run is sealed into a tamper-evident audit chain with signed evidence — who changed what, which policy allowed it, and the human approval that let it land. That evidence can be exported as compliance artifacts.",
      },
      {
        q: "Which compliance frameworks does the evidence map to?",
        a: "Recoder's exportable evidence is mapped to SOC 2, the EU AI Act, and DORA, so agent work can be traced against the controls those frameworks expect.",
      },
      {
        q: "Can governance run entirely on our own infrastructure?",
        a: "Yes. The control plane is local-first and self-hostable with fail-closed auth and a durable local credential store, so agent work and its audit trail stay inside your boundary.",
      },
    ],
    relatedCompare: ["recoder-vs-conductor", "recoder-vs-cursor"],
    relatedAlternatives: ["github-codespaces-alternatives", "gitpod-alternatives"],
    related: ["self-hosted-ai-agent-orchestration", "compare-and-merge-agent-diffs"],
  },
  {
    slug: "self-hosted-ai-agent-orchestration",
    title: "Self-hosted, local-first AI agent orchestration",
    metaTitle: "Self-hosted AI agent orchestration — Recoder",
    description:
      "Run a local-first control plane for coding agents on your own machine. Loopback-only, fail-closed auth, BYOK, self-hostable — no vendor cloud proxying your code or keys.",
    keywords: [
      "self-hosted AI agents",
      "local-first AI coding",
      "on-prem coding agents",
      "self-hosted agent orchestration",
      "private AI coding",
    ],
    tagline: "Your machine. Your keys. Your code stays put.",
    intro: [
      "Sending your source code and provider keys through someone else's cloud is a non-starter for a lot of teams. But most AI coding tools assume a hosted backend, which means your repository and your credentials pass through infrastructure you don't control.",
      "Local-first flips that default. The orchestration runs on your own machine, drives the agents you already have, and uses your own keys — so nothing is proxied through a vendor unless you explicitly turn on cross-machine features.",
    ],
    sections: [
      {
        h: "A local control plane, loopback only",
        body: [
          "Recoder's control plane is a desktop app that runs a local backend on 127.0.0.1:3100 by default — bound to loopback, not exposed to the network. It runs fail-closed with a durable local credential store, so a missing or invalid credential denies access rather than silently degrading.",
        ],
      },
      {
        h: "Bring your own keys; no token resale",
        body: [
          "Recoder points at the provider keys your agents already use and never proxies or resells model tokens — you keep paying providers directly. Your inference traffic goes where it always did; Recoder coordinates the agents, it doesn't sit in the token path.",
        ],
      },
      {
        h: "Self-hostable, with recoder.xyz as the auth source of truth",
        body: [
          "The platform is proprietary but self-hostable, so you can run it inside your own boundary. Authentication is anchored to recoder.xyz as the source of truth, and the control plane fails closed when dependencies or keys are missing rather than faking success.",
        ],
      },
      {
        h: "Restart-survivable workspaces",
        body: [
          "Recoder keeps a state-of-record on top of tmux and git worktrees, so your workspaces survive a restart and reconcile back to a known-good state instead of vanishing. Long-running agent work isn't lost to a reboot.",
        ],
      },
    ],
    steps: [
      "Install the local desktop control plane on your own machine — no account required to start.",
      "It launches a loopback-only backend and imports your git identity, PATH agents, and shell environment.",
      "Point it at your existing provider keys; inference stays on your own accounts.",
      "Run agents in isolated worktrees entirely on your hardware.",
      "Keep everything local, or self-host the platform inside your own boundary.",
    ],
    faq: [
      {
        q: "Does my code leave my machine?",
        a: "By default, no. The control plane is a local desktop app bound to loopback, it drives agents on your own machine, and it never proxies your model tokens. Cross-machine team features are framed as in development and are opt-in.",
      },
      {
        q: "Can I self-host Recoder?",
        a: "Yes. Recoder is proprietary but self-hostable, so you can run the control plane inside your own boundary, with recoder.xyz as the authentication source of truth.",
      },
      {
        q: "What happens if a key or dependency is missing?",
        a: "The control plane fails closed: missing keys or dependencies deny access with explicit errors rather than silently degrading or faking a healthy state.",
      },
    ],
    relatedCompare: ["recoder-vs-claude-code", "recoder-vs-conductor"],
    relatedAlternatives: ["github-codespaces-alternatives", "gitpod-alternatives"],
    related: ["governed-ai-code-merges", "byok-ai-coding"],
  },
  {
    slug: "byok-ai-coding",
    title: "Bring your own keys (BYOK) AI coding",
    metaTitle: "BYOK AI coding — bring your own keys — Recoder",
    description:
      "Use your own provider keys with every coding agent. Recoder orchestrates Claude Code, Codex, Aider, and more without proxying or reselling model tokens — you pay providers directly.",
    keywords: [
      "BYOK AI coding",
      "bring your own keys AI",
      "no token resale",
      "provider keys coding agents",
      "BYOK coding agents",
    ],
    tagline: "Your keys, your provider bill, your control.",
    intro: [
      "Many AI coding products sit in the middle of your model traffic: they proxy inference, mark up tokens, or lock you to whatever models they resell. That means a second bill, an opaque markup, and a vendor with visibility into every prompt.",
      "Bring-your-own-keys removes the middleman. You use the provider keys your agents already have, pay the providers directly, and the orchestration layer never touches the token path.",
    ],
    sections: [
      {
        h: "No proxy, no markup",
        body: [
          "Recoder explicitly does not proxy or resell model tokens. It points your agents at the keys you already use and gets out of the way of the inference call. You pay Recoder for orchestration, review, and governance — never for tokens.",
        ],
      },
      {
        h: "Every agent, your own provider",
        body: [
          "Because keys are yours, you're free to run whichever agents and models you want, on whichever provider accounts you already have — and to run several at once on the same task.",
        ],
        bullets: [
          "Claude Code on your Anthropic plan or API key.",
          "Codex CLI and other OpenAI-oriented agents on your OpenAI key.",
          "Gemini CLI on your Google key; Aider and opencode against any supported provider.",
        ],
      },
      {
        h: "Keys stay on your machine",
        body: [
          "The control plane is local-first with a durable local credential store and fail-closed auth. Your keys live on your own box; Recoder coordinates the agents that use them rather than centralizing them in a vendor cloud.",
        ],
      },
    ],
    steps: [
      "Install the local control plane; it imports the shell environment and keys your agents already use.",
      "Confirm which provider keys each agent should use — they stay on your machine.",
      "Run one or many agents; each calls your provider directly for inference.",
      "Recoder orchestrates, compares, and governs the results without touching the token path.",
      "Your provider billing is unchanged; you pay Recoder only for orchestration.",
    ],
    faq: [
      {
        q: "Does Recoder resell or mark up model tokens?",
        a: "No. Recoder explicitly does not proxy or resell tokens. You bring your own provider keys and pay the providers directly; Recoder charges for orchestration, review, and governance only.",
      },
      {
        q: "Where are my provider keys stored?",
        a: "On your own machine, in a durable local credential store. The control plane is local-first and fails closed, so keys aren't centralized in a vendor cloud.",
      },
      {
        q: "Can different agents use different providers?",
        a: "Yes. Because the keys are yours, each agent can use whichever provider account you point it at — and you can run agents from different providers in parallel on the same task.",
      },
    ],
    relatedCompare: ["claude-code-vs-codex", "claude-code-vs-gemini-cli", "recoder-vs-claude-code"],
    relatedAlternatives: ["aider-alternatives", "cursor-alternatives"],
    related: ["parallel-ai-coding-agents", "self-hosted-ai-agent-orchestration"],
  },
];

export function useCase(slug: string): UseCase | undefined {
  return USE_CASES.find((u) => u.slug === slug);
}
