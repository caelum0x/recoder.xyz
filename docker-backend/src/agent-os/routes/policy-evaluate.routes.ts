import { Router, type Request, type Response } from 'express';
import type { AgentProfile, PolicyDecision, TaskSpec, WorkLock } from '@recoder/agent-os';
import { evaluatePolicy, type PolicyAction, type PolicyInput } from '@recoder/agent-policy';
import type { AgentOsRepository } from '../repositories/agent-os.repository';
import { agentOsContainer } from '../service-container';

/**
 * Live @recoder/agent-policy surface on the canonical Agent OS control plane.
 *
 * Until now the policy engine was only reachable transitively via @recoder/agent-mcp.
 * This route runs `evaluatePolicy` directly over a PolicyInput (actor/action/target)
 * and returns the real PolicyDecision (allow | needs_approval | deny). The decision is
 * additively persisted via the existing repository so it shows up in the policy CRUD
 * surface and the cockpit summary. Nothing here removes or alters the existing
 * `/policies` CRUD routes.
 */

const POLICY_ACTIONS: readonly PolicyAction[] = [
  'file.read',
  'file.write',
  'command.run',
  'tool.call',
  'memory.write',
  'artifact.publish',
  'deploy.preview',
  'branch.push',
  'pr.create',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isPolicyAction(value: unknown): value is PolicyAction {
  return typeof value === 'string' && (POLICY_ACTIONS as readonly string[]).includes(value);
}

/**
 * Build a PolicyInput from an untrusted request body. The actor (AgentProfile) and
 * action are required; the engine itself needs the full actor permission policy to
 * make a real decision, so we validate it is present rather than fabricating one.
 */
function parsePolicyInput(body: unknown): { input: PolicyInput } | { error: string } {
  if (!isRecord(body)) {
    return { error: 'request body must be a JSON object' };
  }

  const actor = body.actor;
  if (!isRecord(actor) || typeof actor.agentId !== 'string' || !isRecord(actor.permissions)) {
    return { error: 'actor must be a full AgentProfile (agentId + permissions required)' };
  }

  if (!isPolicyAction(body.action)) {
    return { error: `action must be one of: ${POLICY_ACTIONS.join(', ')}` };
  }

  const targetSource = isRecord(body.target) ? body.target : {};
  const target = {
    path: optionalString(targetSource.path),
    command: optionalString(targetSource.command),
    toolName: optionalString(targetSource.toolName),
    environment: optionalString(targetSource.environment),
  };

  const input: PolicyInput = {
    actor: actor as unknown as AgentProfile,
    action: body.action,
    target,
    task: isRecord(body.task) ? (body.task as unknown as TaskSpec) : undefined,
    workLocks: Array.isArray(body.workLocks) ? (body.workLocks as WorkLock[]) : undefined,
    now: optionalString(body.now),
  };

  return { input };
}

export function createPolicyEvaluateRouter(
  repository: AgentOsRepository = agentOsContainer.repository,
): Router {
  const router = Router();

  // POST /api/agent-os/policy/evaluate
  // Runs the real @recoder/agent-policy engine and returns the PolicyDecision.
  router.post('/evaluate', async (req: Request, res: Response) => {
    try {
      const parsed = parsePolicyInput(req.body);
      if ('error' in parsed) {
        res.status(400).json({ success: false, error: parsed.error });
        return;
      }

      const decision: PolicyDecision = evaluatePolicy(parsed.input);

      // Additively persist the live decision so it surfaces in /policies + summary.
      // Persistence is best-effort: a storage failure must not hide a real decision.
      try {
        await repository.upsertPolicyDecision(decision);
      } catch {
        // Decision is still returned to the caller; storage is non-authoritative here.
      }

      res.json({ success: true, data: decision });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'policy_evaluate_failed',
      });
    }
  });

  return router;
}
