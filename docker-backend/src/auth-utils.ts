import type express from 'express';

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

export function isStrictAuthMode(): boolean {
  const nodeEnv = process.env.NODE_ENV || 'development';
  return process.env.REQUIRE_AUTH === 'true' || nodeEnv === 'production';
}
