// `parseBlockedProvenance` -- proves the DEFENSIVE, snake_case-wire -> camelCase
// parse of loom's OPTIONAL screen-rule provenance (`agent_rule_id`,
// `agent_blocked_kind`) off an `AgentInfo` or a `pane.agent_status_changed`
// event `data`. TRUTHFULNESS invariant: an undeclared / blank / unrecognised
// field is `undefined` -- never coerced into a fabricated kind.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  parseAgentQueryResult,
  parseBlockedProvenance,
  parseWorkspaceAgentStatusChangedEvent,
  parseWorktreeStatusResult,
  type AgentInfo,
  type BlockedProvenance,
} from './protocol';

describe('parseBlockedProvenance', () => {
  test('parses a declared rule id + blocked kind (snake_case -> camelCase)', () => {
    const parsed: BlockedProvenance = parseBlockedProvenance({
      agent_rule_id: 'rule-approval-7',
      agent_blocked_kind: 'approval',
    });
    assert.deepEqual(parsed, {
      agentRuleId: 'rule-approval-7',
      agentBlockedKind: 'approval',
    });
  });

  test('carries the full declared taxonomy (approval | input | trust)', () => {
    for (const kind of ['approval', 'input', 'trust'] as const) {
      assert.equal(
        parseBlockedProvenance({ agent_blocked_kind: kind }).agentBlockedKind,
        kind
      );
    }
  });

  test('absent fields yield an empty provenance (both undefined)', () => {
    assert.deepEqual(parseBlockedProvenance({}), {});
    const parsed = parseBlockedProvenance({ agent_status: 'blocked' });
    assert.equal(parsed.agentRuleId, undefined);
    assert.equal(parsed.agentBlockedKind, undefined);
  });

  test('an unrecognised blocked kind is dropped (never fabricated)', () => {
    const parsed = parseBlockedProvenance({
      agent_rule_id: 'rule-1',
      agent_blocked_kind: 'panic',
    });
    assert.equal(parsed.agentBlockedKind, undefined);
    // A valid sibling field still parses.
    assert.equal(parsed.agentRuleId, 'rule-1');
  });

  test('a blank rule id is dropped', () => {
    assert.equal(parseBlockedProvenance({ agent_rule_id: '   ' }).agentRuleId, undefined);
    assert.equal(parseBlockedProvenance({ agent_rule_id: '' }).agentRuleId, undefined);
  });

  test('a non-record source yields an empty provenance (defensive)', () => {
    assert.deepEqual(parseBlockedProvenance(null), {});
    assert.deepEqual(parseBlockedProvenance(undefined), {});
    assert.deepEqual(parseBlockedProvenance('blocked'), {});
    assert.deepEqual(parseBlockedProvenance(42), {});
  });

  test('parses provenance straight off an AgentInfo carrying the fields', () => {
    const agent: AgentInfo = {
      terminal_id: 't1',
      agent_status: 'blocked',
      workspace_id: 'w1',
      tab_id: 'tab1',
      pane_id: 'p1',
      focused: false,
      revision: 3,
      agent_rule_id: 'rule-trust-2',
      agent_blocked_kind: 'trust',
    };
    assert.deepEqual(parseBlockedProvenance(agent), {
      agentRuleId: 'rule-trust-2',
      agentBlockedKind: 'trust',
    });
  });

  test('an AgentInfo without provenance parses to empty (manifest-less agents)', () => {
    const agent: AgentInfo = {
      terminal_id: 't1',
      agent_status: 'blocked',
      workspace_id: 'w1',
      tab_id: 'tab1',
      pane_id: 'p1',
      focused: false,
      revision: 3,
    };
    assert.deepEqual(parseBlockedProvenance(agent), {});
  });
});

// `parseAgentQueryResult` -- the DEFENSIVE reader of an `agent.query` reply's
// `agents` list. TRUTHFULNESS invariant: only a well-formed `agent_query` result
// with an array of object entries yields agents; anything else is `[]`, never a
// fabricated agent. Entries pass through with their OPTIONAL screen-rule
// provenance (`agent_rule_id`, `agent_blocked_kind`) intact.
describe('parseAgentQueryResult', () => {
  test('parses the agents list in order, preserving provenance passthrough', () => {
    const agents = parseAgentQueryResult({
      type: 'agent_query',
      agents: [
        {
          terminal_id: 't-blocked',
          agent_status: 'blocked',
          workspace_id: 'w2',
          tab_id: 'w2:1',
          pane_id: 'w2-1',
          focused: false,
          revision: 7,
          agent_rule_id: 'rule-approval-3',
          agent_blocked_kind: 'approval',
        },
        {
          terminal_id: 't-done',
          agent_status: 'done',
          workspace_id: 'w1',
          tab_id: 'w1:1',
          pane_id: 'w1-1',
          focused: false,
          revision: 4,
        },
      ],
    });

    assert.equal(agents.length, 2);
    assert.equal(agents[0].terminal_id, 't-blocked');
    assert.equal(agents[0].agent_status, 'blocked');
    assert.equal(agents[0].agent_rule_id, 'rule-approval-3');
    assert.equal(agents[0].agent_blocked_kind, 'approval');
    assert.equal(agents[1].terminal_id, 't-done');
    // A manifest-less agent carries no provenance and is passed through as-is.
    assert.equal(agents[1].agent_rule_id, undefined);
    assert.equal(agents[1].agent_blocked_kind, undefined);
  });

  test('an empty match yields an empty list', () => {
    assert.deepEqual(parseAgentQueryResult({ type: 'agent_query', agents: [] }), []);
  });

  test('a non-agent_query result yields an empty list (never fabricated)', () => {
    assert.deepEqual(parseAgentQueryResult({ type: 'ok' }), []);
    assert.deepEqual(parseAgentQueryResult({ type: 'agent_info', agent: {} }), []);
  });

  test('a malformed agents field yields an empty list', () => {
    assert.deepEqual(
      parseAgentQueryResult({ type: 'agent_query', agents: 'nope' }),
      []
    );
    assert.deepEqual(parseAgentQueryResult({ type: 'agent_query' }), []);
  });

  test('non-object entries are dropped rather than coerced', () => {
    const agents = parseAgentQueryResult({
      type: 'agent_query',
      agents: [
        null,
        'not-an-agent',
        42,
        {
          terminal_id: 't-ok',
          agent_status: 'idle',
          workspace_id: 'w1',
          tab_id: 'w1:1',
          pane_id: 'w1-1',
          focused: true,
          revision: 1,
        },
      ],
    });
    assert.equal(agents.length, 1);
    assert.equal(agents[0].terminal_id, 't-ok');
  });

  test('a non-record source yields an empty list (defensive)', () => {
    assert.deepEqual(parseAgentQueryResult(null), []);
    assert.deepEqual(parseAgentQueryResult(undefined), []);
    assert.deepEqual(parseAgentQueryResult('agent_query'), []);
  });
});

// `parseWorktreeStatusResult` -- the DEFENSIVE reader of a `worktree.status`
// reply. TRUTHFULNESS invariant: only a well-formed `worktree_status` result
// with every field present and correctly typed yields a status; anything else is
// `null`, never a fabricated `0/0` "in sync". `has_upstream` disambiguates a
// real `0/0` (in sync) from "no upstream to compare against".
describe('parseWorktreeStatusResult', () => {
  test('parses a dirty status with an upstream ahead/behind', () => {
    const status = parseWorktreeStatusResult({
      type: 'worktree_status',
      path: '/tmp/wt',
      dirty: true,
      changed_files: 3,
      has_upstream: true,
      ahead: 2,
      behind: 1,
    });

    assert.deepEqual(status, {
      path: '/tmp/wt',
      dirty: true,
      changed_files: 3,
      has_upstream: true,
      ahead: 2,
      behind: 1,
    });
  });

  test('preserves a truthful no-upstream 0/0 (not conflated with in-sync)', () => {
    const status = parseWorktreeStatusResult({
      type: 'worktree_status',
      path: '/tmp/clean',
      dirty: false,
      changed_files: 0,
      has_upstream: false,
      ahead: 0,
      behind: 0,
    });

    assert.ok(status);
    assert.equal(status.has_upstream, false);
    assert.equal(status.ahead, 0);
    assert.equal(status.behind, 0);
  });

  test('a non-worktree_status result yields null (never fabricated)', () => {
    assert.equal(parseWorktreeStatusResult({ type: 'ok' }), null);
    assert.equal(
      parseWorktreeStatusResult({ type: 'worktree_removed', path: '/tmp/wt' }),
      null
    );
  });

  test('a malformed or partial status yields null', () => {
    // Missing fields.
    assert.equal(
      parseWorktreeStatusResult({ type: 'worktree_status', path: '/tmp/wt' }),
      null
    );
    // Wrong types: counts arriving as strings must not be coerced.
    assert.equal(
      parseWorktreeStatusResult({
        type: 'worktree_status',
        path: '/tmp/wt',
        dirty: true,
        changed_files: '3',
        has_upstream: true,
        ahead: 2,
        behind: 1,
      }),
      null
    );
    // Non-string path.
    assert.equal(
      parseWorktreeStatusResult({
        type: 'worktree_status',
        path: 42,
        dirty: false,
        changed_files: 0,
        has_upstream: false,
        ahead: 0,
        behind: 0,
      }),
      null
    );
  });

  test('a non-record source yields null (defensive)', () => {
    assert.equal(parseWorktreeStatusResult(null), null);
    assert.equal(parseWorktreeStatusResult(undefined), null);
    assert.equal(parseWorktreeStatusResult('worktree_status'), null);
  });
});

// `parseWorkspaceAgentStatusChangedEvent` -- the DEFENSIVE reader of the
// workspace-scoped AGGREGATE agent-status event `data`. TRUTHFULNESS invariant:
// a malformed / unrecognised payload yields `null` -- the client never
// fabricates an aggregate status the panes do not support.
describe('parseWorkspaceAgentStatusChangedEvent', () => {
  test('parses a well-formed aggregate payload into camelCase', () => {
    assert.deepEqual(
      parseWorkspaceAgentStatusChangedEvent({
        type: 'workspace_agent_status_changed',
        workspace_id: 'ws-1',
        agent_status: 'blocked',
      }),
      { workspaceId: 'ws-1', agentStatus: 'blocked' }
    );
  });

  test('accepts every known aggregate status, including unknown', () => {
    for (const status of ['idle', 'working', 'blocked', 'done', 'unknown']) {
      assert.deepEqual(
        parseWorkspaceAgentStatusChangedEvent({
          type: 'workspace_agent_status_changed',
          workspace_id: 'ws-1',
          agent_status: status,
        }),
        { workspaceId: 'ws-1', agentStatus: status }
      );
    }
  });

  test('rejects a wrong type tag, empty id, or unrecognised status', () => {
    assert.equal(
      parseWorkspaceAgentStatusChangedEvent({
        type: 'pane_agent_status_changed',
        workspace_id: 'ws-1',
        agent_status: 'blocked',
      }),
      null
    );
    assert.equal(
      parseWorkspaceAgentStatusChangedEvent({
        type: 'workspace_agent_status_changed',
        workspace_id: '   ',
        agent_status: 'blocked',
      }),
      null
    );
    assert.equal(
      parseWorkspaceAgentStatusChangedEvent({
        type: 'workspace_agent_status_changed',
        workspace_id: 'ws-1',
        agent_status: 'ready',
      }),
      null
    );
  });

  test('a non-record source yields null (defensive)', () => {
    assert.equal(parseWorkspaceAgentStatusChangedEvent(null), null);
    assert.equal(parseWorkspaceAgentStatusChangedEvent(undefined), null);
    assert.equal(
      parseWorkspaceAgentStatusChangedEvent('workspace_agent_status_changed'),
      null
    );
  });
});
