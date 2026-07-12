'use strict';
/**
 * Recoder capability tools — the governed MCP interop bridge, shared verbatim by
 * every agent-facing stdio server (the main `mcp/recoder-a2a-server.js` and the
 * distributed npm/CLI copies). This is the SINGLE source of truth for the
 * capability tool set so the copies cannot drift.
 *
 * The conductor injects RECODER_INTERNAL_URL + INTERNAL_SERVICE_KEY into the
 * agent's launch env; these tools call the backend's gated MCP host
 * (/api/mcp/tools/:server/:tool/call) on the agent's behalf. Every call runs the
 * authorize -> risk -> execute -> audit gate server-side. No secret is written
 * anywhere; it lives only in env. When the key is absent (running outside a
 * Recoder workspace) each tool degrades to a truthful "not available" string.
 *
 * This file is vendored identically into each package dir. It is plain CJS and
 * self-contained (Node 18+ global `fetch`), so keeping the copies in sync is a
 * byte-for-byte diff.
 */

/** The capability tool definitions (JSON-Schema), spread into each server's TOOLS. */
const CAPABILITY_TOOLS = [
  {
    name: 'recoder_memory_search',
    description: "Search Recoder's durable, reviewed memory for facts learned in prior runs (project conventions, gotchas, decisions). Use this BEFORE asking the user things that may already be known. Returns accepted memory items matching the query.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to recall (keywords or a question)' },
        scope: { type: 'string', description: 'Optional scope filter: repo | user | org | space | path | agent | task-type' },
        limit: { type: 'number', description: 'Max results (default all matches)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'recoder_remember',
    description: "Propose a durable memory for Recoder to remember in future runs (a reusable fact/convention/gotcha). Requires evidence (a taskId + artifactId). The proposal is REVIEWED before it becomes durable — it is not written blindly. Use when you learn something worth persisting across sessions.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title of the fact' },
        body: { type: 'string', description: 'The fact/convention/gotcha to remember' },
        scope: { type: 'string', description: 'repo | user | org | space | path | agent | task-type (default repo)' },
        taskId: { type: 'string', description: 'Evidence: the task this was learned in' },
        artifactId: { type: 'string', description: 'Evidence: an artifact backing the fact' },
      },
      required: ['title', 'body', 'taskId', 'artifactId'],
    },
  },
  {
    name: 'recoder_issues_ready',
    description: "List the READY issues from Recoder's issue graph (beads/bd) — the unblocked work you can pick up. Use this to decide what to work on next.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'recoder_issue_create',
    description: 'Log a new issue in the Recoder issue graph (beads/bd) — e.g. discovered follow-up work. Returns the new issue id.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Issue title' },
        description: { type: 'string', description: 'Optional details' },
      },
      required: ['title'],
    },
  },
  {
    name: 'recoder_issue_close',
    description: 'Close an issue in the Recoder issue graph (beads/bd) when its work is done.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Issue id (e.g. recoder-abcd)' },
        reason: { type: 'string', description: 'Why it is closed (e.g. "Completed")' },
      },
      required: ['id'],
    },
  },
  {
    name: 'recoder_repo_search',
    description: "Search code — the local project (git grep, gitignore-aware) OR any GitHub repository. Pass `github` (owner/name) to search a remote repo, or `githubOwner` to search across an owner's repos; otherwise it searches the current project. Returns file:line (local) or repo/path + fragments (GitHub).",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Pattern / code to search for' },
        repo: { type: 'string', description: 'Optional absolute LOCAL repo path (defaults to the current project)' },
        github: { type: 'string', description: 'Optional GitHub repo to search, as "owner/name" (uses gh code search)' },
        githubOwner: { type: 'string', description: "Optional GitHub owner/org to search across their repos" },
        language: { type: 'string', description: 'Optional language filter for GitHub search (e.g. typescript)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'recoder_repo_diff',
    description: "See the repository's working-tree diff (stat + patch). Optionally against a base ref, or in another absolute repo path.",
    inputSchema: {
      type: 'object',
      properties: {
        base: { type: 'string', description: 'Optional base ref to diff against' },
        repo: { type: 'string', description: 'Optional absolute repo path' },
      },
    },
  },
  {
    name: 'recoder_browser_open',
    description: 'Open a URL in a real browser (headless) so you can VERIFY your own work — e.g. a preview or deployed page. Reuses one page per turn.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'The URL to open' } },
      required: ['url'],
    },
  },
  {
    name: 'recoder_browser_verify',
    description: "Assert that text is present on the currently-open page (open one first with recoder_browser_open). Returns whether the expected content rendered — use it to CHECK your UI changes actually work.",
    inputSchema: {
      type: 'object',
      properties: {
        contains: { type: 'string', description: 'The text you expect to see on the page' },
        selector: { type: 'string', description: 'Optional CSS selector to scope the check (default body)' },
      },
      required: ['contains'],
    },
  },
  {
    name: 'recoder_request_approval',
    description: 'Request human approval before a sensitive action (e.g. pushing, deleting, a risky command). Records a pending approval in the control plane that a reviewer resolves. Use this instead of proceeding on your own for high-risk steps.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task this approval is for' },
        reason: { type: 'string', description: 'What you want to do and why it needs approval' },
        requiredAt: { type: 'string', description: 'before_push | before_pr | before_write | before_sensitive_action (default)' },
      },
      required: ['taskId', 'reason'],
    },
  },
  {
    name: 'recoder_attach_artifact',
    description: "Attach an output artifact (a report, summary, log, or result) to the task's audit trail so it is reviewable in the cockpit and provenance-tracked. Use this to record what you produced.",
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task to attach the artifact to' },
        content: { type: 'string', description: 'The artifact content (text)' },
        kind: { type: 'string', description: 'report | log | diff | summary | … (default report)' },
        mimeType: { type: 'string', description: 'Default text/plain' },
      },
      required: ['taskId', 'content'],
    },
  },
  {
    name: 'recoder_github_search_repos',
    description: 'Find GitHub repositories by query (name, topic, description). Returns fullName, description, url, stars. Complements recoder_repo_search (which searches CODE).',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Repo search query' } },
      required: ['query'],
    },
  },
  {
    name: 'recoder_github_pr_create',
    description: 'Open a GitHub pull request via gh (from the current repo/branch by default). APPROVAL-GATED — a PR is a customer-visible action; policy may require approval. Returns the PR url.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'PR title' },
        body: { type: 'string', description: 'PR description' },
        repo: { type: 'string', description: 'owner/name (default: current repo)' },
        head: { type: 'string', description: 'Head branch (default: current)' },
        base: { type: 'string', description: 'Base branch' },
        draft: { type: 'boolean', description: 'Open as draft' },
      },
      required: ['title'],
    },
  },
  {
    name: 'recoder_preview_url',
    description: "Get the live preview URL for your workspace (the deployed/served page produced by your task), if one exists. The URL is owned by Recoder — it returns null truthfully when your task produced code, not a live page. Pass workspaceId, or it resolves from your current task.",
    inputSchema: {
      type: 'object',
      properties: { workspaceId: { type: 'string', description: 'Optional workspace id (defaults to your task’s workspace)' } },
    },
  },
  {
    name: 'recoder_preview_health',
    description: "Health-check your workspace's live preview — probes the preview URL and reports whether it responded healthy (2xx/3xx). Use this to CONFIRM your change actually serves before claiming done.",
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Optional workspace id' },
        url: { type: 'string', description: 'Optional explicit URL to probe (defaults to the workspace preview URL)' },
      },
    },
  },
  {
    name: 'recoder_preview_check',
    description: 'Run the richer headless-browser check on your preview (render assert + console/page errors + screenshot evidence), attached to the task audit trail. Use it to verify the UI actually renders without errors, not just that a socket answered.',
    inputSchema: {
      type: 'object',
      properties: { workspaceId: { type: 'string', description: 'Optional workspace id' } },
    },
  },
  {
    name: 'recoder_deploy_status',
    description: "Read your workspace's delivery/deploy status — the Recoder-owned workspace state, preview URL, and delivery summary. READ-ONLY (never triggers a deploy). Pass workspaceId, or it resolves from your current task.",
    inputSchema: {
      type: 'object',
      properties: { workspaceId: { type: 'string', description: 'Optional workspace id (defaults to your task’s workspace)' } },
    },
  },
  {
    name: 'recoder_billing_plan',
    description: "Read the authoritative plan + entitlements for the task/workspace owner (recoder.xyz is the plan authority). READ-ONLY. Pass userId, or it resolves from your current task/workspace owner. Reports a truthful message (not a fake plan) when the subject is unknown.",
    inputSchema: {
      type: 'object',
      properties: { userId: { type: 'string', description: 'Optional owner user id (defaults to the task/workspace owner)' } },
    },
  },
];

const CAPABILITY_TOOL_NAMES = new Set(CAPABILITY_TOOLS.map((t) => t.name));

/**
 * Build the capability bridge bound to an agent identity + interop-host URL.
 * Returns the tool defs plus `handleCapabilityTool(name, args)`, which returns a
 * result string for a capability tool or `null` if `name` is not one of ours
 * (so the caller can fall through to its own switch).
 */
function createCapabilityTools(options = {}) {
  const agentId = options.agentId || process.env.RECODER_AGENT_ID || 'claude_code';
  const internalUrl =
    options.internalUrl ||
    process.env.RECODER_INTERNAL_URL ||
    options.dockerUrl ||
    process.env.RECODER_DOCKER_URL ||
    'http://localhost:3001';
  const serviceKey = process.env.INTERNAL_SERVICE_KEY || '';
  const hasInteropAuth = () => Boolean(serviceKey);

  async function callInteropTool(serverId, toolName, args) {
    if (!hasInteropAuth()) {
      throw new Error('Recoder capability host not configured (no INTERNAL_SERVICE_KEY in this run).');
    }
    const actor = { agentId, permissions: { toolRules: [] } };
    const res = await fetch(
      `${internalUrl.replace(/\/+$/, '')}/api/mcp/tools/${encodeURIComponent(serverId)}/${encodeURIComponent(toolName)}/call`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-service-key': serviceKey },
        body: JSON.stringify({ actor, args }),
      },
    );
    const body = await res.json().catch(() => ({}));
    const data = (body && body.data) || {};
    if (data.status === 'denied') {
      throw new Error(`capability denied by policy: ${data.reason || 'not allowed'}`);
    }
    if (data.status === 'needs_approval') {
      throw new Error(`capability needs approval before it can run: ${data.reason || ''}`.trim());
    }
    if (!res.ok || data.status !== 'completed') {
      throw new Error(data.error || (body && body.error) || `capability call failed (HTTP ${res.status})`);
    }
    return (data.result && data.result.content) ?? data.result ?? data;
  }

  const unavailable = (what) =>
    `Recoder ${what} is not available in this run (no INTERNAL_SERVICE_KEY). It works inside a Recoder workspace.`;
  const errMsg = (err) => (err instanceof Error ? err.message : String(err));

  async function handleCapabilityTool(name, args = {}) {
    if (!CAPABILITY_TOOL_NAMES.has(name)) return null;

    switch (name) {
      case 'recoder_memory_search': {
        if (!hasInteropAuth()) return unavailable('memory');
        try {
          const content = await callInteropTool('recoder.memory', 'memory.search', {
            query: String(args.query || ''),
            scope: args.scope,
            limit: typeof args.limit === 'number' ? args.limit : undefined,
          });
          const items = Array.isArray(content) ? content : [];
          if (!items.length) return `No durable memory found for "${args.query}".`;
          return items
            .map((m) => `• [${m.scope || '?'}] ${m.title || '(untitled)'}\n  ${(m.body || '').slice(0, 400)}`)
            .join('\n');
        } catch (err) {
          return `memory search: ${errMsg(err)}`;
        }
      }

      case 'recoder_remember': {
        if (!hasInteropAuth()) return unavailable('memory');
        try {
          const candidate = await callInteropTool('recoder.memory', 'memory.candidate.create', {
            title: String(args.title || ''),
            body: String(args.body || ''),
            scope: args.scope || 'repo',
            evidence: { taskId: String(args.taskId || ''), artifactId: String(args.artifactId || '') },
          });
          const id = (candidate && (candidate.candidateId || candidate.id)) || '(pending)';
          return `Proposed memory "${args.title}" (candidate ${id}). It will become durable after review — not written blindly.`;
        } catch (err) {
          return `remember: ${errMsg(err)}`;
        }
      }

      case 'recoder_issues_ready': {
        if (!hasInteropAuth()) return unavailable('issue graph');
        try {
          const content = await callInteropTool('recoder.beads', 'beads.ready', {});
          const items = Array.isArray(content) ? content : [];
          if (!items.length) return 'No ready issues.';
          return items.map((i) => `• ${i.id || '?'} [${i.priority ?? '?'}] ${i.title || '(untitled)'}`).join('\n');
        } catch (err) {
          return `issues: ${errMsg(err)}`;
        }
      }

      case 'recoder_issue_create': {
        if (!hasInteropAuth()) return unavailable('issue graph');
        try {
          const content = await callInteropTool('recoder.beads', 'beads.create', {
            title: String(args.title || ''),
            description: args.description,
          });
          const id = (content && (content.id || content.issueId)) || '(created)';
          return `Created issue ${id}: ${args.title}`;
        } catch (err) {
          return `issue create: ${errMsg(err)}`;
        }
      }

      case 'recoder_issue_close': {
        if (!hasInteropAuth()) return unavailable('issue graph');
        try {
          await callInteropTool('recoder.beads', 'beads.close', {
            id: String(args.id || ''),
            reason: args.reason,
          });
          return `Closed issue ${args.id}.`;
        } catch (err) {
          return `issue close: ${errMsg(err)}`;
        }
      }

      case 'recoder_repo_search': {
        if (!hasInteropAuth()) return unavailable('repo search');
        try {
          const content = await callInteropTool('recoder.repo', 'repo.search', {
            query: String(args.query || ''),
            repo: args.repo,
            github: args.github,
            githubOwner: args.githubOwner,
            language: args.language,
          });
          const matches = (content && content.matches) || [];
          if (!matches.length) return `No matches for "${args.query}".`;
          if (content && content.source === 'github') {
            return matches
              .map((m) => `• ${m.repo}/${m.path}${m.fragments && m.fragments.length ? `\n  ${m.fragments.join('\n  ')}` : ''}`)
              .join('\n');
          }
          return matches.join('\n');
        } catch (err) {
          return `repo search: ${errMsg(err)}`;
        }
      }

      case 'recoder_repo_diff': {
        if (!hasInteropAuth()) return unavailable('repo diff');
        try {
          const content = await callInteropTool('recoder.repo', 'repo.diff', {
            base: args.base,
            repo: args.repo,
          });
          const stat = (content && content.stat) || '(no changes)';
          const patch = (content && content.patch) || '';
          return `${stat}\n\n${patch}`.trim();
        } catch (err) {
          return `repo diff: ${errMsg(err)}`;
        }
      }

      case 'recoder_request_approval': {
        if (!hasInteropAuth()) return unavailable('approvals');
        try {
          const content = await callInteropTool('recoder.approvals', 'approvals.request', {
            taskId: String(args.taskId || ''),
            reason: String(args.reason || ''),
            requiredAt: args.requiredAt,
          });
          const id = (content && content.approvalId) || '(pending)';
          return `Requested approval ${id} (status: ${(content && content.status) || 'pending'}). A reviewer must resolve it before the action proceeds.`;
        } catch (err) {
          return `request approval: ${errMsg(err)}`;
        }
      }

      case 'recoder_attach_artifact': {
        if (!hasInteropAuth()) return unavailable('artifacts');
        try {
          const content = await callInteropTool('recoder.artifacts', 'artifacts.create', {
            taskId: String(args.taskId || ''),
            content: String(args.content || ''),
            kind: args.kind,
            mimeType: args.mimeType,
          });
          const id = (content && content.artifactId) || '(created)';
          return `Attached artifact ${id} to task ${args.taskId}.`;
        } catch (err) {
          return `attach artifact: ${errMsg(err)}`;
        }
      }

      case 'recoder_github_search_repos': {
        if (!hasInteropAuth()) return unavailable('GitHub');
        try {
          const content = await callInteropTool('recoder.github', 'github.search', {
            query: String(args.query || ''),
          });
          const repos = Array.isArray(content) ? content : [];
          if (!repos.length) return `No repositories found for "${args.query}".`;
          return repos
            .map((r) => `• ${r.fullName} ★${r.stargazersCount ?? '?'} — ${(r.description || '').slice(0, 100)}\n  ${r.url || ''}`)
            .join('\n');
        } catch (err) {
          return `github search: ${errMsg(err)}`;
        }
      }

      case 'recoder_github_pr_create': {
        if (!hasInteropAuth()) return unavailable('GitHub');
        try {
          const content = await callInteropTool('recoder.github', 'github.pr.create', {
            title: String(args.title || ''),
            body: args.body,
            repo: args.repo,
            head: args.head,
            base: args.base,
            draft: args.draft === true,
          });
          return `Opened PR: ${(content && content.url) || '(created)'}`;
        } catch (err) {
          return `github pr create: ${errMsg(err)}`;
        }
      }

      case 'recoder_browser_open': {
        if (!hasInteropAuth()) return unavailable('browser');
        try {
          const content = await callInteropTool('recoder.browser', 'browser.open', {
            url: String(args.url || ''),
          });
          return `Opened ${(content && content.url) || args.url}. Use recoder_browser_verify to check the page content.`;
        } catch (err) {
          return `browser open: ${errMsg(err)}`;
        }
      }

      case 'recoder_browser_verify': {
        if (!hasInteropAuth()) return unavailable('browser');
        try {
          const content = await callInteropTool('recoder.browser', 'browser.verify', {
            contains: String(args.contains || ''),
            selector: args.selector,
          });
          return content && content.present
            ? `✓ Present: the page contains "${args.contains}".`
            : `✗ Not found: the page does NOT contain "${args.contains}".`;
        } catch (err) {
          return `browser verify: ${errMsg(err)}`;
        }
      }

      case 'recoder_preview_url': {
        if (!hasInteropAuth()) return unavailable('preview');
        try {
          const content = await callInteropTool('recoder.preview', 'preview.issue_url', {
            workspaceId: args.workspaceId,
          });
          if (!content || content.url == null) {
            return (content && content.message) || 'This workspace has no preview URL (it produced code, not a live page).';
          }
          return `Preview URL: ${content.url}`;
        } catch (err) {
          return `preview url: ${errMsg(err)}`;
        }
      }

      case 'recoder_preview_health': {
        if (!hasInteropAuth()) return unavailable('preview');
        try {
          const content = await callInteropTool('recoder.preview', 'preview.health', {
            workspaceId: args.workspaceId,
            url: args.url,
          });
          return content && content.healthy
            ? `✓ Preview healthy (HTTP ${content.status}): ${content.url}`
            : `✗ Preview unhealthy: ${(content && content.message) || 'no response'}`;
        } catch (err) {
          return `preview health: ${errMsg(err)}`;
        }
      }

      case 'recoder_preview_check': {
        if (!hasInteropAuth()) return unavailable('preview');
        try {
          const content = await callInteropTool('recoder.preview', 'preview.browser_check', {
            workspaceId: args.workspaceId,
          });
          const outcome = (content && content.outcome) || content;
          return `Preview browser-check: ${JSON.stringify(outcome).slice(0, 800)}`;
        } catch (err) {
          return `preview check: ${errMsg(err)}`;
        }
      }

      case 'recoder_deploy_status': {
        if (!hasInteropAuth()) return unavailable('deploy');
        try {
          const content = await callInteropTool('recoder.deploy', 'deploy.status', {
            workspaceId: args.workspaceId,
          });
          if (!content) return 'No deploy status available.';
          const parts = [`Workspace ${content.workspaceId || '?'}: state=${content.state ?? 'unknown'}`];
          if (content.previewUrl) parts.push(`preview=${content.previewUrl}`);
          parts.push(`deployBackend=${content.deployBackendConfigured ? 'configured' : 'none'}`);
          if (content.message) parts.push(content.message);
          return parts.join('\n');
        } catch (err) {
          return `deploy status: ${errMsg(err)}`;
        }
      }

      case 'recoder_billing_plan': {
        if (!hasInteropAuth()) return unavailable('billing');
        try {
          const content = await callInteropTool('recoder.billing', 'billing.plan.read', {
            userId: args.userId,
          });
          if (!content) return 'No plan available.';
          const grants = Array.isArray(content.entitlements) ? content.entitlements : [];
          const grantLine = grants.length
            ? `\nEntitlements: ${grants.map((g) => `${g.kind}:${g.key}${g.granted ? '' : '(revoked)'}`).join(', ')}`
            : '';
          const planLine = content.plan == null
            ? (content.message || 'Plan could not be resolved for this user.')
            : `Plan: ${content.plan}`;
          return `${planLine}${grantLine}`;
        } catch (err) {
          return `billing plan: ${errMsg(err)}`;
        }
      }

      default:
        return null;
    }
  }

  return { tools: CAPABILITY_TOOLS, hasInteropAuth, callInteropTool, handleCapabilityTool };
}

module.exports = { CAPABILITY_TOOLS, CAPABILITY_TOOL_NAMES, createCapabilityTools };
