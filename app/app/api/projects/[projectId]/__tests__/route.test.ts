// @vitest-environment node
/**
 * Project detail route tests — PATCH /api/projects/[projectId]
 *
 * Focus: the cross-tenant project-takeover guard. The snapshot upsert conflicts
 * on `project_id` ALONE and reassigns `user_id = EXCLUDED.user_id`, so without an
 * ownership check any authenticated caller could PATCH an arbitrary projectId,
 * overwrite its files, and silently steal ownership. Identity is always resolved
 * from the verified session/internal signature — never from the request body.
 *
 * These handlers run in the `node` environment (see the pragma above) with
 * prisma/auth/snapshot helpers mocked, so they are deterministic regardless of
 * the app's jsdom/React unit-test mismatch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth-config', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('@/lib/auth-helpers', () => ({
  ensureAppUserFromAuthUser: vi.fn(),
}));

vi.mock('@/lib/internal-service-auth', () => ({
  verifyInternalServiceRequest: vi.fn(),
}));

vi.mock('@/lib/project-snapshots', () => ({
  getProjectSnapshotOwnerId: vi.fn(),
  getProjectSnapshotWithLegacyFallback: vi.fn(),
  patchProjectSnapshotFiles: vi.fn(),
  getProjectMessageCount: vi.fn(),
  getProjectMessages: vi.fn(),
}));

import { PATCH } from '@/app/api/projects/[projectId]/route';
import { auth } from '@/lib/auth-config';
import { ensureAppUserFromAuthUser } from '@/lib/auth-helpers';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';
import {
  getProjectSnapshotOwnerId,
  getProjectSnapshotWithLegacyFallback,
  patchProjectSnapshotFiles,
} from '@/lib/project-snapshots';

const mockGetSession = vi.mocked(auth.api.getSession);
const mockEnsureAppUser = vi.mocked(ensureAppUserFromAuthUser);
const mockVerifyInternal = vi.mocked(verifyInternalServiceRequest);
const mockGetOwnerId = vi.mocked(getProjectSnapshotOwnerId);
const mockGetWithFallback = vi.mocked(getProjectSnapshotWithLegacyFallback);
const mockPatch = vi.mocked(patchProjectSnapshotFiles);

const ATTACKER_ID = 'attacker-user';
const VICTIM_ID = 'victim-user';

function buildPatchRequest(
  projectId: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function params(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

/** Authenticate as a web session user whose app-user id matches the session id. */
function authAs(userId: string) {
  mockGetSession.mockResolvedValue({ user: { id: userId, email: `${userId}@example.com` } } as any);
  mockEnsureAppUser.mockResolvedValue({ id: userId } as any);
}

describe('PATCH /api/projects/[projectId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPatch.mockResolvedValue({
      projectId: 'proj',
      urlId: null,
      files: { 'index.html': 'x' },
      directories: [],
      updatedAt: new Date().toISOString(),
    } as any);
  });

  it('returns 401 when the caller is not authenticated', async () => {
    mockGetSession.mockResolvedValue(null as any);

    const res = await PATCH(
      buildPatchRequest('victim-project', { files: { 'index.html': '<pwned>' } }),
      params('victim-project'),
    );

    expect(res.status).toBe(401);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('blocks cross-tenant takeover: attacker PATCHing a victim project gets 404 and no write', async () => {
    // Attacker is a fully authenticated user.
    authAs(ATTACKER_ID);
    // The project already exists and is owned by the victim.
    mockGetOwnerId.mockResolvedValue(VICTIM_ID);
    // The attacker does NOT own it (nor via any legacy counterpart id).
    mockGetWithFallback.mockResolvedValue(null);

    const res = await PATCH(
      buildPatchRequest('victim-project', { files: { 'index.html': '<pwned>' } }),
      params('victim-project'),
    );

    // Existence is not disclosed and, crucially, the upsert never runs — so the
    // victim's files and user_id ownership are left intact.
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('lets the legitimate owner patch their own existing project', async () => {
    authAs(VICTIM_ID);
    mockGetOwnerId.mockResolvedValue(VICTIM_ID);
    mockGetWithFallback.mockResolvedValue({ projectId: 'victim-project', userId: VICTIM_ID } as any);

    const res = await PATCH(
      buildPatchRequest('victim-project', { files: { 'index.html': 'safe' } }),
      params('victim-project'),
    );

    expect(res.status).toBe(200);
    // The write is scoped to the VERIFIED session identity, never the body.
    expect(mockPatch).toHaveBeenCalledWith(
      VICTIM_ID,
      'victim-project',
      expect.objectContaining({ files: { 'index.html': 'safe' } }),
    );
  });

  it('allows creating a brand-new (non-existent) project', async () => {
    authAs(ATTACKER_ID);
    // No snapshot exists for this id yet — a genuine create, allowed to fall through.
    mockGetOwnerId.mockResolvedValue(null);

    const res = await PATCH(
      buildPatchRequest('fresh-project', { files: { 'index.html': 'new' } }),
      params('fresh-project'),
    );

    expect(res.status).toBe(200);
    expect(mockGetWithFallback).not.toHaveBeenCalled();
    expect(mockPatch).toHaveBeenCalledWith(
      ATTACKER_ID,
      'fresh-project',
      expect.objectContaining({ files: { 'index.html': 'new' } }),
    );
  });

  it('preserves the signed internal-service flow (identity from x-user-id, not body)', async () => {
    // No web session; the caller authenticates via a valid internal signature.
    mockGetSession.mockResolvedValue(null as any);
    mockVerifyInternal.mockReturnValue({ ok: true } as any);
    mockGetOwnerId.mockResolvedValue(null);

    const res = await PATCH(
      buildPatchRequest(
        'svc-project',
        { files: { 'index.html': 'svc' } },
        {
          'x-internal-service-key': 'k',
          'x-internal-signature': 's',
          'x-internal-timestamp': 't',
          'x-internal-nonce': 'n',
          'x-user-id': 'service-acting-user',
        },
      ),
      params('svc-project'),
    );

    expect(res.status).toBe(200);
    expect(mockPatch).toHaveBeenCalledWith(
      'service-acting-user',
      'svc-project',
      expect.objectContaining({ files: { 'index.html': 'svc' } }),
    );
  });

  it('rejects an internal request whose signature does not verify', async () => {
    mockGetSession.mockResolvedValue(null as any);
    mockVerifyInternal.mockReturnValue({ ok: false } as any);

    const res = await PATCH(
      buildPatchRequest(
        'svc-project',
        { files: { 'index.html': 'svc' } },
        {
          'x-internal-service-key': 'k',
          'x-internal-signature': 'bad',
          'x-internal-timestamp': 't',
          'x-internal-nonce': 'n',
          'x-user-id': VICTIM_ID,
        },
      ),
      params('svc-project'),
    );

    expect(res.status).toBe(401);
    expect(mockPatch).not.toHaveBeenCalled();
  });
});
