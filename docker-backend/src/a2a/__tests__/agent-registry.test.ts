/**
 * @module agent-registry.test
 *
 * Comprehensive test suite for the Agent Registry REST API.
 *
 * Covers:
 * - AgentRegistryService: registration, unregistration, discovery, health,
 *   self-registration, default agent pre-registration
 * - Validation middleware: register body, self-register body, discovery query
 * - Route handlers: happy paths, error paths, edge cases
 * - Full workflows (register -> discover -> heartbeat -> health -> unregister)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock durable-identity persistence with an in-memory backing store so the
// service hydrates/persists deterministically without touching the data/ dir.
// `__durableStore` is the shared backing array used to simulate the JSON file.
// ---------------------------------------------------------------------------
vi.mock('../a2a-persistence', () => {
  const store = {
    entries: [] as [string, unknown][],
  };
  return {
    __durableStore: store,
    loadA2ADurableIdentities: vi.fn(() => new Map(store.entries)),
    saveA2ADurableIdentities: vi.fn((identities: Map<string, unknown>) => {
      store.entries = [...identities.entries()];
    }),
  };
});

// Typed access to the mocked store / spies.
import * as a2aPersistence from '../a2a-persistence';
const durableStore = (a2aPersistence as unknown as {
  __durableStore: { entries: [string, unknown][] };
}).__durableStore;

import {
  AgentRegistryService,
  getAgentRegistryService,
  resetAgentRegistryService,
  ReservedAgentIdError,
  DEFAULT_AGENTS,
  type RegisterAgentInput,
  type SelfRegisterInput,
} from '../agent-registry.service';
import {
  validateRegisterBody,
  validateSelfRegisterBody,
  validateDiscoveryQuery,
  parseJsonTextBody,
} from '../agent-registry.middleware';
import type { RegisteredAgent } from '@recoder/shared/a2a';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeRegisterInput(overrides: Partial<RegisterAgentInput> = {}): RegisterAgentInput {
  return {
    identity: {
      id: 'test-agent',
      name: 'Test Agent',
      platform: 'custom',
    },
    card: {
      name: 'Test Agent',
      description: 'A test agent',
      protocolVersion: '0.3.0',
      version: '1.0.0',
      url: 'http://localhost:9000',
      skills: [
        { id: 'test-skill', name: 'Test Skill', description: 'A test skill', tags: ['test'] },
      ],
      capabilities: { streaming: false, pushNotifications: false },
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
    },
    protocol: 'rest',
    tier: 'tier1',
    tags: ['test'],
    ...overrides,
  };
}

function makeSelfRegisterInput(overrides: Partial<SelfRegisterInput> = {}): SelfRegisterInput {
  return {
    agentId: 'self-agent',
    name: 'Self Agent',
    platform: 'recoder_web',
    ...overrides,
  };
}

function makeMockReq(body?: any, params?: any, query?: any): any {
  return {
    body: body ?? {},
    params: params ?? {},
    query: query ?? {},
    headers: {},
  };
}

function makeMockRes(): any {
  const res: any = {
    _status: 200,
    _data: null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: any) {
      res._data = data;
      return res;
    },
  };
  return res;
}

function makeMockNext(): any {
  return vi.fn();
}

// ===========================================================================
// AgentRegistryService
// ===========================================================================

describe('AgentRegistryService', () => {
  let service: AgentRegistryService;

  beforeEach(() => {
    resetAgentRegistryService();
    durableStore.entries = [];
    service = new AgentRegistryService();
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  describe('register', () => {
    it('registers an agent and returns the RegisteredAgent', () => {
      const input = makeRegisterInput();
      const result = service.register(input);

      expect(result.identity.id).toBe('test-agent');
      expect(result.identity.name).toBe('Test Agent');
      expect(result.identity.platform).toBe('custom');
      expect(result.card.name).toBe('Test Agent');
      expect(result.protocol).toBe('rest');
      expect(result.tier).toBe('tier1');
      expect(result.tags).toEqual(['test']);
    });

    it('sets a heartbeat on registration', () => {
      service.register(makeRegisterInput());
      const health = service.getHealth('test-agent');
      expect(health.online).toBe(true);
      expect(health.lastHeartbeat).toBeTruthy();
    });

    it('overwrites existing agent with same id', () => {
      service.register(makeRegisterInput());
      const updated = service.register(makeRegisterInput({
        card: {
          ...makeRegisterInput().card,
          description: 'Updated description',
        },
      }));
      expect(updated.card.description).toBe('Updated description');
      expect(service.list()).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Unregistration
  // -----------------------------------------------------------------------

  describe('unregister', () => {
    it('removes a registered agent and returns true', () => {
      service.register(makeRegisterInput());
      expect(service.unregister('test-agent')).toBe(true);
      expect(service.get('test-agent')).toBeUndefined();
    });

    it('returns false when agent does not exist', () => {
      expect(service.unregister('nonexistent')).toBe(false);
    });

    it('removes heartbeat data on unregister', () => {
      service.register(makeRegisterInput());
      service.unregister('test-agent');
      const health = service.getHealth('test-agent');
      expect(health.online).toBe(false);
      expect(health.lastHeartbeat).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // Get
  // -----------------------------------------------------------------------

  describe('get / getWithHealth', () => {
    it('returns undefined for unknown agent', () => {
      expect(service.get('unknown')).toBeUndefined();
    });

    it('returns the registered agent', () => {
      service.register(makeRegisterInput());
      const agent = service.get('test-agent');
      expect(agent).toBeDefined();
      expect(agent!.identity.id).toBe('test-agent');
    });

    it('getWithHealth includes health info', () => {
      service.register(makeRegisterInput());
      const agentWithHealth = service.getWithHealth('test-agent');
      expect(agentWithHealth).toBeDefined();
      expect(agentWithHealth!.health.online).toBe(true);
      expect(agentWithHealth!.health.lastHeartbeat).toBeTruthy();
    });

    it('getWithHealth returns undefined for unknown agent', () => {
      expect(service.getWithHealth('unknown')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // List
  // -----------------------------------------------------------------------

  describe('list', () => {
    it('returns empty array when no agents registered', () => {
      expect(service.list()).toEqual([]);
    });

    it('returns all registered agents', () => {
      service.register(makeRegisterInput());
      service.register(makeRegisterInput({
        identity: { id: 'agent-2', name: 'Agent 2', platform: 'codex' },
      }));
      expect(service.list()).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Discovery
  // -----------------------------------------------------------------------

  describe('discover', () => {
    beforeEach(() => {
      service.register(makeRegisterInput({
        identity: { id: 'agent-rest', name: 'REST Agent', platform: 'recoder_web' },
        protocol: 'rest',
        tier: 'tier1',
        tags: ['web'],
      }));
      service.register(makeRegisterInput({
        identity: { id: 'agent-mcp', name: 'MCP Agent', platform: 'claude_code' },
        protocol: 'mcp',
        tier: 'tier1',
        tags: ['ai'],
      }));
      service.register(makeRegisterInput({
        identity: { id: 'agent-jsonrpc', name: 'JSON-RPC Agent', platform: 'codex' },
        protocol: 'jsonrpc',
        tier: 'tier2',
        tags: ['code'],
      }));
    });

    it('returns all agents with no filters', () => {
      expect(service.discover({})).toHaveLength(3);
    });

    it('filters by protocol', () => {
      const results = service.discover({ protocol: 'mcp' });
      expect(results).toHaveLength(1);
      expect(results[0].identity.id).toBe('agent-mcp');
    });

    it('filters by platform', () => {
      const results = service.discover({ platform: 'codex' });
      expect(results).toHaveLength(1);
      expect(results[0].identity.id).toBe('agent-jsonrpc');
    });

    it('filters by tier', () => {
      const results = service.discover({ tier: 'tier2' });
      expect(results).toHaveLength(1);
      expect(results[0].identity.id).toBe('agent-jsonrpc');
    });

    it('filters by skillTag in card skills', () => {
      const results = service.discover({ skillTag: 'test' });
      expect(results).toHaveLength(3); // all have 'test' skill tag from fixture
    });

    it('filters by skillTag in tags array', () => {
      const results = service.discover({ skillTag: 'web' });
      expect(results).toHaveLength(1);
      expect(results[0].identity.id).toBe('agent-rest');
    });

    it('returns empty when no match', () => {
      expect(service.discover({ protocol: 'file_git' })).toHaveLength(0);
    });

    it('combines filters', () => {
      const results = service.discover({ protocol: 'rest', tier: 'tier1' });
      expect(results).toHaveLength(1);
      expect(results[0].identity.id).toBe('agent-rest');
    });
  });

  // -----------------------------------------------------------------------
  // Heartbeat / Health
  // -----------------------------------------------------------------------

  describe('heartbeat and health', () => {
    it('recordHeartbeat returns false for unknown agent', () => {
      expect(service.recordHeartbeat('unknown')).toBe(false);
    });

    it('recordHeartbeat returns true and updates last heartbeat', () => {
      service.register(makeRegisterInput());
      const result = service.recordHeartbeat('test-agent');
      expect(result).toBe(true);
      const health = service.getHealth('test-agent');
      expect(health.online).toBe(true);
    });

    it('agent goes offline after heartbeat timeout', () => {
      service.register(makeRegisterInput());
      // Manually set a stale heartbeat
      const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
      (service as any).heartbeats.set('test-agent', staleTime);

      const health = service.getHealth('test-agent');
      expect(health.online).toBe(false);
      expect(health.lastHeartbeat).toBe(staleTime);
    });

    it('getHealth returns empty/offline for unknown agent', () => {
      const health = service.getHealth('unknown');
      expect(health.online).toBe(false);
      expect(health.lastHeartbeat).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // Reconnect-safe session reconciliation
  // -----------------------------------------------------------------------

  describe('reconcileSession', () => {
    it('registers a brand-new agent on first pairing', () => {
      const result = service.reconcileSession({
        agentId: 'bridge-agent',
        name: 'Bridge Agent',
        platform: 'codex',
        workspaceId: 'ws-1',
        capabilities: ['code-generation'],
      });

      expect(result.isNew).toBe(true);
      expect(result.agent.identity.id).toBe('bridge-agent');
      expect(result.durable.firstSeenAt).toBeTruthy();
      expect(result.durable.reconnectCount).toBe(0);
      expect(result.durable.workspaceIds).toEqual(['ws-1']);
      expect(result.durable.capabilities).toEqual(['code-generation']);
      expect(result.health.online).toBe(true);
      expect(service.list()).toHaveLength(1);
    });

    it('does not duplicate the registry entry on reconnect', () => {
      service.reconcileSession({ agentId: 'bridge-agent', name: 'Bridge Agent', platform: 'codex' });
      service.reconcileSession({ agentId: 'bridge-agent' });
      service.reconcileSession({ agentId: 'bridge-agent' });

      expect(service.list()).toHaveLength(1);
    });

    it('preserves firstSeenAt and increments reconnectCount across reconnects', () => {
      const first = service.reconcileSession({
        agentId: 'bridge-agent',
        name: 'Bridge Agent',
        platform: 'codex',
      });
      const second = service.reconcileSession({ agentId: 'bridge-agent' });
      const third = service.reconcileSession({ agentId: 'bridge-agent' });

      expect(second.durable.firstSeenAt).toBe(first.durable.firstSeenAt);
      expect(third.durable.firstSeenAt).toBe(first.durable.firstSeenAt);
      expect(first.durable.reconnectCount).toBe(0);
      expect(second.durable.reconnectCount).toBe(1);
      expect(third.durable.reconnectCount).toBe(2);
    });

    it('reuses the existing identity on reconnect even if payload omits/changes it', () => {
      service.reconcileSession({
        agentId: 'bridge-agent',
        name: 'Original Name',
        platform: 'codex',
      });
      // Reconnect with a different platform/name — identity must stay stable.
      const result = service.reconcileSession({
        agentId: 'bridge-agent',
        name: 'New Name',
        platform: 'claude_code',
      });

      expect(result.isNew).toBe(false);
      expect(result.agent.identity.name).toBe('Original Name');
      expect(result.agent.identity.platform).toBe('codex');
    });

    it('accumulates workspace membership without duplicates', () => {
      service.reconcileSession({ agentId: 'bridge-agent', platform: 'codex', workspaceId: 'ws-1' });
      service.reconcileSession({ agentId: 'bridge-agent', workspaceId: 'ws-2' });
      const result = service.reconcileSession({ agentId: 'bridge-agent', workspaceId: 'ws-1' });

      expect(result.durable.workspaceIds).toEqual(['ws-1', 'ws-2']);
    });

    it('refreshes last-seen / health on reconnect after going stale', () => {
      service.reconcileSession({ agentId: 'bridge-agent', platform: 'codex' });
      // Force the heartbeat stale.
      const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      (service as any).heartbeats.set('bridge-agent', staleTime);
      expect(service.getHealth('bridge-agent').online).toBe(false);

      const result = service.reconcileSession({ agentId: 'bridge-agent' });
      expect(result.health.online).toBe(true);
      expect(service.getHealth('bridge-agent').online).toBe(true);
    });

    it('updates capabilities only when new ones are reported', () => {
      service.reconcileSession({
        agentId: 'bridge-agent',
        platform: 'codex',
        capabilities: ['a', 'b'],
      });
      // Reconnect without capabilities — should retain prior ones.
      const retained = service.reconcileSession({ agentId: 'bridge-agent' });
      expect(retained.durable.capabilities).toEqual(['a', 'b']);

      // Reconnect with new capabilities — should replace.
      const replaced = service.reconcileSession({
        agentId: 'bridge-agent',
        capabilities: ['c'],
      });
      expect(replaced.durable.capabilities).toEqual(['c']);
    });

    it('exposes durable identity through getWithHealth', () => {
      service.reconcileSession({ agentId: 'bridge-agent', platform: 'codex', workspaceId: 'ws-1' });
      const withHealth = service.getWithHealth('bridge-agent');
      expect(withHealth).toBeDefined();
      expect(withHealth!.durable).toBeDefined();
      expect(withHealth!.durable!.workspaceIds).toEqual(['ws-1']);
    });

    it('clears durable identity on unregister', () => {
      service.reconcileSession({ agentId: 'bridge-agent', platform: 'codex' });
      expect(service.getDurableIdentity('bridge-agent')).toBeDefined();
      service.unregister('bridge-agent');
      expect(service.getDurableIdentity('bridge-agent')).toBeUndefined();
    });

    it('throws on empty agentId', () => {
      expect(() => service.reconcileSession({ agentId: '   ' })).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Durable identity persistence (round-trip across restart)
  // -----------------------------------------------------------------------

  describe('durable identity persistence', () => {
    it('persists durable identities so they survive a restart', () => {
      service.reconcileSession({
        agentId: 'bridge-agent',
        name: 'Bridge Agent',
        platform: 'codex',
        workspaceId: 'ws-1',
        capabilities: ['code-generation'],
      });
      service.reconcileSession({ agentId: 'bridge-agent', workspaceId: 'ws-2' });

      const original = service.getDurableIdentity('bridge-agent');
      expect(original).toBeDefined();
      expect(original!.reconnectCount).toBe(1);
      expect(original!.workspaceIds).toEqual(['ws-1', 'ws-2']);

      // Simulate a process restart: a fresh service must hydrate from the
      // persisted store (mocked in-memory) without re-running reconcile.
      const restarted = new AgentRegistryService();
      const hydrated = restarted.getDurableIdentity('bridge-agent');
      expect(hydrated).toBeDefined();
      expect(hydrated!.firstSeenAt).toBe(original!.firstSeenAt);
      expect(hydrated!.reconnectCount).toBe(original!.reconnectCount);
      expect(hydrated!.workspaceIds).toEqual(['ws-1', 'ws-2']);
      expect(hydrated!.capabilities).toEqual(['code-generation']);
    });

    it('continues the reconnect chain after a restart instead of resetting', () => {
      const first = service.reconcileSession({ agentId: 'bridge-agent', platform: 'codex' });
      service.reconcileSession({ agentId: 'bridge-agent' }); // reconnectCount -> 1

      const restarted = new AgentRegistryService();
      const afterRestart = restarted.reconcileSession({ agentId: 'bridge-agent' });

      // The in-memory registry entry is rebuilt on restart (so `isNew` is true),
      // but reconnect-safety still holds: the firstSeenAt anchor is preserved and
      // the reconnectCount keeps climbing from the hydrated durable identity
      // rather than resetting to zero.
      expect(afterRestart.durable.firstSeenAt).toBe(first.durable.firstSeenAt);
      expect(afterRestart.durable.reconnectCount).toBe(2);
    });

    it('removes the durable identity from the persisted store on unregister', () => {
      service.reconcileSession({ agentId: 'bridge-agent', platform: 'codex' });
      expect(durableStore.entries.some(([id]) => id === 'bridge-agent')).toBe(true);

      service.unregister('bridge-agent');
      expect(durableStore.entries.some(([id]) => id === 'bridge-agent')).toBe(false);

      // A restart must not resurrect the removed identity.
      const restarted = new AgentRegistryService();
      expect(restarted.getDurableIdentity('bridge-agent')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Reserved default-agent id collision (security)
  // -----------------------------------------------------------------------

  describe('reserved agentId collision', () => {
    const reservedId = DEFAULT_AGENTS[0].id; // e.g. 'recoder-web'

    it('rejects a non-admin caller claiming a reserved default agent id', () => {
      expect(() =>
        service.reconcileSession({ agentId: reservedId, platform: 'codex' }),
      ).toThrow(ReservedAgentIdError);
      // No phantom registry entry should have been created.
      expect(service.getDurableIdentity(reservedId)).toBeUndefined();
    });

    it('rejects every pre-registered default agent id for non-admin callers', () => {
      for (const config of DEFAULT_AGENTS) {
        expect(() =>
          service.reconcileSession({ agentId: config.id }),
        ).toThrow(ReservedAgentIdError);
      }
    });

    it('allows an admin-level caller to claim a reserved default agent id', () => {
      const result = service.reconcileSession({
        agentId: reservedId,
        platform: 'recoder_web',
        callerIsAdmin: true,
      });
      expect(result.agent.identity.id).toBe(reservedId);
      expect(service.getDurableIdentity(reservedId)).toBeDefined();
    });

    it('allows subsequent non-admin reconnects once the identity is owned', () => {
      // Admin claims it first (creates durable identity)...
      service.reconcileSession({
        agentId: reservedId,
        platform: 'recoder_web',
        callerIsAdmin: true,
      });
      // ...then a non-admin heartbeat for the already-owned id is permitted.
      const result = service.reconcileSession({ agentId: reservedId });
      expect(result.isNew).toBe(false);
      expect(result.durable.reconnectCount).toBe(1);
    });

    it('does not reject non-reserved external agent ids', () => {
      expect(() =>
        service.reconcileSession({ agentId: 'external-coding-agent', platform: 'codex' }),
      ).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Self-registration
  // -----------------------------------------------------------------------

  describe('selfRegister', () => {
    it('registers with minimal config using platform defaults', () => {
      const agent = service.selfRegister(makeSelfRegisterInput());
      expect(agent.identity.id).toBe('self-agent');
      expect(agent.identity.platform).toBe('recoder_web');
      expect(agent.protocol).toBe('rest');
      expect(agent.tier).toBe('tier1');
      expect(agent.card.description).toBe('Recoder Web application');
      expect(agent.card.skills.length).toBeGreaterThan(0);
    });

    it('allows overriding description, url, version', () => {
      const agent = service.selfRegister(makeSelfRegisterInput({
        description: 'Custom description',
        url: 'http://custom.local',
        version: '2.0.0',
      }));
      expect(agent.card.description).toBe('Custom description');
      expect(agent.card.url).toBe('http://custom.local');
      expect(agent.card.version).toBe('2.0.0');
    });

    it('allows overriding skills and tags', () => {
      const agent = service.selfRegister(makeSelfRegisterInput({
        skills: [
          { id: 'custom-skill', name: 'Custom', description: 'Custom skill', tags: ['custom'] },
        ],
        tags: ['custom-tag'],
      }));
      expect(agent.card.skills).toHaveLength(1);
      expect(agent.card.skills[0].id).toBe('custom-skill');
      expect(agent.tags).toEqual(['custom-tag']);
    });

    it('uses codex defaults for codex platform', () => {
      const agent = service.selfRegister(makeSelfRegisterInput({
        agentId: 'codex-agent',
        name: 'Codex Agent',
        platform: 'codex',
      }));
      expect(agent.protocol).toBe('jsonrpc');
      expect(agent.tier).toBe('tier1');
    });

    it('uses mcp defaults for claude_code platform', () => {
      const agent = service.selfRegister(makeSelfRegisterInput({
        agentId: 'claude-agent',
        name: 'Claude Agent',
        platform: 'claude_code',
      }));
      expect(agent.protocol).toBe('mcp');
      expect(agent.tier).toBe('tier1');
    });
  });

  // -----------------------------------------------------------------------
  // Default agent registration
  // -----------------------------------------------------------------------

  describe('registerDefaults', () => {
    it('registers all default agents', () => {
      service.registerDefaults();
      const agents = service.list();
      expect(agents.length).toBe(DEFAULT_AGENTS.length);
    });

    it('registers recoder-web with correct platform', () => {
      service.registerDefaults();
      const web = service.get('recoder-web');
      expect(web).toBeDefined();
      expect(web!.identity.platform).toBe('recoder_web');
      expect(web!.protocol).toBe('rest');
    });

    it('registers recoder-agency with correct platform', () => {
      service.registerDefaults();
      const agency = service.get('recoder-agency');
      expect(agency).toBeDefined();
      expect(agency!.identity.platform).toBe('recoder_agency');
    });

    it('registers recoder-studio as custom platform', () => {
      service.registerDefaults();
      const studio = service.get('recoder-studio');
      expect(studio).toBeDefined();
      expect(studio!.identity.platform).toBe('custom');
    });

    it('registers recoder-pm with correct platform', () => {
      service.registerDefaults();
      const pm = service.get('recoder-pm');
      expect(pm).toBeDefined();
      expect(pm!.identity.platform).toBe('recoder_pm');
    });

    it('registers openclaw as custom platform', () => {
      service.registerDefaults();
      const openclaw = service.get('openclaw');
      expect(openclaw).toBeDefined();
      expect(openclaw!.identity.platform).toBe('custom');
    });

    it('all default agents have skills and tags', () => {
      service.registerDefaults();
      for (const config of DEFAULT_AGENTS) {
        const agent = service.get(config.id);
        expect(agent).toBeDefined();
        expect(agent!.card.skills.length).toBeGreaterThan(0);
        expect(agent!.tags.length).toBeGreaterThan(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Singleton
  // -----------------------------------------------------------------------

  describe('singleton', () => {
    it('getAgentRegistryService returns same instance', () => {
      const a = getAgentRegistryService();
      const b = getAgentRegistryService();
      expect(a).toBe(b);
    });

    it('singleton pre-registers default agents', () => {
      const svc = getAgentRegistryService();
      const agents = svc.list();
      expect(agents.length).toBeGreaterThanOrEqual(DEFAULT_AGENTS.length);
    });

    it('resetAgentRegistryService creates fresh instance', () => {
      const a = getAgentRegistryService();
      resetAgentRegistryService();
      const b = getAgentRegistryService();
      expect(a).not.toBe(b);
    });
  });
});

// ===========================================================================
// Validation middleware
// ===========================================================================

describe('Agent Registry Middleware', () => {
  // -----------------------------------------------------------------------
  // validateRegisterBody
  // -----------------------------------------------------------------------

  describe('validateRegisterBody', () => {
    it('passes valid body', () => {
      const req = makeMockReq({
        identity: { id: 'a', name: 'A', platform: 'custom' },
        card: {
          name: 'A',
          description: 'Desc',
          version: '1.0.0',
          url: 'http://localhost',
          skills: [],
          capabilities: { streaming: false, pushNotifications: false },
        },
        protocol: 'rest',
        tier: 'tier1',
        tags: [],
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateRegisterBody(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('rejects missing identity', () => {
      const req = makeMockReq({
        card: { name: 'A', description: 'D', version: '1', skills: [], capabilities: {} },
        protocol: 'rest',
        tier: 'tier1',
        tags: [],
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateRegisterBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
      expect(res._data.success).toBe(false);
    });

    it('rejects invalid platform in identity', () => {
      const req = makeMockReq({
        identity: { id: 'a', name: 'A', platform: 'invalid_platform' },
        card: { name: 'A', description: 'D', version: '1', skills: [], capabilities: {} },
        protocol: 'rest',
        tier: 'tier1',
        tags: [],
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateRegisterBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('rejects invalid protocol', () => {
      const req = makeMockReq({
        identity: { id: 'a', name: 'A', platform: 'custom' },
        card: { name: 'A', description: 'D', version: '1', skills: [], capabilities: {} },
        protocol: 'invalid',
        tier: 'tier1',
        tags: [],
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateRegisterBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('rejects invalid tier', () => {
      const req = makeMockReq({
        identity: { id: 'a', name: 'A', platform: 'custom' },
        card: { name: 'A', description: 'D', version: '1', skills: [], capabilities: {} },
        protocol: 'rest',
        tier: 'tier3',
        tags: [],
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateRegisterBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('rejects non-array tags', () => {
      const req = makeMockReq({
        identity: { id: 'a', name: 'A', platform: 'custom' },
        card: { name: 'A', description: 'D', version: '1', skills: [], capabilities: {} },
        protocol: 'rest',
        tier: 'tier1',
        tags: 'not-an-array',
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateRegisterBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('rejects non-string elements in tags', () => {
      const req = makeMockReq({
        identity: { id: 'a', name: 'A', platform: 'custom' },
        card: { name: 'A', description: 'D', version: '1', skills: [], capabilities: {} },
        protocol: 'rest',
        tier: 'tier1',
        tags: [123],
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateRegisterBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('rejects non-object body', () => {
      const req = makeMockReq('invalid');
      const res = makeMockRes();
      const next = makeMockNext();

      validateRegisterBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('rejects missing card fields', () => {
      const req = makeMockReq({
        identity: { id: 'a', name: 'A', platform: 'custom' },
        card: { name: 'A' }, // missing description, version, skills, capabilities
        protocol: 'rest',
        tier: 'tier1',
        tags: [],
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateRegisterBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
      expect(res._data.error.details.validation_issues.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // validateSelfRegisterBody
  // -----------------------------------------------------------------------

  describe('validateSelfRegisterBody', () => {
    it('passes valid minimal body', () => {
      const req = makeMockReq({
        agentId: 'agent-1',
        name: 'Agent 1',
        platform: 'recoder_web',
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateSelfRegisterBody(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('passes valid body with all optional fields', () => {
      const req = makeMockReq({
        agentId: 'agent-1',
        name: 'Agent 1',
        platform: 'custom',
        url: 'http://localhost',
        description: 'Custom agent',
        version: '2.0.0',
        tags: ['a', 'b'],
        skills: [
          { id: 's', name: 'S', description: 'D', tags: ['t'] },
        ],
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateSelfRegisterBody(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('rejects missing agentId', () => {
      const req = makeMockReq({ name: 'A', platform: 'custom' });
      const res = makeMockRes();
      const next = makeMockNext();

      validateSelfRegisterBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('rejects missing name', () => {
      const req = makeMockReq({ agentId: 'a', platform: 'custom' });
      const res = makeMockRes();
      const next = makeMockNext();

      validateSelfRegisterBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('rejects invalid platform', () => {
      const req = makeMockReq({ agentId: 'a', name: 'A', platform: 'invalid' });
      const res = makeMockRes();
      const next = makeMockNext();

      validateSelfRegisterBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('rejects invalid skills structure', () => {
      const req = makeMockReq({
        agentId: 'a',
        name: 'A',
        platform: 'custom',
        skills: [{ id: 's' }], // missing name, description, tags
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateSelfRegisterBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('rejects non-object body', () => {
      const req = makeMockReq(null);
      const res = makeMockRes();
      const next = makeMockNext();

      validateSelfRegisterBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // validateDiscoveryQuery
  // -----------------------------------------------------------------------

  describe('validateDiscoveryQuery', () => {
    it('passes with no query params', () => {
      const req = makeMockReq(undefined, undefined, {});
      const res = makeMockRes();
      const next = makeMockNext();

      validateDiscoveryQuery(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('passes with valid query params', () => {
      const req = makeMockReq(undefined, undefined, {
        protocol: 'rest',
        platform: 'custom',
        tier: 'tier1',
        status: 'supported',
        skillTag: 'web',
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateDiscoveryQuery(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('rejects invalid protocol', () => {
      const req = makeMockReq(undefined, undefined, { protocol: 'invalid' });
      const res = makeMockRes();
      const next = makeMockNext();

      validateDiscoveryQuery(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('rejects invalid platform', () => {
      const req = makeMockReq(undefined, undefined, { platform: 'invalid' });
      const res = makeMockRes();
      const next = makeMockNext();

      validateDiscoveryQuery(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('rejects invalid tier', () => {
      const req = makeMockReq(undefined, undefined, { tier: 'tier99' });
      const res = makeMockRes();
      const next = makeMockNext();

      validateDiscoveryQuery(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('rejects invalid status', () => {
      const req = makeMockReq(undefined, undefined, { status: 'invalid' });
      const res = makeMockRes();
      const next = makeMockNext();

      validateDiscoveryQuery(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('rejects empty skillTag', () => {
      const req = makeMockReq(undefined, undefined, { skillTag: '  ' });
      const res = makeMockRes();
      const next = makeMockNext();

      validateDiscoveryQuery(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // parseJsonTextBody
  // -----------------------------------------------------------------------

  describe('parseJsonTextBody', () => {
    it('parses string body into JSON', () => {
      const req = makeMockReq('{"key":"value"}');
      const res = makeMockRes();
      const next = makeMockNext();

      parseJsonTextBody(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.body).toEqual({ key: 'value' });
    });

    it('passes through non-string body', () => {
      const body = { key: 'value' };
      const req = makeMockReq(body);
      const res = makeMockRes();
      const next = makeMockNext();

      parseJsonTextBody(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.body).toBe(body);
    });

    it('rejects invalid JSON string', () => {
      const req = makeMockReq('not valid json');
      const res = makeMockRes();
      const next = makeMockNext();

      parseJsonTextBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });
  });
});

// ===========================================================================
// Full integration workflow
// ===========================================================================

describe('Agent Registry Workflow', () => {
  let service: AgentRegistryService;

  beforeEach(() => {
    resetAgentRegistryService();
    durableStore.entries = [];
    service = new AgentRegistryService();
  });

  it('complete lifecycle: register -> discover -> heartbeat -> health -> unregister', () => {
    // 1. Register
    const agent = service.register(makeRegisterInput({
      identity: { id: 'lifecycle-agent', name: 'Lifecycle Agent', platform: 'recoder_web' },
      protocol: 'rest',
      tags: ['lifecycle'],
    }));
    expect(agent.identity.id).toBe('lifecycle-agent');

    // 2. Discover by platform
    const discovered = service.discover({ platform: 'recoder_web' });
    expect(discovered).toHaveLength(1);
    expect(discovered[0].identity.id).toBe('lifecycle-agent');

    // 3. Discover by tag
    const byTag = service.discover({ skillTag: 'lifecycle' });
    expect(byTag).toHaveLength(1);

    // 4. Check health (should be online after registration)
    const health = service.getHealth('lifecycle-agent');
    expect(health.online).toBe(true);

    // 5. Record heartbeat
    expect(service.recordHeartbeat('lifecycle-agent')).toBe(true);

    // 6. Get with health
    const withHealth = service.getWithHealth('lifecycle-agent');
    expect(withHealth).toBeDefined();
    expect(withHealth!.health.online).toBe(true);

    // 7. Unregister
    expect(service.unregister('lifecycle-agent')).toBe(true);

    // 8. Verify removal
    expect(service.get('lifecycle-agent')).toBeUndefined();
    expect(service.discover({ platform: 'recoder_web' })).toHaveLength(0);
  });

  it('self-register then discover by generated card properties', () => {
    // Self-register a web agent
    const agent = service.selfRegister({
      agentId: 'my-web-agent',
      name: 'My Web Agent',
      platform: 'recoder_web',
      tags: ['custom-tag'],
    });

    expect(agent.identity.id).toBe('my-web-agent');
    expect(agent.protocol).toBe('rest');

    // Discover by protocol
    const byProtocol = service.discover({ protocol: 'rest' });
    expect(byProtocol.some(a => a.identity.id === 'my-web-agent')).toBe(true);

    // Discover by custom tag
    const byTag = service.discover({ skillTag: 'custom-tag' });
    expect(byTag).toHaveLength(1);
    expect(byTag[0].identity.id).toBe('my-web-agent');
  });

  it('default agents are discoverable by their platform', () => {
    service.registerDefaults();

    // recoder-web should be discoverable by platform
    const webAgents = service.discover({ platform: 'recoder_web' });
    expect(webAgents.some(a => a.identity.id === 'recoder-web')).toBe(true);

    // recoder-pm should be discoverable
    const pmAgents = service.discover({ platform: 'recoder_pm' });
    expect(pmAgents.some(a => a.identity.id === 'recoder-pm')).toBe(true);

    // recoder-agency should be discoverable
    const agencyAgents = service.discover({ platform: 'recoder_agency' });
    expect(agencyAgents.some(a => a.identity.id === 'recoder-agency')).toBe(true);

    // custom platform should have recoder-studio and openclaw
    const customAgents = service.discover({ platform: 'custom' });
    expect(customAgents.length).toBeGreaterThanOrEqual(2);
    expect(customAgents.some(a => a.identity.id === 'recoder-studio')).toBe(true);
    expect(customAgents.some(a => a.identity.id === 'openclaw')).toBe(true);
  });

  it('default agents are all online after registration', () => {
    service.registerDefaults();

    for (const config of DEFAULT_AGENTS) {
      const health = service.getHealth(config.id);
      expect(health.online).toBe(true);
      expect(health.lastHeartbeat).toBeTruthy();
    }
  });
});
