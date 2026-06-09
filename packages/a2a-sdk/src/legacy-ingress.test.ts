import { describe, expect, it } from 'vitest';
import { normalizeLegacyInboundEnvelope } from './legacy-ingress';

describe('normalizeLegacyInboundEnvelope', () => {
  it('normalizes a legacy recoder envelope through the shared TaskEnvelope contract', () => {
    const result = normalizeLegacyInboundEnvelope(
      {
        messageId: 'msg-legacy-1',
        threadId: 'thread-legacy-1',
        intent: 'execute',
        from: { id: 'sender', platform: 'unknown-platform' },
        to: { id: 'agency', platform: 'recoder_agency' },
        payload: [{ kind: 'text', text: 'hello' }],
      },
      { workspaceId: 'agency-workspace' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.legacyEnvelope.from.platform).toBe('custom');
    expect(result.legacyEnvelope.to.name).toBe('agency');
    expect(result.envelope.workspace_id).toBe('agency-workspace');
    expect(result.envelope.requester.platform).toBe('custom');
    expect(result.envelope.connector.connector_id).toBe('agency');
  });

  it('returns legacy-path issues for invalid legacy input', () => {
    const result = normalizeLegacyInboundEnvelope(
      {
        messageId: 'msg-legacy-2',
        threadId: 'thread-legacy-2',
        intent: 'execute',
        from: { id: 'sender', platform: 'custom' },
        to: { id: 'agency', platform: 'recoder_agency' },
        payload: [{ kind: 'text', text: '' }],
      },
      { workspaceId: 'agency-workspace', sourcePath: 'body' },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.issues).toContainEqual({
      path: 'body.payload[0].text',
      message: 'must be a non-empty string',
    });
  });
});
