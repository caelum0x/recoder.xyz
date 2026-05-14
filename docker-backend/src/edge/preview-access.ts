import crypto from 'crypto';

export type PreviewProtectionMode = 'public' | 'signed' | 'private';

export interface PreviewAccessTokenPayload {
  projectId: string;
  deploymentId: string;
  mode: Exclude<PreviewProtectionMode, 'public'>;
  exp: number;
  taskId?: string;
}

function getPreviewAccessSecret(): string {
  return process.env.RECODER_PREVIEW_ACCESS_SECRET || 'recoder-preview-access-dev-secret';
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(value: string): string {
  return crypto
    .createHmac('sha256', getPreviewAccessSecret())
    .update(value)
    .digest('base64url');
}

export function createPreviewAccessToken(
  input: Omit<PreviewAccessTokenPayload, 'exp'> & { expiresAtMs?: number; ttlMs?: number },
): string {
  const exp = input.expiresAtMs ?? Date.now() + (input.ttlMs ?? 24 * 60 * 60 * 1000);
  const payload: PreviewAccessTokenPayload = {
    projectId: input.projectId,
    deploymentId: input.deploymentId,
    mode: input.mode,
    exp,
    ...(input.taskId ? { taskId: input.taskId } : {}),
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyPreviewAccessToken(
  token: string,
  options: {
    projectId?: string;
    deploymentId?: string;
    nowMs?: number;
  } = {},
): { ok: true; payload: PreviewAccessTokenPayload } | { ok: false; error: string } {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: 'Missing preview access token' };

  const [encodedPayload, signature] = trimmed.split('.');
  if (!encodedPayload || !signature) {
    return { ok: false, error: 'Malformed preview access token' };
  }

  const expectedSignature = sign(encodedPayload);
  if (signature !== expectedSignature) {
    return { ok: false, error: 'Invalid preview access token signature' };
  }

  let payload: PreviewAccessTokenPayload;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload)) as PreviewAccessTokenPayload;
  } catch {
    return { ok: false, error: 'Invalid preview access token payload' };
  }

  const nowMs = options.nowMs ?? Date.now();
  if (!payload.projectId || !payload.deploymentId || !payload.mode || !payload.exp) {
    return { ok: false, error: 'Preview access token payload is incomplete' };
  }
  if (payload.exp <= nowMs) {
    return { ok: false, error: 'Preview access token has expired' };
  }
  if (options.projectId && payload.projectId !== options.projectId) {
    return { ok: false, error: 'Preview access token project mismatch' };
  }
  if (options.deploymentId && payload.deploymentId !== options.deploymentId) {
    return { ok: false, error: 'Preview access token deployment mismatch' };
  }

  return { ok: true, payload };
}

