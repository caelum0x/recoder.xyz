/**
 * @module capability-matcher.service
 *
 * Service that matches task requirements against registered agent capabilities
 * to find the best agent for a given task.
 *
 * Scoring algorithm (0-100):
 * - Base score: (matched required capabilities / total required) * 60
 * - Preferred capability bonus: (matched preferred / total preferred) * 20
 * - Platform match bonus: +10 if platform matches preferredPlatform
 * - Tier bonus: tier-1 = +10, tier-2 = +5, custom = +0
 *
 * Capabilities are matched against the union of an agent's skill IDs and
 * skill tags from its AgentCard.
 */

import type { RegisteredAgent } from '@recoder/shared/a2a';
import { getAgentRegistryService } from './agent-registry.service';
import { createLogger } from '../logger';

const logger = createLogger('a2a-capability-matcher');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskRequirements {
  /** Required capabilities/skills the agent must have */
  requiredCapabilities: string[];
  /** Preferred capabilities (boost score but not required) */
  preferredCapabilities?: string[];
  /** Preferred platform (e.g., 'claude', 'cursor', 'replit') */
  preferredPlatform?: string;
  /** Tags that should match agent metadata */
  tags?: string[];
}

export interface AgentMatch {
  agentId: string;
  agentName: string;
  platform: string;
  score: number; // 0-100
  matchedCapabilities: string[];
  missingCapabilities: string[];
  tier: 'tier-1' | 'tier-2' | 'custom';
  /** Human-readable explanation of why this agent was matched and how the score was computed. */
  reason: string;
}

export interface MatchResult {
  matches: AgentMatch[];
  totalCandidates: number;
  bestMatch: AgentMatch | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tier-1 platform identifiers (maps to both ConnectorPlatform and RecoderAgentPlatform). */
const TIER_1_PLATFORMS = new Set(['claude', 'claude_code', 'codex']);

/** Tier-2 platform identifiers. */
const TIER_2_PLATFORMS = new Set(['cursor', 'windsurf', 'recoder_desktop']);

/**
 * Determine the display tier for an agent based on its registered tier field.
 * Falls back to platform-based heuristic if tier is absent.
 */
function determineTier(agent: RegisteredAgent): 'tier-1' | 'tier-2' | 'custom' {
  if (agent.tier === 'tier1') return 'tier-1';
  if (agent.tier === 'tier2') return 'tier-2';
  // Fallback: infer from platform
  const platform = agent.identity.platform;
  if (TIER_1_PLATFORMS.has(platform)) return 'tier-1';
  if (TIER_2_PLATFORMS.has(platform)) return 'tier-2';
  return 'custom';
}

/** Tier bonus points. */
function tierBonus(tier: 'tier-1' | 'tier-2' | 'custom'): number {
  switch (tier) {
    case 'tier-1':
      return 10;
    case 'tier-2':
      return 5;
    case 'custom':
      return 0;
  }
}

/**
 * Collect all capability identifiers from an agent.
 * Includes skill IDs, skill tags, and the agent-level tags array.
 */
function collectCapabilities(agent: RegisteredAgent): Set<string> {
  const caps = new Set<string>();
  for (const skill of agent.card.skills) {
    caps.add(skill.id);
    for (const tag of skill.tags) {
      caps.add(tag);
    }
  }
  for (const tag of agent.tags) {
    caps.add(tag);
  }
  return caps;
}

/**
 * Check whether a platform string loosely matches the agent platform.
 * Handles mappings such as 'claude' -> 'claude_code'.
 */
function platformMatches(agentPlatform: string, preferredPlatform: string): boolean {
  if (agentPlatform === preferredPlatform) return true;
  // Allow shorthand 'claude' to match 'claude_code'
  if (preferredPlatform === 'claude' && agentPlatform === 'claude_code') return true;
  if (preferredPlatform === 'claude_code' && agentPlatform === 'claude') return true;
  return false;
}

/**
 * Build a human-readable reason string explaining how a match score was computed.
 */
function buildMatchReason(params: {
  matchedCount: number;
  totalRequired: number;
  missingRequired: string[];
  matchedPreferred: string[];
  totalPreferred: number;
  score: number;
  tier: 'tier-1' | 'tier-2' | 'custom';
  platformMatch: boolean;
  preferredPlatform?: string;
}): string {
  const parts: string[] = [];

  if (params.totalRequired > 0) {
    if (params.matchedCount === params.totalRequired) {
      parts.push(`All capabilities matched (${params.matchedCount}/${params.totalRequired}).`);
    } else {
      parts.push(
        `Matched ${params.matchedCount}/${params.totalRequired} required capabilities` +
          (params.missingRequired.length > 0
            ? ` (missing: ${params.missingRequired.join(', ')}).`
            : '.'),
      );
    }
  } else {
    parts.push('No required capabilities specified.');
  }

  if (params.totalPreferred > 0) {
    parts.push(`Preferred: ${params.matchedPreferred.length}/${params.totalPreferred}.`);
  }

  parts.push(`Score: ${params.score}. Tier: ${params.tier}.`);

  if (params.platformMatch && params.preferredPlatform) {
    parts.push(`Platform match: ${params.preferredPlatform}.`);
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CapabilityMatcherService {
  /**
   * Score and rank all registered agents against the given task requirements.
   * Agents with score 0 are excluded unless there are no required capabilities.
   */
  matchAgents(requirements: TaskRequirements): MatchResult {
    const agents = getAgentRegistryService().list();
    const totalCandidates = agents.length;

    const matches: AgentMatch[] = [];

    for (const agent of agents) {
      const match = this.scoreAgent(agent, requirements);
      // Include agents with score > 0, or include all if no required capabilities
      if (match.score > 0 || requirements.requiredCapabilities.length === 0) {
        matches.push(match);
      }
    }

    // Sort by score descending, then by tier (tier-1 first) for tie-breaking
    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-break by tier
      const tierOrder: Record<string, number> = { 'tier-1': 0, 'tier-2': 1, 'custom': 2 };
      return (tierOrder[a.tier] ?? 3) - (tierOrder[b.tier] ?? 3);
    });

    const bestMatch = matches.length > 0 ? matches[0] : null;

    logger.debug(
      { totalCandidates, matchCount: matches.length, bestAgentId: bestMatch?.agentId ?? null },
      'Capability matching completed',
    );

    return { matches, totalCandidates, bestMatch };
  }

  /**
   * Return the highest-scoring agent for the given requirements, or null
   * if no suitable agent is found.
   */
  findBestAgent(requirements: TaskRequirements): AgentMatch | null {
    return this.matchAgents(requirements).bestMatch;
  }

  /**
   * Check whether a specific agent possesses all of the listed capabilities.
   */
  isCapable(agentId: string, capabilities: string[]): boolean {
    const agent = getAgentRegistryService().get(agentId);
    if (!agent) return false;
    const agentCaps = collectCapabilities(agent);
    return capabilities.every((cap) => agentCaps.has(cap));
  }

  // -- Private helpers ------------------------------------------------------

  private scoreAgent(agent: RegisteredAgent, requirements: TaskRequirements): AgentMatch {
    const agentCaps = collectCapabilities(agent);
    const tier = determineTier(agent);

    // Required capabilities
    const { requiredCapabilities, preferredCapabilities = [], preferredPlatform, tags = [] } = requirements;

    const matchedRequired: string[] = [];
    const missingRequired: string[] = [];

    for (const cap of requiredCapabilities) {
      if (agentCaps.has(cap)) {
        matchedRequired.push(cap);
      } else {
        missingRequired.push(cap);
      }
    }

    // Base score: matched required / total required * 60
    const baseScore =
      requiredCapabilities.length > 0
        ? (matchedRequired.length / requiredCapabilities.length) * 60
        : 60; // If no required capabilities, give full base score

    // If the agent matched zero required capabilities (and there are required
    // capabilities), the agent is not a candidate -- score stays at 0 and
    // no bonuses are applied.
    if (requiredCapabilities.length > 0 && matchedRequired.length === 0) {
      return {
        agentId: agent.identity.id,
        agentName: agent.identity.name,
        platform: agent.identity.platform,
        score: 0,
        matchedCapabilities: [],
        missingCapabilities: missingRequired,
        tier,
        reason: `No capabilities matched (0/${requiredCapabilities.length} required). Missing: ${missingRequired.join(', ')}.`,
      };
    }

    // Preferred capability bonus: matched preferred / total preferred * 20
    let preferredScore = 0;
    const matchedPreferred: string[] = [];
    if (preferredCapabilities.length > 0) {
      for (const cap of preferredCapabilities) {
        if (agentCaps.has(cap)) {
          matchedPreferred.push(cap);
        }
      }
      preferredScore = (matchedPreferred.length / preferredCapabilities.length) * 20;
    }

    // Platform match bonus: +10 if platform matches
    const platformScore =
      preferredPlatform && platformMatches(agent.identity.platform, preferredPlatform) ? 10 : 0;

    // Tier bonus
    const tierScore = tierBonus(tier);

    const totalScore = Math.round(baseScore + preferredScore + platformScore + tierScore);

    // All matched capabilities (required + preferred)
    const allMatched = [...new Set([...matchedRequired, ...matchedPreferred])];

    // Build a human-readable reason string
    const reason = buildMatchReason({
      matchedCount: matchedRequired.length,
      totalRequired: requiredCapabilities.length,
      missingRequired,
      matchedPreferred,
      totalPreferred: preferredCapabilities.length,
      score: totalScore,
      tier,
      platformMatch: platformScore > 0,
      preferredPlatform,
    });

    return {
      agentId: agent.identity.id,
      agentName: agent.identity.name,
      platform: agent.identity.platform,
      score: totalScore,
      matchedCapabilities: allMatched,
      missingCapabilities: missingRequired,
      tier,
      reason,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: CapabilityMatcherService | null = null;

export function getCapabilityMatcher(): CapabilityMatcherService {
  if (!instance) {
    instance = new CapabilityMatcherService();
  }
  return instance;
}

export function resetCapabilityMatcher(): void {
  instance = null;
}
