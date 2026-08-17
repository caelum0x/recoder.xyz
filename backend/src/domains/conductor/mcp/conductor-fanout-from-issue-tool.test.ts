/**
 * Contract tests for `recoder_fanout_from_issue` (Board ↔ bd wiring, recoder-uou2):
 *  - `composeIssueTask` — the PURE issue→task-prompt composer (title+body, bounded).
 *  - the tool handler over a fake {@link FanoutFromIssueSurface}: reads the issue,
 *    seeds the task, delegates to fanout with taskId=issueId (closing the existing
 *    trackWork/completeWork loop), enforces caller identity, and REFUSES truthfully
 *    (no fan-out) on a missing/unknown issue.
 */
import { describe, it, expect } from 'vitest';
import type { McpToolCaller } from '../../../shared/module-base.js';
import type { FanoutInput, FanoutResult } from '../fanout/converge-fanout.service.js';
import type { IssueRead } from '../ports/code-intel.port.js';
import {
  buildConductorFanoutFromIssueTools,
  composeIssueTask,
  type FanoutFromIssueSurface,
} from './conductor-fanout-from-issue-tool.js';

const CALLER: McpToolCaller = { userId: 'user-1', orgId: 'org-1', scopes: ['read', 'write'] };

const STUB_RESULT = { converged: null } as unknown as FanoutResult;

/** A fake surface recording fanout inputs and returning a fixed issue for `readIssue`. */
function fakeSurface(issue: IssueRead | null): {
  surface: FanoutFromIssueSurface;
  fanoutCalls: FanoutInput[];
  readCalls: string[];
} {
  const fanoutCalls: FanoutInput[] = [];
  const readCalls: string[] = [];
  return {
    fanoutCalls,
    readCalls,
    surface: {
      async readIssue(id) {
        readCalls.push(id);
        return issue;
      },
      async fanout(input) {
        fanoutCalls.push(input);
        return STUB_RESULT;
      },
    },
  };
}

function tool(surface: FanoutFromIssueSurface) {
  const [reg] = buildConductorFanoutFromIssueTools(surface);
  return reg;
}

const VALID_ARGS = {
  issueId: 'recoder-abc',
  agentKinds: ['claude', 'codex'],
  repoPath: '/repo',
  spaceId: 'space-1',
  projectId: 'proj-1',
};

describe('composeIssueTask', () => {
  it('folds title + description into the task prompt with the issue id', () => {
    const task = composeIssueTask({ id: 'recoder-abc', title: 'Fix the widget', description: 'It crashes on empty input.' });
    expect(task).toBe('Work bd issue recoder-abc: Fix the widget\n\nIt crashes on empty input.');
  });

  it('uses the title alone when there is no description', () => {
    expect(composeIssueTask({ id: 'recoder-abc', title: 'Fix the widget' })).toBe('Work bd issue recoder-abc: Fix the widget');
  });

  it('truncates a runaway body', () => {
    const task = composeIssueTask({ id: 'x', title: 't', description: 'a'.repeat(20000) });
    expect(task.length).toBeLessThan(9000);
    expect(task.endsWith('…')).toBe(true);
  });
});

describe('recoder_fanout_from_issue tool', () => {
  it('is registered under the expected name', () => {
    expect(tool(fakeSurface(null).surface).name).toBe('recoder_fanout_from_issue');
  });

  it('reads the issue and fans out with taskId=issueId and the composed task', async () => {
    const { surface, fanoutCalls, readCalls } = fakeSurface({ id: 'recoder-abc', title: 'Fix it', description: 'details' });
    const res = await tool(surface).handler(VALID_ARGS, CALLER);
    expect(readCalls).toEqual(['recoder-abc']);
    expect(fanoutCalls).toHaveLength(1);
    expect(fanoutCalls[0]).toMatchObject({
      task: 'Work bd issue recoder-abc: Fix it\n\ndetails',
      taskId: 'recoder-abc',
      agentKinds: ['claude', 'codex'],
      repoPath: '/repo',
      spaceId: 'space-1',
      projectId: 'proj-1',
      actor: { userId: 'user-1' },
    });
    expect(res).toBe(STUB_RESULT);
  });

  it('REFUSES with no fan-out when the issue cannot be read (unknown/unavailable)', async () => {
    const { surface, fanoutCalls } = fakeSurface(null);
    const res = await tool(surface).handler(VALID_ARGS, CALLER);
    expect(res).toMatchObject({ ok: false });
    expect((res as { error: string }).error).toMatch(/could not be read/);
    expect(fanoutCalls).toHaveLength(0);
  });

  it('requires an authenticated caller (no free-form identity)', async () => {
    const { surface, readCalls } = fakeSurface({ id: 'recoder-abc', title: 't' });
    const res = await tool(surface).handler(VALID_ARGS, undefined);
    expect(res).toMatchObject({ ok: false });
    // Refuses BEFORE reading the issue.
    expect(readCalls).toHaveLength(0);
  });

  it('requires issueId, repoPath, spaceId, projectId, and valid agentKinds', async () => {
    const { surface } = fakeSurface({ id: 'recoder-abc', title: 't' });
    const reg = tool(surface);
    expect(await reg.handler({ ...VALID_ARGS, issueId: '' }, CALLER)).toMatchObject({ ok: false });
    expect(await reg.handler({ ...VALID_ARGS, repoPath: '' }, CALLER)).toMatchObject({ ok: false });
    expect(await reg.handler({ ...VALID_ARGS, agentKinds: ['claude'] }, CALLER)).toMatchObject({ ok: false });
    expect(await reg.handler({ ...VALID_ARGS, agentKinds: ['bogus', 'codex'] }, CALLER)).toMatchObject({ ok: false });
  });
});
