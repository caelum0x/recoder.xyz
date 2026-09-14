// Head-to-head comparisons of AI coding tools, authored as typed data (same
// convention as docs/content.ts and changelog/entries.ts — no markdown
// dependency). Each Comparison is its own route at /compare/[slug].
//
// Editorial rules for this file:
//   - Every claim must be verifiable about the real tool. No invented
//     benchmarks, no fabricated numbers, no false "X can't do Y" claims.
//   - It is fine — and more credible — to say a competitor is strong at
//     something. These pages exist to help a reader choose, not to mislead.
//   - "Where Recoder fits" is honest positioning: Recoder is a different
//     category (it orchestrates the agents being compared), not a drop-in
//     replacement for an editor or a single CLI.

export interface ToolRef {
  /** Display name, e.g. "Claude Code". */
  name: string;
  /** One-line category, e.g. "Agentic CLI (terminal)". */
  kind: string;
  /** License / cost posture, e.g. "Open source (Apache-2.0)". */
  license: string;
}

export interface CompareFaq {
  q: string;
  a: string;
}

export interface Comparison {
  slug: string;
  a: ToolRef;
  b: ToolRef;
  /** H1 + the base for the <title>, e.g. "Claude Code vs Cursor". */
  title: string;
  /** <title> string (may add context beyond the H1). */
  metaTitle: string;
  /** <meta name="description">. Keep ~150-160 chars. */
  description: string;
  /** Hero subtitle. */
  tagline: string;
  /** Opening context paragraphs. */
  intro: string[];
  /** Feature matrix. head[0] is the row-label column. */
  table: { head: string[]; rows: string[][] };
  prosA: string[];
  consA: string[];
  prosB: string[];
  consB: string[];
  /** "Choose A when …" */
  whenA: string;
  /** "Choose B when …" */
  whenB: string;
  /** Honest positioning: where Recoder fits relative to this pair. */
  recoderFit: string[];
  faq: CompareFaq[];
  /** Slugs of related comparisons to cross-link. */
  related: string[];
}

// Shared tool references. Facts here are the load-bearing, verifiable ones;
// keep them accurate if a tool changes.
const RECODER: ToolRef = {
  name: "Recoder",
  kind: "Multi-agent orchestrator (desktop)",
  license: "Proprietary · self-hostable · BYOK",
};
const CLAUDE_CODE: ToolRef = {
  name: "Claude Code",
  kind: "Agentic CLI (terminal)",
  license: "Proprietary (Anthropic)",
};
const CODEX: ToolRef = {
  name: "Codex CLI",
  kind: "Agentic CLI (terminal)",
  license: "Open source (Apache-2.0)",
};
const CURSOR: ToolRef = {
  name: "Cursor",
  kind: "AI code editor (VS Code fork)",
  license: "Proprietary",
};
const OPENCODE: ToolRef = {
  name: "opencode",
  kind: "Agentic TUI (terminal)",
  license: "Open source (MIT)",
};
const AIDER: ToolRef = {
  name: "Aider",
  kind: "AI pair programmer (terminal)",
  license: "Open source (Apache-2.0)",
};
const GEMINI_CLI: ToolRef = {
  name: "Gemini CLI",
  kind: "Agentic CLI (terminal)",
  license: "Open source (Apache-2.0)",
};
const CONDUCTOR: ToolRef = {
  name: "Conductor",
  kind: "Parallel Claude Code app (macOS)",
  license: "Proprietary (free)",
};

// Reusable closer for pages that pit two rivals against each other: the point
// of Recoder is you don't have to bet on one.
function versusRecoderFit(a: string, b: string): string[] {
  return [
    `The honest answer to "${a} or ${b}?" is often "both, on the same task." They have different strengths and they fail on different problems — so the run where one flails is frequently the run where the other nails it.`,
    `Recoder is built for exactly that. It launches ${a}, ${b}, and any other agents you use in parallel, each in its own isolated git worktree, on one task. You compare the diffs side by side, converge the best of each into one branch, and land a single governed merge with a tamper-evident audit trail. Instead of picking a winner up front, you let the results decide.`,
  ];
}

export const COMPARISONS: Comparison[] = [
  {
    slug: "claude-code-vs-cursor",
    a: CLAUDE_CODE,
    b: CURSOR,
    title: "Claude Code vs Cursor",
    metaTitle: "Claude Code vs Cursor: terminal agent vs AI editor (2026)",
    description:
      "Claude Code vs Cursor compared: a terminal-native agentic CLI against an AI-first code editor. Form factor, models, autocomplete, pricing, and when to use each.",
    tagline: "A terminal-native agent versus an AI-first editor.",
    intro: [
      "Claude Code and Cursor are two of the most-used AI coding tools, but they live in different form factors. Claude Code is an agentic command-line tool from Anthropic that works in your terminal, reads and edits files across a repo, and runs commands to complete multi-step tasks. Cursor is a full editor — a fork of VS Code — with AI woven into the editing surface: tab autocomplete, inline edits, and an agent mode.",
      "The practical question is rarely which is 'better' in the abstract, but which fits how you work: do you want an autonomous agent you drive from a prompt, or a polished editor that keeps you in the loop line by line?",
    ],
    table: {
      head: ["Dimension", "Claude Code", "Cursor"],
      rows: [
        ["Form factor", "Terminal CLI + IDE extensions", "GUI editor (VS Code fork) + a CLI agent"],
        ["Models", "Anthropic Claude (Sonnet, Opus)", "Multiple: Claude, GPT, Gemini, and Cursor's own"],
        ["Tab autocomplete", "No inline completion", "Best-in-class inline completion"],
        ["Agentic edits", "Yes — autonomous, whole-repo", "Yes — Agent/Composer + background agents"],
        ["Headless / CI use", "Strong — scriptable, works over SSH", "Editor-centric; CLI agent is newer"],
        ["Extensibility", "MCP, subagents, hooks, slash commands", "VS Code extensions, MCP, rules files"],
        ["Pricing", "Claude Pro/Max plan or API usage", "Cursor subscription (Pro / Business)"],
      ],
    },
    prosA: [
      "Terminal-native: fits scripting, SSH, headless, and CI workflows where a GUI can't go.",
      "Deep autonomy for multi-step tasks — it plans, edits many files, and runs commands.",
      "Rich extensibility: MCP tools, subagents, hooks, and slash commands.",
      "Uses Anthropic's frontier models directly, which are strong at long, structured coding tasks.",
    ],
    consA: [
      "No inline tab-completion — it isn't an editor.",
      "Locked to Anthropic models; no GPT/Gemini choice.",
      "Token cost can climb on large autonomous runs.",
      "GUI-first developers face a steeper terminal learning curve.",
    ],
    prosB: [
      "Exceptional autocomplete and inline Cmd-K edits.",
      "Familiar VS Code UX and extension ecosystem.",
      "Model choice — route to Claude, GPT, Gemini, or Cursor's own models.",
      "Background agents let work continue while you edit.",
    ],
    consB: [
      "Requires adopting a specific editor; less appealing if you're committed to Neovim/JetBrains.",
      "Proprietary, subscription-based.",
      "Less naturally scriptable/headless than a pure CLI.",
      "Heavier footprint than a terminal tool.",
    ],
    whenA:
      "Choose Claude Code when you live in the terminal, want an agent that autonomously drives multi-step changes, need headless/CI runs, or want Anthropic-model depth without leaving the shell.",
    whenB:
      "Choose Cursor when you want a polished editor with the best-in-class autocomplete and fast inline AI, while staying in control of each edit — and when model flexibility matters.",
    recoderFit: versusRecoderFit("Claude Code", "Cursor"),
    faq: [
      {
        q: "Is Cursor better than Claude Code?",
        a: "Neither is strictly better — they're different tools. Cursor is a better day-to-day editor with unmatched autocomplete; Claude Code is a stronger autonomous terminal agent for multi-step, headless, or CI-driven work. Many developers use both.",
      },
      {
        q: "Can I use Claude Code and Cursor together?",
        a: "Yes. A common setup is Cursor as the editor for hands-on work and Claude Code (or Cursor's own agent) for autonomous tasks. Recoder can even run them in parallel on the same task and converge the results.",
      },
      {
        q: "Do they use the same models?",
        a: "Both can use Anthropic's Claude models. Claude Code is Anthropic-only; Cursor additionally offers GPT, Gemini, and its own models.",
      },
    ],
    related: ["claude-code-vs-codex", "cursor-vs-codex", "recoder-vs-cursor"],
  },

  {
    slug: "claude-code-vs-codex",
    a: CLAUDE_CODE,
    b: CODEX,
    title: "Claude Code vs Codex CLI",
    metaTitle: "Claude Code vs Codex CLI: Anthropic vs OpenAI terminal agents",
    description:
      "Claude Code vs OpenAI Codex CLI compared: two terminal coding agents. Open source vs proprietary, models, sandboxing, cloud mode, and when to choose each.",
    tagline: "Anthropic's agent versus OpenAI's, both in the terminal.",
    intro: [
      "Claude Code and OpenAI's Codex CLI are direct form-factor rivals: both are agentic command-line coding tools that plan, edit files, and run commands to finish a task. The differences are underneath — vendor and models, how each sandboxes command execution, licensing, and whether a cloud counterpart exists.",
      "Codex CLI is open source under Apache-2.0 and pairs with OpenAI's cloud Codex; Claude Code is proprietary to Anthropic and focuses on the local terminal plus IDE extensions.",
    ],
    table: {
      head: ["Dimension", "Claude Code", "Codex CLI"],
      rows: [
        ["Vendor", "Anthropic", "OpenAI"],
        ["Source", "Proprietary", "Open source (Apache-2.0)"],
        ["Models", "Claude (Sonnet, Opus)", "OpenAI models (GPT-5-Codex family)"],
        ["Command sandbox", "Permission prompts + hooks", "OS-level sandbox + approval modes"],
        ["Cloud counterpart", "No (local CLI + IDE ext.)", "Yes — Codex cloud alongside the CLI"],
        ["Auth", "Claude Pro/Max or API key", "ChatGPT plan sign-in or API key"],
        ["Extensibility", "MCP, subagents, hooks", "MCP, AGENTS.md, config profiles"],
      ],
    },
    prosA: [
      "Mature agentic ergonomics: subagents, hooks, and slash commands.",
      "Opus/Sonnet are strong at long, structured reasoning tasks.",
      "Large, fast-moving ecosystem and documentation.",
      "Tight IDE extensions for VS Code and JetBrains.",
    ],
    consA: [
      "Closed source — you can't audit or self-modify the client.",
      "Anthropic models only.",
      "Requires a Claude plan or metered API spend.",
    ],
    prosB: [
      "Open source and auditable; you can read and patch the client.",
      "Robust OS-level sandboxing of command execution.",
      "Local CLI and a cloud mode share the same workflow.",
      "A ChatGPT plan can cover usage without separate API billing.",
    ],
    consB: [
      "OpenAI models only.",
      "Some agentic conveniences are younger than Claude Code's.",
      "Sandbox behavior varies by OS and setup.",
    ],
    whenA:
      "Choose Claude Code if you prefer Anthropic's models, want the most mature subagent/hook ergonomics, or already pay for a Claude plan.",
    whenB:
      "Choose Codex CLI if you want an open-source, auditable client, strong OS sandboxing, OpenAI models, or a cloud + local workflow tied to your ChatGPT plan.",
    recoderFit: versusRecoderFit("Claude Code", "Codex CLI"),
    faq: [
      {
        q: "Is Codex CLI open source?",
        a: "Yes. OpenAI's Codex CLI is open source under the Apache-2.0 license, so you can read the code, file issues, and build it yourself. Claude Code is proprietary.",
      },
      {
        q: "Which has better command sandboxing?",
        a: "Codex CLI leans on OS-level sandboxing with explicit approval modes for running commands. Claude Code uses permission prompts and hooks. Both aim to keep an agent from running dangerous commands unchecked.",
      },
      {
        q: "Can I run both on the same task?",
        a: "Yes — that's a core Recoder workflow. Run Claude Code and Codex CLI in parallel worktrees, compare the diffs, and merge the best result.",
      },
    ],
    related: ["claude-code-vs-cursor", "codex-vs-aider", "recoder-vs-codex"],
  },

  {
    slug: "claude-code-vs-aider",
    a: CLAUDE_CODE,
    b: AIDER,
    title: "Claude Code vs Aider",
    metaTitle: "Claude Code vs Aider: autonomous agent vs git-native pair",
    description:
      "Claude Code vs Aider compared: an autonomous terminal agent against a git-native, model-agnostic AI pair programmer. Models, git workflow, and when to use each.",
    tagline: "An autonomous agent versus a git-native pair programmer.",
    intro: [
      "Both Claude Code and Aider run in the terminal, but they embody different philosophies. Claude Code is an autonomous agent: give it a task and it plans, edits across the repo, and runs commands. Aider is a git-native AI pair programmer: it works tightly with you, and it commits every change as a discrete git commit with a generated message, so the git history is your undo stack.",
      "Aider is also model-agnostic and open source, while Claude Code is proprietary and uses Anthropic's models.",
    ],
    table: {
      head: ["Dimension", "Claude Code", "Aider"],
      rows: [
        ["Style", "Autonomous agent", "Interactive pair programming"],
        ["Source", "Proprietary", "Open source (Apache-2.0)"],
        ["Models", "Anthropic Claude", "Model-agnostic (Claude, GPT, Gemini, local, …)"],
        ["Git workflow", "Edits, commits on request", "Auto-commits each change with a message"],
        ["Repo context", "Agentic exploration + MCP", "Repo map via tree-sitter"],
        ["Language / install", "Node-based CLI", "Python package (pip / uv)"],
        ["Maturity", "Newer, fast-moving", "Very mature, large community"],
      ],
    },
    prosA: [
      "Strong autonomy: completes multi-step tasks with less hand-holding.",
      "MCP, subagents, and hooks for extensibility.",
      "Frontier Claude models for deep reasoning.",
    ],
    consA: [
      "Proprietary and Anthropic-only.",
      "Less explicit about per-change git commits than Aider.",
      "Cost scales with autonomous token use.",
    ],
    prosB: [
      "Model-agnostic — use whatever model is cheapest or best for the job, including local models.",
      "Git-native: every edit is a clean, revertible commit.",
      "Mature, well-documented, and free/open source.",
      "Repo map gives good whole-project context economically.",
    ],
    consB: [
      "More pair-style than fully autonomous; you stay closely in the loop.",
      "No built-in command sandbox — git history is the safety net.",
      "Fewer 'agent' conveniences than a dedicated agent tool.",
    ],
    whenA:
      "Choose Claude Code when you want an agent to take a task and run with it autonomously, and you're happy on Anthropic's models.",
    whenB:
      "Choose Aider when you want tight, git-native control, model flexibility (including local/cheaper models), and a mature open-source tool that keeps a clean commit trail.",
    recoderFit: versusRecoderFit("Claude Code", "Aider"),
    faq: [
      {
        q: "Does Aider work with Claude models?",
        a: "Yes. Aider is model-agnostic and works well with Anthropic's Claude models, as well as OpenAI, Gemini, DeepSeek, and local models. Claude Code is limited to Anthropic's models.",
      },
      {
        q: "Which is better for a clean git history?",
        a: "Aider is designed around git — it commits each change as its own commit with a generated message, so reverting is trivial. Claude Code edits and commits on request.",
      },
      {
        q: "Can I combine them?",
        a: "Yes. With Recoder you can run Claude Code and Aider in parallel on the same task and converge the strongest diff into one governed merge.",
      },
    ],
    related: ["codex-vs-aider", "cursor-vs-aider", "recoder-vs-aider"],
  },

  {
    slug: "claude-code-vs-gemini-cli",
    a: CLAUDE_CODE,
    b: GEMINI_CLI,
    title: "Claude Code vs Gemini CLI",
    metaTitle: "Claude Code vs Gemini CLI: Anthropic vs Google terminal agents",
    description:
      "Claude Code vs Gemini CLI compared: Anthropic's proprietary agent against Google's open-source CLI with a large free tier and 1M-token context. When to use each.",
    tagline: "Anthropic's agent versus Google's open-source CLI.",
    intro: [
      "Claude Code and Gemini CLI are both terminal agents, but they come from different vendors with different economics. Gemini CLI is Google's open-source (Apache-2.0) command-line agent built around Gemini models, notable for a generous free tier for individual Google accounts and a very large context window. Claude Code is Anthropic's proprietary agent focused on strong reasoning with Claude models.",
      "If cost and context size dominate your decision, Gemini CLI is compelling; if model quality on hard reasoning tasks dominates, Claude Code is a strong pick.",
    ],
    table: {
      head: ["Dimension", "Claude Code", "Gemini CLI"],
      rows: [
        ["Vendor", "Anthropic", "Google"],
        ["Source", "Proprietary", "Open source (Apache-2.0)"],
        ["Models", "Claude (Sonnet, Opus)", "Gemini (2.5 Pro and newer)"],
        ["Free tier", "Requires a plan or API spend", "Generous free tier for personal Google accounts"],
        ["Context window", "Large", "Very large (up to ~1M tokens on Gemini Pro)"],
        ["Extensibility", "MCP, subagents, hooks", "MCP, tools, ReAct loop"],
      ],
    },
    prosA: [
      "Claude models excel at long, structured reasoning and refactors.",
      "Mature subagent/hook ecosystem.",
      "Polished IDE extensions.",
    ],
    consA: [
      "No free tier — needs a Claude plan or API spend.",
      "Anthropic models only; closed source.",
    ],
    prosB: [
      "Generous free usage for individual Google accounts.",
      "Open source and auditable.",
      "Very large context window suits big codebases and documents.",
      "Backed by Google's model roadmap.",
    ],
    consB: [
      "Gemini models only.",
      "Agentic ergonomics are younger than Claude Code's.",
      "Heavy usage still benefits from a paid tier.",
    ],
    whenA:
      "Choose Claude Code when reasoning quality on hard tasks matters most and you're invested in Anthropic's models and tooling.",
    whenB:
      "Choose Gemini CLI when you want low/zero cost to start, an open-source client, or a very large context window for big repos.",
    recoderFit: versusRecoderFit("Claude Code", "Gemini CLI"),
    faq: [
      {
        q: "Is Gemini CLI free?",
        a: "Gemini CLI offers a generous free tier for individual Google accounts, with higher limits on paid plans or via API keys. Claude Code requires a Claude plan or metered API usage.",
      },
      {
        q: "Which has the larger context window?",
        a: "Gemini CLI can use Gemini's very large context window (up to around 1M tokens on Gemini Pro), which is useful for large codebases. Both tools handle sizeable context.",
      },
      {
        q: "Can I run both agents on one task?",
        a: "Yes — Recoder runs Claude Code and Gemini CLI in parallel worktrees so you can compare their diffs and merge the best.",
      },
    ],
    related: ["claude-code-vs-codex", "aider-vs-gemini-cli", "claude-code-vs-opencode"],
  },

  {
    slug: "claude-code-vs-opencode",
    a: CLAUDE_CODE,
    b: OPENCODE,
    title: "Claude Code vs opencode",
    metaTitle: "Claude Code vs opencode: proprietary agent vs open-source TUI",
    description:
      "Claude Code vs opencode compared: Anthropic's proprietary agent against the open-source, provider-agnostic terminal TUI. Models, architecture, and when to use each.",
    tagline: "A proprietary agent versus an open, provider-agnostic TUI.",
    intro: [
      "opencode is an open-source (MIT) terminal coding agent with a polished TUI and a client/server architecture, designed to be provider-agnostic — you can point it at Anthropic, OpenAI, Google, or local models. Claude Code is Anthropic's proprietary agent, tightly integrated with Claude models.",
      "The choice often comes down to lock-in tolerance: opencode maximizes flexibility and openness; Claude Code maximizes integration with Anthropic's stack.",
    ],
    table: {
      head: ["Dimension", "Claude Code", "opencode"],
      rows: [
        ["Source", "Proprietary", "Open source (MIT)"],
        ["Models", "Anthropic Claude", "Provider-agnostic (any model)"],
        ["Interface", "CLI + IDE extensions", "TUI (client/server)"],
        ["Editor awareness", "IDE extensions", "LSP integration"],
        ["Extensibility", "MCP, subagents, hooks", "MCP, provider config"],
        ["Cost model", "Claude plan or API", "Bring your own provider key"],
      ],
    },
    prosA: [
      "Deep integration with Anthropic's models and tooling.",
      "Mature subagent/hook ecosystem and IDE extensions.",
      "Strong out-of-the-box autonomous behavior.",
    ],
    consA: [
      "Closed source; Anthropic models only.",
      "No provider flexibility.",
    ],
    prosB: [
      "Open source and provider-agnostic — no model lock-in.",
      "Polished terminal TUI with LSP awareness.",
      "Client/server design enables flexible front-ends.",
      "Bring whatever key/model you prefer, including local.",
    ],
    consB: [
      "You assemble your own provider setup.",
      "Younger ecosystem than Claude Code.",
    ],
    whenA:
      "Choose Claude Code when you want the most integrated Anthropic experience and the richest agent ergonomics today.",
    whenB:
      "Choose opencode when you value open source, a great TUI, and the freedom to switch models/providers — including running Claude models through it.",
    recoderFit: versusRecoderFit("Claude Code", "opencode"),
    faq: [
      {
        q: "Can opencode use Claude models?",
        a: "Yes. opencode is provider-agnostic, so you can run Anthropic's Claude models through it, along with OpenAI, Gemini, or local models. Claude Code is limited to Anthropic's models.",
      },
      {
        q: "Is opencode open source?",
        a: "Yes, opencode is open source under the MIT license. Claude Code is proprietary.",
      },
      {
        q: "Do I have to pick one?",
        a: "No. Recoder can run Claude Code and opencode side by side on the same task and converge the best result into one governed merge.",
      },
    ],
    related: ["claude-code-vs-aider", "opencode-vs-aider", "claude-code-vs-gemini-cli"],
  },

  {
    slug: "codex-vs-aider",
    a: CODEX,
    b: AIDER,
    title: "Codex CLI vs Aider",
    metaTitle: "Codex CLI vs Aider: OpenAI agent vs model-agnostic pair",
    description:
      "OpenAI Codex CLI vs Aider compared: an autonomous, sandboxed agent against a git-native, model-agnostic pair programmer. Both open source. When to use each.",
    tagline: "An OpenAI agent versus a model-agnostic git-native pair.",
    intro: [
      "Codex CLI and Aider are both open-source terminal tools, but they differ in autonomy and model strategy. Codex CLI is OpenAI's autonomous agent with OS-level command sandboxing and a cloud counterpart, tied to OpenAI models. Aider is a git-native pair programmer that works with almost any model and commits each change to git.",
      "If you want autonomy and OpenAI's stack, Codex CLI fits; if you want model freedom and a clean git-driven workflow, Aider fits.",
    ],
    table: {
      head: ["Dimension", "Codex CLI", "Aider"],
      rows: [
        ["Models", "OpenAI models", "Model-agnostic (Claude, GPT, Gemini, local, …)"],
        ["Style", "Autonomous agent", "Interactive pair programming"],
        ["Git workflow", "Edits, commits with approval", "Auto-commits each change"],
        ["Command safety", "OS-level sandbox + approvals", "Git history as the safety net"],
        ["Language", "Rust", "Python"],
        ["Cloud mode", "Yes (Codex cloud)", "No — local only"],
      ],
    },
    prosA: [
      "Autonomous multi-step execution with OS-level sandboxing.",
      "Cloud and local share one workflow.",
      "Open source (Apache-2.0) and auditable.",
      "Works with a ChatGPT plan.",
    ],
    consA: [
      "OpenAI models only.",
      "Less git-granular than Aider by default.",
    ],
    prosB: [
      "Use any model — optimize for cost, quality, or privacy (local).",
      "Every change is a clean git commit.",
      "Very mature with a large community.",
      "Efficient repo map for whole-project context.",
    ],
    consB: [
      "More interactive than fully autonomous.",
      "No built-in command sandbox.",
      "No cloud mode.",
    ],
    whenA:
      "Choose Codex CLI when you want an autonomous, sandboxed agent on OpenAI models, or a shared local + cloud workflow.",
    whenB:
      "Choose Aider when you want model freedom (including local models), a git-native commit trail, and a battle-tested open-source tool.",
    recoderFit: versusRecoderFit("Codex CLI", "Aider"),
    faq: [
      {
        q: "Are both Codex CLI and Aider open source?",
        a: "Yes. Codex CLI is Apache-2.0 and Aider is Apache-2.0. The main difference is that Codex CLI is tied to OpenAI models while Aider is model-agnostic.",
      },
      {
        q: "Which is safer for running commands?",
        a: "Codex CLI provides OS-level sandboxing and approval modes for command execution. Aider relies on git history as its safety net and stays more interactive.",
      },
      {
        q: "Can I run both at once?",
        a: "Yes — Recoder can launch Codex CLI and Aider in parallel worktrees and let you converge the best diff.",
      },
    ],
    related: ["claude-code-vs-codex", "claude-code-vs-aider", "aider-vs-gemini-cli"],
  },

  {
    slug: "cursor-vs-aider",
    a: CURSOR,
    b: AIDER,
    title: "Cursor vs Aider",
    metaTitle: "Cursor vs Aider: AI editor vs terminal pair programmer",
    description:
      "Cursor vs Aider compared: a proprietary AI-first editor against an open-source, git-native terminal pair programmer. Form factor, models, cost, and when to use each.",
    tagline: "A GUI AI editor versus an open terminal pair programmer.",
    intro: [
      "Cursor and Aider sit at opposite ends of the form-factor spectrum. Cursor is a proprietary AI-first editor (a VS Code fork) with unmatched autocomplete and inline edits. Aider is an open-source, git-native pair programmer that runs entirely in the terminal and works with almost any model.",
      "Cursor optimizes for a rich graphical editing experience; Aider optimizes for openness, model flexibility, and a clean git workflow.",
    ],
    table: {
      head: ["Dimension", "Cursor", "Aider"],
      rows: [
        ["Form factor", "GUI editor (VS Code fork)", "Terminal CLI"],
        ["Source", "Proprietary", "Open source (Apache-2.0)"],
        ["Models", "Claude, GPT, Gemini, Cursor's own", "Model-agnostic, including local"],
        ["Autocomplete", "Best-in-class inline completion", "None (edit-by-prompt)"],
        ["Git workflow", "Manual / editor-driven", "Auto-commits each change"],
        ["Cost", "Subscription", "Free tool; you pay only for model usage"],
      ],
    },
    prosA: [
      "Best-in-class autocomplete and inline Cmd-K edits.",
      "Full graphical editor with the VS Code ecosystem.",
      "Model choice and background agents.",
    ],
    consA: [
      "Proprietary and subscription-based.",
      "Requires adopting the Cursor editor.",
      "Less scriptable/headless than a CLI.",
    ],
    prosB: [
      "Free, open source, and model-agnostic (including local models).",
      "Git-native: clean, revertible commits.",
      "Runs anywhere a terminal does — SSH, servers, CI.",
      "Lightweight footprint.",
    ],
    consB: [
      "No autocomplete or graphical editing.",
      "Terminal-first workflow isn't for everyone.",
      "More interactive than autonomous.",
    ],
    whenA:
      "Choose Cursor when you want a premium graphical editing experience with the best autocomplete and inline AI.",
    whenB:
      "Choose Aider when you prefer the terminal, want model freedom and low cost, or need to work on remote/headless machines with a clean git trail.",
    recoderFit: versusRecoderFit("Cursor", "Aider"),
    faq: [
      {
        q: "Is Cursor or Aider cheaper?",
        a: "Aider is a free, open-source tool — you pay only for the model usage you choose (and can use cheaper or local models). Cursor is a paid subscription that bundles model access.",
      },
      {
        q: "Can Aider replace Cursor?",
        a: "It depends on your workflow. Aider covers AI-assisted editing in the terminal but has no autocomplete or GUI. If you rely on inline completion and a graphical editor, Cursor fills a different need.",
      },
      {
        q: "Can I use both?",
        a: "Yes. Many developers edit in Cursor and use terminal agents for autonomous tasks. Recoder can also run terminal agents in parallel and converge their output.",
      },
    ],
    related: ["claude-code-vs-cursor", "cursor-vs-codex", "codex-vs-aider"],
  },

  {
    slug: "cursor-vs-codex",
    a: CURSOR,
    b: CODEX,
    title: "Cursor vs Codex CLI",
    metaTitle: "Cursor vs Codex CLI: AI editor vs OpenAI terminal agent",
    description:
      "Cursor vs OpenAI Codex CLI compared: a proprietary AI editor against an open-source terminal agent. Form factor, models, sandboxing, and when to use each.",
    tagline: "A GUI editor versus an open-source terminal agent.",
    intro: [
      "Cursor and Codex CLI both come with strong OpenAI-model support, but in very different packages. Cursor is a graphical AI editor (VS Code fork) with autocomplete, inline edits, and an agent mode. Codex CLI is OpenAI's open-source terminal agent with OS-level sandboxing and a cloud counterpart.",
      "Pick based on where you want to work: inside a rich editor, or from the command line with an autonomous, sandboxed agent.",
    ],
    table: {
      head: ["Dimension", "Cursor", "Codex CLI"],
      rows: [
        ["Form factor", "GUI editor (VS Code fork)", "Terminal CLI + cloud"],
        ["Source", "Proprietary", "Open source (Apache-2.0)"],
        ["Models", "Claude, GPT, Gemini, Cursor's own", "OpenAI models"],
        ["Autocomplete", "Best-in-class", "None (agentic edits)"],
        ["Command sandbox", "Editor-managed", "OS-level sandbox + approvals"],
        ["Headless / CI", "Editor-centric", "Strong — scriptable and cloud-capable"],
      ],
    },
    prosA: [
      "Rich graphical editing with best-in-class autocomplete.",
      "Multiple model providers to choose from.",
      "Familiar VS Code ecosystem.",
    ],
    consA: [
      "Proprietary and subscription-based.",
      "Less scriptable/headless than a CLI.",
    ],
    prosB: [
      "Open source and auditable.",
      "Autonomous with OS-level command sandboxing.",
      "Local + cloud workflow on OpenAI models.",
      "Great for scripting, servers, and CI.",
    ],
    consB: [
      "OpenAI models only.",
      "No autocomplete or graphical editing.",
    ],
    whenA:
      "Choose Cursor for a premium graphical editor with autocomplete and model choice while staying hands-on.",
    whenB:
      "Choose Codex CLI for an open-source, autonomous, sandboxed agent you can run in the terminal, CI, or the cloud.",
    recoderFit: versusRecoderFit("Cursor", "Codex CLI"),
    faq: [
      {
        q: "Does Cursor use Codex or OpenAI models?",
        a: "Cursor lets you route to multiple providers including OpenAI's GPT models, as well as Claude and Gemini. Codex CLI is specifically OpenAI's own open-source agent tied to OpenAI models.",
      },
      {
        q: "Which is better for CI and automation?",
        a: "Codex CLI, because it's a scriptable terminal tool with a cloud mode. Cursor is editor-centric, though it now has a CLI agent too.",
      },
      {
        q: "Can I combine them?",
        a: "Yes. Edit in Cursor and run Codex CLI for autonomous work — or let Recoder run terminal agents in parallel and converge their diffs.",
      },
    ],
    related: ["claude-code-vs-cursor", "cursor-vs-aider", "claude-code-vs-codex"],
  },

  {
    slug: "aider-vs-gemini-cli",
    a: AIDER,
    b: GEMINI_CLI,
    title: "Aider vs Gemini CLI",
    metaTitle: "Aider vs Gemini CLI: model-agnostic pair vs Google's agent",
    description:
      "Aider vs Gemini CLI compared: a model-agnostic, git-native pair programmer against Google's open-source agent with a large free tier. Both open source. When to use each.",
    tagline: "A model-agnostic pair versus Google's open-source agent.",
    intro: [
      "Aider and Gemini CLI are both open-source terminal tools, and both are budget-friendly, but their model strategies differ. Aider is model-agnostic and git-native — it works with any model and commits each change. Gemini CLI is built around Google's Gemini models, with a generous free tier and a very large context window.",
      "If you want to mix and match models (or run local ones) with a clean git trail, Aider fits; if you want maximal free usage and a huge context on Gemini, Gemini CLI fits.",
    ],
    table: {
      head: ["Dimension", "Aider", "Gemini CLI"],
      rows: [
        ["Models", "Model-agnostic (any provider, local)", "Gemini (2.5 Pro and newer)"],
        ["Source", "Open source (Apache-2.0)", "Open source (Apache-2.0)"],
        ["Free usage", "Free tool; pay only for models", "Generous free tier for personal accounts"],
        ["Git workflow", "Auto-commits each change", "Agentic edits"],
        ["Context window", "Depends on chosen model", "Very large (up to ~1M tokens)"],
        ["Style", "Interactive pair programming", "ReAct-style agent"],
      ],
    },
    prosA: [
      "Use any model — optimize for cost, quality, or privacy.",
      "Git-native, clean commit history.",
      "Very mature with a large community.",
      "Efficient repo map for whole-project context.",
    ],
    consA: [
      "More interactive than fully autonomous.",
      "You choose and pay for a model provider.",
    ],
    prosB: [
      "Generous free tier for individual Google accounts.",
      "Very large context window for big repos.",
      "Open source and backed by Google's roadmap.",
      "MCP support and an agentic loop.",
    ],
    consB: [
      "Gemini models only.",
      "Less git-granular than Aider by default.",
    ],
    whenA:
      "Choose Aider when you want model freedom (including local models) and a git-driven workflow with clean commits.",
    whenB:
      "Choose Gemini CLI when you want low/zero cost to start, a very large context window, and are happy on Gemini models.",
    recoderFit: versusRecoderFit("Aider", "Gemini CLI"),
    faq: [
      {
        q: "Can Aider use Gemini models?",
        a: "Yes. Aider is model-agnostic and can use Gemini models along with Claude, GPT, and local models. Gemini CLI is specific to Google's Gemini models.",
      },
      {
        q: "Which is cheaper?",
        a: "Both are free, open-source tools. Gemini CLI adds a generous free usage tier on Gemini models; Aider's cost depends entirely on which model you point it at, and can be near-zero with local models.",
      },
      {
        q: "Can I run both together?",
        a: "Yes — Recoder can run Aider and Gemini CLI in parallel worktrees and converge the best result.",
      },
    ],
    related: ["codex-vs-aider", "claude-code-vs-gemini-cli", "opencode-vs-aider"],
  },

  {
    slug: "opencode-vs-aider",
    a: OPENCODE,
    b: AIDER,
    title: "opencode vs Aider",
    metaTitle: "opencode vs Aider: open-source, model-agnostic terminal tools",
    description:
      "opencode vs Aider compared: two open-source, model-agnostic terminal coding tools. TUI + LSP vs git-native auto-commits. Architecture and when to use each.",
    tagline: "Two open, model-agnostic terminal tools, different philosophies.",
    intro: [
      "opencode and Aider are both open-source, model-agnostic terminal coding tools, which makes this a close comparison. opencode ships a polished TUI with a client/server architecture and LSP integration. Aider is a git-native pair programmer that commits each change and builds a repo map for context.",
      "The decision comes down to interface and workflow: a modern TUI with editor awareness (opencode) versus a git-first, commit-per-change flow (Aider).",
    ],
    table: {
      head: ["Dimension", "opencode", "Aider"],
      rows: [
        ["License", "MIT", "Apache-2.0"],
        ["Models", "Provider-agnostic", "Model-agnostic (incl. local)"],
        ["Interface", "TUI (client/server)", "REPL-style CLI"],
        ["Editor awareness", "LSP integration", "Repo map (tree-sitter)"],
        ["Git workflow", "Agentic edits", "Auto-commits each change"],
        ["Extensibility", "MCP, provider config", "Scriptable, config files"],
      ],
    },
    prosA: [
      "Polished TUI with a client/server design.",
      "LSP integration for editor-grade code awareness.",
      "Provider-agnostic with flexible front-ends.",
      "Open source (MIT).",
    ],
    consA: [
      "Younger than Aider; smaller community.",
      "You assemble your provider setup.",
    ],
    prosB: [
      "Very mature and widely used.",
      "Git-native: clean commit per change.",
      "Efficient repo map for context.",
      "Works with any model, including local.",
    ],
    consB: [
      "REPL-style UX is less 'app-like' than a TUI.",
      "No built-in command sandbox.",
    ],
    whenA:
      "Choose opencode when you want a modern TUI with LSP awareness and a flexible client/server architecture.",
    whenB:
      "Choose Aider when you want a mature, git-native workflow with a commit for every change and a proven track record.",
    recoderFit: versusRecoderFit("opencode", "Aider"),
    faq: [
      {
        q: "Are opencode and Aider both open source?",
        a: "Yes. opencode is MIT-licensed and Aider is Apache-2.0. Both are model-agnostic and run in the terminal.",
      },
      {
        q: "Which has better editor awareness?",
        a: "opencode integrates with LSP for editor-grade code intelligence. Aider builds a repo map via tree-sitter to give the model whole-project context.",
      },
      {
        q: "Do I have to choose?",
        a: "No. Recoder can run opencode and Aider in parallel on the same task and let you converge the best diff.",
      },
    ],
    related: ["claude-code-vs-opencode", "aider-vs-gemini-cli", "codex-vs-aider"],
  },

  {
    slug: "recoder-vs-cursor",
    a: RECODER,
    b: CURSOR,
    title: "Recoder vs Cursor",
    metaTitle: "Recoder vs Cursor: agent orchestrator vs AI editor",
    description:
      "Recoder vs Cursor compared: an orchestrator that runs many coding agents in parallel and converges their work, versus an AI-first editor. Different categories — here's how they fit.",
    tagline: "An orchestrator for many agents versus a single AI editor.",
    intro: [
      "Recoder and Cursor are honestly in different categories, and comparing them fairly matters. Cursor is an excellent AI-first editor — a VS Code fork with best-in-class autocomplete, inline edits, and an agent mode. Recoder is not an editor at all: it's a desktop control plane that runs multiple coding agents in parallel isolated git worktrees, then helps you compare, converge, and merge their work under governance.",
      "So this isn't 'which edits code better' — Cursor wins that outright as an editor. It's 'do you want one AI in your editor, or several agents racing the same task with a principled way to combine the winners?'",
    ],
    table: {
      head: ["Dimension", "Recoder", "Cursor"],
      rows: [
        ["Category", "Multi-agent orchestrator", "AI code editor"],
        ["Editing surface", "None — drives external agents", "Full GUI editor with autocomplete"],
        ["Parallel agents", "Many agents, one task, isolated worktrees", "Background agents within the editor"],
        ["Convergence", "Pick/synthesize diffs into one branch", "Manual"],
        ["Governance", "Policy gate, approvals, signed audit trail", "Team/admin controls"],
        ["Keys / privacy", "BYOK, local-first, self-hostable", "Cloud subscription, model routing"],
        ["Best at", "Comparing + merging many agents' work", "Day-to-day editing + autocomplete"],
      ],
    },
    prosA: [
      "Runs many different agents (Claude Code, Codex, Cursor's CLI, opencode, Aider, Gemini CLI) on one task.",
      "Isolated git worktrees so agents never clobber each other.",
      "Convergence: pick one agent's file or synthesize non-overlapping edits.",
      "Governance gate, human approvals, and a tamper-evident audit trail with compliance export.",
      "BYOK and local-first: your code, agents, and keys stay on your machine.",
    ],
    consA: [
      "Not an editor — no autocomplete or inline editing.",
      "Most valuable when you actually run multiple agents; overkill for single-agent editing.",
      "macOS-first desktop app today.",
    ],
    prosB: [
      "Best-in-class autocomplete and inline AI editing.",
      "Full graphical editor with the VS Code ecosystem.",
      "Multiple model providers and background agents.",
    ],
    consB: [
      "Single-editor experience; not built to race many external agents and converge them.",
      "No signed audit trail / compliance evidence export.",
      "Proprietary cloud subscription.",
    ],
    whenA:
      "Choose Recoder when you want to run several agents on the same task, compare and merge the best of each, and keep a governed, auditable record — on your own machine.",
    whenB:
      "Choose Cursor when you want the best hands-on AI editing experience with autocomplete for day-to-day coding.",
    recoderFit: [
      "These tools compose rather than compete. Keep Cursor as your editor, and use Recoder when a task is worth throwing multiple agents at — Cursor's own CLI agent can even be one of the agents Recoder runs in parallel.",
      "Recoder's value shows up after the agents finish: comparing divergent diffs, converging the best parts into one branch, and landing a single governed merge with an audit trail you can export for review.",
    ],
    faq: [
      {
        q: "Is Recoder an alternative to Cursor?",
        a: "Not exactly — Recoder isn't an editor. Cursor is where you write and autocomplete code; Recoder is where you run multiple agents on a task and converge their results. Many teams use both.",
      },
      {
        q: "Can Recoder run Cursor's agent?",
        a: "Recoder orchestrates agent CLIs you already have on your PATH, including Cursor's CLI agent, alongside Claude Code, Codex, opencode, Aider, and Gemini CLI.",
      },
      {
        q: "Does Recoder resell model tokens?",
        a: "No. Recoder is bring-your-own-keys: your agents use your provider keys, and you pay providers directly for inference. Recoder orchestrates and governs — it never proxies or resells tokens.",
      },
    ],
    related: ["recoder-vs-claude-code", "recoder-vs-conductor", "claude-code-vs-cursor"],
  },

  {
    slug: "recoder-vs-claude-code",
    a: RECODER,
    b: CLAUDE_CODE,
    title: "Recoder vs Claude Code",
    metaTitle: "Recoder vs Claude Code: orchestrate many agents vs one CLI",
    description:
      "Recoder vs Claude Code compared: Claude Code is one terminal agent; Recoder runs Claude Code and other agents in parallel, converges their diffs, and governs the merge.",
    tagline: "One terminal agent versus an orchestrator that runs many.",
    intro: [
      "Claude Code is a single, excellent agent: you give it a task and it works through your terminal. Recoder isn't a competing agent — it's the layer above. It runs Claude Code (and other agents like Codex, opencode, Aider, or Gemini CLI) in parallel isolated worktrees on the same task, then helps you compare, converge, and land one governed merge.",
      "If you only ever want one agent doing one attempt, Claude Code alone is simpler. Recoder earns its place the moment you want multiple parallel attempts, a real comparison, and a principled way to combine the best.",
    ],
    table: {
      head: ["Dimension", "Recoder", "Claude Code"],
      rows: [
        ["Category", "Multi-agent orchestrator", "Single agentic CLI"],
        ["Agents", "Claude Code + Codex, opencode, Aider, …", "Claude Code itself"],
        ["Parallel attempts", "Many, isolated per worktree", "One at a time"],
        ["Compare & converge", "Side-by-side diffs, pick/synthesize", "Not applicable"],
        ["Governance", "Policy gate, approvals, signed audit", "Permission prompts + hooks"],
        ["Keys", "BYOK across all agents", "Your Anthropic auth"],
      ],
    },
    prosA: [
      "Runs Claude Code alongside other agents on one task, in isolated worktrees.",
      "Compare divergent diffs and converge the best of each.",
      "Governance gate, approvals, and a tamper-evident audit trail.",
      "Not locked to one vendor — mix agents and models.",
      "Local-first, self-hostable, BYOK.",
    ],
    consA: [
      "Adds orchestration overhead that a single-agent workflow doesn't need.",
      "Not an agent itself — it drives the agents you install.",
      "macOS-first desktop app today.",
    ],
    prosB: [
      "Simple and direct for one-agent tasks.",
      "Mature agent ergonomics: subagents, hooks, slash commands.",
      "Strong Anthropic models.",
    ],
    consB: [
      "One attempt at a time — no built-in parallel-agent comparison or convergence.",
      "Anthropic models only.",
      "No signed audit trail or compliance evidence export.",
    ],
    whenA:
      "Choose Recoder when you want several agents (including Claude Code) racing the same task, a real diff comparison, convergence, and a governed, auditable merge.",
    whenB:
      "Choose Claude Code on its own when a single terminal agent is all you need and simplicity matters most.",
    recoderFit: [
      "This isn't either/or: Claude Code is one of the agents Recoder runs best. Use Claude Code directly for quick single-agent tasks, and reach for Recoder when a task is worth multiple parallel attempts and a governed merge.",
      "Recoder's payoff is convergence and governance — turning N divergent Claude Code (and peer-agent) runs into one reviewed, audit-backed commit.",
    ],
    faq: [
      {
        q: "Does Recoder replace Claude Code?",
        a: "No. Recoder runs Claude Code — it's an orchestration layer, not a competing agent. You keep using Claude Code exactly as before; Recoder adds parallel runs, comparison, convergence, and governance.",
      },
      {
        q: "Can I run Claude Code and Codex together in Recoder?",
        a: "Yes. That's the core workflow: launch multiple agents in parallel isolated worktrees on one task, then converge the best diffs into a single governed merge.",
      },
      {
        q: "Do I need a Recoder subscription to use Claude Code?",
        a: "No — Claude Code works on its own. Recoder is optional and adds orchestration, convergence, and governance on top of the agents you already run with your own keys.",
      },
    ],
    related: ["recoder-vs-conductor", "recoder-vs-cursor", "claude-code-vs-codex"],
  },

  {
    slug: "recoder-vs-conductor",
    a: RECODER,
    b: CONDUCTOR,
    title: "Recoder vs Conductor",
    metaTitle: "Recoder vs Conductor: multi-agent + governance vs parallel Claude Code",
    description:
      "Recoder vs Conductor compared: both run coding agents in parallel git worktrees. Conductor focuses on Claude Code; Recoder is agent-agnostic with convergence and governance.",
    tagline: "The closest head-to-head: parallel agents, different scope.",
    intro: [
      "This is the most direct comparison on this list. Conductor is a macOS app that runs multiple Claude Code agents in parallel, each in its own isolated git workspace, so you can review their diffs — and it's free and pleasantly simple. Recoder shares that parallel-worktrees-with-diff-review foundation, but widens the scope in two directions: it's agent-agnostic, and it adds convergence plus governance.",
      "If your entire workflow is Claude Code and you want the simplest possible parallel runner, Conductor is a great fit. If you run several different agents, or you need to merge their work and prove the merge was reviewed, that's where Recoder is built to go further.",
    ],
    table: {
      head: ["Dimension", "Recoder", "Conductor"],
      rows: [
        ["Agents supported", "Claude Code, Codex, opencode, Aider, Gemini CLI, …", "Claude Code"],
        ["Parallel isolation", "Git worktree per agent", "Git workspace per agent"],
        ["Diff review", "Side-by-side, contested-file aware", "Yes"],
        ["Convergence", "Pick/synthesize diffs into one branch", "Manual"],
        ["Governance", "Policy gate, approvals, signed audit trail", "Not a focus"],
        ["Compliance export", "SOC 2 / EU AI Act / DORA mapping", "No"],
        ["Cost", "Free tier + paid plans, self-hostable", "Free"],
      ],
    },
    prosA: [
      "Agent-agnostic — not limited to Claude Code.",
      "Convergence: combine the best of several agents' diffs into one branch.",
      "Governance gate, human approvals, and a tamper-evident audit trail.",
      "Compliance evidence export mapped to real control catalogs.",
      "Self-hostable and BYOK.",
    ],
    consA: [
      "More surface area than a single-agent runner.",
      "macOS-first today (like Conductor).",
      "Paid plans for higher headroom and governance features.",
    ],
    prosB: [
      "Free and simple.",
      "Purpose-built and polished for Claude Code specifically.",
      "Low learning curve for parallel Claude Code runs.",
    ],
    consB: [
      "Claude Code only — no Codex, opencode, Aider, or Gemini CLI.",
      "No built-in convergence of multiple agents' diffs.",
      "No governance gate, approvals, or signed audit/compliance export.",
    ],
    whenA:
      "Choose Recoder when you run more than one kind of agent, want to converge their work into one branch, or need governed, auditable merges (approvals, audit trail, compliance evidence).",
    whenB:
      "Choose Conductor when you exclusively use Claude Code and want the simplest, free way to run several instances in parallel and review their diffs.",
    recoderFit: [
      "Recoder and Conductor solve the same first problem — parallel agents in isolated worktrees — but Recoder is designed for teams and workflows that outgrow a single-agent, ungoverned runner.",
      "The dividing lines are agent breadth (many agents vs Claude Code only), convergence (combining diffs vs manual), and governance (a policy gate, approvals, and a signed audit trail vs none).",
    ],
    faq: [
      {
        q: "Is Recoder just Conductor for more agents?",
        a: "Agent breadth is one difference, but not the only one. Recoder also adds convergence (combining multiple agents' diffs into one branch) and governance (a fail-closed policy gate, human approvals, and a tamper-evident audit trail with compliance export). Conductor focuses on running Claude Code in parallel.",
      },
      {
        q: "Does Conductor support Codex or Aider?",
        a: "Conductor is built around Claude Code. Recoder is agent-agnostic and orchestrates Claude Code, Codex, opencode, Aider, Gemini CLI, and others.",
      },
      {
        q: "Is Recoder free like Conductor?",
        a: "Recoder has a free tier for local use, with paid plans for more headroom, seats, and governance. Conductor is free. Both run agents locally on your machine.",
      },
    ],
    related: ["recoder-vs-claude-code", "recoder-vs-cursor", "recoder-vs-codex"],
  },

  {
    slug: "recoder-vs-aider",
    a: RECODER,
    b: AIDER,
    title: "Recoder vs Aider",
    metaTitle: "Recoder vs Aider: multi-agent orchestrator vs git-native pair",
    description:
      "Recoder vs Aider compared: Aider is a single git-native AI pair programmer; Recoder orchestrates many agents in parallel, converges their diffs, and governs the merge.",
    tagline: "A single git-native pair versus a multi-agent orchestrator.",
    intro: [
      "Aider is a focused, excellent tool: a git-native AI pair programmer that runs in the terminal, works with almost any model, and commits each change. Recoder is a different kind of tool — it orchestrates multiple agents (which could include an Aider-style workflow) in parallel isolated worktrees, then compares, converges, and governs the merge.",
      "For a single agent doing one careful, git-driven pass, Aider is lightweight and hard to beat. Recoder is for when you want several agents attempting a task at once and a principled way to combine and govern the results.",
    ],
    table: {
      head: ["Dimension", "Recoder", "Aider"],
      rows: [
        ["Category", "Multi-agent orchestrator", "Single AI pair programmer"],
        ["Agents/models", "Many agents, BYOK across providers", "One session, model-agnostic"],
        ["Parallel attempts", "Many, isolated worktrees", "One at a time"],
        ["Git workflow", "Converge diffs → governed merge", "Auto-commit each change"],
        ["Governance", "Policy gate, approvals, signed audit", "Git history"],
        ["Cost", "Free tier + paid plans", "Free tool; pay for models"],
      ],
    },
    prosA: [
      "Runs many agents in parallel on one task and converges the best diffs.",
      "Governance gate, approvals, and a tamper-evident audit trail.",
      "BYOK across all agents; self-hostable.",
      "Contested-file aware comparison across agents.",
    ],
    consA: [
      "Heavier than a single-agent, git-native tool.",
      "Not itself a pair programmer — it drives agents.",
      "macOS-first desktop app today.",
    ],
    prosB: [
      "Simple, mature, and free/open source.",
      "Git-native: a clean commit for every change.",
      "Model-agnostic, including cheap or local models.",
      "Lightweight and scriptable.",
    ],
    consB: [
      "One agent, one attempt — no parallel comparison or convergence.",
      "No governance gate or signed audit trail.",
    ],
    whenA:
      "Choose Recoder when you want several agents racing a task, a real diff comparison, convergence, and a governed, auditable merge.",
    whenB:
      "Choose Aider when a single, git-native pair programmer with model freedom is exactly enough — and you value simplicity.",
    recoderFit: [
      "Aider is a great single-agent workflow; Recoder is the layer for running many agents and reconciling their output. They aren't rivals so much as different rungs of the same ladder.",
      "If Aider's single-pass, git-native model already covers you, you may not need an orchestrator. Reach for Recoder when parallel attempts, convergence, and governance start to matter.",
    ],
    faq: [
      {
        q: "Does Recoder replace Aider?",
        a: "No — they operate at different levels. Aider is a single AI pair programmer; Recoder orchestrates multiple agents and converges their work. You can keep using Aider-style workflows while adding parallel runs and governance with Recoder.",
      },
      {
        q: "Can Recoder auto-commit like Aider?",
        a: "Recoder's model is different: agents work in isolated worktrees, and Recoder converges the chosen diffs into a single governed merge with an audit trail. Aider commits each change inline as you go.",
      },
      {
        q: "Are both free?",
        a: "Aider is free and open source (you pay only for model usage). Recoder has a free tier for local use plus paid plans for more headroom and governance.",
      },
    ],
    related: ["recoder-vs-codex", "recoder-vs-claude-code", "claude-code-vs-aider"],
  },

  {
    slug: "recoder-vs-codex",
    a: RECODER,
    b: CODEX,
    title: "Recoder vs Codex CLI",
    metaTitle: "Recoder vs Codex CLI: orchestrate many agents vs one OpenAI agent",
    description:
      "Recoder vs OpenAI Codex CLI compared: Codex CLI is one agent; Recoder runs Codex and other agents in parallel, converges their diffs, and governs the merge.",
    tagline: "One OpenAI agent versus an orchestrator that runs many.",
    intro: [
      "Codex CLI is OpenAI's open-source terminal agent — autonomous, sandboxed, and tied to OpenAI models. Recoder isn't a competing agent; it's the orchestration layer that can run Codex CLI (alongside Claude Code, opencode, Aider, or Gemini CLI) in parallel isolated worktrees, then compare, converge, and govern the merge.",
      "If your workflow is a single OpenAI agent, Codex CLI stands on its own. Recoder adds value when you want multiple parallel attempts across different agents and a principled, auditable way to combine them.",
    ],
    table: {
      head: ["Dimension", "Recoder", "Codex CLI"],
      rows: [
        ["Category", "Multi-agent orchestrator", "Single agentic CLI"],
        ["Agents", "Codex + Claude Code, opencode, Aider, …", "Codex itself (OpenAI models)"],
        ["Parallel attempts", "Many, isolated worktrees", "One at a time"],
        ["Compare & converge", "Side-by-side diffs, pick/synthesize", "Not applicable"],
        ["Governance", "Policy gate, approvals, signed audit", "OS sandbox + approval modes"],
        ["Keys", "BYOK across all agents", "OpenAI auth / ChatGPT plan"],
      ],
    },
    prosA: [
      "Runs Codex CLI alongside other agents on one task.",
      "Compare divergent diffs and converge the best of each.",
      "Governance gate, approvals, and a tamper-evident audit trail with compliance export.",
      "Vendor-agnostic — not tied to OpenAI models.",
      "Self-hostable and BYOK.",
    ],
    consA: [
      "Orchestration overhead a single-agent flow doesn't need.",
      "Not an agent itself — it drives the agents you install.",
      "macOS-first desktop app today.",
    ],
    prosB: [
      "Open source and auditable.",
      "Autonomous with strong OS-level command sandboxing.",
      "Local + cloud workflow on OpenAI models.",
      "Covered by a ChatGPT plan.",
    ],
    consB: [
      "One attempt at a time — no parallel-agent comparison or convergence.",
      "OpenAI models only.",
      "No cross-agent convergence or signed compliance evidence export.",
    ],
    whenA:
      "Choose Recoder when you want several agents (including Codex) racing one task, convergence of their diffs, and a governed, auditable merge.",
    whenB:
      "Choose Codex CLI on its own when a single open-source, sandboxed OpenAI agent is what you need.",
    recoderFit: [
      "Codex CLI is one of the agents Recoder runs well. Use it directly for single-agent OpenAI tasks; reach for Recoder when a task deserves multiple parallel agents and a governed merge.",
      "Recoder's contribution is convergence and governance across agents — turning several divergent runs into one reviewed, audit-backed commit.",
    ],
    faq: [
      {
        q: "Does Recoder replace Codex CLI?",
        a: "No. Recoder runs Codex CLI as one of its agents — it's an orchestration layer, not a competing agent. You keep Codex CLI's sandbox and workflow; Recoder adds parallel runs, convergence, and governance.",
      },
      {
        q: "Can Recoder run Codex and Claude Code side by side?",
        a: "Yes. Launch them in parallel isolated worktrees on the same task, compare their diffs, and converge the best into a single governed merge.",
      },
      {
        q: "Is Recoder open source like Codex CLI?",
        a: "Codex CLI is open source (Apache-2.0). Recoder is proprietary but self-hostable and BYOK — your code, agents, and keys stay on your machine.",
      },
    ],
    related: ["recoder-vs-claude-code", "recoder-vs-conductor", "codex-vs-aider"],
  },
];

export function comparison(slug: string): Comparison | undefined {
  return COMPARISONS.find((c) => c.slug === slug);
}
