// The "AI Coding Agents" reference dataset — a factual directory of the real
// coding agents, editors, and cloud dev environments developers use today.
// Authored as typed data (same convention as compare/comparisons.ts and
// docs/content.ts — no markdown dependency). It powers the free, linkable
// reference page at /tools/agent-directory.
//
// Editorial rules for this file (identical to comparisons.ts):
//   - Every field must be verifiable about the real tool from its own public
//     docs, repo, or site. No invented benchmarks, user counts, or numbers.
//   - Where a fact isn't publicly settled (e.g. a proprietary tool's exact
//     model list), describe the posture ("multiple providers"), don't guess.
//   - Categories are descriptive, not a ranking. This is a directory, not a
//     leaderboard. Corrections are welcome via /contact.
//
// This is deliberately a superset of the ToolRef facts in comparisons.ts: the
// same core tools appear in both, and the directory adds the vendor, homepage,
// and form-factor columns a reference table needs.

/** Coarse grouping used by the on-page filter. */
export type AgentGroup = "orchestrator" | "cli" | "editor" | "cde";

export interface AgentEntry {
  /** Stable slug (also used as the React key and anchor id). */
  slug: string;
  /** Display name exactly as the vendor writes it. */
  name: string;
  /** Short human category label shown in the table, e.g. "Agentic CLI". */
  kind: string;
  /** Coarse group for the filter control. */
  group: AgentGroup;
  /** Who makes it. */
  vendor: string;
  /** License / cost posture, e.g. "Open source (Apache-2.0)". */
  license: string;
  /** True when the client itself is open source (drives the "OSS only" filter). */
  oss: boolean;
  /** Where it runs, e.g. "Terminal", "GUI editor", "Cloud". */
  formFactor: string;
  /** Model posture — which models it can drive. */
  models: string;
  /** Canonical homepage (used for the outbound reference link). */
  homepage: string;
  /** One or two factual sentences. Publicly-known capabilities only. */
  note: string;
  /** Slugs of /compare/[slug] pages that feature this tool (internal linking). */
  compareSlugs: string[];
}

// Order: orchestrators first (the category Recoder is in), then terminal
// agents, then editors, then cloud dev environments. Within a group,
// roughly by how commonly they come up.
export const AGENTS: readonly AgentEntry[] = [
  {
    slug: "recoder",
    name: "Recoder",
    kind: "Multi-agent orchestrator",
    group: "orchestrator",
    vendor: "Recoder",
    license: "Proprietary · self-hostable · BYOK",
    oss: false,
    formFactor: "Desktop app (macOS-first)",
    models: "Agent-agnostic — drives the agents you install, BYOK",
    homepage: "https://recoder.xyz",
    note: "Runs your chosen coding-agent CLIs in parallel, each in its own isolated git worktree, then helps you compare, converge, and land one governed merge with a tamper-evident audit trail. Not an editor and not a model reseller — you pay providers directly.",
    compareSlugs: ["recoder-vs-conductor", "recoder-vs-claude-code", "recoder-vs-cursor"],
  },
  {
    slug: "conductor",
    name: "Conductor",
    kind: "Parallel Claude Code runner",
    group: "orchestrator",
    vendor: "Conductor",
    license: "Proprietary (free)",
    oss: false,
    formFactor: "Desktop app (macOS)",
    models: "Claude (via Claude Code)",
    homepage: "https://conductor.build",
    note: "A macOS app that runs multiple Claude Code agents in parallel, each in its own isolated git workspace, so you can review their diffs. Free and focused specifically on Claude Code.",
    compareSlugs: ["recoder-vs-conductor"],
  },
  {
    slug: "claude-code",
    name: "Claude Code",
    kind: "Agentic CLI",
    group: "cli",
    vendor: "Anthropic",
    license: "Proprietary",
    oss: false,
    formFactor: "Terminal + IDE extensions",
    models: "Anthropic Claude (Sonnet, Opus)",
    homepage: "https://www.anthropic.com/claude-code",
    note: "Anthropic's terminal-native agent: it reads and edits files across a repo and runs commands to complete multi-step tasks. Extensible via MCP, subagents, hooks, and slash commands.",
    compareSlugs: [
      "claude-code-vs-cursor",
      "claude-code-vs-codex",
      "claude-code-vs-aider",
      "recoder-vs-claude-code",
    ],
  },
  {
    slug: "codex-cli",
    name: "Codex CLI",
    kind: "Agentic CLI",
    group: "cli",
    vendor: "OpenAI",
    license: "Open source (Apache-2.0)",
    oss: true,
    formFactor: "Terminal + cloud",
    models: "OpenAI models",
    homepage: "https://github.com/openai/codex",
    note: "OpenAI's open-source terminal agent with OS-level command sandboxing and approval modes, plus a cloud counterpart that shares the same workflow. Auditable and buildable from source.",
    compareSlugs: [
      "claude-code-vs-codex",
      "codex-vs-aider",
      "cursor-vs-codex",
      "recoder-vs-codex",
    ],
  },
  {
    slug: "aider",
    name: "Aider",
    kind: "AI pair programmer",
    group: "cli",
    vendor: "Aider (Paul Gauthier)",
    license: "Open source (Apache-2.0)",
    oss: true,
    formFactor: "Terminal",
    models: "Model-agnostic (Claude, GPT, Gemini, local, …)",
    homepage: "https://aider.chat",
    note: "A git-native AI pair programmer that commits each change as its own git commit with a generated message, and builds a repo map via tree-sitter for whole-project context. Works with almost any model, including local ones.",
    compareSlugs: [
      "claude-code-vs-aider",
      "codex-vs-aider",
      "cursor-vs-aider",
      "opencode-vs-aider",
      "recoder-vs-aider",
    ],
  },
  {
    slug: "gemini-cli",
    name: "Gemini CLI",
    kind: "Agentic CLI",
    group: "cli",
    vendor: "Google",
    license: "Open source (Apache-2.0)",
    oss: true,
    formFactor: "Terminal",
    models: "Google Gemini (2.5 Pro and newer)",
    homepage: "https://github.com/google-gemini/gemini-cli",
    note: "Google's open-source terminal agent built around Gemini models, with a generous free tier for individual Google accounts and a very large context window. Supports MCP and an agentic loop.",
    compareSlugs: ["claude-code-vs-gemini-cli", "aider-vs-gemini-cli"],
  },
  {
    slug: "opencode",
    name: "opencode",
    kind: "Agentic TUI",
    group: "cli",
    vendor: "SST",
    license: "Open source (MIT)",
    oss: true,
    formFactor: "Terminal (TUI)",
    models: "Provider-agnostic (any model)",
    homepage: "https://opencode.ai",
    note: "An open-source terminal coding agent with a polished TUI, a client/server architecture, and LSP integration. Provider-agnostic — point it at Anthropic, OpenAI, Google, or local models.",
    compareSlugs: ["claude-code-vs-opencode", "opencode-vs-aider"],
  },
  {
    slug: "open-interpreter",
    name: "Open Interpreter",
    kind: "Local code interpreter agent",
    group: "cli",
    vendor: "Open Interpreter",
    license: "Open source (AGPL-3.0)",
    oss: true,
    formFactor: "Terminal / Python",
    models: "Model-agnostic (hosted or local)",
    homepage: "https://openinterpreter.com",
    note: "An open-source agent that lets language models run code locally in a natural-language REPL — Python, shell, and more — to complete tasks on your machine. More a general code-execution agent than a repo-focused coding tool.",
    compareSlugs: [],
  },
  {
    slug: "cursor",
    name: "Cursor",
    kind: "AI code editor",
    group: "editor",
    vendor: "Anysphere",
    license: "Proprietary",
    oss: false,
    formFactor: "GUI editor (VS Code fork)",
    models: "Multiple: Claude, GPT, Gemini, and Cursor's own",
    homepage: "https://cursor.com",
    note: "An AI-first editor — a fork of VS Code — with best-in-class inline autocomplete, Cmd-K inline edits, an agent/composer mode, and background agents. Routes across multiple model providers. Also ships a CLI agent.",
    compareSlugs: [
      "claude-code-vs-cursor",
      "cursor-vs-aider",
      "cursor-vs-codex",
      "recoder-vs-cursor",
    ],
  },
  {
    slug: "gitpod",
    name: "Gitpod",
    kind: "Cloud dev environment",
    group: "cde",
    vendor: "Gitpod",
    license: "Proprietary (cloud service)",
    oss: false,
    formFactor: "Cloud / browser + local",
    models: "Environment — hosts any agent you install",
    homepage: "https://www.gitpod.io",
    note: "A cloud development environment (CDE) that spins up reproducible, ephemeral workspaces from a repo. Not an agent itself — it's the environment agents and developers run inside. Included here because it's frequently compared alongside coding-agent tooling.",
    compareSlugs: [],
  },
  {
    slug: "github-codespaces",
    name: "GitHub Codespaces",
    kind: "Cloud dev environment",
    group: "cde",
    vendor: "GitHub (Microsoft)",
    license: "Proprietary (cloud service)",
    oss: false,
    formFactor: "Cloud / browser + VS Code",
    models: "Environment — hosts any agent you install",
    homepage: "https://github.com/features/codespaces",
    note: "GitHub's cloud development environment: on-demand, container-backed dev machines accessible from the browser or VS Code. Like Gitpod, it's the environment rather than the agent — a place to run coding agents, not one itself.",
    compareSlugs: [],
  },
] as const;

export function agent(slug: string): AgentEntry | undefined {
  return AGENTS.find((a) => a.slug === slug);
}

/** The filter groups, in display order, with human labels. */
export const AGENT_GROUPS: { id: AgentGroup; label: string; blurb: string }[] = [
  {
    id: "orchestrator",
    label: "Orchestrators",
    blurb: "Run and reconcile many agents at once.",
  },
  {
    id: "cli",
    label: "Terminal agents & CLIs",
    blurb: "Agents that live in your shell.",
  },
  {
    id: "editor",
    label: "AI editors",
    blurb: "GUI editors with AI woven in.",
  },
  {
    id: "cde",
    label: "Cloud dev environments",
    blurb: "Where agents run, not agents themselves.",
  },
];

export function groupLabel(id: AgentGroup): string {
  return AGENT_GROUPS.find((g) => g.id === id)?.label ?? id;
}
