/**
 * @module assignment-router.test
 *
 * Test suite for the AssignmentRouterService.
 *
 * Covers the four primary routing dimensions:
 * - **Capability match** — agents are ranked by capability score.
 * - **Assignee override** — an explicit assignee is honoured over scoring.
 * - **Policy filtering** — only workspace members are eligible.
 * - **Health preference** — online/healthy agents are preferred (and gated
 *   when the policy requires healthy agents).
 *
 * Plus: A2A intent matching and runtime-lane-as-secondary-metadata.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AssignmentRouterService,
  getAssignmentRouterService,
  resetAssignmentRouterService,
  type WorkspaceRoutingPolicy,
} from '../assignment-router.service';
import {
  AgentRegistryService,
  getAgentRegistryService,
  resetAgentRegistryService,
  type RegisterAgentInput,
} from '../agent-registry.service';
import {
  CapabilityMatcherService,
  resetCapabilityMatcher,
} from '../capability-matcher.service';
import { getWorkspaceService, resetWorkspaceService } from '../workspace.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function registerAgent(
  service: AgentRegistryService,
  id: string,
  name: string,
  platform: RegisterAgentInput['identity']['platform'],
  tier: RegisterAgentInput['tier'],
  skillIds: string[],
  tags: string[] = [],
): void {
  service.register({
    identity: { id, name, platform },
    card: {
      name,
      description: `${name} description`,
      protocolVersion: '0.3.0',
      version: '1.0.0',
      url: `http://${id}.local`,
      skills: skillIds.map((sid) => ({
        id: sid,
        name: sid,
        description: `${sid} skill`,
        tags: [sid],
      })),
      capabilities: { streaming: false, pushNotifications: false },
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
    },
    protocol: 'rest',
    tier,
    tags,
  });
}

/** Policy that allows the given ids and does not require health. */
function policyFor(...ids: string[]): WorkspaceRoutingPolicy {
  return { memberAgentIds: ids };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AssignmentRouterService', () => {
  let registry: AgentRegistryService;
  let matcher: CapabilityMatcherService;
  let router: AssignmentRouterService;

  beforeEach(() => {
    resetAgentRegistryService();
    resetCapabilityMatcher();
    resetWorkspaceService();
    resetAssignmentRouterService();

    // Singleton registry seeds defaults — strip them for a clean slate.
    registry = getAgentRegistryService();
    for (const agent of registry.list()) {
      registry.unregister(agent.identity.id);
    }

    // Matcher reads the singleton registry; share that instance.
    matcher = new CapabilityMatcherService();
    router = new AssignmentRouterService(registry, matcher, getWorkspaceService());
  });

  // =========================================================================
  // Capability match
  // =========================================================================

  describe('capability match', () => {
    it('selects the agent with the higher capability score', () => {
      registerAgent(registry, 'low', 'Low', 'custom', 'tier2', ['code-gen']);
      registerAgent(registry, 'high', 'High', 'custom', 'tier2', ['code-gen', 'testing']);

      const decision = router.routeWithPolicy(
        { requiredCapabilities: ['code-gen', 'testing'] },
        policyFor('low', 'high'),
      );

      expect(decision.agentId).toBe('high');
      expect(decision.viaExplicitAssignee).toBe(false);
      // Runtime lane is recorded as secondary metadata, not the selector.
      expect(decision.runtime).toEqual({ protocol: 'rest', tier: 'tier2', platform: 'custom' });
    });

    it('excludes agents that match none of the required capabilities', () => {
      registerAgent(registry, 'unrelated', 'Unrelated', 'custom', 'tier2', ['design']);
      registerAgent(registry, 'capable', 'Capable', 'custom', 'tier2', ['code-gen']);

      const decision = router.routeWithPolicy(
        { requiredCapabilities: ['code-gen'] },
        policyFor('unrelated', 'capable'),
      );

      expect(decision.agentId).toBe('capable');
      expect(decision.candidates.map((c) => c.agentId)).not.toContain('unrelated');
    });

    it('returns null when no eligible agent matches required capabilities', () => {
      registerAgent(registry, 'unrelated', 'Unrelated', 'custom', 'tier2', ['design']);

      const decision = router.routeWithPolicy(
        { requiredCapabilities: ['code-gen'] },
        policyFor('unrelated'),
      );

      expect(decision.agentId).toBeNull();
      expect(decision.candidates).toHaveLength(0);
    });
  });

  // =========================================================================
  // Assignee override
  // =========================================================================

  describe('assignee override', () => {
    it('honours an explicit assignee even when another agent scores higher', () => {
      registerAgent(registry, 'best', 'Best', 'codex', 'tier1', ['code-gen', 'testing']);
      registerAgent(registry, 'chosen', 'Chosen', 'custom', 'tier2', ['code-gen']);

      const decision = router.routeWithPolicy(
        { requiredCapabilities: ['code-gen'], assigneeAgentId: 'chosen' },
        policyFor('best', 'chosen'),
      );

      expect(decision.agentId).toBe('chosen');
      expect(decision.viaExplicitAssignee).toBe(true);
    });

    it('rejects an explicit assignee that is not a registered agent', () => {
      const decision = router.routeWithPolicy(
        { assigneeAgentId: 'ghost' },
        policyFor('ghost'),
      );

      expect(decision.agentId).toBeNull();
      expect(decision.viaExplicitAssignee).toBe(true);
      expect(decision.reason).toMatch(/not a registered agent/);
    });

    it('rejects an explicit assignee that is not a workspace member', () => {
      registerAgent(registry, 'outsider', 'Outsider', 'custom', 'tier2', ['code-gen']);

      const decision = router.routeWithPolicy(
        { assigneeAgentId: 'outsider' },
        policyFor('member-only'),
      );

      expect(decision.agentId).toBeNull();
      expect(decision.viaExplicitAssignee).toBe(true);
      expect(decision.reason).toMatch(/not a member/);
    });
  });

  // =========================================================================
  // Policy filtering
  // =========================================================================

  describe('policy filtering', () => {
    it('only considers agents that are members of the workspace', () => {
      registerAgent(registry, 'member', 'Member', 'custom', 'tier2', ['code-gen']);
      registerAgent(registry, 'nonmember', 'Non Member', 'codex', 'tier1', ['code-gen', 'testing']);

      const decision = router.routeWithPolicy(
        { requiredCapabilities: ['code-gen'] },
        policyFor('member'),
      );

      expect(decision.agentId).toBe('member');
      expect(decision.candidates.map((c) => c.agentId)).toEqual(['member']);
    });

    it('returns null when no registered agent is a workspace member', () => {
      registerAgent(registry, 'a', 'A', 'custom', 'tier2', ['code-gen']);

      const decision = router.routeWithPolicy(
        { requiredCapabilities: ['code-gen'] },
        policyFor('someone-else'),
      );

      expect(decision.agentId).toBeNull();
      expect(decision.reason).toMatch(/members of the workspace/);
    });

    it('fails closed when memberAgentIds is empty (no wildcard to all agents)', () => {
      registerAgent(registry, 'a', 'A', 'custom', 'tier2', ['code-gen']);
      registerAgent(registry, 'b', 'B', 'codex', 'tier1', ['code-gen', 'testing']);

      const decision = router.routeWithPolicy(
        { requiredCapabilities: ['code-gen'] },
        policyFor(), // empty member set
      );

      expect(decision.agentId).toBeNull();
      expect(decision.candidates).toHaveLength(0);
      expect(decision.reason).toMatch(/no member agents/i);
    });

    it('rejects an explicit assignee when memberAgentIds is empty', () => {
      registerAgent(registry, 'outsider', 'Outsider', 'custom', 'tier2', ['code-gen']);

      const decision = router.routeWithPolicy(
        { assigneeAgentId: 'outsider' },
        policyFor(), // empty member set
      );

      expect(decision.agentId).toBeNull();
      expect(decision.viaExplicitAssignee).toBe(true);
      expect(decision.reason).toMatch(/not a member/);
    });

    it('opens routing to all agents only when allowUnrestrictedWhenEmpty is set', () => {
      registerAgent(registry, 'a', 'A', 'custom', 'tier2', ['code-gen']);
      registerAgent(registry, 'b', 'B', 'codex', 'tier1', ['code-gen', 'testing']);

      const decision = router.routeWithPolicy(
        { requiredCapabilities: ['code-gen'] },
        { memberAgentIds: [], allowUnrestrictedWhenEmpty: true },
      );

      expect(decision.agentId).not.toBeNull();
      expect(decision.candidates.length).toBeGreaterThan(0);
    });

    it('route() fails closed for an unknown workspace', () => {
      registerAgent(registry, 'a', 'A', 'custom', 'tier2', ['code-gen']);

      const decision = router.route({ requiredCapabilities: ['code-gen'] }, 'ws_does_not_exist');

      expect(decision.agentId).toBeNull();
    });

    it('uses workspace membership from the workspace service in route()', () => {
      registerAgent(registry, 'member', 'Member', 'custom', 'tier2', ['code-gen']);
      registerAgent(registry, 'nonmember', 'Non Member', 'custom', 'tier2', ['code-gen']);

      const ws = getWorkspaceService().create({
        name: 'Test WS',
        projectId: 'proj-1',
        ownerId: 'owner-1',
        memberAgentIds: ['member'],
      });

      const decision = router.route({ requiredCapabilities: ['code-gen'] }, ws.workspaceId);

      expect(decision.agentId).toBe('member');
    });
  });

  // =========================================================================
  // Health preference
  // =========================================================================

  describe('health preference', () => {
    it('prefers an online agent over an offline one with equal capabilities', () => {
      registerAgent(registry, 'offline', 'Offline', 'custom', 'tier2', ['code-gen']);
      registerAgent(registry, 'online', 'Online', 'custom', 'tier2', ['code-gen']);

      // register() seeds a heartbeat; refresh 'online' and force 'offline' stale
      // via the public health API (deterministic, no private-field access).
      registry.recordHeartbeat('online');
      registry.forceOffline('offline');

      const decision = router.routeWithPolicy(
        { requiredCapabilities: ['code-gen'] },
        policyFor('offline', 'online'),
      );

      expect(decision.agentId).toBe('online');
      const onlineCandidate = decision.candidates.find((c) => c.agentId === 'online');
      const offlineCandidate = decision.candidates.find((c) => c.agentId === 'offline');
      expect(onlineCandidate?.healthy).toBe(true);
      expect(offlineCandidate?.healthy).toBe(false);
      expect(onlineCandidate!.score).toBeGreaterThan(offlineCandidate!.score);
    });

    it('excludes offline agents when the policy requires healthy agents', () => {
      registerAgent(registry, 'offline', 'Offline', 'custom', 'tier2', ['code-gen']);
      registry.forceOffline('offline');

      const decision = router.routeWithPolicy(
        { requiredCapabilities: ['code-gen'] },
        { memberAgentIds: ['offline'], requireHealthy: true },
      );

      expect(decision.agentId).toBeNull();
      expect(decision.reason).toMatch(/online\/healthy/);
    });

    it('rejects an explicit offline assignee when health is required', () => {
      registerAgent(registry, 'offline', 'Offline', 'custom', 'tier2', ['code-gen']);
      registry.forceOffline('offline');

      const decision = router.routeWithPolicy(
        { assigneeAgentId: 'offline' },
        { memberAgentIds: ['offline'], requireHealthy: true },
      );

      expect(decision.agentId).toBeNull();
      expect(decision.reason).toMatch(/offline/);
    });
  });

  // =========================================================================
  // A2A intent matching
  // =========================================================================

  describe('intent match', () => {
    it('prefers an agent that advertises the requested intent via tags', () => {
      // Both equally capable; only 'reviewer' advertises the 'review' intent.
      registerAgent(registry, 'plain', 'Plain', 'custom', 'tier2', ['code-gen']);
      registerAgent(registry, 'reviewer', 'Reviewer', 'custom', 'tier2', ['code-gen'], [
        'intent:review',
      ]);

      const decision = router.routeWithPolicy(
        { requiredCapabilities: ['code-gen'], intent: 'review' },
        policyFor('plain', 'reviewer'),
      );

      expect(decision.agentId).toBe('reviewer');
      const reviewer = decision.candidates.find((c) => c.agentId === 'reviewer');
      expect(reviewer?.intentMatch).toBe(true);
    });

    it('matches a bare skill tag that names a known intent', () => {
      registerAgent(registry, 'planner', 'Planner', 'custom', 'tier2', ['plan']);

      const decision = router.routeWithPolicy(
        { requiredCapabilities: ['plan'], intent: 'plan' },
        policyFor('planner'),
      );

      expect(decision.agentId).toBe('planner');
      expect(decision.candidates[0].intentMatch).toBe(true);
    });

    it('falls back to platform-default intents when none are advertised', () => {
      registerAgent(registry, 'codex-agent', 'Codex', 'codex', 'tier1', ['code-gen']);

      const decision = router.routeWithPolicy(
        { requiredCapabilities: ['code-gen'], intent: 'execute' },
        policyFor('codex-agent'),
      );

      expect(decision.agentId).toBe('codex-agent');
      expect(decision.candidates[0].intentMatch).toBe(true);
    });
  });

  // =========================================================================
  // Singleton
  // =========================================================================

  describe('singleton', () => {
    it('getAssignmentRouterService returns the same instance', () => {
      const a = getAssignmentRouterService();
      const b = getAssignmentRouterService();
      expect(a).toBe(b);
    });

    it('resetAssignmentRouterService creates a fresh instance', () => {
      const a = getAssignmentRouterService();
      resetAssignmentRouterService();
      const b = getAssignmentRouterService();
      expect(a).not.toBe(b);
    });
  });
});
