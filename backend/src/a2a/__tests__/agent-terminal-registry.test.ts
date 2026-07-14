/**
 * Tests for agent-terminal-registry — per-terminal A2A agent discovery.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerTerminal,
  deregisterTerminal,
  heartbeat,
  getTerminal,
  listTerminals,
  listByType,
  countByType,
  listByProject,
  getSummary,
  pushToTerminal,
  sweepStale,
} from '../agent-terminal-registry';

// Clear the internal registry between tests by importing the module state reset.
// Since the registry is module-level, we deregister any lingering sessions.
function resetRegistry(): void {
  for (const t of listTerminals()) {
    deregisterTerminal(t.sessionId);
  }
}

describe('agent-terminal-registry', () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe('registerTerminal', () => {
    it('registers a new terminal with auto-generated session ID', () => {
      const session = registerTerminal({ agentType: 'claude_code' });

      expect(session.sessionId).toMatch(/^claude_code_[a-z0-9]{6}$/);
      expect(session.agentType).toBe('claude_code');
      expect(session.displayName).toBe('Claude Code #1');
      expect(session.connectedAt).toBeTruthy();
      expect(session.capabilities).toContain('chat');
    });

    it('uses provided session ID if supplied', () => {
      const session = registerTerminal({
        agentType: 'codex',
        sessionId: 'codex_custom_123',
      });

      expect(session.sessionId).toBe('codex_custom_123');
    });

    it('assigns sequential display numbers for same agent type', () => {
      const a = registerTerminal({ agentType: 'claude_code' });
      const b = registerTerminal({ agentType: 'claude_code' });
      const c = registerTerminal({ agentType: 'codex' });

      expect(a.displayName).toBe('Claude Code #1');
      expect(b.displayName).toBe('Claude Code #2');
      expect(c.displayName).toBe('Codex #1');
    });

    it('updates existing session on re-registration', () => {
      const first = registerTerminal({
        agentType: 'claude_code',
        sessionId: 'claude_code_test_1',
      });
      const before = first.lastHeartbeatAt;

      // Small delay to ensure timestamp changes
      const second = registerTerminal({
        agentType: 'claude_code',
        sessionId: 'claude_code_test_1',
        projectId: 'proj_abc',
      });

      expect(second.sessionId).toBe(first.sessionId);
      expect(second.projectId).toBe('proj_abc');
      expect(second.lastHeartbeatAt >= before).toBe(true);
    });

    it('detects remote callback URLs', () => {
      const local = registerTerminal({
        agentType: 'codex',
        callbackUrl: 'http://localhost:8080/inbox',
      });
      const remote = registerTerminal({
        agentType: 'codex',
        callbackUrl: 'https://tunnel.example.com/inbox',
      });

      expect(local.isRemote).toBe(false);
      expect(remote.isRemote).toBe(true);
    });
  });

  describe('deregisterTerminal', () => {
    it('removes a registered terminal', () => {
      const session = registerTerminal({ agentType: 'codex' });
      expect(getTerminal(session.sessionId)).toBeTruthy();

      deregisterTerminal(session.sessionId);
      expect(getTerminal(session.sessionId)).toBeUndefined();
    });

    it('is a no-op for unknown session', () => {
      expect(() => deregisterTerminal('unknown_session')).not.toThrow();
    });
  });

  describe('heartbeat', () => {
    it('updates lastHeartbeatAt for registered terminal', () => {
      const session = registerTerminal({ agentType: 'claude_code' });
      const ok = heartbeat(session.sessionId);
      expect(ok).toBe(true);
    });

    it('returns false for unknown session', () => {
      expect(heartbeat('unknown')).toBe(false);
    });

    it('updates project context on heartbeat', () => {
      const session = registerTerminal({ agentType: 'codex' });
      heartbeat(session.sessionId, { projectId: 'proj_xyz', workspaceDir: '/ws/xyz' });

      const updated = getTerminal(session.sessionId);
      expect(updated?.projectId).toBe('proj_xyz');
      expect(updated?.workspaceDir).toBe('/ws/xyz');
    });
  });

  describe('queries', () => {
    beforeEach(() => {
      resetRegistry();
      registerTerminal({ agentType: 'claude_code', projectId: 'proj_a' });
      registerTerminal({ agentType: 'claude_code', projectId: 'proj_b' });
      registerTerminal({ agentType: 'codex', projectId: 'proj_a' });
      registerTerminal({ agentType: 'opencode', projectId: 'proj_c' });
    });

    it('listByType filters by agent type', () => {
      expect(listByType('claude_code')).toHaveLength(2);
      expect(listByType('codex')).toHaveLength(1);
      expect(listByType('opencode')).toHaveLength(1);
      expect(listByType('unknown')).toHaveLength(0);
    });

    it('countByType returns count per agent type', () => {
      expect(countByType('claude_code')).toBe(2);
      expect(countByType('codex')).toBe(1);
      expect(countByType('unknown')).toBe(0);
    });

    it('listByProject filters by project', () => {
      expect(listByProject('proj_a')).toHaveLength(2);
      expect(listByProject('proj_b')).toHaveLength(1);
      expect(listByProject('proj_c')).toHaveLength(1);
    });

    it('getSummary returns counts and sessions per type', () => {
      const summary = getSummary();
      expect(summary.claude_code?.count).toBe(2);
      expect(summary.claude_code?.sessions).toHaveLength(2);
      expect(summary.codex?.count).toBe(1);
      expect(summary.opencode?.count).toBe(1);
    });

    it('listTerminals returns all registered', () => {
      expect(listTerminals()).toHaveLength(4);
    });
  });

  describe('sweepStale', () => {
    it('removes terminals with stale heartbeats', async () => {
      const session = registerTerminal({ agentType: 'codex' });
      expect(getTerminal(session.sessionId)).toBeTruthy();

      // Wait a tick so the heartbeat timestamp is in the past
      await new Promise((r) => setTimeout(r, 5));

      // Sweep with 1ms timeout — anything older than 1ms is stale
      const removed = sweepStale(1);

      expect(removed).toContain(session.sessionId);
      expect(getTerminal(session.sessionId)).toBeUndefined();
    });

    it('keeps fresh terminals', () => {
      const session = registerTerminal({ agentType: 'codex' });

      // Sweep with 60s timeout — session is fresh
      const removed = sweepStale(60_000);

      expect(removed).not.toContain(session.sessionId);
      expect(getTerminal(session.sessionId)).toBeTruthy();
    });
  });

  describe('pushToTerminal', () => {
    it('returns false when no callback URL registered', async () => {
      const session = registerTerminal({ agentType: 'codex' });
      const ok = await pushToTerminal(session.sessionId, { type: 'test', data: {} });
      expect(ok).toBe(false);
    });

    it('returns false for unknown terminal', async () => {
      const ok = await pushToTerminal('unknown', { type: 'test', data: {} });
      expect(ok).toBe(false);
    });
  });
});
