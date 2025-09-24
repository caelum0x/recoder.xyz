/**
 * Utility functions for proper error handling in TypeScript strict mode
 */

/**
 * Safely extracts error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

/**
 * Safely logs error and returns formatted message
 */
export function logAndFormatError(error: unknown, context: string): string {
  const message = getErrorMessage(error);
  console.error(`${context}:`, error);
  return message;
}

/**
 * Creates a safe error response for API routes
 */
export function createErrorResponse(error: unknown, userMessage: string, includeDetails = false) {
  return {
    success: false,
    error: userMessage,
    details: includeDetails ? getErrorMessage(error) : undefined
  };
}