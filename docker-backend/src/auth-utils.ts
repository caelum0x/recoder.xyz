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

export function isStrictAuthMode(): boolean {
  // Allow explicit override via STRICT_AUTH=false (needed for web.recoder.xyz anonymous container creation)
  if (process.env.STRICT_AUTH === 'false') return false;
  const nodeEnv = process.env.NODE_ENV || 'development';
  return process.env.REQUIRE_AUTH === 'true' || nodeEnv === 'production';
}
