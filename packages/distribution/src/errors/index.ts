/**
 * Distribution error codes. Each maps to a `failed` RunEvent (`data.code`).
 */
export type DistributionErrorCode =
  | 'entitlement_denied'
  | 'approval_required'
  | 'approval_rejected'
  | 'quota_exceeded'
  | 'device_limit_exceeded'
  | 'registry_failed'
  | 'tap_push_failed'
  | 'sign_failed'
  | 'notarize_failed'
  | 'preview_unhealthy'
  | 'publish_failed'
  | 'key_missing'
  | 'webhook_untrusted'
  | 'invalid_input'
  | 'provider_unavailable';

/** Base error for the distribution subsystem. */
export class DistributionError extends Error {
  readonly code: DistributionErrorCode;
  readonly detail?: Readonly<Record<string, unknown>>;

  constructor(code: DistributionErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = 'DistributionError';
    this.code = code;
    if (detail) this.detail = detail;
  }
}

/**
 * A degraded-mode error: a required key/dependency is missing. The production
 * fail-safe rule — surface as environment evidence + unhealthy, never a faked
 * success.
 */
export class FailSafeError extends DistributionError {
  constructor(message: string, detail?: Record<string, unknown>) {
    super('key_missing', message, detail);
    this.name = 'FailSafeError';
  }
}

/** Raised when a customer-visible delivery lacks a recorded approval. */
export class ApprovalRequiredError extends DistributionError {
  constructor(message: string, detail?: Record<string, unknown>) {
    super('approval_required', message, detail);
    this.name = 'ApprovalRequiredError';
  }
}

/** Raised when an actor is not entitled to a channel/feature. */
export class EntitlementDeniedError extends DistributionError {
  constructor(message: string, detail?: Record<string, unknown>) {
    super('entitlement_denied', message, detail);
    this.name = 'EntitlementDeniedError';
  }
}

/**
 * Raised when registering a device would exceed the per-seat device limit. The
 * `detail` carries the `limit`, the current `activeCount`, and the active
 * device ids so a caller can present an explicit revoke/approve choice — the
 * registration does NOT silently displace an existing device (fail safe).
 */
export class DeviceLimitExceededError extends DistributionError {
  constructor(message: string, detail?: Record<string, unknown>) {
    super('device_limit_exceeded', message, detail);
    this.name = 'DeviceLimitExceededError';
  }
}
