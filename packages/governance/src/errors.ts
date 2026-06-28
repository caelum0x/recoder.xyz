/**
 * Typed error hierarchy for the governance subsystem.
 *
 * Every governance failure is a `GovernanceError` subclass carrying a stable
 * `code` so callers (and the fallback path) can branch deterministically. None
 * of these errors should ever leak secret-shaped material in their messages;
 * sanitization happens at the boundary that constructs them.
 */

export type GovernanceErrorCode =
  | 'GOVERNANCE_CONFIG_INVALID'
  | 'GOVERNANCE_DAEMON_UNAVAILABLE'
  | 'GOVERNANCE_ENFORCEMENT_DENIED'
  | 'GOVERNANCE_APPROVAL_TIMEOUT'
  | 'GOVERNANCE_APPROVAL_NOT_FOUND'
  | 'GOVERNANCE_APPROVAL_ALREADY_RESOLVED'
  | 'GOVERNANCE_AUDIT_TAMPERED'
  | 'GOVERNANCE_AUDIT_NOT_FOUND'
  | 'GOVERNANCE_ROUTING_DENIED'
  | 'GOVERNANCE_INTERNAL';

export class GovernanceError extends Error {
  readonly code: GovernanceErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: GovernanceErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'GovernanceError';
    this.code = code;
    this.details = details;
    // Preserve prototype chain across transpilation targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Configuration failed zod validation or required fields were missing. */
export class GovernanceConfigError extends GovernanceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('GOVERNANCE_CONFIG_INVALID', message, details);
    this.name = 'GovernanceConfigError';
  }
}

/**
 * The Rust governance daemon (or its FFI fallback) is unreachable. This is NOT
 * an allow — callers must downgrade to the conservative fallback enforcer.
 */
export class DaemonUnavailableError extends GovernanceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('GOVERNANCE_DAEMON_UNAVAILABLE', message, details);
    this.name = 'DaemonUnavailableError';
  }
}

/** Permission enforcement returned a hard deny. */
export class EnforcementDeniedError extends GovernanceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('GOVERNANCE_ENFORCEMENT_DENIED', message, details);
    this.name = 'EnforcementDeniedError';
  }
}

/** An approval gate timed out without a human decision. Fails closed (deny). */
export class ApprovalTimeoutError extends GovernanceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('GOVERNANCE_APPROVAL_TIMEOUT', message, details);
    this.name = 'ApprovalTimeoutError';
  }
}

export class ApprovalNotFoundError extends GovernanceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('GOVERNANCE_APPROVAL_NOT_FOUND', message, details);
    this.name = 'ApprovalNotFoundError';
  }
}

export class ApprovalAlreadyResolvedError extends GovernanceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('GOVERNANCE_APPROVAL_ALREADY_RESOLVED', message, details);
    this.name = 'ApprovalAlreadyResolvedError';
  }
}

/** The audit Merkle chain failed integrity verification at some sequence. */
export class AuditTamperError extends GovernanceError {
  readonly brokenAtSeq: number;

  constructor(message: string, brokenAtSeq: number, details?: Record<string, unknown>) {
    super('GOVERNANCE_AUDIT_TAMPERED', message, { ...details, brokenAtSeq });
    this.name = 'AuditTamperError';
    this.brokenAtSeq = brokenAtSeq;
  }
}

export class AuditNotFoundError extends GovernanceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('GOVERNANCE_AUDIT_NOT_FOUND', message, details);
    this.name = 'AuditNotFoundError';
  }
}

export class RoutingDeniedError extends GovernanceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('GOVERNANCE_ROUTING_DENIED', message, details);
    this.name = 'RoutingDeniedError';
  }
}

export function isGovernanceError(value: unknown): value is GovernanceError {
  return value instanceof GovernanceError;
}
