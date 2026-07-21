/**
 * formatPreviewVerifyLine — the terminal-plain "preview checked" projection.
 */
import { describe, expect, it } from 'vitest';
import { formatPreviewVerifyLine } from './preview-verify-line';
import type { PreviewVerificationView } from './api';

const NOW = Date.parse('2026-07-21T12:00:00.000Z');

function view(overrides: Partial<PreviewVerificationView> = {}): PreviewVerificationView {
  return {
    workspaceId: 'ws-1',
    status: 'passed',
    checkedAt: '2026-07-21T11:59:30.000Z',
    summary: 'preview reachable',
    degraded: false,
    checks: [],
    screenshotRef: null,
    ...overrides,
  };
}

describe('formatPreviewVerifyLine', () => {
  it('renders a passed check with a relative timestamp and no engine name', () => {
    const line = formatPreviewVerifyLine(view({ status: 'passed' }), NOW);
    expect(line.tone).toBe('passed');
    expect(line.text).toBe('preview checked ✓ 30s ago');
    expect(line.text).not.toMatch(/browser|browser-use|chrome/i);
  });

  it('renders a failed check with the first failed check message', () => {
    const line = formatPreviewVerifyLine(
      view({
        status: 'failed',
        checks: [
          { tool: 'open', status: 'passed' },
          { tool: 'assert', status: 'failed', message: 'expected "Welcome" not found' },
        ],
      }),
      NOW,
    );
    expect(line.tone).toBe('failed');
    expect(line.text).toBe('preview checked ✗ expected "Welcome" not found');
  });

  it('falls back to reason then summary for a failed check without a check message', () => {
    expect(formatPreviewVerifyLine(view({ status: 'failed', reason: 'HTTP 500' }), NOW).text).toBe(
      'preview checked ✗ HTTP 500',
    );
    expect(
      formatPreviewVerifyLine(view({ status: 'failed', summary: 'page errored' }), NOW).text,
    ).toBe('preview checked ✗ page errored');
  });

  it('renders a skipped/degraded run as "not verified" with the reason, never a pass', () => {
    const line = formatPreviewVerifyLine(
      view({ status: 'skipped', degraded: true, reason: 'no browser engine wired' }),
      NOW,
    );
    expect(line.tone).toBe('skipped');
    expect(line.text).toBe('preview checked — not verified (no browser engine wired)');
    expect(line.text).not.toMatch(/✓/);
  });

  it('renders "preview not checked" for a null (never-verified / 404) view', () => {
    const line = formatPreviewVerifyLine(null, NOW);
    expect(line.tone).toBe('none');
    expect(line.text).toBe('preview not checked');
    expect(line.screenshotNote).toBeNull();
    expect(line.screenshotRef).toBeNull();
  });

  it('surfaces "screenshot not retained" when no image ref is present', () => {
    const line = formatPreviewVerifyLine(view({ status: 'passed', screenshotRef: null }), NOW);
    expect(line.screenshotRef).toBeNull();
    expect(line.screenshotNote).toBe('screenshot not retained');
  });

  it('passes a real screenshot ref through instead of the note (future artifact store)', () => {
    const line = formatPreviewVerifyLine(
      view({ status: 'passed', screenshotRef: 'https://artifacts/shot.png' }),
      NOW,
    );
    expect(line.screenshotRef).toBe('https://artifacts/shot.png');
    expect(line.screenshotNote).toBeNull();
  });

  it('carries no screenshot line for a skipped run', () => {
    const line = formatPreviewVerifyLine(view({ status: 'skipped', reason: 'timeout' }), NOW);
    expect(line.screenshotRef).toBeNull();
    expect(line.screenshotNote).toBeNull();
  });

  it('omits the relative time when the timestamp is unparseable', () => {
    const line = formatPreviewVerifyLine(view({ status: 'passed', checkedAt: 'not-a-date' }), NOW);
    expect(line.text).toBe('preview checked ✓');
  });
});
