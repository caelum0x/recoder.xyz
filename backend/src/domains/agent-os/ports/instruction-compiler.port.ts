/**
 * `InstructionCompilerPort` — the seam that compiles a provenance-tracked
 * `InstructionBundle` from task + agent + repo + memory + policy sources (domain
 * doc §1.6). CONSUMED from `@recoder/agent-instructions/agent-os-compiler`; the
 * adapter wraps `compileAgentOsInstructionBundle` and degrades to `down` when the
 * on-disk sources are unreadable (domain doc §8:
 * `POST /instructions/compile` → `SERVICE_UNAVAILABLE`).
 *
 * FROZEN CONTRACT — Phase 5a seam. The `instruction.service.ts` compiles +
 * persists bundles through this port; the adapter is the ONLY place the concrete
 * `@recoder/agent-instructions` compiler is referenced. The input/result types
 * are re-exported from the package so the port stays a thin, typed seam without
 * redefining the compiler's shape.
 */
import type { HealthStatus } from '../../../shared/health-types.js';
import type {
  CompileAgentOsInstructionBundleInput,
  CompileAgentOsInstructionBundleResult,
} from '@recoder/agent-instructions/agent-os-compiler';

export type {
  CompileAgentOsInstructionBundleInput,
  CompileAgentOsInstructionBundleResult,
} from '@recoder/agent-instructions/agent-os-compiler';

export interface InstructionCompilerPort {
  /**
   * Compile a runtime + audit `InstructionBundle` pair from the given sources,
   * carrying provenance + per-source hashes. Rejects with a
   * `SERVICE_UNAVAILABLE`-mapped error when sources are unreadable — never a
   * partial/faked bundle.
   */
  compile(
    input: CompileAgentOsInstructionBundleInput,
  ): Promise<CompileAgentOsInstructionBundleResult>;

  /** Truthful compiler health: `down` when instruction sources are unreadable. */
  health(): HealthStatus | Promise<HealthStatus>;
}
