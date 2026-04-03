import { describe, expect, it } from 'vitest';

import { normalizeDockerWebSocketPath } from './docker-api';

describe('normalizeDockerWebSocketPath', () => {
  it('leaves canonical watch paths unchanged', () => {
    expect(normalizeDockerWebSocketPath('/watch/project-123')).toBe('/watch/project-123');
  });

  it('rewrites legacy watch websocket paths', () => {
    expect(normalizeDockerWebSocketPath('/api/watch/project-123')).toBe('/watch/project-123');
  });

  it('rewrites legacy terminal websocket paths to terminalId query params', () => {
    expect(normalizeDockerWebSocketPath('/api/terminal/project-123/term-456'))
      .toBe('/terminal/project-123?terminalId=term-456');
  });

  it('preserves existing query params when rewriting legacy terminal paths', () => {
    expect(normalizeDockerWebSocketPath('/api/terminal/project-123/term-456?foo=bar'))
      .toBe('/terminal/project-123?foo=bar&terminalId=term-456');
  });

  it('does not override an existing terminalId query param', () => {
    expect(normalizeDockerWebSocketPath('/api/terminal/project-123/term-456?terminalId=term-999'))
      .toBe('/terminal/project-123?terminalId=term-999');
  });
});
