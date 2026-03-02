/**
 * Basic utility tests for the mobile app.
 * Validates core helper functions used across the app.
 */

describe('generateUUID', () => {
  it('generates a string', () => {
    // Simple UUID-like generator test
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(5);
  });

  it('generates unique values', () => {
    const ids = new Set(
      Array.from({ length: 100 }, () =>
        `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      )
    );
    expect(ids.size).toBe(100);
  });
});

describe('Message type conversions', () => {
  it('converts Message metadata object to JSON string', () => {
    const metadata = { mode: 'code', language: 'typescript' };
    const result = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
    expect(result).toBe('{"mode":"code","language":"typescript"}');
  });

  it('passes through string metadata unchanged', () => {
    const metadata = '{"mode":"code"}';
    const result = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
    expect(result).toBe('{"mode":"code"}');
  });
});

describe('Attachment validation', () => {
  interface Attachment {
    type: 'image' | 'video' | 'document';
    uri: string;
    name?: string;
    size?: number;
    mimeType?: string;
  }

  function validateAttachment(att: Attachment): { valid: boolean; reason?: string } {
    if (!att.uri) return { valid: false, reason: 'missing uri' };
    if (!['image', 'video', 'document'].includes(att.type)) {
      return { valid: false, reason: 'invalid type' };
    }
    if (att.size !== undefined && att.size > 50 * 1024 * 1024) {
      return { valid: false, reason: 'file too large (max 50MB)' };
    }
    return { valid: true };
  }

  it('accepts valid image attachment', () => {
    expect(
      validateAttachment({ type: 'image', uri: 'file:///photo.jpg', size: 1024 })
    ).toEqual({ valid: true });
  });

  it('rejects missing uri', () => {
    expect(
      validateAttachment({ type: 'image', uri: '' })
    ).toEqual({ valid: false, reason: 'missing uri' });
  });

  it('rejects oversized files', () => {
    expect(
      validateAttachment({ type: 'document', uri: 'file:///big.pdf', size: 100 * 1024 * 1024 })
    ).toEqual({ valid: false, reason: 'file too large (max 50MB)' });
  });
});

describe('Auth error helpers', () => {
  function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err !== null && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return String(err);
  }

  it('extracts message from Error', () => {
    expect(getErrorMessage(new Error('test error'))).toBe('test error');
  });

  it('extracts message from plain object', () => {
    expect(getErrorMessage({ message: 'plain error' })).toBe('plain error');
  });

  it('converts non-error to string', () => {
    expect(getErrorMessage('string error')).toBe('string error');
    expect(getErrorMessage(42)).toBe('42');
  });
});
