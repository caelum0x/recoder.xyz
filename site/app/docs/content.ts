// Site-native docs content, authored as typed data (same convention as
// changelog/entries.ts — no markdown dependency). The canonical, exhaustive guide
// lives in the repo at docs/guide/; this is the customer-facing getting-started
// surface served at /docs.

export type DocBlock =
  | { kind: "p"; text: string }
  | { kind: "steps"; items: string[] }
  | { kind: "code"; code: string }
  | { kind: "note"; text: string };

export interface DocSection {
  id: string;
  title: string;
  blocks: DocBlock[];
}

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "what-is-recoder",
    title: "What is Recoder?",
    blocks: [
      {
        kind: "p",
        text: "Recoder is a self-hosted convergence layer for AI coding agents. You run your own agents — Claude Code, Codex, opencode, and more — in parallel, in isolated git worktrees, then compare their work, converge the best of each, and land a single governed, evidence-producing merge.",
      },
      {
        kind: "p",
        text: "Your machine, your agents, your keys. Recoder orchestrates and governs; it never proxies or resells inference tokens. It is a cockpit for agents, not an editor — it drives the agent CLIs you already run.",
      },
    ],
  },
  {
    id: "install",
    title: "Install",
    blocks: [
      {
        kind: "p",
        text: "Recoder ships as a desktop app that runs entirely on your machine. No account is required to start. On macOS (Apple Silicon) the build is signed with an Apple Developer ID and notarized, so it installs without Gatekeeper warnings.",
      },
      { kind: "steps", items: [
        "Download Recoder for macOS from the download page.",
        "Open the .dmg and drag Recoder to your Applications folder.",
        "Launch it — a local control-plane backend starts on 127.0.0.1:3100 (loopback only; nothing is exposed to the network).",
      ] },
      {
        kind: "p",
        text: "Verify the download before installing — the download page publishes a SHA-256 checksum:",
      },
      { kind: "code", code: "shasum -a 256 ~/Downloads/Recoder-<version>-arm64.dmg\n# compare to the digest shown on the download page" },
    ],
  },
  {
    id: "connect-agents",
    title: "Connect your coding agents",
    blocks: [
      {
        kind: "p",
        text: "Recoder detects the agent CLIs installed on your PATH — Claude Code, Codex, opencode, Cursor, Gemini CLI, Qwen Code, Crush, and more. The recipe is the same for every agent: install its CLI, authenticate it the way you normally would, make sure it's on your PATH, then refresh Recoder.",
      },
      { kind: "code", code: "claude --version    # Claude Code\ncodex --version     # Codex\nopencode --version  # opencode" },
      {
        kind: "note",
        text: "Recoder inherits your shell environment, so agents pick up the same provider keys and config they use when you run them directly. If an agent isn't installed or authenticated, Recoder says so — it never fabricates availability.",
      },
    ],
  },
  {
    id: "first-run",
    title: "Your first parallel run",
    blocks: [
      {
        kind: "p",
        text: "The core loop runs two or more agents on the same task, then converges them into one governed merge:",
      },
      { kind: "steps", items: [
        "Create a workspace: pick a local git repo, describe the task, and select two or more detected agents.",
        "Recoder launches each agent in its own isolated git worktree — they run in parallel and never touch each other's files.",
        "Watch each run's event stream. If an action needs sign-off, it surfaces as an approval.",
        "Compare the results: see each agent's diff and which files are contested.",
        "Converge: per file, pick one agent's version or synthesize non-overlapping edits from several.",
        "Merge: the converged branch passes the governance gate and is sealed with signed evidence + an audit trail.",
      ] },
    ],
  },
  {
    id: "byok",
    title: "Bring your own keys (BYOK)",
    blocks: [
      {
        kind: "p",
        text: "Recoder is bring-your-own-keys. Your agents talk to their providers with their own auth, exactly as they do outside Recoder — it doesn't sit between the agent and its provider. You pay your providers directly for inference; Recoder never proxies or resells tokens.",
      },
      {
        kind: "note",
        text: "Don't confuse provider keys (ANTHROPIC_API_KEY, OPENAI_API_KEY — pay for inference) with Recoder platform keys (sk_… — identify you to the control plane). The desktop app mints the latter locally; you don't manage it by hand for local use.",
      },
    ],
  },
  {
    id: "governance",
    title: "Governance & evidence",
    blocks: [
      {
        kind: "p",
        text: "Every risky action an agent takes — git writes, merges, secret access — passes a policy gate before it happens. The gate is fail-closed: if the policy engine is unavailable, the default is to deny, never to silently allow. Actions that need human sign-off surface as approvals.",
      },
      {
        kind: "p",
        text: "A governed merge produces a content-hashed, Ed25519-signed ConvergenceEvidence record (the task, each candidate diff, the verdict/approval, verification, per-file provenance) sealed into a tamper-evident audit chain — exportable as a compliance pack mapped to SOC 2, EU AI Act, and DORA controls. Each control's status is derived from real evidence; Recoder never fabricates a “met.”",
      },
    ],
  },
];
