/**
 * extractPreviewUrl — sniff the local dev-server URL out of run console output.
 */
import { describe, expect, it } from 'vitest';
import { extractPreviewUrl } from './preview-url';

describe('extractPreviewUrl', () => {
  it("pulls a Vite-style 'Local:' URL", () => {
    expect(extractPreviewUrl('  VITE ready\n  Local:   http://localhost:5173/\n')).toBe('http://localhost:5173/');
  });

  it('normalizes 0.0.0.0 / 127.0.0.1 to localhost', () => {
    expect(extractPreviewUrl('Running on http://0.0.0.0:8000')).toBe('http://localhost:8000');
    expect(extractPreviewUrl('serving http://127.0.0.1:3000/app')).toBe('http://localhost:3000/app');
  });

  it('returns the LAST local URL (the active server after a restart)', () => {
    const out = 'first http://localhost:3000\n...restarting...\nnow http://localhost:3001/';
    expect(extractPreviewUrl(out)).toBe('http://localhost:3001/');
  });

  it('ignores non-local URLs', () => {
    expect(extractPreviewUrl('fetching https://registry.npmjs.org/pkg')).toBeNull();
  });

  it('returns null when no URL has appeared yet', () => {
    expect(extractPreviewUrl('installing dependencies…')).toBeNull();
    expect(extractPreviewUrl('')).toBeNull();
    expect(extractPreviewUrl(null)).toBeNull();
  });
});
