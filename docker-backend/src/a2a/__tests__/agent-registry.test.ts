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

const persistenceMocks = vi.hoisted(() => ({
  loadA2AAgentRegistryState: vi.fn(() => ({
    agents: new Map(),
    heartbeats: new Map(),
    lifecycle: new Map(),
  })),
  saveA2AAgentRegistryState: vi.fn(),
}));

vi.mock('../a2a-persistence', () => ({
  loadA2AAgentRegistryState: persistenceMocks.loadA2AAgentRegistryState,
  saveA2AAgentRegistryState: persistenceMocks.saveA2AAgentRegistryState,
}));

import {
  AgentRegistryService,
  getAgentRegistryService,
  resetAgentRegistryService,
  DEFAULT_AGENTS,
  type RegisterAgentInput,
  type SelfRegisterInput,
} from '../agent-registry.service';
import { getHeartbeatTracker, resetHeartbeatTracker } from '../heartbeat-tracker.service';
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
    platform: 'recoder_app',
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
    persistenceMocks.loadA2AAgentRegistryState.mockReset();
    persistenceMocks.loadA2AAgentRegistryState.mockReturnValue({
      agents: new Map(),
      heartbeats: new Map(),
      lifecycle: new Map(),
    });
    persistenceMocks.saveA2AAgentRegistryState.mockReset();
    resetHeartbeatTracker();
    resetAgentRegistryService();
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
      expect(persistenceMocks.saveA2AAgentRegistryState).toHaveBeenCalled();
    });

    it('sets a heartbeat on registration', () => {
      service.register(makeRegisterInput());
      const health = service.getHealth('test-agent');
      expect(health.online).toBe(true);
      expect(health.lastHeartbeat).toBeTruthy();
      expect(getHeartbeatTracker().getRecord('test-agent')).toMatchObject({
        agentId: 'test-agent',
        metadata: expect.objectContaining({ source: 'registry' }),
      });
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
      expect(persistenceMocks.saveA2AAgentRegistryState).toHaveBeenCalled();
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
      expect(agentWithHealth!.lifecycle.registrationCount).toBe(1);
      expect(agentWithHealth!.lifecycle.reconnectCount).toBe(0);
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
        identity: { id: 'agent-rest', name: 'REST Agent', platform: 'recoder_app' },
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
      const before = service.getLifecycle('test-agent');
      const result = service.recordHeartbeat('test-agent');
      expect(result).toBe(true);
      const health = service.getHealth('test-agent');
      expect(health.online).toBe(true);
      const after = service.getLifecycle('test-agent');
      expect(after?.lastSeenAt).toBeTruthy();
      expect(after?.firstRegisteredAt).toBe(before?.firstRegisteredAt);
      expect(after?.lastSeenAt).toBe(health.lastHeartbeat);
      expect(persistenceMocks.saveA2AAgentRegistryState).toHaveBeenCalled();
    });

    it('tracks reconnect lifecycle metadata for repeated registration of the same agent id', () => {
      service.register(makeRegisterInput({
        identity: { id: 'repeat-agent', name: 'Repeat Agent', platform: 'custom', instanceId: 'inst-1' },
      }));
      const firstLifecycle = service.getLifecycle('repeat-agent');

      service.register(makeRegisterInput({
        identity: { id: 'repeat-agent', name: 'Repeat Agent', platform: 'custom', instanceId: 'inst-2' },
      }));
      const secondLifecycle = service.getLifecycle('repeat-agent');

      expect(firstLifecycle).toBeDefined();
      expect(secondLifecycle).toBeDefined();
      expect(secondLifecycle?.firstRegisteredAt).toBe(firstLifecycle?.firstRegisteredAt);
      expect(secondLifecycle?.registrationCount).toBe(2);
      expect(secondLifecycle?.reconnectCount).toBe(1);
      expect(secondLifecycle?.lastInstanceId).toBe('inst-2');
    });

    it('agent goes offline after heartbeat timeout', () => {
      service.register(makeRegisterInput());
      const trackerRecord = getHeartbeatTracker().getRecord('test-agent');
      expect(trackerRecord).toBeDefined();
      trackerRecord!.lastHeartbeatAt = Date.now() - 10 * 60 * 1000;
      trackerRecord!.isOnline = false;

      const health = service.getHealth('test-agent');
      expect(health.online).toBe(false);
      expect(health.lastHeartbeat).toBe(new Date(trackerRecord!.lastHeartbeatAt).toISOString());
    });

    it('getHealth returns empty/offline for unknown agent', () => {
      const health = service.getHealth('unknown');
      expect(health.online).toBe(false);
      expect(health.lastHeartbeat).toBe('');
    });
  });

  describe('persistence', () => {
    it('hydrates persisted agents and heartbeats on startup', () => {
      const persistedAgent = makeRegisterInput({
        identity: { id: 'persisted-agent', name: 'Persisted Agent', platform: 'codex' },
        protocol: 'jsonrpc',
      });
      const persistedHeartbeat = new Date(Date.now() - 60_000).toISOString();

      persistenceMocks.loadA2AAgentRegistryState.mockReturnValueOnce({
        agents: new Map([['persisted-agent', {
          identity: persistedAgent.identity,
          card: persistedAgent.card,
          protocol: persistedAgent.protocol,
          tier: persistedAgent.tier,
          status: 'supported',
          tags: persistedAgent.tags,
        } satisfies RegisteredAgent]]),
        heartbeats: new Map([['persisted-agent', persistedHeartbeat]]),
        lifecycle: new Map([['persisted-agent', {
          firstRegisteredAt: persistedHeartbeat,
          lastRegisteredAt: persistedHeartbeat,
          lastSeenAt: persistedHeartbeat,
          reconnectCount: 2,
          registrationCount: 3,
          lastInstanceId: 'persisted-instance',
        }]]),
      });

      const hydrated = new AgentRegistryService();

      expect(hydrated.get('persisted-agent')).toMatchObject({
        identity: { id: 'persisted-agent', platform: 'codex' },
        protocol: 'jsonrpc',
      });
      expect(hydrated.getHealth('persisted-agent')).toMatchObject({
        lastHeartbeat: persistedHeartbeat,
        online: true,
      });
      expect(hydrated.getLifecycle('persisted-agent')).toMatchObject({
        reconnectCount: 2,
        registrationCount: 3,
        lastInstanceId: 'persisted-instance',
      });
    });

    it('backfills lifecycle metadata for older persisted registry snapshots', () => {
      const persistedHeartbeat = new Date(Date.now() - 60_000).toISOString();
      persistenceMocks.loadA2AAgentRegistryState.mockReturnValueOnce({
        agents: new Map([['legacy-agent', {
          identity: { id: 'legacy-agent', name: 'Legacy Agent', platform: 'custom' },
          card: makeRegisterInput().card,
          protocol: 'rest',
          tier: 'tier1',
          status: 'supported',
          tags: ['legacy'],
        } satisfies RegisteredAgent]]),
        heartbeats: new Map([['legacy-agent', persistedHeartbeat]]),
        lifecycle: new Map(),
      });

      const hydrated = new AgentRegistryService();
      expect(hydrated.getLifecycle('legacy-agent')).toMatchObject({
        firstRegisteredAt: persistedHeartbeat,
        lastRegisteredAt: persistedHeartbeat,
        lastSeenAt: persistedHeartbeat,
        reconnectCount: 0,
        registrationCount: 1,
      });
    });

    it('persists updated registry snapshots after register, heartbeat, and unregister', () => {
      service.register(makeRegisterInput());
      service.recordHeartbeat('test-agent');
      service.unregister('test-agent');

      const calls = persistenceMocks.saveA2AAgentRegistryState.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(3);

      const firstSnapshot = calls[0]?.[0];
      expect(firstSnapshot.agents.get('test-agent')).toMatchObject({
        identity: { id: 'test-agent' },
      });
      expect(firstSnapshot.heartbeats.get('test-agent')).toBeTruthy();
      expect(firstSnapshot.lifecycle.get('test-agent')).toMatchObject({
        registrationCount: 1,
        reconnectCount: 0,
      });

      const lastSnapshot = calls[calls.length - 1]?.[0];
      expect(lastSnapshot.agents.has('test-agent')).toBe(false);
      expect(lastSnapshot.heartbeats.has('test-agent')).toBe(false);
      expect(lastSnapshot.lifecycle.has('test-agent')).toBe(false);
    });

    it('prefers heartbeat tracker state over the persisted registry heartbeat map', () => {
      service.register(makeRegisterInput({
        identity: { id: 'tracked-agent', name: 'Tracked Agent', platform: 'custom' },
      }));
      const trackerRecord = getHeartbeatTracker().getRecord('tracked-agent');
      expect(trackerRecord).toBeDefined();
      trackerRecord!.lastHeartbeatAt = Date.now() - 30_000;

      const staleRegistryHeartbeat = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      (service as any).heartbeats.set('tracked-agent', staleRegistryHeartbeat);

      const health = service.getHealth('tracked-agent');
      expect(health.online).toBe(true);
      expect(health.lastHeartbeat).toBe(new Date(trackerRecord!.lastHeartbeatAt).toISOString());
    });
  });

  // -----------------------------------------------------------------------
  // Self-registration
  // -----------------------------------------------------------------------

  describe('selfRegister', () => {
    it('registers with minimal config using platform defaults', () => {
      const agent = service.selfRegister(makeSelfRegisterInput());
      expect(agent.identity.id).toBe('self-agent');
      expect(agent.identity.platform).toBe('recoder_app');
      expect(agent.protocol).toBe('rest');
      expect(agent.tier).toBe('tier1');
      expect(agent.card.description).toBe('Recoder App application');
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
      const web = service.get('recoder-app');
      expect(web).toBeDefined();
      expect(web!.identity.platform).toBe('recoder_app');
      expect(web!.protocol).toBe('rest');
    });

    it('does not register the deprecated recoder-agency surface', () => {
      service.registerDefaults();
      const agency = service.get('recoder-agency');
      expect(agency).toBeUndefined();
    });

    it('registers recoder-studio as custom platform', () => {
      service.registerDefaults();
      const studio = service.get('recoder-studio');
      expect(studio).toBeDefined();
      expect(studio!.identity.platform).toBe('custom');
    });

    it('does not register the deprecated recoder-pm surface', () => {
      service.registerDefaults();
      const pm = service.get('recoder-pm');
      expect(pm).toBeUndefined();
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
        platform: 'recoder_app',
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
    service = new AgentRegistryService();
  });

  it('complete lifecycle: register -> discover -> heartbeat -> health -> unregister', () => {
    // 1. Register
    const agent = service.register(makeRegisterInput({
      identity: { id: 'lifecycle-agent', name: 'Lifecycle Agent', platform: 'recoder_app' },
      protocol: 'rest',
      tags: ['lifecycle'],
    }));
    expect(agent.identity.id).toBe('lifecycle-agent');

    // 2. Discover by platform
    const discovered = service.discover({ platform: 'recoder_app' });
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
    expect(withHealth!.lifecycle.registrationCount).toBe(1);

    // 6b. Discover with health should include lifecycle metadata
    const enrichedDiscovery = service.discoverWithHealth({ platform: 'recoder_app' });
    expect(enrichedDiscovery[0]?.lifecycle.lastSeenAt).toBeTruthy();

    // 7. Unregister
    expect(service.unregister('lifecycle-agent')).toBe(true);

    // 8. Verify removal
    expect(service.get('lifecycle-agent')).toBeUndefined();
    expect(service.discover({ platform: 'recoder_app' })).toHaveLength(0);
  });

  it('self-register then discover by generated card properties', () => {
    // Self-register a web agent
    const agent = service.selfRegister({
      agentId: 'my-web-agent',
      name: 'My Web Agent',
      platform: 'recoder_app',
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
    const webAgents = service.discover({ platform: 'recoder_app' });
    expect(webAgents.some(a => a.identity.id === 'recoder-app')).toBe(true);

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
