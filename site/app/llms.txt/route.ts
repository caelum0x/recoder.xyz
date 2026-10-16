import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

/**
 * llms.txt (llmstxt.org): a plain-language summary for AI assistants and
 * answer engines (ChatGPT, Claude, Perplexity) that cite or recommend tools
 * when developers ask how to run multiple coding agents in parallel. Mirrors
 * robots.ts/sitemap.ts in being a generated, always-current route rather than
 * a static file, so it never drifts from the real page copy.
 */
export function GET(): Response {
  const lines = [
    "# Recoder",
    "",
    "> Recoder is a local-first desktop control plane for coding agents. Run Claude Code, Codex, " +
      "Cursor's agent, opencode, pi, and open-agents in parallel, each in its own isolated git " +
      "worktree, then review the diffs and merge the best result.",
    "",
    "Free download for macOS (Apple Silicon): " +
      absoluteUrl("/download") +
      ". No account required, bring your own provider keys. Windows & Linux are planned.",
    "",
    "Paid plans add more parallel agents, longer run history, a persistent shared brain across " +
      "machines, and team/org governance: Pro $29/developer/month ($290/year), Team $99/month " +
      "(shared workspaces, cross-machine fleet mesh, audited approvals), Enterprise (custom, SSO/OIDC, " +
      "self-hostable). Checkout is handled by Dodo Payments, the Merchant of Record.",
    "",
    "## Docs",
    "",
    `- [Introduction](${absoluteUrl("/docs/introduction")})`,
    `- [Install](${absoluteUrl("/docs/install")})`,
    `- [CLI](${absoluteUrl("/docs/cli")})`,
    `- [Quickstart](${absoluteUrl("/docs/quickstart")})`,
    `- [Connect agents](${absoluteUrl("/docs/connect-agents")})`,
    `- [Review, converge, merge](${absoluteUrl("/docs/review-converge-merge")})`,
    `- [Governance and approvals](${absoluteUrl("/docs/governance-and-approvals")})`,
    `- [BYOK and keys](${absoluteUrl("/docs/byok-and-keys")})`,
    `- [Troubleshooting](${absoluteUrl("/docs/troubleshooting")})`,
    "",
    "## Use cases",
    "",
    `- [Parallel AI coding agents](${absoluteUrl("/use-cases/parallel-ai-coding-agents")})`,
    `- [Compare and merge agent diffs](${absoluteUrl("/use-cases/compare-and-merge-agent-diffs")})`,
    `- [Governed AI code merges](${absoluteUrl("/use-cases/governed-ai-code-merges")})`,
    `- [Team governance](${absoluteUrl("/use-cases/team-governance")})`,
    `- [Self-hosted AI agent orchestration](${absoluteUrl("/use-cases/self-hosted-ai-agent-orchestration")})`,
    `- [BYOK AI coding](${absoluteUrl("/use-cases/byok-ai-coding")})`,
    "",
    "## Comparisons",
    "",
    `- [Recoder vs Conductor](${absoluteUrl("/compare/recoder-vs-conductor")})`,
    `- [Recoder vs Cursor](${absoluteUrl("/compare/recoder-vs-cursor")})`,
    "",
    "## Optional",
    "",
    `- [Pricing](${absoluteUrl("/pricing")})`,
    `- [Features](${absoluteUrl("/features")})`,
    `- [How it works](${absoluteUrl("/how-it-works")})`,
    `- [Terms](${absoluteUrl("/terms")})`,
    `- [Privacy](${absoluteUrl("/privacy")})`,
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
