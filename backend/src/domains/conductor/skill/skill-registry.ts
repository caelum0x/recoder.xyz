/**
 * `SkillRegistry` — loads skill manifests and admits ONLY the ones that are
 * authentically SIGNED and version-PINNED. This is the trust boundary of the
 * governed skill model: everything downstream (resolution, policy, execution)
 * operates exclusively over what this registry has verified.
 *
 * Admission checks, in fail-fast order, per manifest:
 *  1. STRUCTURE — well-formed id/version/publisherKeyId/signature + typed actions;
 *     otherwise `malformed`.
 *  2. PINNING   — the id must be in the injected pinned allow-list AND the version
 *     must match the pinned version; otherwise `not_pinned` / `version_mismatch`.
 *     An unpinned (or unknown) skill is never admitted — a supply-chain defense.
 *  3. SIGNATURE — the injected {@link SkillSignatureVerifier} must return ok;
 *     otherwise `unsigned` / `bad_signature` / `unknown_publisher`.
 *
 * A manifest that fails ANY check is REJECTED (recorded with a truthful reason for
 * audit) and is NEVER exposed by {@link list} / {@link resolveAction} — so it can
 * never be invoked, even if a caller names it directly.
 */
import type { Logger } from '../../../shared/logger.js';
import type {
  SkillAction,
  SkillLoadOutcome,
  SkillManifest,
  SkillRejectionReason,
  SkillSignatureVerifier,
  VerifiedSkill,
} from './skill.types.js';

/** The pinned allow-list: skill id → the ONE version permitted to load. */
export type PinnedSkillVersions = Readonly<Record<string, string>>;

export interface SkillRegistryDeps {
  readonly verifier: SkillSignatureVerifier;
  /** The pinned {id → version} allow-list; an id absent here is `not_pinned`. */
  readonly pinned: PinnedSkillVersions;
  readonly logger: Logger;
}

/** A resolved (skill, action) pair from the VERIFIED set — the invoke entry point. */
export interface ResolvedSkillAction {
  readonly manifest: SkillManifest;
  readonly action: SkillAction;
}

/** Structural validation of an untrusted manifest before any trust check. */
function isWellFormed(manifest: SkillManifest): boolean {
  if (
    !manifest ||
    typeof manifest.id !== 'string' ||
    manifest.id.trim().length === 0 ||
    typeof manifest.version !== 'string' ||
    manifest.version.trim().length === 0 ||
    typeof manifest.publisherKeyId !== 'string' ||
    manifest.publisherKeyId.trim().length === 0 ||
    typeof manifest.signature !== 'string' ||
    !Array.isArray(manifest.actions)
  ) {
    return false;
  }
  for (const action of manifest.actions) {
    if (
      !action ||
      typeof action.id !== 'string' ||
      action.id.trim().length === 0 ||
      typeof action.title !== 'string' ||
      !action.paramsSchema ||
      typeof action.paramsSchema !== 'object' ||
      !Array.isArray(action.requiredCapabilities)
    ) {
      return false;
    }
  }
  return true;
}

export class SkillRegistry {
  private readonly verifier: SkillSignatureVerifier;
  private readonly pinned: PinnedSkillVersions;
  private readonly log: Logger;
  /** The admitted set — keyed by skill id, verified + pinned only. */
  private readonly verified = new Map<string, VerifiedSkill>();

  constructor(deps: SkillRegistryDeps) {
    this.verifier = deps.verifier;
    this.pinned = deps.pinned;
    this.log = deps.logger;
  }

  /**
   * Load a batch of manifests, admitting only those that verify + are pinned.
   * Idempotent per id within the batch: a second manifest for an already-admitted
   * id is rejected `duplicate_id` (never silently overwrites a verified skill).
   * Returns a truthful per-manifest report for auditing.
   */
  async load(manifests: readonly SkillManifest[]): Promise<readonly SkillLoadOutcome[]> {
    const report: SkillLoadOutcome[] = [];
    for (const manifest of manifests) {
      const outcome = await this.admit(manifest);
      report.push(outcome);
    }
    return report;
  }

  /** Every VERIFIED skill (safe to expose — signature + pinning already passed). */
  list(): readonly VerifiedSkill[] {
    return [...this.verified.values()];
  }

  /**
   * Resolve a (skill, action) from the VERIFIED set only. An unknown/unverified
   * skill or an unknown action id ⇒ `null` — the invoke path treats that as a
   * refusal and never executes.
   */
  resolveAction(skillId: string, actionId: string): ResolvedSkillAction | null {
    const skill = this.verified.get(skillId);
    if (!skill) return null;
    const action = skill.manifest.actions.find((a) => a.id === actionId);
    if (!action) return null;
    return { manifest: skill.manifest, action };
  }

  // --- internals -------------------------------------------------------------

  private async admit(manifest: SkillManifest): Promise<SkillLoadOutcome> {
    const id = typeof manifest?.id === 'string' ? manifest.id : '<malformed>';

    if (!isWellFormed(manifest)) {
      return this.reject(id, 'malformed');
    }
    if (this.verified.has(manifest.id)) {
      return this.reject(manifest.id, 'duplicate_id');
    }

    // PINNING first — an unpinned/unknown or wrong-version skill never even
    // reaches signature verification.
    // Own-property lookup only — an exotic manifest id like 'constructor' must
    // resolve to not_pinned, never an inherited prototype value.
    const pinnedVersion = Object.prototype.hasOwnProperty.call(this.pinned, manifest.id)
      ? this.pinned[manifest.id]
      : undefined;
    if (pinnedVersion === undefined) {
      return this.reject(manifest.id, 'not_pinned');
    }
    if (pinnedVersion !== manifest.version) {
      return this.reject(manifest.id, 'version_mismatch');
    }

    // SIGNATURE — the injected verifier is the sole authority; never throws.
    let verification;
    try {
      verification = await this.verifier.verify(manifest);
    } catch (err: unknown) {
      this.log.error(
        { skillId: manifest.id, err: err instanceof Error ? err.message : String(err) },
        'skill signature verifier faulted — manifest rejected (fail-closed)',
      );
      return this.reject(manifest.id, 'verifier_fault');
    }
    if (!verification.ok) {
      return this.reject(manifest.id, verification.reason);
    }

    this.verified.set(manifest.id, { manifest });
    this.log.info(
      { skillId: manifest.id, version: manifest.version, actions: manifest.actions.length },
      'skill manifest verified + admitted',
    );
    return { id: manifest.id, ok: true };
  }

  private reject(id: string, reason: SkillRejectionReason): SkillLoadOutcome {
    this.log.warn({ skillId: id, reason }, 'skill manifest rejected at load');
    return { id, ok: false, reason };
  }
}

/** Build the skill registry over its trust seams. */
export function createSkillRegistry(deps: SkillRegistryDeps): SkillRegistry {
  return new SkillRegistry(deps);
}
