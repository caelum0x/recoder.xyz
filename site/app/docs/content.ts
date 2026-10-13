// Detailed, multi-page docs content authored as typed data (same convention as
// changelog/entries.ts — no markdown dependency). Each DocPage is its own route at
// /docs/[slug]; the canonical exhaustive source also lives in the repo at docs/guide/.

export type DocBlock =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "steps"; items: string[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "code"; code: string }
  | { kind: "note"; text: string }
  | { kind: "table"; head: string[]; rows: string[][] };

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  blocks: DocBlock[];
}

export const DOC_PAGES: DocPage[] = [
  {
    slug: "introduction",
    title: "What is Recoder?",
    description:
      "Recoder is a self-hosted convergence layer for AI coding agents: run your own agents in parallel, converge the best of each, and land one governed merge.",
    blocks: [
      { kind: "p", text: "Recoder is a desktop agent control plane. The product is a terminal: you open Recoder, run your chosen coding agents in parallel isolated git worktrees, then review and merge their work — with governance and a full audit trail underneath." },
      { kind: "h", text: "The problem it solves" },
      { kind: "p", text: "A single AI coding agent gives you one attempt at a task. If you want a second opinion you run it again and lose the first. If you run several agents at once, you're left with N divergent branches and no principled way to combine them." },
      { kind: "p", text: "Recoder turns N divergent parallel runs into one trusted merge:" },
      { kind: "bullets", items: [
        "Parallel, isolated — each agent works in its own git worktree; they never step on each other.",
        "Compare — see where agents agree, where they diverge, and which files are contested.",
        "Converge — per file, take one agent's version wholesale (pick) or merge non-overlapping edits from several (synthesize).",
        "Govern — every merge passes a policy gate, can require human approval, and is sealed into a tamper-evident audit chain with signed evidence you can export for SOC 2 / EU AI Act / DORA reviews.",
      ] },
      { kind: "h", text: "Who it's for" },
      { kind: "bullets", items: [
        "Individual developers who want to run a few agents against a task and keep the best result, fast.",
        "Teams who need parallel agents and a record of what happened — who changed what, which policy allowed it, and proof it was reviewed.",
        "Regulated / enterprise environments that need agent work to be governed and auditable, self-hosted, with no vendor cloud in the loop.",
      ] },
      { kind: "h", text: "What it is not" },
      { kind: "p", text: "It is not an editor — Recoder doesn't replace your IDE or add tab-completion; it drives the agent CLIs you already run. And it is not a token reseller — you bring your own provider keys; Recoder orchestrates and never resells inference." },
    ],
  },
  {
    slug: "install",
    title: "Install",
    description:
      "Download and install the signed, notarized Recoder desktop app for macOS, verify the download, and see what the app starts on your machine.",
    blocks: [
      { kind: "p", text: "Recoder ships as a desktop app that runs entirely on your machine. There's no account required to start." },
      { kind: "h", text: "Download" },
      { kind: "p", text: "Go to the download page and pick your platform. On macOS (Apple Silicon / arm64) the build is signed with an Apple Developer ID and notarized by Apple, so it installs without Gatekeeper warnings. Intel and universal builds are on the roadmap; Windows and Linux show a notify-me option until they ship." },
      { kind: "h", text: "Verify the download (recommended)" },
      { kind: "p", text: "Every macOS build publishes a SHA-256 checksum. On the download page, expand “Verify checksum” and confirm it matches before installing:" },
      { kind: "code", code: "shasum -a 256 ~/Downloads/Recoder-<version>-arm64.dmg\n# compare the output to the digest shown on the download page" },
      { kind: "p", text: "You can also confirm the signature and notarization yourself:" },
      { kind: "code", code: "codesign --verify --deep --strict /Applications/Recoder.app && echo \"signature OK\"\nxcrun stapler validate ~/Downloads/Recoder-<version>-arm64.dmg" },
      { kind: "h", text: "Install" },
      { kind: "steps", items: [
        "Open the .dmg.",
        "Drag Recoder to your Applications folder.",
        "Launch it from Applications. Because the build is notarized, macOS opens it without the “unidentified developer” prompt.",
      ] },
      { kind: "h", text: "First run — what starts on your machine" },
      { kind: "p", text: "When Recoder launches it starts a local control-plane backend on your machine (loopback 127.0.0.1:3100 by default) and supervises it. This backend is the conductor + agent-os + engine host. Nothing is exposed to the network; it binds to loopback only." },
      { kind: "p", text: "On first run, Recoder imports your local environment so it can drive the agents you already have: your git identity for commits it makes on your behalf, which agent CLIs are installed and on your PATH, your GitHub CLI (gh) auth if present, and your shell environment so agents inherit the keys and tools you normally use." },
    ],
  },
  {
    slug: "cli",
    title: "recoder-code CLI",
    description:
      "No desktop install, no waitlist: recoder-code is a BYOK coding-agent CLI published on npm today, including a parallel git-worktree mode. Verified commands only.",
    blocks: [
      { kind: "p", text: "recoder-code is a separate, already-shipping product: a terminal-native, BYOK AI coding agent published on npm. It's the fastest way to try Recoder's parallel-agent idea with zero install and no waitlist — run it with npx, point it at your own provider key or OpenRouter, and go." },
      { kind: "h", text: "Run it" },
      { kind: "code", code: "npx recoder-code@latest" },
      { kind: "p", text: "That launches the interactive CLI. Every command below was run against the published npm package and its real --help output; nothing here is aspirational." },
      { kind: "h", text: "Parallel mode (git worktrees)" },
      { kind: "p", text: "The same core idea as the desktop app's parallel runs, from the terminal: recoder-code parallel spins up an isolated git worktree per task and runs there, so parallel attempts never step on each other or your working tree." },
      { kind: "code", code: "npx recoder-code@latest parallel \"implement user auth\"          # start parallel task on a new branch\nnpx recoder-code@latest parallel -b recoder/user-auth-123 \"continue work\"  # resume an existing branch\nnpx recoder-code@latest parallel --list                              # list active parallel worktrees\nnpx recoder-code@latest parallel --cleanup                           # clean up stale worktrees\nnpx recoder-code@latest parallel-finish                              # finish parallel mode and commit changes" },
      { kind: "h", text: "Everyday commands" },
      { kind: "table", head: ["Command", "What it does"], rows: [
        ["recoder-code", "Launch the interactive CLI (default)"],
        ["recoder-code -p \"<prompt>\"", "Non-interactive: run one prompt and exit"],
        ["recoder-code init", "Initialize a .recoder folder in the current directory (-g for a global ~/.recoder config)"],
        ["recoder-code configure", "Interactive configuration wizard"],
        ["recoder-code providers", "Manage AI providers (Ollama, OpenRouter, etc.)"],
        ["recoder-code models", "Manage AI models; --list-models / --list-models-all to see what's available"],
        ["recoder-code agents", "Manage built-in and custom AI agents"],
        ["recoder-code plan", "Project planning — technical architecture and implementation plans"],
        ["recoder-code auth login / status / whoami", "Authenticate with Recoder.xyz and check status"],
        ["recoder-code mcp", "Manage MCP servers"],
      ] },
      { kind: "h", text: "Bring your own key" },
      { kind: "p", text: "recoder-code is BYOK, same as the desktop app: configure a provider via recoder-code configure or recoder-code providers, or pass --openai-api-key / --openai-base-url directly. --setup runs a one-time wizard. --sandbox runs the agent sandboxed; --yolo / --approval-mode control how much it auto-approves — default prompts for approval on risky actions." },
      { kind: "code", code: "npx recoder-code@latest --setup\nnpx recoder-code@latest -m <model> -p \"explain this repo's structure\"" },
      { kind: "note", text: "recoder-code is published independently on npm (currently 2.5.5) from the desktop app's release train. Verify what you get with npx recoder-code@latest --version and --help — the flags above are the exact, current output of that command, not a fixed list that can drift out of date." },
    ],
  },
  {
    slug: "quickstart",
    title: "Quickstart: your first parallel run",
    description:
      "Run two agents on the same task, compare them, converge, and land one governed merge — end to end, in about ten minutes.",
    blocks: [
      { kind: "p", text: "This walks through the core loop end to end: run two agents on the same task, compare them, converge, and land one governed merge. Budget ~10 minutes." },
      { kind: "h", text: "Before you start" },
      { kind: "bullets", items: [
        "Install Recoder.",
        "Have at least two agent CLIs on your PATH (e.g. Claude Code and Codex), each authenticated the way you normally use them.",
        "Have a local git repository you want to work in.",
      ] },
      { kind: "h", text: "1. Create a workspace" },
      { kind: "steps", items: [
        "Pick a repository — choose the local folder for your git repo. Recoder checks it's a git repo (and can git init for you if not).",
        "Describe the task — a short instruction, e.g. “Add input validation to the signup form and cover it with tests.”",
        "Select the agents — check two or more detected agents. Agents that aren't installed/authenticated show their state so you're never guessing.",
        "Launch. Recoder creates one isolated git worktree per agent, all sharing the same task group, and starts each agent in its own worktree.",
      ] },
      { kind: "h", text: "2. Watch the runs" },
      { kind: "p", text: "Each run streams its activity. Open a run to see its event stream (what the agent is doing, files it's touching, when it needs input or hits an approval). You can also attach a real terminal to a run's session if you want the raw agent TUI. If an agent needs a decision that policy gates, it surfaces as an approval." },
      { kind: "h", text: "3. Compare the results" },
      { kind: "p", text: "When the agents finish, open Compare. Recoder shows each agent's diff side by side, which files are contested (more than one agent changed them), and readiness / mergeability signals per run." },
      { kind: "h", text: "4. Converge" },
      { kind: "p", text: "Open Converge. Non-contested files are taken automatically; contested files you resolve — either pick one agent's version wholesale, or synthesize (merge non-overlapping edits from several agents). Converge composes the winners into a fresh governed branch; it never mutates any agent's worktree." },
      { kind: "h", text: "5. Merge (governed)" },
      { kind: "p", text: "Land the converged branch. The merge passes the governance gate: if policy allows it outright it merges; if policy requires human sign-off it waits for your approval; either way it's sealed into the audit chain and a ConvergenceEvidence record is produced." },
    ],
  },
  {
    slug: "connect-agents",
    title: "Connect your coding agents",
    description:
      "Recoder drives the agent CLIs you already have — Claude Code, Codex, opencode, Cursor, Gemini CLI and more. How detection and auth work.",
    blocks: [
      { kind: "p", text: "Recoder drives the agent CLIs you already have installed. It does not bundle or resell them — you keep using each agent exactly as its vendor intended, with your own auth. Recoder detects what's on your PATH and orchestrates them." },
      { kind: "h", text: "How detection works" },
      { kind: "p", text: "On launch (and whenever you refresh), Recoder probes your PATH for supported agent CLIs via its /api/conductor/runtimes endpoint. Each agent shows as available (installed + on PATH, auth looks present) or not detected (install it and refresh). Detection is a fresh PATH probe, so if you install an agent while Recoder is open, just refresh — no restart needed. Recoder never fabricates availability." },
      { kind: "h", text: "Supported runtimes" },
      { kind: "table", head: ["Runtime", "Display name"], rows: [
        ["claude_code", "Claude Code"],
        ["codex", "Codex"],
        ["opencode", "opencode"],
        ["cursor", "Cursor"],
        ["gemini_cli", "Gemini CLI"],
        ["qwen_code", "Qwen Code"],
        ["crush", "Crush"],
        ["pi", "pi"],
        ["recoder_code", "Recoder Code"],
      ] },
      { kind: "p", text: "The list you actually see is whatever is installed on your machine." },
      { kind: "h", text: "The setup pattern (every agent)" },
      { kind: "p", text: "Install its CLI, authenticate it the way you normally would, make sure it's on your PATH, then refresh Recoder. For example:" },
      { kind: "code", code: "claude --version    # Claude Code\ncodex --version     # Codex\nopencode --version  # opencode" },
      { kind: "bullets", items: [
        "Claude Code — authenticate via Anthropic's interactive login, or an ANTHROPIC_API_KEY in your environment.",
        "Codex — authenticate via its login flow, or an OPENAI_API_KEY in your environment.",
        "opencode — configure its provider/key as you normally would.",
        "Cursor, Gemini CLI, Qwen Code, Crush, pi — same recipe: install, authenticate, ensure it's on PATH, refresh.",
      ] },
      { kind: "note", text: "Recoder inherits your shell environment, so agents pick up the same provider keys and config they use when you run them directly. Recoder does not intercept, proxy, or resell those tokens." },
    ],
  },
  {
    slug: "review-converge-merge",
    title: "Review, converge & merge",
    description:
      "Recoder's headline flow: take N parallel agent runs and turn them into one reviewed, governed commit with signed evidence.",
    blocks: [
      { kind: "p", text: "This is Recoder's headline flow: take N parallel agent runs and turn them into one reviewed, governed commit." },
      { kind: "h", text: "1. Compare" },
      { kind: "p", text: "Open Compare for a task group. You get side-by-side diffs of each agent's worktree against the base, the contested files (paths more than one agent changed), readiness / mergeability signals, and pairwise A/B comparison when you want to weigh two agents head-to-head." },
      { kind: "h", text: "2. Converge" },
      { kind: "p", text: "Open Converge. Recoder builds a convergence plan:" },
      { kind: "bullets", items: [
        "Non-contested files are taken automatically from whichever agent changed them.",
        "Pick — take one agent's version of a contested file wholesale. Safe and obvious when one agent clearly did it right.",
        "Synthesize — merge non-overlapping edits from multiple agents using a 3-way merge (git merge-file semantics; for more than two agents it folds them pairwise). If two agents edited the same lines in a way that truly conflicts, Recoder marks it a conflict and aborts that file rather than writing conflict markers — you won't get a silently broken merge.",
      ] },
      { kind: "note", text: "Provenance is recorded. For every file, Recoder remembers which agent won and whether it was a pick or a synthesize. That provenance goes into the evidence record." },
      { kind: "h", text: "3. Governed merge" },
      { kind: "p", text: "Land the converged branch. Before any git write happens, the merge passes the governance gate: allowed → it merges (falling back to a local git merge when there's no remote/gh); needs approval → it waits for a human decision; denied → it stops and tells you why. Every outcome is sealed into the tamper-evident audit chain." },
      { kind: "h", text: "The evidence you get" },
      { kind: "p", text: "A successful governed merge produces a ConvergenceEvidence record: the task and each candidate agent's diff, the governance verdict and any approval, verification results, per-file provenance (which agent contributed each path, pick vs synthesize), a SHA-256 content hash, and an Ed25519 signature when a signing key is configured. You can export a compliance pack mapping the evidence to SOC 2, EU AI Act, DORA, and Recoder's own convergence-integrity control — each status derived from present evidence, never a fabricated “met.”" },
    ],
  },
  {
    slug: "governance-and-approvals",
    title: "Governance & approvals",
    description:
      "Recoder governs what agents can do below the model: a fail-closed policy gate, human approvals, a tamper-evident audit trail, and compliance evidence export.",
    blocks: [
      { kind: "p", text: "Recoder governs what agents are allowed to do below the model, so it doesn't depend on trusting agent output. Instruction files shape behavior; the governance gate, policy decisions, and a tamper-evident audit trail enforce it." },
      { kind: "h", text: "The governance gate" },
      { kind: "p", text: "Every risky action an agent (or the convergence flow) takes passes a policy gate before it happens: git writes, PR creation, merges, secret access, network calls. The gate returns allow (proceed), needs approval (pause for a human), or deny (stop, with a reason). The gate is fail-closed: if the policy engine is unavailable or errors, the default is to deny, never to silently allow." },
      { kind: "h", text: "Approvals" },
      { kind: "p", text: "When an action needs human sign-off it surfaces as an approval. Open the Approvals view to see pending requests with their context — what's being requested, by which run, and the risk tier — and approve or reject each. A merge that policy gates waits on your approval before any git write, and the decision (and who made it) becomes part of the evidence and audit trail. You also get an OS notification when a run needs input or an approval." },
      { kind: "h", text: "The audit trail" },
      { kind: "p", text: "Every governed action is sealed into a Merkle audit chain — an append-only, tamper-evident log. Each entry is content-hashed and linked to the previous one, so any after-the-fact edit is detectable. This is what lets Recoder prove not just that the agent did X, but that X was authorized by this policy, approved by this person, with a tamper-evident record." },
      { kind: "h", text: "Compliance evidence export" },
      { kind: "p", text: "From a governed merge's evidence you can export a compliance pack (JSON or Markdown) mapping the evidence to a control catalog: SOC 2 (CC8.1 change management, CC7.2 change verification), EU AI Act (Art. 12 record-keeping, Art. 14 human oversight), DORA (ICT change control), and Recoder (convergence integrity). Each control's status is derived from a real evidence field — e.g. human oversight is met only when a real approval was recorded, partial for a high-risk change auto-allowed without one, and not-evidenced for a low-risk auto-merge. Recoder never fabricates a “met.”" },
      { kind: "h", text: "Solo / self-hosted mode" },
      { kind: "p", text: "Running fully local without a cloud database, some cloud-oriented gates would otherwise fail closed and block everything. Recoder has explicit solo-mode seams that let the local workflow work end to end while keeping the governance decisions and audit truthful. You get the gate and the audit trail locally; you don't get blocked just because there's no cloud backend." },
    ],
  },
  {
    slug: "byok-and-keys",
    title: "Bring your own keys (BYOK)",
    description:
      "Point Recoder at the provider keys your agents already use. Recoder orchestrates and governs; it never proxies, intercepts, or resells inference tokens.",
    blocks: [
      { kind: "p", text: "Recoder is bring-your-own-keys. You point it at the provider keys your agents already use. Recoder orchestrates and governs; it never proxies, intercepts, or resells inference tokens. You pay your providers directly for inference, and (on a paid Recoder plan) you pay Recoder for orchestration and control — never for tokens." },
      { kind: "h", text: "1. Your agents' own keys" },
      { kind: "p", text: "When you run Claude Code, Codex, opencode, etc., the agent talks to its provider using its own auth — exactly as it does outside Recoder. Recoder launches each agent with your shell environment, so it inherits the same keys and config you normally use (ANTHROPIC_API_KEY for Claude Code, OPENAI_API_KEY for Codex, whatever opencode is configured with). Recoder does not sit between the agent and its provider." },
      { kind: "h", text: "2. Recoder-managed inference (optional)" },
      { kind: "p", text: "Some Recoder features can call an LLM directly (assistive features, routing). These go through Recoder's BYOK LLM gateway, which you configure with your own provider keys. Missing keys degrade truthfully — the feature reports it's unavailable rather than silently failing or falling back to someone else's tokens. Key writes are governed, and secrets are stored encrypted, never in plaintext." },
      { kind: "h", text: "Provider keys vs platform keys" },
      { kind: "bullets", items: [
        "Provider keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, …) — your AI provider credentials. These pay for inference. Recoder never resells them.",
        "Recoder platform keys (sk_…) — identify you to a Recoder backend for control-plane operations. The desktop app mints one locally for its embedded backend; you don't manage it by hand for local use.",
      ] },
    ],
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    description:
      "Recoder degrades truthfully — when something is missing it tells you. Common not-connected / not-available states and their fixes.",
    blocks: [
      { kind: "p", text: "Recoder is built to degrade truthfully — when something's missing, the relevant surface tells you instead of faking success. This page maps the common states to fixes." },
      { kind: "h", text: "“Backend not connected” everywhere" },
      { kind: "bullets", items: [
        "Give it a moment on first launch — the backend takes a few seconds to boot.",
        "Make sure nothing else is bound to port 3100. You can override the port with the RECODER_BACKEND_PORT environment variable before launching.",
        "If it persists, quit and relaunch so the supervisor respawns the backend.",
      ] },
      { kind: "h", text: "An agent isn't detected" },
      { kind: "bullets", items: [
        "Confirm the CLI runs from a normal terminal (claude --version, codex --version, …).",
        "Make sure it's on the same PATH Recoder inherited. If you installed it after launching Recoder, just refresh — detection is a live PATH probe.",
        "If it's installed but shows unauthenticated, complete its own login / set its provider key, then refresh.",
      ] },
      { kind: "h", text: "A merge won't land" },
      { kind: "bullets", items: [
        "Waiting on approval — check the Approvals view; a policy-gated merge pauses for a human decision.",
        "Denied — the governance gate blocked it and shows a reason; address the reason rather than bypassing it.",
        "Illegal transition — a workspace must be in a reviewable state before it can merge; finish review/converge first.",
      ] },
      { kind: "h", text: "Converge marked a file as a conflict" },
      { kind: "p", text: "When two agents edit the same lines incompatibly, synthesize won't invent a resolution — it flags the conflict and stops on that file. Resolve it by picking one agent's version of that file, or converge the rest and handle that file by hand." },
      { kind: "h", text: "An engine/feature says “not configured” or “unavailable”" },
      { kind: "p", text: "Some optional engines (semantic code search, browser verification) depend on components that may not be present in every build or environment — for example provider keys or Python sidecars. When a dependency is missing, the engine reports not configured / unavailable on purpose, rather than pretending to work. The core parallel-run → converge → governed-merge loop does not depend on these optional engines." },
    ],
  },
];

export function docPage(slug: string): DocPage | undefined {
  return DOC_PAGES.find((p) => p.slug === slug);
}
