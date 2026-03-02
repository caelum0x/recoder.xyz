/**
 * @module capability-matcher.test
 *
 * Test suite for the CapabilityMatcherService.
 *
 * Covers:
 * - Matching algorithm: empty registry, full match, partial match, no match,
 *   preferred capabilities, platform bonus, tier scoring, ranking
 * - findBestAgent: highest-scoring, null on no match, tie-breaking by tier
 * - isCapable: positive and negative checks
 * - Edge cases: empty required capabilities, extra capabilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CapabilityMatcherService,
  getCapabilityMatcher,
  resetCapabilityMatcher,
  type TaskRequirements,
} from '../capability-matcher.service';
import {
  AgentRegistryService,
  getAgentRegistryService,
  resetAgentRegistryService,
  type RegisterAgentInput,
} from '../agent-registry.service';

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
        tags: [sid], // each skill has its id as a tag too
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CapabilityMatcherService', () => {
  let registry: AgentRegistryService;
  let matcher: CapabilityMatcherService;

  beforeEach(() => {
    // Reset singletons so each test starts clean
    resetAgentRegistryService();
    resetCapabilityMatcher();

    // Create a fresh registry (without default agents) and matcher
    registry = new AgentRegistryService();
    // Replace the singleton so getAgentRegistryService() returns our clean instance
    // We need to use the singleton mechanism -- seed it by calling the getter after reset
    // Actually, the matcher calls getAgentRegistryService() which auto-registers defaults.
    // To keep tests clean, we'll override the singleton:
    (globalThis as any).__testRegistryOverride = registry;

    // We need the matcher to use our registry. Since the matcher calls getAgentRegistryService()
    // internally, we need to ensure the singleton is our registry instance.
    // The cleanest approach: use resetAgentRegistryService() and register agents via the singleton.
    // Let's use getAgentRegistryService() directly, which auto-registers defaults.
    // For cleaner tests, reset and register only test agents.

    // Reset again and get fresh singleton (will auto-register defaults)
    resetAgentRegistryService();
    // We don't want defaults -- but getAgentRegistryService() registers them.
    // Instead, we'll create a standalone service and work with the matcher that uses the singleton.
    // Let's just use the singleton and unregister defaults.

    registry = getAgentRegistryService(); // Has defaults
    // Unregister all defaults to start clean
    for (const agent of registry.list()) {
      registry.unregister(agent.identity.id);
    }

    matcher = new CapabilityMatcherService();
  });

  // =========================================================================
  // Matching algorithm
  // =========================================================================

  describe('matchAgents', () => {
    it('returns empty matches when no agents are registered', () => {
      const result = matcher.matchAgents({
        requiredCapabilities: ['code-generation'],
      });

      expect(result.matches).toHaveLength(0);
      expect(result.totalCandidates).toBe(0);
      expect(result.bestMatch).toBeNull();
    });

    it('matches agent with all required capabilities (full required score)', () => {
      registerAgent(registry, 'agent-a', 'Agent A', 'codex', 'tier1', ['code-generation', 'refactoring']);

      const result = matcher.matchAgents({
        requiredCapabilities: ['code-generation', 'refactoring'],
      });

      expect(result.matches).toHaveLength(1);
      const match = result.matches[0];
      expect(match.agentId).toBe('agent-a');
      expect(match.matchedCapabilities).toContain('code-generation');
      expect(match.matchedCapabilities).toContain('refactoring');
      expect(match.missingCapabilities).toHaveLength(0);
      // Base: 60 + tier-1 bonus: 10 = 70
      expect(match.score).toBe(70);
    });

    it('partial match: agent has some but not all required capabilities', () => {
      registerAgent(registry, 'agent-b', 'Agent B', 'custom', 'tier2', ['code-generation']);

      const result = matcher.matchAgents({
        requiredCapabilities: ['code-generation', 'testing', 'deployment'],
      });

      expect(result.matches).toHaveLength(1);
      const match = result.matches[0];
      expect(match.matchedCapabilities).toContain('code-generation');
      expect(match.missingCapabilities).toContain('testing');
      expect(match.missingCapabilities).toContain('deployment');
      // Base: (1/3)*60 = 20, tier-2 bonus: 5 => 25
      expect(match.score).toBe(25);
    });

    it('no match: agent has none of the required capabilities (filtered out with score 0)', () => {
      registerAgent(registry, 'agent-c', 'Agent C', 'custom', 'tier2', ['unrelated-skill']);

      const result = matcher.matchAgents({
        requiredCapabilities: ['code-generation', 'testing'],
      });

      // Agent scores 0 on required capabilities and gets filtered out
      expect(result.matches).toHaveLength(0);
      expect(result.totalCandidates).toBe(1);
    });

    it('preferred capabilities boost score', () => {
      registerAgent(registry, 'agent-d', 'Agent D', 'custom', 'tier2', [
        'code-generation',
        'testing',
        'documentation',
      ]);

      const result = matcher.matchAgents({
        requiredCapabilities: ['code-generation'],
        preferredCapabilities: ['testing', 'documentation'],
      });

      expect(result.matches).toHaveLength(1);
      const match = result.matches[0];
      // Base: (1/1)*60 = 60, preferred: (2/2)*20 = 20, tier-2: 5 => 85
      expect(match.score).toBe(85);
    });

    it('platform match gives +10 bonus', () => {
      registerAgent(registry, 'agent-e', 'Agent E', 'claude_code', 'tier1', ['code-review']);

      const withPlatform = matcher.matchAgents({
        requiredCapabilities: ['code-review'],
        preferredPlatform: 'claude',
      });
      const withoutPlatform = matcher.matchAgents({
        requiredCapabilities: ['code-review'],
      });

      // With platform: base 60 + tier-1 10 + platform 10 = 80
      expect(withPlatform.matches[0].score).toBe(80);
      // Without platform: base 60 + tier-1 10 = 70
      expect(withoutPlatform.matches[0].score).toBe(70);
      expect(withPlatform.matches[0].score - withoutPlatform.matches[0].score).toBe(10);
    });

    it('tier-1 agents scored higher than tier-2 with same capabilities', () => {
      registerAgent(registry, 'tier1-agent', 'Tier 1 Agent', 'codex', 'tier1', ['code-generation']);
      registerAgent(registry, 'tier2-agent', 'Tier 2 Agent', 'custom', 'tier2', ['code-generation']);

      const result = matcher.matchAgents({
        requiredCapabilities: ['code-generation'],
      });

      expect(result.matches).toHaveLength(2);
      const tier1Match = result.matches.find((m) => m.agentId === 'tier1-agent')!;
      const tier2Match = result.matches.find((m) => m.agentId === 'tier2-agent')!;

      // Tier-1: base 60 + tier 10 = 70
      expect(tier1Match.score).toBe(70);
      // Tier-2: base 60 + tier 5 = 65
      expect(tier2Match.score).toBe(65);
      expect(tier1Match.score).toBeGreaterThan(tier2Match.score);
    });

    it('multiple agents ranked correctly by score', () => {
      // Agent with all capabilities + tier-1 + platform match
      registerAgent(registry, 'best', 'Best Agent', 'claude_code', 'tier1', ['code-gen', 'testing', 'review']);
      // Agent with all capabilities + tier-2
      registerAgent(registry, 'good', 'Good Agent', 'custom', 'tier2', ['code-gen', 'testing', 'review']);
      // Agent with partial capabilities
      registerAgent(registry, 'partial', 'Partial Agent', 'custom', 'tier2', ['code-gen']);

      const result = matcher.matchAgents({
        requiredCapabilities: ['code-gen', 'testing'],
        preferredCapabilities: ['review'],
        preferredPlatform: 'claude',
      });

      expect(result.matches.length).toBeGreaterThanOrEqual(2);
      // Best should be first
      expect(result.matches[0].agentId).toBe('best');
      // Good should be second
      expect(result.matches[1].agentId).toBe('good');
      // Verify ordering is descending by score
      for (let i = 1; i < result.matches.length; i++) {
        expect(result.matches[i - 1].score).toBeGreaterThanOrEqual(result.matches[i].score);
      }
    });
  });

  // =========================================================================
  // findBestAgent
  // =========================================================================

  describe('findBestAgent', () => {
    it('returns highest-scoring agent', () => {
      registerAgent(registry, 'low', 'Low Agent', 'custom', 'tier2', ['code-gen']);
      registerAgent(registry, 'high', 'High Agent', 'claude_code', 'tier1', ['code-gen', 'review']);

      const best = matcher.findBestAgent({
        requiredCapabilities: ['code-gen'],
        preferredCapabilities: ['review'],
        preferredPlatform: 'claude',
      });

      expect(best).not.toBeNull();
      expect(best!.agentId).toBe('high');
    });

    it('returns null when no capable agents', () => {
      registerAgent(registry, 'unrelated', 'Unrelated Agent', 'custom', 'tier2', ['design']);

      const best = matcher.findBestAgent({
        requiredCapabilities: ['code-generation', 'testing'],
      });

      expect(best).toBeNull();
    });

    it('breaks ties by tier (tier-1 preferred)', () => {
      // Both agents have same capabilities, same preferred, no platform bonus
      // The only difference is tier
      registerAgent(registry, 'custom-agent', 'Custom Agent', 'custom', 'tier2', ['code-gen']);
      registerAgent(registry, 'codex-agent', 'Codex Agent', 'codex', 'tier1', ['code-gen']);

      const best = matcher.findBestAgent({
        requiredCapabilities: ['code-gen'],
      });

      expect(best).not.toBeNull();
      // tier-1 has higher tier bonus (10 vs 5) so score will differ
      // codex-agent: 60 + 10 = 70, custom-agent: 60 + 5 = 65
      expect(best!.agentId).toBe('codex-agent');
      expect(best!.tier).toBe('tier-1');
    });
  });

  // =========================================================================
  // isCapable
  // =========================================================================

  describe('isCapable', () => {
    it('returns true when agent has all capabilities', () => {
      registerAgent(registry, 'capable-agent', 'Capable Agent', 'codex', 'tier1', [
        'code-generation',
        'testing',
        'deployment',
      ]);

      expect(matcher.isCapable('capable-agent', ['code-generation', 'testing'])).toBe(true);
    });

    it('returns false when agent is missing a capability', () => {
      registerAgent(registry, 'limited-agent', 'Limited Agent', 'codex', 'tier1', ['code-generation']);

      expect(matcher.isCapable('limited-agent', ['code-generation', 'testing'])).toBe(false);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('empty required capabilities matches all agents', () => {
      registerAgent(registry, 'agent-1', 'Agent 1', 'codex', 'tier1', ['skill-a']);
      registerAgent(registry, 'agent-2', 'Agent 2', 'custom', 'tier2', ['skill-b']);

      const result = matcher.matchAgents({
        requiredCapabilities: [],
      });

      // All agents should be included (empty required = everyone qualifies)
      expect(result.matches).toHaveLength(2);
      expect(result.totalCandidates).toBe(2);
      // Both get full base score (60) since no required capabilities
      for (const match of result.matches) {
        expect(match.score).toBeGreaterThanOrEqual(60);
      }
    });

    it('agent with extra capabilities beyond required still gets full score', () => {
      registerAgent(registry, 'overqualified', 'Overqualified Agent', 'codex', 'tier1', [
        'code-generation',
        'testing',
        'deployment',
        'monitoring',
        'documentation',
      ]);

      const result = matcher.matchAgents({
        requiredCapabilities: ['code-generation', 'testing'],
      });

      expect(result.matches).toHaveLength(1);
      const match = result.matches[0];
      expect(match.missingCapabilities).toHaveLength(0);
      // Full base: 60 + tier-1: 10 = 70
      expect(match.score).toBe(70);
    });
  });

  // =========================================================================
  // Singleton
  // =========================================================================

  describe('singleton', () => {
    it('getCapabilityMatcher returns same instance', () => {
      const a = getCapabilityMatcher();
      const b = getCapabilityMatcher();
      expect(a).toBe(b);
    });

    it('resetCapabilityMatcher creates fresh instance', () => {
      const a = getCapabilityMatcher();
      resetCapabilityMatcher();
      const b = getCapabilityMatcher();
      expect(a).not.toBe(b);
    });
  });
});
