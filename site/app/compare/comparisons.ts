// Head-to-head comparisons of Recoder against specific named competitors,
// authored as typed data (same convention as use-cases/use-cases.ts and
// docs/content.ts — no markdown dependency). Each Comparison is its own route
// at /compare/[slug].
//
// Editorial rules for this file:
//   - Every claim about Recoder or a named competitor must be verifiable from
//     that product's own live site as of the date in the comment above each
//     entry. No invented benchmarks, no fabricated numbers, no false
//     "X can't do Y" claims.
//   - It is fine — and more credible — to say a competitor is strong at
//     something, or to note where Recoder doesn't yet do something (e.g.
//     Windows/Linux support). These pages exist to help a reader choose, not
//     to mislead.
//   - If a competitor's pricing or feature set changes, update the entry or
//     remove it rather than leaving a stale claim live.

export interface ToolRef {
  /** Display name, e.g. "Conductor". */
  name: string;
  /** One-line category, e.g. "Parallel Claude Code app (macOS)". */
  kind: string;
  /** License / cost posture, e.g. "Proprietary · free + paid tiers". */
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
  /** H1 + the base for the <title>, e.g. "Recoder vs Conductor". */
  title: string;
  /** <title> string (may add context beyond the H1). */
  metaTitle: string;
  /** <meta name="description">. Keep ~150-160 chars. */
  description: string;
  keywords: string[];
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
  /** Honest positioning: where Recoder fits relative to this competitor. */
  recoderFit: string[];
  faq: CompareFaq[];
  /** Slugs of related comparisons to cross-link. */
  related: string[];
}

// Shared tool references. Facts here are the load-bearing, verifiable ones —
// re-verify against the live site before editing.
const RECODER: ToolRef = {
  name: "Recoder",
  kind: "Multi-agent orchestrator (desktop)",
  license: "Proprietary · free tier + paid plans · BYOK",
};
const CONDUCTOR: ToolRef = {
  name: "Conductor",
  kind: "Parallel coding-agent app (macOS)",
  license: "Proprietary · free tier + paid plans",
};
const CURSOR: ToolRef = {
  name: "Cursor",
  kind: "AI code editor + cloud agent platform",
  license: "Proprietary",
};
const VIBE_KANBAN: ToolRef = {
  name: "Vibe Kanban",
  kind: "Kanban planning + multi-agent workspace tool (npx, sunsetting to OSS)",
  license: "Apache-2.0 · open source; hosted product is sunsetting",
};
const CLAUDE_SQUAD: ToolRef = {
  name: "Claude Squad",
  kind: "Terminal multi-agent manager (tmux-based)",
  license: "AGPL-3.0 · free, open source",
};
const NIMBALYST: ToolRef = {
  name: "Nimbalyst",
  kind: "Visual workspace + shared agent wiki",
  license: "Proprietary app · free wiki plugin (open source) · paid Wiki Teams",
};
const AMUX: ToolRef = {
  name: "amux",
  kind: "Agent fleet control plane (kanban + mobile control)",
  license: "MIT with Commons Clause · free local install · paid cloud plans",
};
const FACTORY_AI: ToolRef = {
  name: "Factory (Droid)",
  kind: "Agent-native software delivery platform",
  license: "Proprietary · paid plans, no free tier",
};

export const COMPARISONS: Comparison[] = [
  {
    // Verified live 2026-10-15 against conductor.build and conductor.build/pricing.
    slug: "recoder-vs-conductor",
    a: RECODER,
    b: CONDUCTOR,
    title: "Recoder vs Conductor",
    metaTitle: "Recoder vs Conductor: parallel coding agents compared",
    description:
      "Recoder vs Conductor: both run coding agents in parallel isolated workspaces on your Mac. Agents, governance, self-hosting, and pricing, compared.",
    keywords: [
      "conductor alternative",
      "recoder vs conductor",
      "run claude code in parallel",
      "parallel coding agents mac app",
      "conductor.build alternative",
    ],
    tagline: "The closest head-to-head: parallel coding agents, different scope.",
    intro: [
      "Conductor and Recoder are the most directly comparable products on this page — both are macOS desktop apps that run multiple coding agents at once, each in its own isolated workspace, so you can review their work before merging. Conductor's own site describes running \"parallel Claude Code, Codex, and Cursor agents in isolated workspaces\"; Recoder runs Claude Code, Codex, Cursor, and opencode the same way, using git worktrees.",
      "Where they diverge is governance and pricing shape. Recoder adds a deny-biased approval gate and a tamper-evident (SHA-256 Merkle-chained) audit trail over every merge, and keeps the base product usable for free on your own machine indefinitely. Conductor's paid tiers are built around Conductor Cloud — hosted cloud workspace hours, multiplayer, and a mobile app — rather than governance.",
    ],
    table: {
      head: ["Dimension", "Recoder", "Conductor"],
      rows: [
        ["Agents named on the product's own site", "Claude Code, Codex, Cursor, opencode", "Claude Code, Codex, Cursor"],
        ["Isolation model", "Git worktree per agent", "Isolated workspace per agent (per their site)"],
        ["Diff review", "Side-by-side, contested-file aware", "Yes"],
        ["Convergence", "Pick or synthesize diffs into one branch", "Not described on their site"],
        ["Approval gate / audit trail", "Fail-closed approvals; SHA-256 Merkle-chained audit trail", "Not mentioned on their site"],
        ["Self-hosting", "Enterprise: run the control plane on your own infra", "Not mentioned on their site"],
        ["Platform today", "macOS (Apple Silicon); Windows & Linux planned", "macOS only"],
        ["Free tier", "Free, local use, forever", "Free tier, plus paid Cloud tiers"],
        ["Paid tier (individual)", "Free — no paid tiers", "Pro $50/mo"],
        ["Team tier", "Free — no paid tiers", "Teams $60/mo per user"],
      ],
    },
    prosA: [
      "Names Claude Code, Codex, Cursor, and opencode as agents it runs, not just Claude Code.",
      "Isolated git worktree per agent so parallel runs never clobber each other.",
      "A fail-closed approval gate and a SHA-256 Merkle-chained audit trail over governed decisions.",
      "Free tier for local use with no time limit; Enterprise adds a self-hosted control-plane option.",
      "BYOK — your code, agents, and keys stay on your machine on the free and Pro tiers.",
    ],
    consA: [
      "macOS (Apple Silicon) only today; Windows and Linux are planned, not shipped.",
      "No hosted cloud workspace or mobile app — it's a local desktop console.",
      "More surface area (approvals, audit trail, convergence) than a workflow that only needs a quick parallel run.",
    ],
    prosB: [
      "Also runs Claude Code, Codex, and Cursor agents in parallel, in isolated workspaces.",
      "Pro tier adds Conductor Cloud workspace hours, multiplayer, API access, and a mobile app — none of which Recoder offers today.",
      "Simple, focused positioning around parallel agent workspaces.",
    ],
    consB: [
      "No approval gate, audit trail, or compliance-style record mentioned on its site.",
      "No self-hosting option mentioned.",
      "Mac only, like Recoder.",
      "The free tier doesn't include the cloud/mobile features — those are Pro ($50/mo) and up.",
    ],
    whenA:
      "Choose Recoder when you want a free local option, a governed audit trail over every merge, or the option to self-host the control plane later (Enterprise).",
    whenB:
      "Choose Conductor when you specifically want its hosted Conductor Cloud workspace hours, multiplayer collaboration, or mobile app, and don't need an approval gate or audit trail.",
    recoderFit: [
      "Both products solve the same first problem — run several coding agents on one task, in isolation, without them clobbering each other's files. The honest difference is what each charges for: Conductor's paid tiers buy you cloud compute, multiplayer, and mobile access; Recoder's paid tiers buy you more parallel agents, longer history, and — on Team and Enterprise — shared approvals, a fleet mesh, and self-hosting.",
      "If governance (who approved a merge, and proof it wasn't tampered with afterward) matters to how your team ships AI-written code, that's the gap Recoder is built to close that isn't part of Conductor's stated feature set today.",
    ],
    faq: [
      {
        q: "Does Conductor support Codex and Cursor, or only Claude Code?",
        a: "As of this writing, Conductor's own site describes running \"parallel Claude Code, Codex, and Cursor agents in isolated workspaces\" — so it supports all three. Recoder also runs opencode alongside those three.",
      },
      {
        q: "Is Conductor free?",
        a: "Conductor has a free tier (parallel agents, local Mac workspaces, BYOK). Its paid Pro tier ($50/mo) adds Conductor Cloud workspace hours, multiplayer, API access, and a mobile app; Teams is $60/mo per user.",
      },
      {
        q: "Does Recoder have an approval gate and audit trail like a compliance tool?",
        a: "Recoder's approval gate is fail-closed — an approval that times out resolves to deny, never to an automatic allow — and governed decisions are sealed into a SHA-256 Merkle chain so a quiet rewrite of the record is detectable. This isn't something Conductor's site describes as a feature.",
      },
      {
        q: "Can I self-host either tool?",
        a: "Recoder's Enterprise tier includes the option to run the entire control plane inside your own infrastructure. Conductor's site doesn't mention a self-hosting option.",
      },
    ],
    related: ["recoder-vs-cursor", "recoder-vs-factory-ai"],
  },

  {
    // Verified live 2026-10-15 against cursor.com and cursor.com/pricing.
    slug: "recoder-vs-cursor",
    a: RECODER,
    b: CURSOR,
    title: "Recoder vs Cursor",
    metaTitle: "Recoder vs Cursor: local agent orchestrator vs AI editor",
    description:
      "Recoder vs Cursor: Cursor is an AI editor with cloud agent fleets; Recoder is a local console that runs your existing agent CLIs in parallel and governs the merge.",
    keywords: [
      "cursor alternative",
      "recoder vs cursor",
      "cursor alternative for teams",
      "local ai coding agent orchestrator",
      "parallel ai coding agents",
    ],
    tagline: "A local console for the agents you run, versus an editor with a cloud agent fleet.",
    intro: [
      "Cursor and Recoder are easy to lump together because both now talk about running multiple agents on a task, but they're built for different starting points. Cursor is first an AI-first code editor — tab autocomplete, inline edits — and it has added \"background agents\" that, per its own site, \"use their own computers to build, test, and demo features\" and can \"launch fleets of agents that work in parallel on ambitious tasks for hours or days.\" That's cloud compute Cursor runs for you, as part of a subscription.",
      "Recoder isn't an editor at all. It's a desktop control plane: point it at a local git repo and it hands the same task to the coding-agent CLIs you already have installed — Claude Code, Codex, Cursor's own CLI agent, or opencode — each running in its own isolated git worktree on your machine, using your own provider keys. When they finish, Recoder shows you what they agree and disagree on, and helps you converge the best of each into one governed merge.",
    ],
    table: {
      head: ["Dimension", "Recoder", "Cursor"],
      rows: [
        ["Category", "Local multi-agent orchestrator", "AI code editor + cloud agent platform"],
        ["Editing surface", "None — drives external agent CLIs", "Full GUI editor with tab autocomplete"],
        ["Where agents run", "On your machine, in isolated git worktrees", "Cursor's own cloud compute (background agents)"],
        ["Keys / billing", "BYOK — you pay model providers directly", "Cursor subscription with a usage allowance"],
        ["Convergence of parallel runs", "Pick or synthesize diffs into one governed branch", "Not described as a built-in workflow"],
        ["Approval gate / audit trail", "Fail-closed approvals; SHA-256 Merkle-chained audit trail", "Not mentioned on their site"],
        ["Self-hosting", "Enterprise: run the control plane on your own infra", "Not mentioned on their site"],
        ["Entry price", "Free, local use, forever", "Free tier; Plus $8/mo"],
      ],
    },
    prosA: [
      "Runs the agent CLIs you already use — Claude Code, Codex, Cursor's CLI agent, opencode — in parallel, on your own machine.",
      "Isolated git worktree per agent, so parallel runs never clobber each other or your working tree.",
      "Convergence: compare contested files and pick or synthesize the best diff into one branch.",
      "A fail-closed approval gate and a SHA-256 Merkle-chained audit trail over governed merges.",
      "BYOK and local-first: you pay providers directly, and nothing leaves your machine unless you opt into a future sync feature.",
    ],
    consA: [
      "Not an editor — no autocomplete or inline editing surface at all.",
      "No cloud compute of its own; everything runs on your box, so you need the agents installed locally.",
      "macOS (Apple Silicon) only today; Windows and Linux are planned.",
    ],
    prosB: [
      "Best-in-class inline autocomplete and a full graphical editor, which Recoder doesn't attempt.",
      "Background agents run on Cursor's own cloud compute, so a laptop going to sleep doesn't stop a long task.",
      "One subscription covers editing, chat, and multiple model providers (per its site, including OpenAI, Anthropic, and Gemini models).",
    ],
    consB: [
      "Running agents in the cloud means your code and prompts pass through Cursor's infrastructure, not just your own machine.",
      "No approval gate, audit trail, or self-hosting option described on its site.",
      "Usage allowance resets weekly and tops up separately if exceeded, per its own pricing page — a different cost model than BYOK.",
    ],
    whenA:
      "Choose Recoder when you want to run the agent CLIs you already have, locally, in parallel, with a governed and auditable merge at the end — and you'd rather pay model providers directly than a usage allowance.",
    whenB:
      "Choose Cursor when you want the best hands-on editing experience for day-to-day coding, plus the option to hand longer tasks to cloud-run background agents without keeping your own machine on.",
    recoderFit: [
      "These tools compose more than they compete. Cursor is a reasonable place to write and review code by hand, and Cursor's own CLI agent is one of the agents Recoder can run in parallel alongside Claude Code, Codex, and opencode.",
      "The real dividing line is where the work happens and who can see it: Cursor's background agents run on Cursor's cloud; Recoder's agents run on your machine with your keys, and Recoder's value shows up afterward — comparing divergent diffs and landing one governed, audit-backed merge.",
    ],
    faq: [
      {
        q: "Is Recoder an alternative to Cursor?",
        a: "Only partially. Cursor is an editor with autocomplete, inline edits, and — more recently — cloud-run background agent fleets. Recoder isn't an editor; it's a local console that runs the agent CLIs you already have in parallel and governs the merge. Many people use both.",
      },
      {
        q: "Can Recoder run Cursor's agent?",
        a: "Yes. Recoder orchestrates agent CLIs you already have on your PATH, including Cursor's own CLI agent, alongside Claude Code, Codex, and opencode.",
      },
      {
        q: "Does Cursor have an approval gate or audit trail like Recoder's?",
        a: "Not based on Cursor's own site. Recoder's approval gate is fail-closed (a timed-out approval resolves to deny) and governed decisions are sealed into a SHA-256 Merkle chain so tampering is detectable. Cursor's site doesn't describe an equivalent.",
      },
      {
        q: "Does Recoder resell model tokens the way a subscription allowance does?",
        a: "No. Recoder is bring-your-own-keys on the Free and Pro tiers: your agents use your own provider keys, and you pay providers directly for inference. Recoder charges for orchestration, not tokens.",
      },
    ],
    related: ["recoder-vs-conductor", "recoder-vs-vibe-kanban", "recoder-vs-nimbalyst"],
  },

  {
    // Verified live 2026-10-19 against vibekanban.com, vibekanban.com/pricing, and
    // github.com/BloopAI/vibe-kanban (28.4k stars at verification time).
    slug: "recoder-vs-vibe-kanban",
    a: RECODER,
    b: VIBE_KANBAN,
    title: "Recoder vs Vibe Kanban",
    metaTitle: "Recoder vs Vibe Kanban: multi-agent orchestrator compared",
    description:
      "Recoder vs Vibe Kanban: Vibe Kanban plans work on a kanban board with 10+ agents via npx; Recoder runs agents in parallel with a governed, audited merge.",
    keywords: [
      "vibe kanban alternative",
      "recoder vs vibe kanban",
      "vibe kanban vs recoder",
      "bloopai vibe kanban alternative",
      "multi-agent coding orchestrator",
    ],
    tagline: "A kanban-first workspace tool with 10+ agents, versus a governed parallel-and-converge console.",
    intro: [
      "Vibe Kanban (BloopAI) is a kanban board for planning work, where each card becomes a workspace that hands a branch, terminal, and dev server to a coding agent. Its own site and README list 10+ supported agents — Claude Code, Codex, Gemini CLI, GitHub Copilot, Amp, Cursor, OpenCode, Droid, CCR, and Qwen Code — more than any other tool on this page, started with a single `npx vibe-kanban` command and self-hostable via Docker. As of this writing, BloopAI has announced Vibe Kanban is sunsetting as a company product and will continue as open source, community-maintained software.",
      "Recoder runs a narrower list of agents — Claude Code, Codex, Cursor, and opencode — but its core workflow is different: the same task goes to every agent at once, each in its own isolated git worktree, and Recoder's job is comparing what they produced and converging on one governed merge, with a fail-closed approval gate and a tamper-evident audit trail. Vibe Kanban's workflow is plan-then-dispatch across many issues; Recoder's is one task, several agents, one audited merge.",
    ],
    table: {
      head: ["Dimension", "Recoder", "Vibe Kanban"],
      rows: [
        ["Agents named on the product's own site", "Claude Code, Codex, Cursor, opencode", "Claude Code, Codex, Gemini CLI, Copilot, Amp, Cursor, OpenCode, Droid, CCR, Qwen Code"],
        ["Core workflow", "One task → N agents in parallel → converge to one merge", "Kanban board → per-issue agent workspace → review → PR"],
        ["Isolation model", "Git worktree per agent, same task", "Workspace (branch + terminal + dev server) per card"],
        ["Convergence of parallel runs on one task", "Pick or synthesize diffs into one branch", "Not its model — one agent per card, not several on the same task"],
        ["Approval gate / audit trail", "Fail-closed approvals; SHA-256 Merkle-chained audit trail", "Inline diff comments and PR review; no approval-gate/audit-trail primitive described"],
        ["Self-hosting", "Enterprise: run the control plane on your own infra", "Yes — a documented self-hosting guide (Docker) for its own product today"],
        ["Install", "Native desktop app (macOS)", "`npx vibe-kanban`, runs anywhere Node does"],
        ["Platform today", "macOS (Apple Silicon); Windows & Linux planned", "Cross-platform (Node-based, browser UI)"],
        ["Pricing", "Free, forever — no paid tiers", "Free (1 user); Pro $30/user/mo (2-49 users); Enterprise custom"],
        ["Project status", "Actively developed", "Company product sunsetting; continuing as community open source"],
      ],
    },
    prosA: [
      "Converges several agents' attempts at the same task into one governed merge — not Vibe Kanban's model.",
      "A fail-closed approval gate and a SHA-256 Merkle-chained audit trail over governed decisions.",
      "BYOK and local-first: agents run on your machine with your own keys.",
      "Actively developed, not a sunsetting product.",
    ],
    consA: [
      "Runs 4 named agents to Vibe Kanban's 10+ — no Gemini CLI, Copilot, Amp, Droid, or Qwen Code support today.",
      "Native desktop app, macOS (Apple Silicon) only today; Vibe Kanban runs via npx on any OS Node supports.",
      "No kanban-style multi-issue planning board — Recoder is scoped to one task at a time across agents, not a backlog.",
    ],
    prosB: [
      "Supports more agents than any other tool on this page, per its own README (10+, including Gemini CLI, Copilot, and Amp).",
      "Cross-platform today via `npx vibe-kanban` — no macOS-only limitation.",
      "A documented self-hosting guide (Docker) for its current product, available now.",
      "Kanban board model fits planning and dispatching many separate issues, not just one task at a time.",
    ],
    consB: [
      "BloopAI has announced the hosted product is sunsetting; its future is community-maintained open source, which carries normal open-source-maintenance uncertainty.",
      "No built-in primitive for running several agents on the same task and converging their diffs — one agent per workspace/card is the model.",
      "No fail-closed approval gate or tamper-evident audit trail described on its site.",
    ],
    whenA:
      "Choose Recoder when the question is \"which agent does this one task best,\" and you want several agents to race it in parallel with a governed, audited merge at the end.",
    whenB:
      "Choose Vibe Kanban when you want to plan and dispatch many separate issues across a wide range of agents from a kanban board, cross-platform, with self-hosting available today.",
    recoderFit: [
      "These tools answer different questions. Vibe Kanban is strongest as a planning-and-dispatch board across a backlog of issues and the widest agent list of any tool compared here. Recoder is strongest when you already know the task and want to see several agents' different attempts at it side by side, then land one governed merge.",
      "Vibe Kanban's sunset announcement is a real, stated fact worth weighing if ongoing vendor support matters to your choice — its stated path forward is community-maintained open source, not a company product.",
    ],
    faq: [
      {
        q: "Is Vibe Kanban shutting down?",
        a: "BloopAI has announced Vibe Kanban is sunsetting as a company product; per its own GitHub README and site, it will continue as open source, community-maintained software.",
      },
      {
        q: "Does Vibe Kanban support more agents than Recoder?",
        a: "Yes, by name count — its README lists 10+ supported agents (Claude Code, Codex, Gemini CLI, GitHub Copilot, Amp, Cursor, OpenCode, Droid, CCR, Qwen Code). Recoder runs Claude Code, Codex, Cursor, and opencode.",
      },
      {
        q: "Can Vibe Kanban run several agents on the same task and merge the best result?",
        a: "Its documented model is one agent per kanban card/workspace, for planning and dispatching across a backlog — not running multiple agents on one task and converging their diffs, which is Recoder's core workflow.",
      },
      {
        q: "Is Vibe Kanban free?",
        a: "Per its pricing page: free for 1 user; Pro is $30/user/month for teams of 2-49; Enterprise is custom pricing for 50+ users with SSO/SAML.",
      },
    ],
    related: ["recoder-vs-conductor", "recoder-vs-claude-squad", "recoder-vs-amux"],
  },

  {
    // Verified live 2026-10-19 against github.com/smtg-ai/claude-squad and
    // smtg-ai.github.io/claude-squad (8.6k stars at verification time).
    slug: "recoder-vs-claude-squad",
    a: RECODER,
    b: CLAUDE_SQUAD,
    title: "Recoder vs Claude Squad",
    metaTitle: "Recoder vs Claude Squad: desktop app vs terminal multi-agent manager",
    description:
      "Recoder vs Claude Squad: a free open-source terminal tool (tmux) for isolated agent workspaces, versus a desktop app that converges parallel runs with an audit trail.",
    keywords: [
      "claude squad alternative",
      "recoder vs claude squad",
      "claude squad vs recoder",
      "tmux ai agent manager alternative",
      "parallel claude code terminal",
    ],
    tagline: "A free terminal tool for running agents side by side, versus a desktop app that converges and audits the merge.",
    intro: [
      "Claude Squad is a free, open-source (AGPL-3.0) terminal app: install it with Homebrew or a shell script, and it manages multiple instances of Claude Code, Codex, Gemini, Aider, and other local agents, each in its own isolated git workspace, supervised through tmux sessions. Its own README describes reviewing changes before applying them and checking them out before pushing — real review, inside the terminal.",
      "Recoder covers similar ground — Claude Code, Codex, Cursor, and opencode, each in its own isolated git worktree — but as a native desktop app rather than a tmux-based terminal tool, and with two things Claude Squad's README doesn't describe: a side-by-side convergence step for picking or synthesizing the best diff across agents that worked the same task, and a fail-closed approval gate backed by a SHA-256 Merkle-chained audit trail.",
    ],
    table: {
      head: ["Dimension", "Recoder", "Claude Squad"],
      rows: [
        ["Agents named on the product's own site", "Claude Code, Codex, Cursor, opencode", "Claude Code, Codex, Gemini, Aider, and other local agents"],
        ["Interface", "Native desktop app", "Terminal app (tmux-based, binary name `cs`)"],
        ["Isolation model", "Git worktree per agent", "Isolated git workspace per task/instance"],
        ["Convergence of parallel runs on one task", "Pick or synthesize diffs into one branch", "Not described — review and checkout per instance, not a cross-agent diff comparison"],
        ["Approval gate / audit trail", "Fail-closed approvals; SHA-256 Merkle-chained audit trail", "Not described on its site"],
        ["Auto-accept mode", "Not the default workflow — approvals are fail-closed", "Experimental `--autoyes` flag auto-accepts agent prompts"],
        ["Self-hosting", "Enterprise: run the control plane on your own infra", "N/A — it's a local CLI you already run yourself"],
        ["Platform today", "macOS (Apple Silicon); Windows & Linux planned", "macOS/Linux (tmux + gh required); no native Windows"],
        ["Price", "Free, forever — no paid tiers", "Free — fully open source (AGPL-3.0)"],
      ],
    },
    prosA: [
      "Converges several agents' attempts at the same task into one governed merge — Claude Squad reviews per instance, not across agents on one task.",
      "A fail-closed approval gate and a SHA-256 Merkle-chained audit trail over governed decisions.",
      "A graphical desktop app — no tmux/terminal-session management required.",
    ],
    consA: [
      "Not free in the way fully open-source software is — Recoder's base tier is free to use locally, but it's proprietary, while Claude Squad is AGPL-3.0 open source end to end.",
      "macOS (Apple Silicon) only today; Claude Squad also runs on Linux.",
      "More moving parts (approvals, audit trail, convergence UI) than a workflow that just wants agents in tmux panes.",
    ],
    prosB: [
      "Fully free and open source (AGPL-3.0) — no paid tier, no proprietary core.",
      "Lightweight terminal tool: install via Homebrew or a one-line script, no separate desktop app.",
      "Runs on Linux as well as macOS (tmux-based, not a native-GUI app tied to one platform's app ecosystem).",
      "An experimental auto-accept mode for people who want agents to run unattended.",
    ],
    consB: [
      "No cross-agent convergence step — it manages instances in parallel, but comparing and merging the best of several agents' attempts at one task isn't a described workflow.",
      "No approval-gate or audit-trail primitive described on its site — review happens in the terminal, per instance, without a sealed record.",
      "Requires tmux and the GitHub CLI (`gh`) as prerequisites, and no native Windows support.",
    ],
    whenA:
      "Choose Recoder when you want a graphical desktop app that runs several agents on one task and converges their diffs into a single governed, audited merge.",
    whenB:
      "Choose Claude Squad when you want a free, fully open-source terminal tool to supervise multiple agent instances in tmux panes, on macOS or Linux, with no cost and no desktop app.",
    recoderFit: [
      "Both tools isolate each agent in its own git workspace so parallel runs don't clobber each other — that part is genuinely similar. The real differences are interface (terminal + tmux vs. native desktop app), licensing (AGPL-3.0 open source vs. proprietary with a free tier), and what happens after the agents finish: Claude Squad hands you per-instance review in the terminal; Recoder adds a convergence step across agents on the same task plus a fail-closed, audited approval gate.",
      "If cost and license matter most and a terminal workflow is fine, Claude Squad's AGPL-3.0, zero-cost model is hard to beat. If you want a governed, auditable merge across multiple agents' attempts at the same task in a graphical app, that's what Recoder is built for.",
    ],
    faq: [
      {
        q: "Is Claude Squad free?",
        a: "Yes — Claude Squad is fully open source under AGPL-3.0, with no paid tier described on its site or README.",
      },
      {
        q: "Does Claude Squad run on Windows?",
        a: "Not natively, as of this writing — its installation methods (Homebrew, a shell install script) and tmux dependency point to macOS/Linux; no native Windows build is described.",
      },
      {
        q: "Can Claude Squad converge or merge the best of several agents' attempts at the same task?",
        a: "Its README describes reviewing and checking out changes per instance, not a built-in step for comparing several agents' diffs on the same task and merging the best one — which is Recoder's core workflow.",
      },
      {
        q: "Does Claude Squad have an approval gate or audit trail like Recoder's?",
        a: "Not based on its own site or README. It does have an experimental `--autoyes` flag that auto-accepts agent prompts, which is close to the opposite of a fail-closed approval gate.",
      },
    ],
    related: ["recoder-vs-vibe-kanban", "recoder-vs-conductor"],
  },

  {
    // Verified live 2026-10-23 against nimbalyst.com.
    slug: "recoder-vs-nimbalyst",
    a: RECODER,
    b: NIMBALYST,
    title: "Recoder vs Nimbalyst",
    metaTitle: "Recoder vs Nimbalyst: parallel-and-converge orchestrator vs agent wiki",
    description:
      "Recoder vs Nimbalyst: Nimbalyst is a shared wiki and visual workspace for Claude Code/Codex context; Recoder runs agents in parallel and governs the merge.",
    keywords: [
      "nimbalyst alternative",
      "recoder vs nimbalyst",
      "nimbalyst vs recoder",
      "ai agent wiki alternative",
      "claude code codex visual workspace",
    ],
    tagline: "A shared memory layer for your agents, versus a parallel-run-and-converge console.",
    intro: [
      "Nimbalyst's own site frames it as \"a wiki your coding agents write for you, and a visual workspace for working with Claude Code, Codex and other agents\" — the product's center of gravity is capturing the decisions and open questions agents surface while they work, then sharing that context across a team through a free, open-source local wiki plugin plus a paid Wiki Teams tier (in beta, free as of this writing).",
      "Recoder solves a different problem: instead of recording what one agent decided, it runs several agents — Claude Code, Codex, Cursor, opencode — on the SAME task at once, each in its own isolated git worktree, then helps you compare their divergent diffs and converge on one governed, audited merge. Nimbalyst's wiki is complementary context capture; Recoder's convergence step and fail-closed approval gate don't appear as features on Nimbalyst's site.",
    ],
    table: {
      head: ["Dimension", "Recoder", "Nimbalyst"],
      rows: [
        ["Agents named on the product's own site", "Claude Code, Codex, Cursor, opencode", "Claude Code, Codex, Cursor, VS Code, any MCP agent"],
        ["Core workflow", "One task → N agents in parallel → converge to one merge", "Visual workspace + a wiki agents write decisions/questions into"],
        ["Isolation model", "Git worktree per agent, same task", "Not described as a worktree-isolation product"],
        ["Convergence of parallel runs on one task", "Pick or synthesize diffs into one branch", "Not its model — one shared wiki, not a cross-agent diff comparison"],
        ["Approval gate / audit trail", "Fail-closed approvals; SHA-256 Merkle-chained audit trail", "Decision history (\"who made them\") in the wiki, not a governance gate"],
        ["Self-hosting", "Enterprise: run the control plane on your own infra", "Wiki plugin is free, local, open source today"],
        ["Platform today", "macOS (Apple Silicon); Windows & Linux planned", "macOS, Windows, Linux; Wiki Teams is browser-based"],
        ["Pricing", "Free, forever — no paid tiers", "Free individual wiki + desktop app; Wiki Teams free during beta (no stated price yet)"],
      ],
    },
    prosA: [
      "Converges several agents' attempts at the same task into one governed merge — not Nimbalyst's model.",
      "A fail-closed approval gate and a SHA-256 Merkle-chained audit trail over governed decisions.",
      "BYOK and local-first: agents run on your machine with your own keys.",
    ],
    consA: [
      "No shared wiki / knowledge-base layer for agent decisions and open questions — Recoder's audit trail is about merges, not team-wide context capture.",
      "macOS (Apple Silicon) only today; Nimbalyst's desktop app already supports Windows and Linux.",
    ],
    prosB: [
      "Cross-platform desktop app today (macOS, Windows, Linux) — no platform gap.",
      "The wiki plugin is free, local, and open source, and works with any MCP-speaking agent, not just four named ones.",
      "Purpose-built for a problem Recoder doesn't address: durable, team-visible context about decisions agents made and questions still open.",
    ],
    consB: [
      "No described convergence step for running multiple agents on the same task and merging the best diff.",
      "No fail-closed approval gate or tamper-evident audit trail over merges described on its site.",
      "Wiki Teams pricing is unpublished (free-during-beta) rather than a stated, stable tier.",
    ],
    whenA:
      "Choose Recoder when the job is running several agents on one task in parallel and landing a single governed, audited merge.",
    whenB:
      "Choose Nimbalyst when the job is keeping a durable, team-shared record of what your agents decided and still need answered, across whichever MCP-speaking agent or editor you use.",
    recoderFit: [
      "These products are more adjacent than competing: Nimbalyst's wiki is about durable team memory across many small agent sessions; Recoder's audit trail is about one governed merge decision at a time, with per-file convergence provenance Nimbalyst's site doesn't describe.",
      "A team could reasonably run both — Nimbalyst to keep institutional knowledge agents surface, Recoder to run the actual parallel task-to-merge workflow with an approval gate.",
    ],
    faq: [
      {
        q: "Is Nimbalyst a multi-agent orchestrator like Recoder?",
        a: "Not based on its own site. Nimbalyst is described as a visual workspace plus a wiki agents write decisions and open questions into — it doesn't describe running several agents on the same task in parallel and converging their diffs, which is Recoder's core workflow.",
      },
      {
        q: "Is Nimbalyst free?",
        a: "The individual wiki plugin and desktop app are free (the wiki plugin is open source). Wiki Teams, the shared/team tier, is free during its beta with no published price yet.",
      },
      {
        q: "Does Nimbalyst have an approval gate or audit trail like Recoder's?",
        a: "Its site describes a decision history inside the wiki (open questions, decisions made, and who made them) — that's team-visible context, not a fail-closed approval gate or a SHA-256 Merkle-chained audit trail over merges.",
      },
      {
        q: "Does Nimbalyst run on Windows and Linux?",
        a: "Yes, per its own site — macOS (Apple Silicon and Intel), Windows, and Linux, plus a browser-based Wiki Teams. Recoder is macOS (Apple Silicon) only today, with Windows and Linux planned.",
      },
    ],
    related: ["recoder-vs-amux", "recoder-vs-conductor"],
  },

  {
    // Verified live 2026-10-23 against amux.io.
    slug: "recoder-vs-amux",
    a: RECODER,
    b: AMUX,
    title: "Recoder vs amux",
    metaTitle: "Recoder vs amux: converge-and-govern vs always-on agent fleet",
    description:
      "Recoder vs amux: amux runs a kanban-coordinated fleet of agents that ships while you sleep; Recoder runs agents in parallel on one task and governs the merge.",
    keywords: [
      "amux alternative",
      "recoder vs amux",
      "amux vs recoder",
      "ai agent fleet control plane alternative",
      "autonomous coding agent orchestrator",
    ],
    tagline: "An always-on agent fleet with mobile control, versus a parallel-run-and-converge console.",
    intro: [
      "amux positions itself as a control plane for a FLEET of agents working a shared backlog unattended — its own site describes atomic task claiming so agents don't duplicate work, origin-stamped inter-agent messaging, self-healing recovery from crashes, and phone-based monitoring and steering so the fleet can \"keep shipping while you sleep.\" It's a single Rust binary, free to self-host (MIT with Commons Clause), with optional paid cloud plans ($39–$129/mo) that add Factory-run compute instead of your own machine.",
      "Recoder's workflow is narrower and more deliberate: one task, several agents (Claude Code, Codex, Cursor, opencode) racing it in parallel in isolated git worktrees, then a side-by-side convergence step and a fail-closed, audited approval gate before anything merges. amux optimizes for autonomous throughput across many tasks with human-in-the-loop alerts; Recoder optimizes for picking the best of several attempts at one task and proving the merge was authorized.",
    ],
    table: {
      head: ["Dimension", "Recoder", "amux"],
      rows: [
        ["Agents named on the product's own site", "Claude Code, Codex, Cursor, opencode", "Claude Code, Codex CLI, Gemini CLI, OpenCode, Ollama (local models)"],
        ["Core workflow", "One task → N agents in parallel → converge to one merge", "Shared kanban backlog → fleet of agents claim + ship tasks unattended"],
        ["Isolation model", "Git worktree per agent, same task", "Each worker gets its own repo, memory, and lane"],
        ["Convergence of parallel runs on one task", "Pick or synthesize diffs into one branch", "Not its model — one worker per claimed task, not several racing the same one"],
        ["Approval gate / audit trail", "Fail-closed approvals; SHA-256 Merkle-chained audit trail", "Message review lanes + owner alerts + one-tap approval prompts; no tamper-evident audit chain described"],
        ["Self-hosting", "Enterprise: run the control plane on your own infra", "Free, default — single binary, local install, full feature set"],
        ["Mobile control", "Not described on Recoder's site", "iOS app + PWA for monitoring and steering from a phone"],
        ["Platform today", "macOS (Apple Silicon); Windows & Linux planned", "Local install (any OS the Rust binary targets) + optional cloud plans"],
        ["Pricing", "Free, forever — no paid tiers", "Free self-hosted; cloud plans $39/mo (Solo) to $129/mo (Max)"],
      ],
    },
    prosA: [
      "Converges several agents' different attempts at the SAME task into one governed merge — amux's model is one worker per task, not several racing one task.",
      "A SHA-256 Merkle-chained, tamper-evident audit trail — amux describes approval prompts and alerts, not a sealed chain.",
      "BYOK and local-first by default on every paid tier, not just the free one.",
    ],
    consA: [
      "No fleet-scale backlog coordination (atomic task claiming across many unattended agents) — Recoder is scoped to one task at a time across agents.",
      "No native mobile app for monitoring or steering runs remotely; amux ships an iOS app and PWA for this today.",
      "macOS (Apple Silicon) only today; amux's single-binary install is less platform-constrained.",
    ],
    prosB: [
      "Built for unattended, fleet-scale throughput across a shared backlog — self-healing recovery from crashes and atomic task claiming aren't things Recoder's site describes.",
      "Free and full-featured self-hosted by default (MIT with Commons Clause), with paid tiers only for amux's own managed cloud compute.",
      "Native mobile app (iOS + PWA) for remote monitoring and one-tap approvals — a real gap in Recoder's current surface.",
    ],
    consB: [
      "No described step for running several agents on the SAME task and converging their diffs into one reviewed merge — the model is one worker per claimed task.",
      "No tamper-evident, cryptographically sealed audit trail described — governance is message review lanes, owner alerts, and approval prompts.",
      "Commons Clause on top of MIT restricts selling a hosted version of amux itself, which matters for anyone considering building on it commercially.",
    ],
    whenA:
      "Choose Recoder when you want several agents to race the SAME task in parallel and you need a governed, cryptographically audited record of which diff got merged and why.",
    whenB:
      "Choose amux when you want a self-hosted, always-on fleet that claims and ships tasks from a shared backlog unattended, with phone-based monitoring and one-tap approvals.",
    recoderFit: [
      "amux is the more autonomous, fleet-throughput-oriented tool — it's built to keep shipping across a backlog while a human only steps in via phone alerts. Recoder is the more deliberate, per-task tool — it's built so you can see what N agents each did with the SAME task and prove, with a sealed hash chain, which one won and who authorized it.",
      "If the priority is unattended scale across many tasks, amux's fleet model is the better fit. If the priority is trusting ONE merge decision enough to show an auditor, Recoder's convergence-plus-audit-trail is what amux's site doesn't claim to offer.",
    ],
    faq: [
      {
        q: "Does amux run several agents on the same task like Recoder does?",
        a: "Not based on its own site. amux's model is a shared backlog where agents atomically claim distinct tasks so they don't duplicate work — not several agents racing the SAME task so you can compare and converge their diffs, which is Recoder's core workflow.",
      },
      {
        q: "Is amux free?",
        a: "Yes, self-hosted — a single binary installed locally with the full feature set, under MIT with Commons Clause. Paid cloud plans ($39–$129/mo) add amux-managed compute instead of your own machine.",
      },
      {
        q: "Does amux have an audit trail like Recoder's Merkle chain?",
        a: "Its site describes message review lanes, owner alerts, and one-tap approval prompts for human-in-the-loop moments — not a cryptographically sealed, tamper-evident audit chain over merges.",
      },
      {
        q: "Can I monitor amux or Recoder from my phone?",
        a: "amux ships a native iOS app and a PWA for monitoring and steering the fleet remotely. Recoder's site does not describe a mobile app today.",
      },
    ],
    related: ["recoder-vs-nimbalyst", "recoder-vs-vibe-kanban"],
  },

  {
    // Verified live 2026-10-23 against factory.com and factory.com/pricing.
    slug: "recoder-vs-factory-ai",
    a: RECODER,
    b: FACTORY_AI,
    title: "Recoder vs Factory",
    metaTitle: "Recoder vs Factory (Droid): local orchestrator vs enterprise agent platform",
    description:
      "Recoder vs Factory: Factory is a paid, enterprise agent platform with SSO/SAML/SCIM; Recoder is a free local console that converges parallel agent runs.",
    keywords: [
      "factory ai alternative",
      "factory droid alternative",
      "recoder vs factory",
      "recoder vs factory.ai",
      "enterprise ai coding agent platform comparison",
    ],
    tagline: "An enterprise agent-delivery platform with SSO baked in, versus a free local console built around convergence.",
    intro: [
      "Factory (branded \"Droid\") describes itself as \"an agent-native software development platform for planning, building, reviewing, testing, and shipping production software,\" reachable from CLI, desktop, web, mobile, and team chat. It has no free tier — Pro starts at $20/month — and its Business ($/custom) and Enterprise (custom) tiers are where the enterprise-trust checklist lives: Single Sign-On, SAML/SCIM provisioning, audit logging and activity trails, admin controls over autonomy levels and network policies, on-premises deployment, and dedicated account management.",
      "Recoder's shape is the opposite end of the spectrum: free forever for local use, no account required to run it, and its edge is a specific workflow Factory's site doesn't describe — running several agents (Claude Code, Codex, Cursor, opencode) on the SAME task in parallel git worktrees and converging their diffs into one governed merge with a cryptographically sealed audit trail. Factory's governance is enterprise identity and admin controls at the Business/Enterprise price points; Recoder's governance is a fail-closed approval gate and a Merkle-chained audit trail, today, without requiring a custom-priced contract — though Recoder does not yet offer SSO/SAML/SCIM, which Factory does.",
    ],
    table: {
      head: ["Dimension", "Recoder", "Factory (Droid)"],
      rows: [
        ["Agents named on the product's own site", "Claude Code, Codex, Cursor, opencode", "Multiple model providers (not individually named on the marketing site)"],
        ["Core workflow", "One task → N agents in parallel → converge to one merge", "Delegate planning/build/review/test/ship work to Droids across CLI/desktop/web/mobile/chat"],
        ["Convergence of parallel runs on one task", "Pick or synthesize diffs into one branch", "Not described as a feature — human approval checkpoints exist, not cross-agent diff convergence"],
        ["Approval gate / audit trail", "Fail-closed approvals; SHA-256 Merkle-chained audit trail", "Audit logging and activity trails — on the custom-priced Business tier and above"],
        ["SSO / SAML / SCIM", "Not offered today", "SSO + SAML/SCIM — on the custom-priced Business tier and above"],
        ["Self-hosting / on-prem", "Enterprise: run the control plane on your own infra", "On-premises deployment — on the custom-priced Enterprise tier"],
        ["Entry price", "Free, local use, forever", "No free tier — Pro starts at $20/mo"],
        ["Team pricing", "Free — no paid tiers (flat)", "Teams: $60/mo per team + $40/mo per seat"],
      ],
    },
    prosA: [
      "Free, local use forever — no account, no seat price, no usage allowance to run the core product.",
      "Converges several agents' attempts at the SAME task into one governed merge — not a workflow Factory's site describes.",
      "A fail-closed approval gate and a SHA-256 Merkle-chained audit trail available without a custom-priced contract.",
    ],
    consA: [
      "No SSO, SAML, or SCIM today — a real gap against Factory's Business/Enterprise tier for a buyer whose procurement requires it.",
      "No mobile app or team-chat integration surface, which Factory offers across CLI/desktop/web/mobile/chat.",
      "macOS (Apple Silicon) only today; Factory is reachable from more surfaces generally.",
    ],
    prosB: [
      "Enterprise identity and governance checklist already built: SSO, SAML/SCIM, audit logging, admin autonomy/network-policy controls, on-premises deployment — exactly what a regulated buyer's security review asks for.",
      "Reachable from CLI, desktop, web, mobile, and team communication tools — broader surface area than Recoder's local desktop app.",
      "Dedicated onboarding, account management, and SLAs at the Business/Enterprise tiers.",
    ],
    consB: [
      "No free tier at all — the cheapest way to use it is $20/mo (Pro), with the enterprise-trust features gated behind custom-priced Business/Enterprise contracts.",
      "No described workflow for running multiple agents on the SAME task and converging their diffs into one merge — delegation is to Droids working tasks, not several agents racing one task.",
      "No publicly stated per-control evidence mapping (e.g., SOC 2 / EU AI Act / DORA) on its marketing site — the audit logging feature is described, not mapped to a specific compliance framework.",
    ],
    whenA:
      "Choose Recoder when you want a free, local-first console for running several agents on one task in parallel and a governed, audit-sealed merge — and you don't yet need SSO/SAML/SCIM.",
    whenB:
      "Choose Factory when your buyer's security review requires SSO/SAML/SCIM, audit logging, and on-premises deployment today, and you're fine paying enterprise pricing to get them.",
    recoderFit: [
      "Factory is the more enterprise-complete platform on paper: identity federation, provisioning, audit trails, and on-prem deployment are already shipped at its higher tiers. Recoder is more complete on the specific workflow its thesis is built around — running N agents on the SAME task and proving, with a sealed hash chain, which diff was merged and under what authority.",
      "This is the honest gap to name out loud: a 30-300 person company selling into regulated enterprise customers may need Factory's SSO/SAML/SCIM checkbox sooner than Recoder can offer it. Recoder's own roadmap treats identity federation as the next enterprise-trust item to close, not a solved problem.",
    ],
    faq: [
      {
        q: "Does Factory have a free tier?",
        a: "No. Per its own pricing page, Pro starts at $20/month with no free tier; Recoder's base product is free for local use indefinitely.",
      },
      {
        q: "Does Recoder support SSO or SAML like Factory does?",
        a: "Not today. Factory's Business tier and above bundle SSO and SAML/SCIM provisioning. Recoder does not yet offer SSO/SAML/SCIM — this is an honest, named gap against Factory for enterprise buyers who require it.",
      },
      {
        q: "Can Factory run several agents on the same task and converge their diffs, like Recoder?",
        a: "Its site describes delegating planning/build/review/test/ship work to Droids and human approval checkpoints, not a described workflow for racing several agents on the SAME task and converging their diffs into one merge — which is Recoder's core workflow.",
      },
      {
        q: "What does Factory's audit logging cost?",
        a: "Per its pricing page, audit logging and activity trails are part of the custom-priced Business tier and above, alongside SSO/SAML/SCIM and admin controls — not included in the $20/mo Pro tier.",
      },
    ],
    related: ["recoder-vs-amux", "recoder-vs-conductor"],
  },
];

export function comparison(slug: string): Comparison | undefined {
  return COMPARISONS.find((c) => c.slug === slug);
}
