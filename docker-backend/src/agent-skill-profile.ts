/**
 * @module agent-skill-profile
 *
 * Dynamic, outcome-driven agent skill profiles — the "compound skills / track
 * progress" capability, inspired by multica (turn coding agents into real
 * teammates). Where `a2a/capability-matcher.service.ts` matches tasks to agents
 * by their *declared* capabilities, this tracks *demonstrated* proficiency:
 * every completed task feeds a per-agent, per-skill track record (attempts,
 * successes, success rate, recency, average duration) that can then re-rank
 * agents for future work.
 *
 * Durable via the JSON persistence store; updates are debounced.
 */

import { loadStore, debouncedSave } from './persistence';
import { createLogger } from './logger';

const logger = createLogger('agent-skill-profile');

const STORE_NAME = 'agent-skill-profiles';

export interface SkillStat {
  skill: string;
  attempts: number;
  successes: number;
  successRate: number;
  avgDurationMs: number;
  lastUsedAt: string;
}

export interface AgentSkillProfile {
  agentId: string;
  skills: Record<string, SkillStat>;
  totalTasks: number;
  totalSuccesses: number;
  updatedAt: string;
}

type ProfileStore = Record<string, AgentSkillProfile>;

let store: ProfileStore | null = null;

function getStore(): ProfileStore {
  if (store === null) {
    store = loadStore<ProfileStore>(STORE_NAME, {});
  }
  return store;
}

function emptyProfile(agentId: string): AgentSkillProfile {
  return { agentId, skills: {}, totalTasks: 0, totalSuccesses: 0, updatedAt: new Date().toISOString() };
}

function updateSkillStat(prev: SkillStat | undefined, skill: string, success: boolean, durationMs?: number, now = new Date().toISOString()): SkillStat {
  const attempts = (prev?.attempts ?? 0) + 1;
  const successes = (prev?.successes ?? 0) + (success ? 1 : 0);
  // Rolling average duration (immutable recompute).
  const prevAvg = prev?.avgDurationMs ?? 0;
  const prevAttempts = prev?.attempts ?? 0;
  const avgDurationMs =
    typeof durationMs === 'number'
      ? Math.round((prevAvg * prevAttempts + durationMs) / attempts)
      : prevAvg;
  return {
    skill,
    attempts,
    successes,
    successRate: successes / attempts,
    avgDurationMs,
    lastUsedAt: now,
  };
}

export interface RecordOutcomeParams {
  agentId: string;
  skills: string[];
  success: boolean;
  durationMs?: number;
}

/** Record the outcome of a task, updating the agent's per-skill track record. */
export function recordTaskOutcome(params: RecordOutcomeParams): AgentSkillProfile {
  const current = getStore();
  const now = new Date().toISOString();
  const prevProfile = current[params.agentId] ?? emptyProfile(params.agentId);

  const skills = (params.skills ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  const nextSkills: Record<string, SkillStat> = { ...prevProfile.skills };
  for (const skill of skills) {
    nextSkills[skill] = updateSkillStat(prevProfile.skills[skill], skill, params.success, params.durationMs, now);
  }

  const nextProfile: AgentSkillProfile = {
    agentId: params.agentId,
    skills: nextSkills,
    totalTasks: prevProfile.totalTasks + 1,
    totalSuccesses: prevProfile.totalSuccesses + (params.success ? 1 : 0),
    updatedAt: now,
  };

  // Immutable store update.
  store = { ...current, [params.agentId]: nextProfile };
  debouncedSave(STORE_NAME, store);
  logger.info({ agentId: params.agentId, skills, success: params.success }, 'recorded task outcome');
  return nextProfile;
}

export function getAgentProfile(agentId: string): AgentSkillProfile | undefined {
  return getStore()[agentId];
}

export function listProfiles(): AgentSkillProfile[] {
  return Object.values(getStore());
}

export interface AgentRanking {
  agentId: string;
  score: number;
  matchedSkills: string[];
  unprovenSkills: string[];
  reason: string;
}

// Confidence damping: an agent with few attempts shouldn't outrank a proven one.
const CONFIDENCE_K = 3;

function skillProficiency(stat: SkillStat | undefined): number {
  if (!stat || stat.attempts === 0) return 0;
  const confidence = stat.attempts / (stat.attempts + CONFIDENCE_K);
  return stat.successRate * confidence;
}

/**
 * Rank agents by demonstrated proficiency on the requested skills. Agents with
 * no track record score 0 (neutral) rather than being penalized — so a fresh
 * agent can still be chosen when no one has proven the skill yet.
 */
export function rankAgentsForSkills(agentIds: string[] | undefined, skills: string[]): AgentRanking[] {
  const current = getStore();
  const wanted = skills.map((s) => s.trim().toLowerCase()).filter(Boolean);
  const candidates = agentIds && agentIds.length > 0 ? agentIds : Object.keys(current);

  const rankings = candidates.map((agentId) => {
    const profile = current[agentId];
    const matchedSkills: string[] = [];
    const unprovenSkills: string[] = [];
    let total = 0;

    for (const skill of wanted) {
      const stat = profile?.skills[skill];
      const proficiency = skillProficiency(stat);
      if (stat && stat.attempts > 0) matchedSkills.push(skill);
      else unprovenSkills.push(skill);
      total += proficiency;
    }

    const score = wanted.length > 0 ? total / wanted.length : 0;
    const reason = matchedSkills.length > 0
      ? `Proven on ${matchedSkills.join(', ')}${unprovenSkills.length ? `; unproven on ${unprovenSkills.join(', ')}` : ''}`
      : 'No demonstrated track record on requested skills';

    return { agentId, score: Number(score.toFixed(4)), matchedSkills, unprovenSkills, reason };
  });

  return rankings.sort((a, b) => b.score - a.score);
}

/** Test/maintenance helper. */
export function resetProfiles(): void {
  store = {};
  debouncedSave(STORE_NAME, store);
}
