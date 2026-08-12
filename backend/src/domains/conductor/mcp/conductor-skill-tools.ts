/**
 * The conductor `recoder_skill_list` + `recoder_skill_invoke` MCP tools — the
 * governed surface of the SKILL MODEL (LOOM Bigger Bet A), the typed, signed,
 * policy-gated replacement for Loom's free-argv plugin RCE surface. Thin, governed
 * bindings mirroring the conductor write tools EXACTLY:
 *
 *  - IDENTITY (SECURITY): the acting identity is the HOST-AUTHORIZED caller (2nd
 *    handler param), NEVER a free-form `args.userId`. Absent a caller ⇒
 *    `AUTH_REQUIRED`. A non-privileged caller may only act as its OWN subject;
 *    only an `admin`/`internal` caller may name another subject (403 otherwise).
 *  - GOVERNANCE: `recoder_skill_invoke` delegates to the composer's
 *    {@link SkillInvokeSurface}, which runs `evaluatePolicy` BEFORE any execution
 *    (deny ⇒ refuse; needs_approval ⇒ approval gate; allow ⇒ execute). The tool
 *    itself NEVER executes a skill.
 *  - TRUTHFULNESS: refusals carry the real reason; a needs_approval returns a
 *    request id and does NOT execute; the skill model unwired ⇒ the composer
 *    throws `SERVICE_UNAVAILABLE` (never a faked success/empty list).
 */
import { createError, ErrorCode } from '../../../shared/errors.js';
import type {
  McpToolCaller,
  McpToolRegistration,
} from '../../../shared/module-base.js';
import type { InvokeSkillActionResult } from '../skill/skill-action.service.js';

/** A read-only, verification-truthful projection of a verified skill for listing. */
export interface VerifiedSkillView {
  readonly id: string;
  readonly version: string;
  readonly publisherKeyId: string;
  readonly actions: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly requiredCapabilities: readonly string[];
    readonly params: ReadonlyArray<{
      readonly name: string;
      readonly type: string;
      readonly required: boolean;
      readonly enum?: readonly string[];
    }>;
  }>;
}

/**
 * The narrow composer seam these tools bind to. The composer enforces the
 * SERVICE_UNAVAILABLE refusal when the skill model is unwired, and runs the
 * governed invoke pipeline (policy → approval/execute).
 */
export interface SkillInvokeSurface {
  listVerifiedSkills(): Promise<readonly VerifiedSkillView[]>;
  invokeSkillAction(input: {
    readonly skillId: string;
    readonly actionId: string;
    readonly params: unknown;
    readonly actorId: string;
    readonly workspace: string;
  }): Promise<InvokeSkillActionResult>;
}

/** Trim to a non-empty string, or `undefined`. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Coerce raw MCP args to a record without trusting the shape. */
function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** Does the caller carry an elevated scope that may act as another subject? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/** Require an authorized caller identity — absent ⇒ `AUTH_REQUIRED` (never guess a tenant). */
function requireCaller(caller: McpToolCaller | undefined): McpToolCaller {
  if (!caller || !str(caller.userId)) {
    throw createError(ErrorCode.AUTH_REQUIRED, 'conductor: no authorized caller identity');
  }
  return caller;
}

/**
 * Resolve the acting subject bound to the HOST-AUTHORIZED caller. A non-privileged
 * caller may only act as its OWN subject; naming another is a 403 unless the caller
 * is admin/internal.
 */
function resolveActor(caller: McpToolCaller, body: Record<string, unknown>): string {
  const authUserId = str(caller.userId)!;
  const requested = str(body.userId);
  if (requested && requested !== authUserId) {
    if (!isPrivileged(caller)) {
      throw createError(
        ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
        'conductor: caller may only invoke skills as its own userId',
      );
    }
    return requested;
  }
  return authUserId;
}

/**
 * Build the governed skill tools bound to the composer's skill surface. Kept
 * SEPARATE from the other tool builders so their registration is explicit at the composer.
 */
export function buildConductorSkillTools(
  surface: SkillInvokeSurface,
): readonly McpToolRegistration[] {
  return [
    {
      name: 'recoder_skill_list',
      description:
        'List the VERIFIED skills available to the caller (signature + pinned version already checked at load): { skills:[{ id, version, publisherKeyId, actions:[{ id, title, requiredCapabilities, params:[{ name, type, required, enum? }] }] }] }. Read-only. Requires an authorized caller. Only verified skills are ever returned — an unsigned/unpinned/unknown-publisher manifest is never listed. The skill model unwired ⇒ SERVICE_UNAVAILABLE (never a faked empty list).',
      handler: async (_raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller);
        const skills = await surface.listVerifiedSkills();
        return { skills };
      },
    },
    {
      name: 'recoder_skill_invoke',
      description:
        'Invoke ONE typed action of a VERIFIED skill. Args: skillId (required), actionId (required), params (object matching the action\'s typed schema — NO free-argv), workspace (required worktree path), userId (optional — admin/internal only). Owner-scoped: a non-privileged caller acts only as its OWN userId (naming another is a 403). GOVERNED: policy is evaluated BEFORE any execution — deny ⇒ { status:\'refused\', reason }; needs_approval ⇒ { status:\'needs_approval\', requestId } (NOT executed); allow ⇒ { status:\'executed\', result }. An unknown/unsigned/unpinned skill, or params that fail the typed schema, ⇒ refused (never executed). The executor runs in the worktree with ONLY the typed params + granted capabilities (no ambient env/secrets); unwired ⇒ SERVICE_UNAVAILABLE.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const authorized = requireCaller(caller);
        const body = asObject(raw);
        const actorId = resolveActor(authorized, body);

        const skillId = str(body.skillId);
        if (!skillId) throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'skillId is required');
        const actionId = str(body.actionId);
        if (!actionId) throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'actionId is required');
        const workspace = str(body.workspace);
        if (!workspace) throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'workspace is required');

        return surface.invokeSkillAction({
          skillId,
          actionId,
          params: body.params ?? {},
          actorId,
          workspace,
        });
      },
    },
  ];
}
