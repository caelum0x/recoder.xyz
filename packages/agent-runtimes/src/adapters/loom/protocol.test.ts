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
