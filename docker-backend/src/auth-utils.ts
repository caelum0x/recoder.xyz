import type express from 'express';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getProjectIdFromRequest(req: express.Request): string | undefined {
  const params = req.params as Record<string, string | undefined> | undefined;
  const body = req.body as Record<string, any> | undefined;
  const query = req.query as Record<string, any> | undefined;

  return (
    params?.projectId ||
    body?.projectId ||
    query?.projectId ||
    query?.containerId ||
    undefined
  );
}

export function isLikelySandboxProjectId(value?: string | null): value is string {
  if (!value) {
    return false;
  }

  return value.startsWith('project-') || UUID_RE.test(value);
}

function readFirstQueryString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim() || undefined;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim()) {
        return entry.trim();
      }
    }
  }

  return undefined;
}

export function resolveA2ASystemSession(
  token?: string | null,
  query: Record<string, unknown> = {},
): { userId: string; sessionId: string } | null {
  const normalizedToken = token?.trim();
  if (!normalizedToken) {
    return null;
  }

  const validTokens = [
    process.env.RECODER_A2A_SHARED_SECRET,
    process.env.RECODER_A2A_BRIDGE_TOKEN,
    process.env.RECODER_A2A_WORKER_TOKEN,
  ].filter((value): value is string => Boolean(value?.trim()));

  if (!validTokens.includes(normalizedToken)) {
    return null;
  }

  const agentId = readFirstQueryString(query.agentId) || 'a2a-bridge';
  const sessionId = readFirstQueryString(query.sessionId) || normalizedToken.slice(0, 8);

  return {
    userId: `agent:${agentId}`,
    sessionId,
  };
}

export function isStrictAuthMode(): boolean {
  // Allow explicit override via STRICT_AUTH=false (needed for web.recoder.xyz anonymous container creation)
  if (process.env.STRICT_AUTH === 'false') return false;
  const nodeEnv = process.env.NODE_ENV || 'development';
  return process.env.REQUIRE_AUTH === 'true' || nodeEnv === 'production';
}
