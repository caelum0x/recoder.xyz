/**
 * Conductor API client — the herd view reads the SAME control-plane API the
 * cockpit uses (GET /api/conductor/workspaces). Canonical state stays in the
 * conductor; this surface only reads and attaches. Responses use the backend's
 * `{ success, data }` envelope; errors are surfaced truthfully, never masked
 * as an empty herd.
 */
import type { Workspace } from '@recoder/agent-os';

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { message?: string } | string;
}

export class HerdBackendError extends Error {}

export async function fetchWorkspaces(backend: string, token?: string): Promise<Workspace[]> {
  let res: Response;
  try {
    res = await fetch(`${backend}/api/conductor/workspaces`, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
  } catch (err) {
    throw new HerdBackendError(
      `backend unreachable at ${backend} — is Recoder running? (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  if (!res.ok) {
    throw new HerdBackendError(`backend replied ${res.status} for /api/conductor/workspaces`);
  }
  const body = (await res.json()) as Envelope<Workspace[]> | Workspace[];
  if (Array.isArray(body)) return body;
  if (body.success && Array.isArray(body.data)) return body.data;
  const message = typeof body.error === 'string' ? body.error : body.error?.message;
  throw new HerdBackendError(message || 'unexpected workspaces payload');
}
