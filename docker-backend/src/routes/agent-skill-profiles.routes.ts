/**
 * Agent Skill Profiles API Routes (dynamic, outcome-driven proficiency)
 *
 * Compound skills: record task outcomes and rank agents by demonstrated ability.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, registration order, middleware order, auth, and error helpers are
 * unchanged. The `agent-skill-profile` collaborators are lazily imported exactly as
 * before; only the `authenticateRequest` middleware is injected via the factory.
 */

import express, { Router } from 'express';
import {
  ErrorCode,
  createError,
  asyncHandler,
  sendError,
  sendSuccess,
} from '../errors/index.js';

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

type AuthMiddleware = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
) => void;

export interface AgentSkillProfilesRouterDeps {
  authenticateRequest: AuthMiddleware;
}

export function createAgentSkillProfilesRouter(deps: AgentSkillProfilesRouterDeps): Router {
  const { authenticateRequest } = deps;
  const router = Router();

  router.post('/api/agent-skills/record', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { agentId, skills, success, durationMs } = req.body ?? {};
    if (typeof agentId !== 'string' || !agentId.trim()) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'agentId (string) is required'));
    }
    if (!Array.isArray(skills) || skills.length === 0) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'skills (non-empty array) is required'));
    }
    if (typeof success !== 'boolean') {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'success (boolean) is required'));
    }
    const { recordTaskOutcome } = await import('../agent-skill-profile.js');
    sendSuccess(res, recordTaskOutcome({ agentId, skills, success, durationMs }));
  }));

  router.get('/api/agent-skills', authenticateRequest, asyncHandler(async (_req: AuthenticatedRequest, res: express.Response) => {
    const { listProfiles } = await import('../agent-skill-profile.js');
    sendSuccess(res, { profiles: listProfiles() });
  }));

  // Registered before /:agentId so "leaderboard" isn't captured as an agentId.
  router.get('/api/agent-skills/leaderboard', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { getLeaderboard } = await import('../agent-skill-profile.js');
    sendSuccess(res, {
      leaderboard: getLeaderboard({ skill: req.query.skill as string | undefined, limit: Number(req.query.limit) || 20 }),
    });
  }));

  router.get('/api/agent-skills/:agentId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { getAgentProfile } = await import('../agent-skill-profile.js');
    const profile = getAgentProfile(req.params.agentId);
    if (!profile) return sendError(res, createError(ErrorCode.NOT_FOUND, 'no profile for that agent yet'));
    sendSuccess(res, profile);
  }));

  router.post('/api/agent-skills/rank', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { agentIds, skills } = req.body ?? {};
    if (!Array.isArray(skills) || skills.length === 0) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'skills (non-empty array) is required'));
    }
    const { rankAgentsForSkills } = await import('../agent-skill-profile.js');
    sendSuccess(res, { rankings: rankAgentsForSkills(Array.isArray(agentIds) ? agentIds : undefined, skills) });
  }));

  return router;
}
