/**
 * `createCapabilityDispatchExecutor` — the concrete {@link SkillActionExecutor}
 * that closes the governed skill model's execution seam (LOOM Bigger Bet A / ubyg)
 * WITHOUT reintroducing the free-argv RCE hole the model exists to remove.
 *
 * There is NO arbitrary command execution here. An action runs ONLY by dispatching
 * its DECLARED capabilities to a closed, pre-registered map of built-in
 * {@link SkillCapabilityHandler}s. The rules:
 *
 *  - Every one of the action's `requiredCapabilities` MUST have a registered
 *    handler. If ANY capability is unhandled, the whole action is REFUSED
 *    (`ok:false`) — an action can never run with a capability the deployment did
 *    not explicitly wire a handler for. With NO handlers registered, EVERY action
 *    refuses truthfully (the honest "wired but no capabilities enabled" state).
 *  - Each handler receives ONLY the capability-scoped {@link SkillActionContext}
 *    (typed params + granted capabilities + the trusted worktree path) — never
 *    ambient env, secrets, or a raw client path (the service already resolved the
 *    worktree to an owned checkout before reaching here).
 *  - A handler that throws is isolated into a truthful `{ ok:false, error }` — a
 *    handler bug never crashes the conductor and is never faked as success.
 *
 * New capabilities are added by REGISTERING a handler here (a reviewed, in-repo
 * built-in), never by a skill shipping code. That is the whole point: the skill
 * declares WHAT it needs (capabilities); the deployment decides WHAT that does.
 */
import type { Logger } from '../../../shared/logger.js';
import type {
  SkillActionContext,
  SkillActionExecutor,
  SkillActionOutcome,
} from './skill.types.js';

/**
 * One built-in capability implementation. It receives the capability-scoped
 * context and returns a truthful outcome. It MUST NOT throw for expected failures
 * (return `{ ok:false, error }`); a thrown error is still isolated by the executor.
 */
export interface SkillCapabilityHandler {
  execute(ctx: SkillActionContext): Promise<SkillActionOutcome>;
}

/** The closed capability → handler map a deployment wires (empty = nothing runs). */
export type SkillCapabilityHandlers = Readonly<Record<string, SkillCapabilityHandler>>;

export interface CapabilityDispatchExecutorDeps {
  /** The built-in handlers this deployment enables. Absent/empty ⇒ every action refuses. */
  readonly handlers: SkillCapabilityHandlers;
  readonly logger: Logger;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Build the capability-dispatch executor. Each of the action's granted
 * capabilities is run through its registered handler in declaration order; the
 * first refusal short-circuits (nothing partial is reported as success). A single
 * capability yields that handler's outcome verbatim; multiple capabilities report
 * an aggregate `ok` with each handler's output keyed by capability.
 */
export function createCapabilityDispatchExecutor(
  deps: CapabilityDispatchExecutorDeps,
): SkillActionExecutor {
  const { handlers, logger } = deps;

  return {
    async execute(ctx: SkillActionContext): Promise<SkillActionOutcome> {
      const capabilities = ctx.capabilities;
      if (capabilities.length === 0) {
        // A capability-typed model action with NO capabilities has nothing to run
        // — refuse rather than fabricate a no-op success.
        return { ok: false, error: 'action declares no capabilities to execute' };
      }

      // FAIL-CLOSED admission: refuse the whole action unless EVERY capability has
      // a wired handler — never run a partial subset of a multi-capability action.
      const unhandled = capabilities.filter(
        (cap) => !Object.prototype.hasOwnProperty.call(handlers, cap),
      );
      if (unhandled.length > 0) {
        logger.warn(
          { skillId: ctx.skillId, actionId: ctx.actionId, unhandled },
          'skill action refused: capability has no wired handler',
        );
        return {
          ok: false,
          error: `no handler wired for capability: ${unhandled.join(', ')}`,
        };
      }

      const outputs: Record<string, unknown> = {};
      for (const cap of capabilities) {
        const handler = handlers[cap];
        let outcome: SkillActionOutcome;
        try {
          outcome = await handler.execute(ctx);
        } catch (err) {
          logger.error(
            { skillId: ctx.skillId, actionId: ctx.actionId, capability: cap, err: message(err) },
            'skill capability handler threw — isolated as a truthful failure',
          );
          return { ok: false, error: `capability '${cap}' failed: ${message(err)}` };
        }
        if (!outcome.ok) {
          // A capability refusal fails the whole action — never a partial success.
          return { ok: false, error: outcome.error ?? `capability '${cap}' refused` };
        }
        if (outcome.output !== undefined) outputs[cap] = outcome.output;
      }

      // Single capability → its outcome verbatim; multiple → an aggregate map.
      if (capabilities.length === 1) {
        const only = capabilities[0];
        return { ok: true, ...(only in outputs ? { output: outputs[only] } : {}) };
      }
      return { ok: true, output: outputs };
    },
  };
}
