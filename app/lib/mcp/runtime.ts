const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

export class MCPRuntimeDisabledError extends Error {
  constructor() {
    super('MCP runtime is temporarily disabled in production');
    this.name = 'MCPRuntimeDisabledError';
  }
}

export function isMcpRuntimeEnabled(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  return TRUTHY_VALUES.has((process.env.MCP_RUNTIME_ENABLED || '').trim().toLowerCase());
}

export function assertMcpRuntimeEnabled(): void {
  if (!isMcpRuntimeEnabled()) {
    throw new MCPRuntimeDisabledError();
  }
}

export function toMcpRuntimeErrorResponse(message = 'MCP runtime is temporarily disabled') {
  return {
    body: { error: message },
    status: 503,
  } as const;
}

export function isMcpRuntimeDisabledError(error: unknown): error is MCPRuntimeDisabledError {
  return error instanceof MCPRuntimeDisabledError;
}
