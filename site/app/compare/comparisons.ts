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
        ["Paid tier (individual)", "Pro $29/mo or $290/yr", "Pro $50/mo"],
        ["Team tier", "Team $99/mo", "Teams $60/mo per user"],
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
    related: ["recoder-vs-cursor"],
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
    related: ["recoder-vs-conductor"],
  },
];

export function comparison(slug: string): Comparison | undefined {
  return COMPARISONS.find((c) => c.slug === slug);
}
