import { describe, it, expect } from 'vitest';
import { safeHref } from '../safe-href';

describe('safeHref — link scheme allowlist (recoder-s0c1)', () => {
  it('neutralizes dangerous schemes to #', () => {
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:msgbox', 'file:///etc/passwd']) {
      expect(safeHref(bad)).toBe('#');
    }
  });

  it('allows http/https/mailto', () => {
    expect(safeHref('https://recoder.xyz')).toBe('https://recoder.xyz');
    expect(safeHref('http://x.com/a?b=1')).toBe('http://x.com/a?b=1');
    expect(safeHref('mailto:a@b.com')).toBe('mailto:a@b.com');
  });

  it('allows relative + anchor links (no scheme)', () => {
    expect(safeHref('/blog/x')).toBe('/blog/x');
    expect(safeHref('#section')).toBe('#section');
    expect(safeHref('foo/bar')).toBe('foo/bar');
  });

  it('empty/nullish → #', () => {
    expect(safeHref('')).toBe('#');
    expect(safeHref(null)).toBe('#');
    expect(safeHref(undefined)).toBe('#');
  });
});
