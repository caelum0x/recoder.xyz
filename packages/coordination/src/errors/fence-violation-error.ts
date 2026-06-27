/**
 * FenceTokenViolationError — a stale writer presented a fence token lower than
 * the current lease token. The store rejects the write even if the lock row
 * still exists. Closes the "slow agent resumes after re-acquire" race.
 */

import { CoordinationError } from './coordination-error';
import { CoordinationErrorCode } from './error-codes';

export class FenceTokenViolationError extends CoordinationError {
  readonly presentedToken: number;
  readonly currentToken: number;

  constructor(presentedToken: number, currentToken: number) {
    super(
      CoordinationErrorCode.FENCE_VIOLATION,
      `Stale fence token ${presentedToken} rejected; current token is ${currentToken}.`,
      { presentedToken, currentToken },
    );
    this.name = 'FenceTokenViolationError';
    this.presentedToken = presentedToken;
    this.currentToken = currentToken;
  }
}
