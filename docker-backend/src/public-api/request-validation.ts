export class RequestValidationError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function requireNonEmptyString(
  value: unknown,
  field: string,
  code: string = 'MISSING_REQUIRED_FIELD'
): string {
  if (typeof value !== 'string') {
    throw new RequestValidationError(code, `${field} is required and must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new RequestValidationError(code, `${field} is required and must be a non-empty string`);
  }
  return trimmed;
}

export function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function parseRouteIds(params: Record<string, string | undefined>): { id: string; taskId?: string } {
  const id = requireNonEmptyString(params.id, 'id', 'INVALID_REQUEST');
  const taskId = params.taskId ? requireNonEmptyString(params.taskId, 'taskId', 'INVALID_REQUEST') : undefined;
  return { id, taskId };
}
