/**
 * The GOVERNED SKILL MODEL contract (LOOM Bigger Bet A) — the typed, signed,
 * capability-gated replacement for Loom's upstream free-argv plugin surface (an
 * RCE hole). A skill declares TYPED actions, each carrying the CAPABILITIES it
 * needs; invoking one is policy-gated BEFORE any execution. There is NO free-form
 * command string anywhere in this contract — an action's inputs are a closed,
 * typed param schema, never argv.
 *
 * SECURITY INVARIANTS encoded by these types:
 *  - A manifest is INERT until VERIFIED (signature + pinned version). The registry
 *    exposes only verified skills; an unsigned / bad-signature / unpinned /
 *    unknown-publisher manifest is never resolvable and thus never invocable.
 *  - An action's params are a TYPED schema (no free-argv); an invocation validates
 *    against it and refuses on any mismatch BEFORE policy or execution.
 *  - Execution flows ONLY through an injected {@link SkillActionExecutor} that
 *    receives the typed params + the granted capabilities — never ambient env or
 *    inherited secrets.
 */

/** The primitive kinds a typed action param may take — a closed set, never argv. */
export type SkillParamType = 'string' | 'number' | 'boolean';

/** A single typed parameter declaration for an action (capability-typed input). */
export interface SkillParamSpec {
  readonly type: SkillParamType;
  /** Whether the caller MUST supply this param (default: false). */
  readonly required?: boolean;
  /** For a `string` param, the closed set of allowed values (optional). */
  readonly enum?: readonly string[];
}

/**
 * The typed param schema of an action: a closed map of param name → spec. An
 * invocation that supplies a key not in this map is REFUSED (no free-argv), and
 * every declared param is type/enum/required-checked before anything runs.
 */
export type SkillActionParamsSchema = Readonly<Record<string, SkillParamSpec>>;

/**
 * ONE typed, capability-gated action a skill exposes. `requiredCapabilities` is
 * the closed set of capability tokens the action needs; they are carried into the
 * policy input so a deny / needs_approval rule can genuinely gate the call, and
 * they are the ONLY grant handed to the executor (capability-scoped execution).
 */
export interface SkillAction {
  readonly id: string;
  readonly title: string;
  readonly paramsSchema: SkillActionParamsSchema;
  readonly requiredCapabilities: readonly string[];
}

/**
 * A signed skill manifest. `signature` is an ed25519 signature (hex or base64)
 * over the canonical manifest MINUS the signature field, produced by the holder
 * of the private key for `publisherKeyId`. A manifest with an empty/invalid
 * signature, or a `publisherKeyId` that resolves to no trusted key, is REJECTED
 * at load and never becomes invocable.
 */
export interface SkillManifest {
  readonly id: string;
  readonly version: string;
  readonly publisherKeyId: string;
  readonly signature: string;
  readonly actions: readonly SkillAction[];
}

/** The signed body of a manifest (everything the signature covers — no `signature`). */
export type SkillManifestSigningBody = Omit<SkillManifest, 'signature'>;

/** A manifest that PASSED verification (signature + pinned version) at load. */
export interface VerifiedSkill {
  readonly manifest: SkillManifest;
}

/** Why a manifest was rejected at load — a truthful, machine-readable reason. */
export type SkillRejectionReason =
  | 'malformed'
  | 'unsigned'
  | 'bad_signature'
  | 'unknown_publisher'
  | 'not_pinned'
  | 'version_mismatch'
  | 'duplicate_id'
  | 'verifier_fault';

/** A per-manifest load outcome (kept for a truthful, auditable load report). */
export type SkillLoadOutcome =
  | { readonly id: string; readonly ok: true }
  | { readonly id: string; readonly ok: false; readonly reason: SkillRejectionReason };

/**
 * The outcome of verifying a manifest's signature against its publisher key. The
 * verifier NEVER throws on untrusted input — a malformed key/signature or an
 * unknown publisher is a truthful `{ ok: false, reason }`, never an exception.
 */
export type SkillVerificationOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'unsigned' | 'bad_signature' | 'unknown_publisher' };

/**
 * The injected signature-verifier seam. Production binds this to the repo's real
 * ed25519 verification (`@recoder/interop`); tests inject a fake. It is the ONLY
 * authority on whether a manifest is authentically signed by a trusted publisher.
 */
export interface SkillSignatureVerifier {
  verify(manifest: SkillManifest): SkillVerificationOutcome | Promise<SkillVerificationOutcome>;
}

/**
 * The capability-scoped context handed to the executor on the ALLOW path. It
 * carries ONLY the typed, validated params + the granted capabilities + the
 * target worktree — and DELIBERATELY nothing else: no `env`, no secrets, no
 * ambient process state. The executor runs in `workspace` with exactly these
 * inputs, so a skill cannot reach beyond its declared capabilities.
 */
export interface SkillActionContext {
  readonly skillId: string;
  readonly actionId: string;
  /** The validated, typed params (a copy — never the caller's mutable object). */
  readonly params: Readonly<Record<string, string | number | boolean>>;
  /** The granted capabilities == the action's `requiredCapabilities` (nothing more). */
  readonly capabilities: readonly string[];
  /** The worktree the action executes in (no ambient cwd). */
  readonly workspace: string;
}

/** A truthful execution result — never a fabricated success. */
export interface SkillActionOutcome {
  readonly ok: boolean;
  readonly output?: unknown;
  readonly error?: string;
}

/**
 * The injected executor seam — the ONLY thing that actually runs an action, in
 * the workspace worktree, over the capability-scoped {@link SkillActionContext}.
 * Absent (unwired) ⇒ the service refuses with `SERVICE_UNAVAILABLE`, never a
 * faked success.
 */
export interface SkillActionExecutor {
  execute(ctx: SkillActionContext): Promise<SkillActionOutcome>;
}
