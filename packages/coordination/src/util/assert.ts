/**
 * invariant() — guards an impossible state. Throws an InvariantViolation that
 * the engine edge catches and maps to a Result. Use for "this can never happen
 * unless a writer bypassed the engine" conditions (e.g. overlapping locks).
 */

export class InvariantViolation extends Error {
  constructor(message: string) {
    super(`Invariant violated: ${message}`);
    this.name = 'InvariantViolation';
  }
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new InvariantViolation(message);
  }
}

/** Exhaustiveness guard for discriminated unions. */
export function assertNever(value: never, message = 'unexpected variant'): never {
  throw new InvariantViolation(`${message}: ${JSON.stringify(value)}`);
}
