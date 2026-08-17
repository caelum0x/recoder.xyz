/**
 * The conductor `recoder_fanout_from_issue` MCP tool — the Board ↔ bd (beads)
 * wiring (recoder-uou2): START a workspace fan-out directly FROM a bd issue.
 *
 * This is the REVERSE of the shipped launch→trackWork→completeWork loop (which
 * claims a bd issue on launch and CLOSES it on merge). Here the agent picks a bd
 * issue and the tool:
 *   1. READS the issue via the degrade-safe issue-graph reader seam
 *      (`codeIntel.readIssue`, backed by the memory facet's `bd show`),
 *   2. COMPOSES the agent task prompt from the issue's title + description, and
 *   3. delegates to the SAME governed {@link ConvergeFanoutSurface.fanout} with
 *      `taskId = issueId` — so the EXISTING trackWork/completeWork wiring claims
 *      the issue on launch and closes it on a successful converge. Zero new
 *      governance: every per-agent launch + the compose self-gate under the caller,
 *      exactly like `recoder_converge_fanout`.
 *
 * TRUTHFULNESS: an unknown issue / an unwired-or-down issue-graph seam ⇒ the tool
 * REFUSES with the real reason and starts NO fan-out (never a fabricated launch on
 * an invented task). Identity is the host-authorized caller, never a free-form arg.
 */
import type {
  McpToolCaller,
  McpToolRegistration,
} from '../../../shared/module-base.js';
import { KNOWN_AGENT_KINDS, type FanoutInput } from '../fanout/converge-fanout.service.js';
import type { IssueRead } from '../ports/code-intel.port.js';
import {
  asObject,
  inputError,
  isInputError,
  parseAgentKinds,
  parseSettleTimeoutMs,
  reqString,
  resolveCaller,
  type ConvergeFanoutSurface,
} from './conductor-fanout-tool.js';

/** The read seam this tool needs: fetch a bd issue's title/description, or `null`. */
export interface IssueReaderSurface {
  readIssue(id: string): Promise<IssueRead | null>;
}

/** The combined surface: read a bd issue AND run the governed fan-out. */
export type FanoutFromIssueSurface = ConvergeFanoutSurface & IssueReaderSurface;

/** Upper bound on the issue body folded into the task prompt (a runaway body is truncated). */
const MAX_ISSUE_BODY = 8000;

/**
 * Compose the agent task prompt from a bd issue — PURE + exported for testing. The
 * issue id is included so the agent knows the tracked work item; the body is folded
 * in when present (bounded), else the title alone drives the task.
 */
export function composeIssueTask(issue: IssueRead): string {
  const title = issue.title.trim();
  const header = `Work bd issue ${issue.id}: ${title}`;
  const body = (issue.description ?? '').trim();
  if (!body) return header;
  const bounded = body.length > MAX_ISSUE_BODY ? `${body.slice(0, MAX_ISSUE_BODY - 1)}…` : body;
  return `${header}\n\n${bounded}`;
}

/**
 * Build the governed `recoder_fanout_from_issue` MCP tool. Kept SEPARATE from
 * `buildConductorFanoutTools` so its registration is explicit at the composer.
 */
export function buildConductorFanoutFromIssueTools(
  surface: FanoutFromIssueSurface
): readonly McpToolRegistration[] {
  return [
    {
      name: 'recoder_fanout_from_issue',
      description:
        'Board ↔ bd: START a governed fan-out directly from a bd issue. Reads the issue, seeds the agent task from its title+description, and fans it to N agents with taskId=issueId — so the existing issue-graph wiring claims the issue on launch and CLOSES it on a successful converge. Args: issueId (required), agentKinds (required, 2..6 distinct kinds from: ' +
        KNOWN_AGENT_KINDS.join(', ') +
        '), repoPath (required), spaceId (required), projectId (required), base (optional), settleTimeoutMs (optional). Truthful: an unknown issue or an unavailable issue graph REFUSES and starts no fan-out; governance + convergence are identical to recoder_converge_fanout.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const body = asObject(raw);
        const resolved = resolveCaller(body, caller);
        if (isInputError(resolved)) return resolved;

        const issueId = reqString(body, 'issueId');
        if (!issueId) return inputError('issueId is required');
        const repoPath = reqString(body, 'repoPath');
        if (!repoPath) return inputError('repoPath is required');
        const spaceId = reqString(body, 'spaceId');
        if (!spaceId) return inputError('spaceId is required');
        const projectId = reqString(body, 'projectId');
        if (!projectId) return inputError('projectId is required');

        const agentKinds = parseAgentKinds(body.agentKinds);
        if (isInputError(agentKinds)) return agentKinds;

        // READ the issue FIRST — a miss / unwired-or-down seam refuses truthfully
        // and starts no fan-out (never a fabricated launch on an invented task).
        const issue = await surface.readIssue(issueId);
        if (!issue) {
          return inputError(
            `bd issue '${issueId}' could not be read (unknown issue or the issue graph is unavailable)`
          );
        }

        const base = reqString(body, 'base');
        const settleTimeoutMs = parseSettleTimeoutMs(body.settleTimeoutMs);
        const input: FanoutInput = {
          task: composeIssueTask(issue),
          agentKinds,
          repoPath,
          spaceId,
          projectId,
          actor: resolved.principal,
          // ALWAYS the bd issue id — this is what closes the track/complete loop.
          taskId: issue.id,
          ...(base ? { base } : {}),
          ...(settleTimeoutMs !== undefined ? { settleTimeoutMs } : {}),
        };
        return surface.fanout(input);
      },
    },
  ];
}
