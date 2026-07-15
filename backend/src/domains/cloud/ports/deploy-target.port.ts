/**
 * `DeployTarget` + `PreviewService` — the deploy + signed-preview contract.
 *
 * FROZEN CONTRACT — Phase 10. `agent-os` (Run completion → preview) and `edge`
 * (signed preview passthrough) compile against `PreviewService`. A deploy is a
 * governance-gated write; the minted URL is HMAC-signed + expiring; health is a
 * REAL probe result, never inferred from a bare 200 (doc §8). Absent signing
 * secret / unreachable target ⇒ failed `Result`, never a faked `live`.
 */
import type { Result } from '../../../shared/result.js';
import type { AppError } from '../../../shared/errors.js';
import type {
  Deployment,
  DeployTargetKind,
  PreviewHealthStatus,
  SignedPreviewUrl,
} from '../types.js';

/** The request to deploy a run artifact to a preview target. */
export interface DeployInput {
  readonly tenantId: string;
  readonly runId?: string | null;
  readonly sandboxId?: string | null;
  readonly target: DeployTargetKind;
  readonly commitSha?: string | null;
  /** Artifact location the target pulls from (repo ref / bundle url / image). */
  readonly source?: string | null;
  readonly ttlSeconds?: number | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** A truthful preview health probe result. */
export interface PreviewHealth {
  readonly deploymentId: string;
  readonly status: PreviewHealthStatus;
  /** HTTP status the probe observed (`null` on connect failure). */
  readonly httpStatus: number | null;
  readonly checkedAt: string;
  readonly reason?: string;
}

/**
 * A single deploy backend (preview runner / static host / container target). The
 * `PreviewService` composes one or more of these; adapters are degrade-safe.
 */
export interface DeployTarget {
  readonly kind: DeployTargetKind;
  /** Truthful availability (drives module health). */
  available(): Promise<boolean>;
  /** Push the artifact live. Fail-safe: unreachable ⇒ `Err(SERVICE_UNAVAILABLE)`. */
  deploy(input: DeployInput): Promise<Result<Deployment, AppError>>;
  /** Probe the deployed target's REAL health. */
  probe(deployment: Deployment): Promise<PreviewHealth>;
}

/** The domain-facing preview surface (deploy + signed URL + health). */
export interface PreviewService {
  /** Deploy an artifact and persist the `Deployment` (governance-gated caller). */
  deploy(input: DeployInput): Promise<Result<Deployment, AppError>>;
  /** Current deployment status (tenant-scoped). */
  status(deploymentId: string, tenantId: string): Promise<Result<Deployment, AppError>>;
  /** Mint / return a signed, expiring preview URL for a deployment. */
  getSignedUrl(deploymentId: string, tenantId: string): Promise<Result<SignedPreviewUrl, AppError>>;
  /** Run a real health probe and persist the outcome. */
  health(deploymentId: string, tenantId: string): Promise<Result<PreviewHealth, AppError>>;
}
