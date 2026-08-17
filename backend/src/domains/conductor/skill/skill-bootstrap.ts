/**
 * `createGovernedSkillModel` — the ONE composer that assembles the governed skill
 * model from deployment inputs, so bootstrap wiring is a thin, testable call rather
 * than ad-hoc glue. It returns `null` when no publisher keys are configured — the
 * feature stays OFF and the conductor's `recoder_skill_*` tools keep refusing
 * `SERVICE_UNAVAILABLE` truthfully (never a faked list/execution).
 *
 * Given a publisher-key allow-list + signed manifests, it:
 *   1. builds the real ed25519 verifier over the allow-list,
 *   2. loads the manifests into a registry PINNED to the first-party skill plus any
 *      extra pins (unsigned / unpinned / unknown-publisher manifests are rejected),
 *   3. binds the workspace resolver to the conductor's `getWorkspace` (owned-worktree
 *      containment), and the capability-dispatch executor to the enabled handlers,
 *   4. returns the `{ registry, service }` the conductor module injects.
 *
 * Trust + execution stay exactly as unit-proven elsewhere: signature/pinning at the
 * registry, capability-typed policy BEFORE execution, and fail-closed capability
 * dispatch (an action runs only if EVERY capability has a wired built-in handler).
 */
import type { Logger } from '../../../shared/logger.js';
import { evaluatePolicy } from '@recoder/agent-policy';
import { createSkillRegistry, type SkillRegistry } from './skill-registry.js';
import {
  createSkillActionService,
  type SkillActionService,
  type SkillApprovalPort,
} from './skill-action.service.js';
import { createEd25519SkillSignatureVerifier } from './skill-signature-verifier.js';
import { createCapabilityDispatchExecutor, type SkillCapabilityHandlers } from './skill-executor.js';
import { builtinReadOnlyWorkspaceCapabilities } from './skill-capabilities.js';
import { recoderWorkspaceSkillPin } from './skill-builtin-manifest.js';
import {
  createOwnedWorkspaceResolver,
  type OwnedWorkspaceLookup,
} from './skill-workspace-resolver.js';
import type { SkillLoadOutcome, SkillManifest } from './skill.types.js';

export interface GovernedSkillModelDeps {
  /** Trust allow-list: publisher keyId → ed25519 PUBLIC key (hex/base64/PEM). Empty ⇒ OFF. */
  readonly publisherKeys: Readonly<Record<string, string>>;
  /** The signed manifests to admit (from a deployment-configured source). */
  readonly manifests: readonly SkillManifest[];
  /** Extra {id → version} pins beyond the first-party skill (optional). */
  readonly extraPins?: Readonly<Record<string, string>>;
  /** The enabled built-in capability handlers; defaults to the read-only workspace set. */
  readonly capabilities?: SkillCapabilityHandlers;
  /** The conductor workspace store seam (owned-worktree resolution). */
  readonly getWorkspace: OwnedWorkspaceLookup['getWorkspace'];
  /** The governance approval port (opens an approval on a `needs_approval` verdict). */
  readonly approval: SkillApprovalPort;
  readonly logger: Logger;
}

export interface GovernedSkillModel {
  readonly registry: SkillRegistry;
  readonly service: SkillActionService;
  /** The per-manifest load report (truthful audit of what was admitted/rejected). */
  readonly loadReport: readonly SkillLoadOutcome[];
}

/**
 * Assemble the governed skill model, or `null` when no publisher keys are
 * configured (feature OFF — the conductor refuses truthfully). Never throws on a
 * bad manifest: a rejected manifest is recorded in `loadReport`, not admitted.
 */
export async function createGovernedSkillModel(
  deps: GovernedSkillModelDeps,
): Promise<GovernedSkillModel | null> {
  const keyIds = Object.keys(deps.publisherKeys);
  if (keyIds.length === 0) {
    deps.logger.info({}, 'governed skill model OFF: no publisher keys configured');
    return null;
  }

  const verifier = createEd25519SkillSignatureVerifier({
    resolveKey: (id) =>
      Object.prototype.hasOwnProperty.call(deps.publisherKeys, id) ? deps.publisherKeys[id] : null,
  });
  const pinned = { ...recoderWorkspaceSkillPin(), ...(deps.extraPins ?? {}) };
  const registry = createSkillRegistry({ verifier, pinned, logger: deps.logger });
  const loadReport = await registry.load(deps.manifests);

  const executor = createCapabilityDispatchExecutor({
    handlers: deps.capabilities ?? builtinReadOnlyWorkspaceCapabilities(),
    logger: deps.logger,
  });
  const resolveWorkspace = createOwnedWorkspaceResolver({ getWorkspace: deps.getWorkspace });

  const service = createSkillActionService({
    registry,
    evaluatePolicy,
    approval: deps.approval,
    resolveWorkspace,
    executor,
    logger: deps.logger,
  });

  const admitted = loadReport.filter((r) => r.ok).length;
  deps.logger.info(
    { publishers: keyIds.length, manifests: deps.manifests.length, admitted },
    'governed skill model ON',
  );
  return { registry, service, loadReport };
}
