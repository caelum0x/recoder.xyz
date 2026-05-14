import { describe, expect, it } from 'vitest';
import { createPreviewAccessToken, verifyPreviewAccessToken } from './preview-access.js';

describe('preview-access', () => {
  it('creates and verifies a valid preview access token', () => {
    const token = createPreviewAccessToken({
      projectId: 'project-1',
      deploymentId: 'preview_123',
      mode: 'signed',
      ttlMs: 60_000,
      taskId: 'task-1',
    });

    const verification = verifyPreviewAccessToken(token, {
      projectId: 'project-1',
      deploymentId: 'preview_123',
    });

    expect(verification.ok).toBe(true);
    if (!verification.ok) return;
    expect(verification.payload.taskId).toBe('task-1');
    expect(verification.payload.mode).toBe('signed');
  });

  it('rejects mismatched project ids', () => {
    const token = createPreviewAccessToken({
      projectId: 'project-1',
      deploymentId: 'preview_123',
      mode: 'private',
      ttlMs: 60_000,
    });

    const verification = verifyPreviewAccessToken(token, {
      projectId: 'project-2',
    });

    expect(verification.ok).toBe(false);
  });

  it('rejects expired tokens', () => {
    const token = createPreviewAccessToken({
      projectId: 'project-1',
      deploymentId: 'preview_123',
      mode: 'signed',
      expiresAtMs: Date.now() - 1,
    });

    const verification = verifyPreviewAccessToken(token);
    expect(verification.ok).toBe(false);
  });
});

