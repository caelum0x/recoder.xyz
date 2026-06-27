/**
 * capability-matcher — required/preferred/platform/tier capability scoring.
 *
 * MERGED from `docker-backend/src/a2a/capability-matcher.service.ts`
 * (`scoreAgent`/`matchAgents` 0–100 algorithm). Decoupled from the
 * `getAgentRegistryService()` singleton: it scores a `DirectoryAgent` (read via
 * `AgentDirectoryPort`) against a `CapabilityRequirements` value. Pure: no IO,
 * no globals — the same inputs always produce the same score.
 *
 * Scoring (preserved from the source):
 *  - base:      (matched required / total required) * 60   (or full 60 when none required)
 *  - preferred: (matched preferred / total preferred) * 20
 *  - platform:  +10 when the agent platform matches the preferred platform
 *  - tier:      tier-1 +10, tier-2 +5, custom +0
 *  - an agent that matches ZERO of a non-empty required set scores 0 (excluded).
 */

export type CapabilityRequirements = {
  /** Capabilities the agent must have to be a candidate. */
  requiredCapabilities: string[];
  /** Capabilities that boost the score but are not required. */
  preferredCapabilities?: string[];
  /** Preferred platform (e.g. 'claude', 'cursor'); +10 when it matches. */
  preferredPlatform?: string;
};

export type CapabilityTier = 'tier-1' | 'tier-2' | 'custom';

export type CapabilityMatch = {
  agentId: string;
  score: number;
  matchedCapabilities: string[];
  missingCapabilities: string[];
  tier: CapabilityTier;
  reason: string;
};

/** What the matcher needs from a directory agent (a structural subset). */
export type CapabilityScorable = {
  agentId: string;
  capabilityIds: string[];
  platform?: string;
};

const TIER_1_PLATFORMS = new Set(['claude', 'claude_code', 'codex']);
const TIER_2_PLATFORMS = new Set(['cursor', 'windsurf', 'recoder_desktop']);

const BASE_WEIGHT = 60;
const PREFERRED_WEIGHT = 20;
const PLATFORM_BONUS = 10;
const TIER_1_BONUS = 10;
const TIER_2_BONUS = 5;

/** Determine a platform tier from the agent's platform string. */
export function determineTier(platform: string | undefined): CapabilityTier {
  if (!platform) {
    return 'custom';
  }
  if (TIER_1_PLATFORMS.has(platform)) {
    return 'tier-1';
  }
  if (TIER_2_PLATFORMS.has(platform)) {
    return 'tier-2';
  }
  return 'custom';
}

function tierBonus(tier: CapabilityTier): number {
  switch (tier) {
    case 'tier-1':
      return TIER_1_BONUS;
    case 'tier-2':
      return TIER_2_BONUS;
    case 'custom':
      return 0;
  }
}

/** Loose platform equality (shorthand 'claude' ↔ 'claude_code'). */
export function platformMatches(agentPlatform: string, preferredPlatform: string): boolean {
  if (agentPlatform === preferredPlatform) {
    return true;
  }
  if (preferredPlatform === 'claude' && agentPlatform === 'claude_code') {
    return true;
  }
  if (preferredPlatform === 'claude_code' && agentPlatform === 'claude') {
    return true;
  }
  return false;
}

function buildReason(params: {
  matchedCount: number;
  totalRequired: number;
  missingRequired: string[];
  matchedPreferredCount: number;
  totalPreferred: number;
  score: number;
  tier: CapabilityTier;
  platformMatch: boolean;
  preferredPlatform?: string;
}): string {
  const parts: string[] = [];
  if (params.totalRequired > 0) {
    if (params.matchedCount === params.totalRequired) {
      parts.push(`All capabilities matched (${params.matchedCount}/${params.totalRequired}).`);
    } else {
      const missing =
        params.missingRequired.length > 0
          ? ` (missing: ${params.missingRequired.join(', ')}).`
          : '.';
      parts.push(
        `Matched ${params.matchedCount}/${params.totalRequired} required capabilities${missing}`,
      );
    }
  } else {
    parts.push('No required capabilities specified.');
  }
  if (params.totalPreferred > 0) {
    parts.push(`Preferred: ${params.matchedPreferredCount}/${params.totalPreferred}.`);
  }
  parts.push(`Score: ${params.score}. Tier: ${params.tier}.`);
  if (params.platformMatch && params.preferredPlatform) {
    parts.push(`Platform match: ${params.preferredPlatform}.`);
  }
  return parts.join(' ');
}

/**
 * Score one agent against the requirements. Returns a `CapabilityMatch` whose
 * `score` is 0 when a non-empty required set is wholly unmet.
 */
export function scoreCapabilities(
  agent: CapabilityScorable,
  requirements: CapabilityRequirements,
): CapabilityMatch {
  const agentCaps = new Set(agent.capabilityIds);
  const tier = determineTier(agent.platform);
  const required = requirements.requiredCapabilities;
  const preferred = requirements.preferredCapabilities ?? [];

  const matchedRequired: string[] = [];
  const missingRequired: string[] = [];
  for (const cap of required) {
    if (agentCaps.has(cap)) {
      matchedRequired.push(cap);
    } else {
      missingRequired.push(cap);
    }
  }

  if (required.length > 0 && matchedRequired.length === 0) {
    return {
      agentId: agent.agentId,
      score: 0,
      matchedCapabilities: [],
      missingCapabilities: missingRequired,
      tier,
      reason: `No capabilities matched (0/${required.length} required). Missing: ${missingRequired.join(', ')}.`,
    };
  }

  const baseScore =
    required.length > 0 ? (matchedRequired.length / required.length) * BASE_WEIGHT : BASE_WEIGHT;

  const matchedPreferred = preferred.filter((cap) => agentCaps.has(cap));
  const preferredScore =
    preferred.length > 0 ? (matchedPreferred.length / preferred.length) * PREFERRED_WEIGHT : 0;

  const platformMatch =
    requirements.preferredPlatform !== undefined &&
    agent.platform !== undefined &&
    platformMatches(agent.platform, requirements.preferredPlatform);
  const platformScore = platformMatch ? PLATFORM_BONUS : 0;

  const score = Math.round(baseScore + preferredScore + platformScore + tierBonus(tier));
  const allMatched = [...new Set([...matchedRequired, ...matchedPreferred])];

  return {
    agentId: agent.agentId,
    score,
    matchedCapabilities: allMatched,
    missingCapabilities: missingRequired,
    tier,
    reason: buildReason({
      matchedCount: matchedRequired.length,
      totalRequired: required.length,
      missingRequired,
      matchedPreferredCount: matchedPreferred.length,
      totalPreferred: preferred.length,
      score,
      tier,
      platformMatch,
      preferredPlatform: requirements.preferredPlatform,
    }),
  };
}

/** Score + rank all agents, excluding zero-scorers unless no required caps. */
export function matchCapabilities(
  agents: CapabilityScorable[],
  requirements: CapabilityRequirements,
): CapabilityMatch[] {
  const tierOrder: Record<CapabilityTier, number> = {
    'tier-1': 0,
    'tier-2': 1,
    custom: 2,
  };
  return agents
    .map((agent) => scoreCapabilities(agent, requirements))
    .filter(
      (match) => match.score > 0 || requirements.requiredCapabilities.length === 0,
    )
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (tierOrder[left.tier] !== tierOrder[right.tier]) {
        return tierOrder[left.tier] - tierOrder[right.tier];
      }
      return left.agentId.localeCompare(right.agentId);
    });
}
