import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const serverSource = readFileSync(resolve(__dirname, '../server.ts'), 'utf8');

describe('server abuse controls wiring', () => {
  it('records API and container rate-limit hits as abuse signals', () => {
    expect(serverSource).toContain("recordRateLimitAbuse(req, 'api');");
    expect(serverSource).toContain("recordRateLimitAbuse(req, 'container-create');");
    expect(serverSource).toContain('const event = abusePrevention.recordRateLimitHit(');
    expect(serverSource).toContain('alertFromAbuseEvent(event);');
  });

  it('keeps payload inspection opt-in and blocks unsafe API payloads when enabled', () => {
    expect(serverSource).toContain('ABUSE_PAYLOAD_INSPECTION_ENABLED');
    expect(serverSource).toContain('abusePrevention.checkPayload(req.body');
    expect(serverSource).toContain("req.path.startsWith('/api/')");
    expect(serverSource).toContain("error: 'Suspicious request payload'");
  });
});
