/**
 * `runtime-connector` + the runtimes registry — locks in that every coding-agent
 * runtime advertises a CORRECT, wire-stable A2A dispatch card and that boot-time
 * registration is degrade-safe (a single runtime failing never blocks the rest).
 *
 * These descriptors are the identity a runtime is registered under, so drift here
 * (wrong id prefix, missing base capability, faked `up` status) is a correctness
 * bug at the dispatch boundary — hence real, pinned assertions.
 */
import { describe, it, expect } from 'vitest';
import type { AgentRow } from '../types.js';
import type { AgentRegistryService } from '../registry/agent-registry.js';
import {
  RUNTIME_BASE_CAPABILITIES,
  runtimeCard,
  toUpsertAgentInput,
  type RuntimeConnectorDescriptor,
} from './runtime-connector.js';
import { RUNTIME_CONNECTORS, registerRuntimeConnectors } from './index.js';

const SAMPLE: RuntimeConnectorDescriptor = {
  runtimeId: 'claude_code',
  displayName: 'Claude Code',
  capabilities: ['code.edit', 'tools.mcp'],
  url: 'https://claude.com/claude-code',
};

describe('runtimeCard', () => {
  it('advertises the base A2A dispatch methods every runtime must support', () => {
    expect(RUNTIME_BASE_CAPABILITIES).toEqual(['message/send', 'tasks/get', 'tasks/cancel']);
  });

  it('builds a runtime: prefixed card carrying base ++ descriptor capabilities', () => {
    const card = runtimeCard(SAMPLE);
    expect(card.id).toBe('runtime:claude_code');
    expect(card.name).toBe('Claude Code');
    expect(card.url).toBe('https://claude.com/claude-code');
    expect(card.description).toContain('Claude Code');
    // Base capabilities come first, then the runtime's own — none dropped.
    expect(card.capabilities).toEqual([
      'message/send',
      'tasks/get',
      'tasks/cancel',
      'code.edit',
      'tools.mcp',
    ]);
  });

  it('every base capability is present on the card', () => {
    const card = runtimeCard(SAMPLE);
    for (const base of RUNTIME_BASE_CAPABILITIES) {
      expect(card.capabilities).toContain(base);
    }
  });

  it('omits url when the descriptor advertises none', () => {
    const card = runtimeCard({ runtimeId: 'x', displayName: 'X', capabilities: [] });
    expect(card.url).toBeUndefined();
    expect(card.id).toBe('runtime:x');
  });
});

describe('toUpsertAgentInput', () => {
  it('projects a descriptor into an owner-scoped kind:runtime upsert starting unknown (never faked up)', () => {
    const input = toUpsertAgentInput(SAMPLE, 'user-123');
    expect(input.id).toBe('runtime:claude_code');
    expect(input.userId).toBe('user-123');
    expect(input.kind).toBe('runtime');
    expect(input.runtimeId).toBe('claude_code');
    // Liveness is not asserted at registration — it must be proven by a heartbeat.
    expect(input.status).toBe('unknown');
    expect(input.card).toEqual(runtimeCard(SAMPLE));
  });
});

describe('RUNTIME_CONNECTORS catalog', () => {
  it('advertises exactly the six expected coding-agent runtimes with unique ids', () => {
    const ids = RUNTIME_CONNECTORS.map((c) => c.runtimeId);
    expect(ids).toEqual(['claude_code', 'codex', 'opencode', 'cursor', 'windsurf', 'replit']);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate dispatch identities
  });

  it('every descriptor carries a display name, a non-empty capability set, and an https url', () => {
    for (const c of RUNTIME_CONNECTORS) {
      expect(c.displayName.length).toBeGreaterThan(0);
      expect(c.capabilities.length).toBeGreaterThan(0);
      expect(c.url).toMatch(/^https:\/\//);
    }
  });

  it('projects every connector to a runtime: prefixed card id matching its runtimeId', () => {
    for (const c of RUNTIME_CONNECTORS) {
      expect(runtimeCard(c).id).toBe(`runtime:${c.runtimeId}`);
    }
  });
});

/** A registry double that records upserts and can fail for a chosen runtimeId. */
function fakeRegistry(failOnRuntimeId?: string): {
  registry: AgentRegistryService;
  registered: string[];
} {
  const registered: string[] = [];
  const registry = {
    async register(input: { id: string; userId: string; kind: string; runtimeId?: string; card: unknown; status?: string }): Promise<AgentRow> {
      if (input.runtimeId === failOnRuntimeId) {
        throw new Error(`registry down for ${input.runtimeId}`);
      }
      registered.push(input.runtimeId ?? input.id);
      return {
        id: input.id,
        userId: input.userId,
        kind: 'runtime',
        runtimeId: input.runtimeId,
        card: input.card as AgentRow['card'],
        status: (input.status as AgentRow['status']) ?? 'unknown',
      };
    },
  } as unknown as AgentRegistryService;
  return { registry, registered };
}

describe('registerRuntimeConnectors — degrade-safe boot registration', () => {
  it('registers all six runtimes for the owner as kind:runtime / status unknown', async () => {
    const { registry, registered } = fakeRegistry();
    const rows = await registerRuntimeConnectors(registry, 'owner-9');

    expect(rows).toHaveLength(6);
    expect(registered).toEqual(['claude_code', 'codex', 'opencode', 'cursor', 'windsurf', 'replit']);
    for (const row of rows) {
      expect(row.kind).toBe('runtime');
      expect(row.status).toBe('unknown');
      expect(row.userId).toBe('owner-9');
      expect(row.id).toBe(`runtime:${row.runtimeId}`);
    }
  });

  it('a single runtime failing to register does NOT block the others (fault swallowed per runtime)', async () => {
    const { registry, registered } = fakeRegistry('cursor');
    const rows = await registerRuntimeConnectors(registry, 'owner-9');

    // Five succeed; the faulting one is simply absent — boot is not failed.
    expect(rows).toHaveLength(5);
    expect(registered).toEqual(['claude_code', 'codex', 'opencode', 'windsurf', 'replit']);
    expect(rows.some((r) => r.runtimeId === 'cursor')).toBe(false);
  });
});
