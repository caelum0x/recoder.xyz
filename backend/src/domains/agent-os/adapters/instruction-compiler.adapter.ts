/**
 * `instruction-compiler.adapter` — the ONLY place the concrete
 * `@recoder/agent-instructions` compiler is referenced (domain doc §1.6). It
 * implements {@link InstructionCompilerPort}: compile a provenance-tracked
 * runtime+audit `InstructionBundle` pair from task/agent/repo/memory/policy
 * sources, and report truthful health.
 *
 * Degrade-safe: the underlying compiler reads on-disk instruction sources. When
 * those are unreadable it throws; this adapter maps that to a
 * `SERVICE_UNAVAILABLE` AppError (never a partial/faked bundle) and flips
 * `health()` to `down` so `POST /instructions/compile` fails truthfully.
 */
import { compileAgentOsInstructionBundle } from '@recoder/agent-instructions/agent-os-compiler';
import type {
  InstructionCompilerPort,
  CompileAgentOsInstructionBundleInput,
  CompileAgentOsInstructionBundleResult,
} from '../ports/instruction-compiler.port.js';
import type { HealthStatus } from '../../../shared/health-types.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';

export function createInstructionCompilerAdapter(logger: Logger): InstructionCompilerPort {
  // Tracks the last compile outcome so health reflects real observed behavior
  // rather than an assumed `up`. Starts optimistic (`up`); a failing compile
  // flips it to `down` until a compile succeeds again.
  let lastHealthy = true;

  return {
    async compile(
      input: CompileAgentOsInstructionBundleInput,
    ): Promise<CompileAgentOsInstructionBundleResult> {
      try {
        const result = compileAgentOsInstructionBundle(input);
        lastHealthy = true;
        return result;
      } catch (error) {
        lastHealthy = false;
        const detail = error instanceof Error ? error.message : 'instruction compile failed';
        logger.error({ err: detail, taskId: input.task.taskId }, 'agent-os instruction compile failed');
        throw createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          `instruction compiler unavailable: ${detail}`,
        );
      }
    },

    health(): HealthStatus {
      return lastHealthy ? 'up' : 'down';
    },
  };
}
