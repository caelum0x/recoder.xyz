/**
 * recoder-n268: the connector state mappers index a plain object literal by an
 * attacker-influenced native-state string (`CODEX_TO_CANONICAL[nativeState]`).
 * Inherited Object.prototype members (`toString`, `constructor`, `valueOf`,
 * `hasOwnProperty`, `__proto__`) are therefore returned as if they were mapped
 * states — they are truthy, so `map*State` returns a function/object instead of
 * `undefined`, and downstream guards (`checkConnectorTransition`,
 * `isConnectorTerminalState`) then treat that non-state as a valid mapping.
 * These tests pin that every non-own key maps to `undefined`.
 */
import { describe, expect, it } from 'vitest';

import {
  mapCodexState,
  mapClaudeState,
  mapConnectorState,
  checkConnectorTransition,
  isConnectorTerminalState,
} from './state-mapping';
import { TaskStateEnum } from './schemas';

const PROTO_KEYS = [
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
];

describe('state-mapping — inherited Object.prototype members are NOT states (recoder-n268)', () => {
  it('mapCodexState returns undefined for every prototype key', () => {
    for (const key of PROTO_KEYS) {
      expect(mapCodexState(key)).toBeUndefined();
    }
  });

  it('mapClaudeState returns undefined for every prototype key', () => {
    for (const key of PROTO_KEYS) {
      expect(mapClaudeState(key)).toBeUndefined();
    }
  });

  it('mapConnectorState returns undefined for prototype keys on both platforms', () => {
    for (const key of PROTO_KEYS) {
      expect(mapConnectorState('codex', key)).toBeUndefined();
      expect(mapConnectorState('claude_code', key)).toBeUndefined();
    }
  });

  it('checkConnectorTransition rejects a prototype key as an unknown state', () => {
    const result = checkConnectorTransition(
      TaskStateEnum.Working,
      'codex',
      'toString',
    );
    expect(result.valid).toBe(false);
    expect(result.mappedState).toBeUndefined();
  });

  it('isConnectorTerminalState is false for a prototype key', () => {
    expect(isConnectorTerminalState('codex', 'constructor')).toBe(false);
    expect(isConnectorTerminalState('claude_code', '__proto__')).toBe(false);
  });

  it('still maps the real states correctly (no regression)', () => {
    expect(mapCodexState('running')).toBe(TaskStateEnum.Working);
    expect(mapClaudeState('streaming')).toBe(TaskStateEnum.Working);
  });
});
