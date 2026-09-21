// "Alternatives to X" pages, authored as typed data (same convention as
// compare/comparisons.ts, docs/content.ts, changelog/entries.ts — no markdown
// dependency). Each Alternative is its own route at /alternatives/[slug].
//
// Editorial rules (shared with comparisons.ts):
//   - Every claim must be verifiable about the real tool. No invented
//     benchmarks, no fabricated numbers, no false "X can't do Y" claims. Where a
//     license or exact capability isn't certain, describe it in general terms
//     ("open source", "cloud-hosted") rather than guessing specifics.
//   - It is more credible to name a genuinely strong alternative than to bury
//     it. These pages exist to help a reader choose, not to funnel by omission.
//   - Recoder is honestly positioned: for editors and cloud dev environments it
//     is a DIFFERENT category (a control plane that runs coding agents), not a
//     drop-in replacement. We say so.

export interface AltOption {
  /** Display name, e.g. "Windsurf". */
  name: string;
  /** One-line category, e.g. "AI code editor (VS Code fork)". */
  kind: string;
  /** What it is — factual, one or two sentences. */
  blurb: string;
  /** When a reader should pick this one. */
  bestFor: string;
}

export interface AltFaq {
  q: string;
  a: string;
}

export interface Alternative {
  slug: string;
  /** The tool the reader is looking to replace, e.g. "Cursor". */
  target: string;
  /** The target's category, e.g. "AI code editor". */
  targetKind: string;
  /** H1. */
  title: string;
  /** <title>. */
  metaTitle: string;
  /** <meta name="description">, ~150-160 chars. */
  description: string;
  keywords: string[];
  /** Hero subtitle. */
  tagline: string;
  /** Opening context paragraphs. */
  intro: string[];
  /** The real alternatives, ranked by relevance to the target's use case. */
  options: AltOption[];
  /** Honest "where Recoder fits" positioning. */
  recoderAngle: string[];
  faq: AltFaq[];
  /** Cross-links into the mesh. */
  relatedCompare: string[];
  relatedUseCases: string[];
  related: string[];
}

export const ALTERNATIVES: Alternative[] = [
  {
    slug: "cursor-alternatives",
    target: "Cursor",
    targetKind: "AI code editor",
    title: "Cursor alternatives",
    metaTitle: "7 Cursor alternatives for AI coding (2026)",
    description:
      "The best Cursor alternatives compared: AI editors, terminal agents, and orchestration. What each is good at, when to pick it, and where they overlap with Cursor.",
    keywords: [
      "cursor alternatives",
      "cursor alternative",
      "AI code editor",
      "alternatives to cursor",
      "AI coding tools",
    ],
    tagline: "AI editors, terminal agents, and everything between.",
    intro: [
      "Cursor is a popular AI-first code editor — a fork of VS Code with tab autocomplete, inline edits, and an agent mode built into the editing surface. It is genuinely strong at what it does; most people looking for a Cursor alternative want either a different editor, a terminal-native agent they drive from the command line, or a way to stop betting on a single tool.",
      "Below are the alternatives developers actually reach for, grouped by what they replace. Facts are kept to publicly verifiable capabilities; pricing and models change, so confirm the current details on each vendor's site before you commit.",
    ],
    options: [
      {
        name: "VS Code + GitHub Copilot",
        kind: "Editor + AI extension",
        blurb:
          "The mainstream baseline: stock Visual Studio Code with GitHub Copilot for completion, chat, and an agent mode. No fork required.",
        bestFor:
          "Teams that want to stay on standard VS Code and its extension ecosystem while adding AI assistance.",
      },
      {
        name: "Windsurf",
        kind: "AI code editor",
        blurb:
          "An AI-native editor (from the Codeium team) with an agentic flow built around whole-project awareness.",
        bestFor:
          "Developers who want a Cursor-style AI editor experience from a different vendor.",
      },
      {
        name: "Zed",
        kind: "High-performance editor with AI",
        blurb:
          "A fast, Rust-built collaborative editor with AI assistant features. Open source, focused on speed and low latency.",
        bestFor:
          "People who prioritize editor performance and a clean, native feel over a VS Code fork.",
      },
      {
        name: "Cline",
        kind: "Agent extension for VS Code",
        blurb:
          "An open-source autonomous coding agent that runs inside VS Code, planning and applying multi-file edits with your approval.",
        bestFor:
          "Developers who want autonomous agent behavior without leaving standard VS Code.",
      },
      {
        name: "Claude Code",
        kind: "Agentic CLI (terminal)",
        blurb:
          "Anthropic's terminal-native coding agent. It reads and edits across a repo and runs commands, rather than living inside an editor.",
        bestFor:
          "Developers who prefer driving an autonomous agent from the terminal, SSH, or CI over an editor UI.",
      },
      {
        name: "Aider",
        kind: "AI pair programmer (terminal)",
        blurb:
          "An open-source, git-native pair programmer that edits your files and commits each change with a message.",
        bestFor:
          "Terminal users who want tight, git-native control and a model-agnostic workflow.",
      },
      {
        name: "Recoder",
        kind: "Multi-agent orchestrator (desktop)",
        blurb:
          "A control plane that runs several of the agents above in parallel isolated git worktrees, then converges the best result into one governed merge. It composes with Cursor rather than replacing the editor.",
        bestFor:
          "Developers who don't want to bet on one tool and would rather compare several agents on the same task.",
      },
    ],
    recoderAngle: [
      "Recoder is not an editor, so it is not a like-for-like Cursor replacement — if what you want is best-in-class autocomplete and an inline editing surface, Cursor wins that outright and you should keep it.",
      "Recoder solves a different problem: instead of choosing one assistant, you run several coding agents — Claude Code, Codex CLI, opencode, Aider, and others — in parallel on the same task, each in its own git worktree. You compare their diffs side by side, take one agent's version of a file wholesale or synthesize non-overlapping edits from several, and land one reviewed, governed merge. Cursor can be one of the tools in that mix.",
    ],
    faq: [
      {
        q: "What is the closest free alternative to Cursor?",
        a: "Stock VS Code with the free tier of GitHub Copilot is the closest mainstream option, and open-source terminal agents like Aider and opencode are free to run against your own provider keys. Confirm current free-tier limits on each vendor's site.",
      },
      {
        q: "Is there a Cursor alternative that runs in the terminal?",
        a: "Yes — Claude Code, Codex CLI, Aider, opencode, and Gemini CLI are all terminal-native. They fit SSH, headless, and CI workflows where an editor GUI can't go.",
      },
      {
        q: "Do I have to replace Cursor to use Recoder?",
        a: "No. Recoder orchestrates coding agents; it doesn't replace your editor. Many people keep Cursor for day-to-day editing and use Recoder when they want to run several agents on a task and merge the best result.",
      },
    ],
    relatedCompare: ["claude-code-vs-cursor", "cursor-vs-aider", "recoder-vs-cursor"],
    relatedUseCases: ["parallel-ai-coding-agents", "compare-and-merge-agent-diffs"],
    related: ["aider-alternatives", "open-interpreter-alternatives"],
  },
  {
    slug: "aider-alternatives",
    target: "Aider",
    targetKind: "terminal AI pair programmer",
    title: "Aider alternatives",
    metaTitle: "6 Aider alternatives for terminal AI coding (2026)",
    description:
      "The best Aider alternatives: terminal coding agents and editors compared. Model-agnostic, git-native, and orchestration options — what each is good at and when to pick it.",
    keywords: [
      "aider alternatives",
      "aider alternative",
      "terminal AI coding",
      "AI pair programmer",
      "alternatives to aider",
    ],
    tagline: "Terminal-native coding agents, compared.",
    intro: [
      "Aider is an open-source, git-native AI pair programmer that runs in your terminal: it edits your files, commits each change with a message, and works with many model providers. It's a favorite for its transparency and tight git integration. People looking for an Aider alternative usually want a different model posture, more autonomy, or a way to run several agents at once.",
      "Here are the terminal-first alternatives worth knowing, plus where an orchestration layer fits. Capabilities below are the publicly verifiable ones; check each project for current model support and licensing.",
    ],
    options: [
      {
        name: "Claude Code",
        kind: "Agentic CLI (terminal)",
        blurb:
          "Anthropic's terminal agent, tuned for deep multi-step autonomy across a repo, with MCP tools, subagents, hooks, and slash commands.",
        bestFor:
          "Developers who want maximum autonomy and rich extensibility on Anthropic models.",
      },
      {
        name: "Codex CLI",
        kind: "Agentic CLI (terminal)",
        blurb:
          "OpenAI's open-source terminal coding agent. Scriptable and autonomous, in the same terminal-native form factor as Aider.",
        bestFor:
          "Developers who want an open-source terminal agent oriented around OpenAI models.",
      },
      {
        name: "opencode",
        kind: "Agentic TUI (terminal)",
        blurb:
          "An open-source, provider-agnostic terminal UI for coding agents. Model-agnostic like Aider, with a richer full-screen TUI.",
        bestFor:
          "Terminal users who want a model-agnostic agent with a full TUI experience.",
      },
      {
        name: "Gemini CLI",
        kind: "Agentic CLI (terminal)",
        blurb:
          "Google's open-source terminal agent, with a notably large free tier and large context window on Gemini models.",
        bestFor:
          "Developers who want a generous free tier and large-context runs on Google models.",
      },
      {
        name: "Continue",
        kind: "Open-source IDE assistant",
        blurb:
          "An open-source assistant that plugs into VS Code and JetBrains, letting you wire in your own models and context.",
        bestFor:
          "Developers who want an open, customizable assistant inside their editor rather than the terminal.",
      },
      {
        name: "Recoder",
        kind: "Multi-agent orchestrator (desktop)",
        blurb:
          "Runs Aider and other terminal agents in parallel isolated git worktrees, then compares and converges their diffs into one governed merge.",
        bestFor:
          "Developers who already like Aider but want to race it against other agents on the same task.",
      },
    ],
    recoderAngle: [
      "If you like Aider's git-native, one-agent workflow, Recoder doesn't ask you to give it up — Aider can be one of the agents Recoder launches.",
      "The difference is scope. Aider drives a single agent, one attempt at a time. Recoder runs Aider alongside Claude Code, Codex CLI, opencode, and others on the same task in parallel, shows you where they agree and diverge, and lets you land one merge that takes the best of each — with a policy gate and a signed audit trail underneath.",
    ],
    faq: [
      {
        q: "Which Aider alternatives are also open source?",
        a: "Codex CLI, opencode, Gemini CLI, and Continue are open source, like Aider. Claude Code is proprietary. Confirm each project's current license before adopting it.",
      },
      {
        q: "Are these alternatives model-agnostic like Aider?",
        a: "opencode and Continue are explicitly provider-agnostic. Claude Code targets Anthropic models, Codex CLI is oriented around OpenAI, and Gemini CLI around Google — though Recoder lets you run several of them together regardless of provider.",
      },
      {
        q: "Can I keep using Aider with Recoder?",
        a: "Yes. Recoder is agent-agnostic and BYOK: it runs the agents you already have on your PATH — including Aider — using your own provider keys. It orchestrates them; it doesn't replace them.",
      },
    ],
    relatedCompare: ["claude-code-vs-aider", "cursor-vs-aider", "recoder-vs-aider"],
    relatedUseCases: ["parallel-ai-coding-agents", "byok-ai-coding"],
    related: ["cursor-alternatives", "open-interpreter-alternatives"],
  },
  {
    slug: "open-interpreter-alternatives",
    target: "Open Interpreter",
    targetKind: "local code-execution agent",
    title: "Open Interpreter alternatives",
    metaTitle: "6 Open Interpreter alternatives for coding (2026)",
    description:
      "The best Open Interpreter alternatives for AI-assisted coding: local-first terminal agents and orchestration compared. What each does and when to pick it.",
    keywords: [
      "open interpreter alternatives",
      "open interpreter alternative",
      "local AI coding agent",
      "code execution agent",
      "alternatives to open interpreter",
    ],
    tagline: "Local-first agents that read, write, and run code.",
    intro: [
      "Open Interpreter is an open-source project that lets a language model run code on your own machine through a natural-language interface — a general local code-execution agent rather than a repo-focused coding tool. People evaluating it against coding work often want something more oriented around editing a codebase and landing changes in git.",
      "These are the alternatives that keep the local-first, terminal-native spirit while focusing on software development. As always, the facts below are the publicly verifiable ones — verify current licensing and capabilities on each project.",
    ],
    options: [
      {
        name: "Claude Code",
        kind: "Agentic CLI (terminal)",
        blurb:
          "A terminal coding agent that edits across a repo and runs commands, with governance-friendly permissions around tool use.",
        bestFor:
          "Developers who want an autonomous repo-editing agent rather than a general code-runner.",
      },
      {
        name: "Aider",
        kind: "AI pair programmer (terminal)",
        blurb:
          "Open-source and git-native: it edits files and commits each change, keeping a clean history of what the agent did.",
        bestFor:
          "People who want every AI change captured as a reviewable git commit.",
      },
      {
        name: "Codex CLI",
        kind: "Agentic CLI (terminal)",
        blurb:
          "OpenAI's open-source terminal agent, running locally and scriptable for autonomous coding tasks.",
        bestFor:
          "Developers who want an open-source, OpenAI-oriented local agent.",
      },
      {
        name: "opencode",
        kind: "Agentic TUI (terminal)",
        blurb:
          "A provider-agnostic terminal agent with a full TUI, focused on coding workflows rather than general system automation.",
        bestFor:
          "Terminal users who want a model-agnostic, coding-focused local agent.",
      },
      {
        name: "gpt-engineer",
        kind: "Open-source code generation",
        blurb:
          "An open-source tool that generates and iterates on a codebase from a natural-language specification.",
        bestFor:
          "Bootstrapping a new project from a prompt rather than editing an existing repo.",
      },
      {
        name: "Recoder",
        kind: "Multi-agent orchestrator (desktop)",
        blurb:
          "Runs local coding agents in parallel isolated git worktrees, then converges their work into one governed, audited merge — all on your machine.",
        bestFor:
          "Developers who want local-first agent work with review, governance, and an audit trail.",
      },
    ],
    recoderAngle: [
      "Open Interpreter and Recoder both keep work on your own machine, but they aim at different things: Open Interpreter is a general agent that runs code from natural language, while Recoder is specifically a control plane for coding agents editing a repository.",
      "Recoder's local control plane runs on loopback (127.0.0.1:3100) with fail-closed auth, drives the coding agents you already have installed with your own keys, and folds every run into a reviewed merge with a tamper-evident audit trail. If your goal is landing governed changes in a codebase — not ad hoc system automation — that's the distinction.",
    ],
    faq: [
      {
        q: "What is the difference between Open Interpreter and a coding agent like Aider?",
        a: "Open Interpreter is a general local code-execution agent driven by natural language; Aider and similar tools are focused on editing a codebase and committing changes to git. The right pick depends on whether you want general automation or repository-focused development.",
      },
      {
        q: "Which alternatives run fully on my own machine?",
        a: "Claude Code, Aider, Codex CLI, and opencode all run locally against your provider keys, and Recoder's control plane is a local desktop app bound to loopback. Confirm each tool's network behavior for your environment.",
      },
      {
        q: "Does Recoder run code locally like Open Interpreter?",
        a: "Recoder's control plane and the agents it drives run on your machine, and it never proxies your model tokens. It focuses that local execution on governed repository changes rather than general-purpose system tasks.",
      },
    ],
    relatedCompare: ["claude-code-vs-aider", "claude-code-vs-codex", "recoder-vs-claude-code"],
    relatedUseCases: ["self-hosted-ai-agent-orchestration", "parallel-ai-coding-agents"],
    related: ["aider-alternatives", "cursor-alternatives"],
  },
  {
    slug: "github-codespaces-alternatives",
    target: "GitHub Codespaces",
    targetKind: "cloud development environment",
    title: "GitHub Codespaces alternatives",
    metaTitle: "GitHub Codespaces alternatives (2026)",
    description:
      "The best GitHub Codespaces alternatives: cloud dev environments and local-first options compared. What each does, when to pick it, and how AI agents fit in.",
    keywords: [
      "github codespaces alternatives",
      "codespaces alternative",
      "cloud development environment",
      "alternatives to github codespaces",
      "dev environments",
    ],
    tagline: "Cloud dev environments — and a local-first option.",
    intro: [
      "GitHub Codespaces gives you a configurable, containerized VS Code development environment in the cloud, spun up from a repository. Teams look for alternatives for cost, portability, self-hosting, or to keep work on their own hardware. It's worth being precise about category: Codespaces is a dev environment, not an AI coding agent, so the closest alternatives are other environment platforms.",
      "Below are the real alternatives, plus an honest note on where an agent control plane like Recoder does and doesn't overlap. Confirm current pricing and hosting models on each vendor's site.",
    ],
    options: [
      {
        name: "Gitpod",
        kind: "Cloud/automated dev environments",
        blurb:
          "Automated, reproducible development environments defined as code, available as a hosted service and in self-hosted forms.",
        bestFor:
          "Teams that want ephemeral, config-as-code environments with a strong self-hosting story.",
      },
      {
        name: "Coder",
        kind: "Self-hosted dev environments",
        blurb:
          "An open-source platform for running development environments on your own cloud or infrastructure, managed centrally.",
        bestFor:
          "Organizations that need dev environments inside their own network and control.",
      },
      {
        name: "DevPod",
        kind: "Client-side dev environments",
        blurb:
          "An open-source, client-side tool that runs devcontainer-based environments on any backend — local, cloud, or Kubernetes — without a hosted control plane.",
        bestFor:
          "Developers who want devcontainer portability without committing to one vendor's cloud.",
      },
      {
        name: "JetBrains dev environments",
        kind: "Remote dev for JetBrains IDEs",
        blurb:
          "Remote development options for JetBrains IDEs, keeping the full IDE experience against a remote backend.",
        bestFor:
          "Teams standardized on JetBrains IDEs rather than VS Code.",
      },
      {
        name: "Local devcontainers",
        kind: "Local containerized dev",
        blurb:
          "The Dev Containers spec run locally in Docker with VS Code or compatible editors — the same config, no cloud host.",
        bestFor:
          "Developers who want reproducible environments without paying for a cloud host.",
      },
      {
        name: "Recoder",
        kind: "Multi-agent orchestrator (desktop)",
        blurb:
          "Not a dev-environment host. A local-first control plane that runs coding agents in parallel git worktrees on your machine and converges their work into a governed merge.",
        bestFor:
          "Teams whose actual goal is coordinating AI coding agents, not renting a cloud IDE.",
      },
    ],
    recoderAngle: [
      "Recoder is a different category from Codespaces and does not replace it: it doesn't host a cloud IDE or provision remote containers. If you specifically need a browser-accessible, cloud-hosted dev environment, one of the environment platforms above is the right answer.",
      "Where the two meet is intent: many teams reach for Codespaces because they want a clean, isolated place for AI agents to work. Recoder gives each agent an isolated git worktree on your own machine, runs several in parallel, and lands one reviewed, governed merge — local-first, with your own keys. It complements a dev environment rather than competing with it.",
    ],
    faq: [
      {
        q: "Is there a self-hosted alternative to GitHub Codespaces?",
        a: "Yes. Coder is built for self-hosting, Gitpod offers self-hosted forms, and DevPod plus local devcontainers keep environments on infrastructure you control. Confirm the current self-hosting model for each.",
      },
      {
        q: "Is Recoder a GitHub Codespaces alternative?",
        a: "Not directly. Codespaces is a cloud dev environment; Recoder is a local-first control plane for running and merging AI coding agents. They solve different problems and can be used together.",
      },
      {
        q: "What's the cheapest Codespaces alternative?",
        a: "Running devcontainers locally in Docker has no per-hour cloud cost, and open-source platforms like Coder and DevPod let you run on your own hardware. Actual cost depends on your infrastructure.",
      },
    ],
    relatedCompare: ["recoder-vs-cursor", "recoder-vs-claude-code"],
    relatedUseCases: ["self-hosted-ai-agent-orchestration", "parallel-ai-coding-agents"],
    related: ["gitpod-alternatives", "cursor-alternatives"],
  },
  {
    slug: "gitpod-alternatives",
    target: "Gitpod",
    targetKind: "cloud development environment",
    title: "Gitpod alternatives",
    metaTitle: "Gitpod alternatives for dev environments (2026)",
    description:
      "The best Gitpod alternatives: cloud and self-hosted dev environments compared, plus how a local-first AI agent control plane fits. What each does and when to pick it.",
    keywords: [
      "gitpod alternatives",
      "gitpod alternative",
      "cloud development environment",
      "alternatives to gitpod",
      "self-hosted dev environments",
    ],
    tagline: "Automated dev environments — hosted and self-hosted.",
    intro: [
      "Gitpod provides automated, reproducible development environments defined as code. Teams evaluate alternatives for pricing, self-hosting flexibility, editor preferences, or to keep environments inside their own infrastructure. Like Codespaces, Gitpod is a dev-environment platform — not an AI coding agent — so its closest alternatives are other environment tools.",
      "Here are the real options, and an honest note on where an agent control plane does and doesn't overlap. Verify current hosting models and pricing directly with each vendor.",
    ],
    options: [
      {
        name: "GitHub Codespaces",
        kind: "Cloud dev environments",
        blurb:
          "Containerized VS Code environments in the cloud, tightly integrated with GitHub repositories.",
        bestFor:
          "Teams already centered on GitHub who want a first-party cloud environment.",
      },
      {
        name: "Coder",
        kind: "Self-hosted dev environments",
        blurb:
          "Open-source platform for running managed development environments on your own cloud or infrastructure.",
        bestFor:
          "Organizations that need environments inside their own network and governance.",
      },
      {
        name: "DevPod",
        kind: "Client-side dev environments",
        blurb:
          "Open-source, client-side devcontainer environments on any backend, with no required hosted control plane.",
        bestFor:
          "Developers who want portable devcontainers across local, cloud, and Kubernetes.",
      },
      {
        name: "Daytona",
        kind: "Dev environment manager",
        blurb:
          "An open-source development environment manager that provisions standardized workspaces across providers.",
        bestFor:
          "Teams that want an open, self-manageable environment orchestrator.",
      },
      {
        name: "Local devcontainers",
        kind: "Local containerized dev",
        blurb:
          "The Dev Containers spec in local Docker — the same reproducible config without a cloud host.",
        bestFor:
          "Developers who want reproducibility without cloud runtime cost.",
      },
      {
        name: "Recoder",
        kind: "Multi-agent orchestrator (desktop)",
        blurb:
          "Not a dev-environment host. A local-first control plane that runs coding agents in parallel git worktrees and converges their work into a governed merge.",
        bestFor:
          "Teams whose goal is coordinating AI coding agents rather than renting a cloud IDE.",
      },
    ],
    recoderAngle: [
      "Recoder does not replace Gitpod: it doesn't provision cloud workspaces or host an IDE. If your need is a hosted, config-as-code environment, one of the platforms above is the right tool.",
      "The overlap is in intent — teams often want an isolated, reproducible place for agents to work. Recoder gives each agent an isolated git worktree on your own machine, runs several agents in parallel, and lands one reviewed, governed merge with a signed audit trail. It's a complement to your dev environment, not a substitute for it.",
    ],
    faq: [
      {
        q: "What is the best self-hosted Gitpod alternative?",
        a: "Coder is purpose-built for self-hosting, and DevPod plus Daytona let you run environments on your own infrastructure. The right choice depends on whether you want a managed control plane or a client-side tool.",
      },
      {
        q: "Is Recoder a Gitpod alternative?",
        a: "Not directly. Gitpod is a cloud dev-environment platform; Recoder is a local-first control plane for running and merging AI coding agents. They address different problems and can complement each other.",
      },
      {
        q: "Can I self-host an AI agent workflow instead of using a cloud environment?",
        a: "Yes — Recoder runs as a local desktop control plane on your own machine with your own provider keys, so AI agent work happens locally without a cloud IDE in the loop.",
      },
    ],
    relatedCompare: ["recoder-vs-claude-code", "recoder-vs-cursor"],
    relatedUseCases: ["self-hosted-ai-agent-orchestration", "governed-ai-code-merges"],
    related: ["github-codespaces-alternatives", "cursor-alternatives"],
  },
];

export function alternative(slug: string): Alternative | undefined {
  return ALTERNATIVES.find((a) => a.slug === slug);
}
