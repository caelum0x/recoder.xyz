import type { AgentProfile } from '@recoder/agent-os';
import { type EnforcementResult, allowed, denied } from '../domain/enforcement-result';
import type { PermissionMode } from '../domain/permission-mode';
import type { ToolPolicy } from '../domain/tool-access';
import { resolveModeWithOverride } from './permission-modes';
import { checkBash, checkFileWrite } from './fallback-enforcer';
import { resolveToolAccess } from './tool-access';

/**
 * FallbackEnforcer — the enforcement facade used when the Rust daemon is down.
 * It composes coarse tool-access resolution (deny-wins) with the fine-grained
 * mode + file/bash checks, exactly as the blueprint's unified model specifies:
 *
 *   resolve_tool_access (coarse) -> if denied, short-circuit
 *   -> mode + check_file_write / check_bash (fine-grained)
 *
 * A denial from either layer short-circuits. Every result is degraded-flagged.
 */
export type EnforcementContext = {
  readonly actor: AgentProfile;
  readonly workspaceRoot?: string;
  readonly modeOverride?: string;
  /** Optional coarse tool-access policy; when absent, tool-access is skipped. */
  readonly toolPolicy?: ToolPolicy;
};

export class FallbackEnforcer {
  /**
   * Enforce a tool invocation. `input` is the bash command for shell tools, or a
   * file path for file-write tools (disambiguated by `kind`).
   */
  enforceTool(
    toolName: string,
    input: string,
    ctx: EnforcementContext,
    kind: 'bash' | 'file_write' | 'generic' = 'generic',
  ): EnforcementResult {
    const mode = resolveModeWithOverride(ctx.actor, ctx.modeOverride);

    // 1. Coarse deny-wins tool access.
    if (ctx.toolPolicy) {
      const access = resolveToolAccess(toolName, ctx.toolPolicy);
      if (access.effect === 'deny') {
        return denied({
          tool: toolName,
          activeMode: mode,
          requiredMode: 'allow',
          reason: access.reason,
          degraded: true,
        });
      }
    }

    // 2. Fine-grained mode + file/bash gating.
    switch (kind) {
      case 'bash':
        return checkBash({ tool: toolName, input, mode });
      case 'file_write':
        return checkFileWrite({ tool: toolName, path: input, workspaceRoot: ctx.workspaceRoot, mode });
      case 'generic':
      default:
        return this.enforceGeneric(toolName, mode);
    }
  }

  /**
   * A generic (non-bash, non-file-write) tool. Read-only-ish tools are allowed;
   * write-capable mode is presumed needed for tools that declare write/execute
   * modes in their capability set. Deny-biased default: read_only mode only
   * permits tools that never declared a write/execute/network mode.
   */
  private enforceGeneric(toolName: string, mode: PermissionMode): EnforcementResult {
    // Without a tool capability descriptor we cannot prove read-only; allow only
    // when the mode already permits writes, otherwise allow read-only by name
    // heuristic but deny known-mutating tool names.
    const looksMutating = /write|create|delete|deploy|push|publish|exec|run|install/i.test(toolName);
    if (!looksMutating) {
      return allowed(true);
    }
    if (mode === 'read_only') {
      return denied({
        tool: toolName,
        activeMode: mode,
        requiredMode: 'workspace_write',
        reason: `Tool '${toolName}' appears to mutate state; requires workspace_write under read_only mode.`,
        degraded: true,
      });
    }
    return allowed(true);
  }
}
