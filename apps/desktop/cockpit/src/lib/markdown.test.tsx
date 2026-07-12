// @vitest-environment jsdom
/**
 * markdown renderer — turns the agent's Markdown into real vnodes (bold, lists,
 * code, headings) and stays safe against markup injection.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'preact';
import { renderMarkdown } from './markdown';

function html(src: string): string {
  const host = document.createElement('div');
  render(renderMarkdown(src), host);
  const out = host.innerHTML;
  render(null, host);
  return out;
}

describe('renderMarkdown', () => {
  it('renders bold, italic, and inline code', () => {
    const out = html('This is **bold**, _italic_, and `code`.');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('<code class="md-code">code</code>');
  });

  it('renders an unordered list as a real <ul>', () => {
    const out = html('- one\n- two\n- three');
    expect(out).toContain('<ul class="md-ul">');
    expect((out.match(/<li>/g) || []).length).toBe(3);
    expect(out).toContain('one');
  });

  it('renders a fenced code block verbatim', () => {
    const out = html('```\nconst x = 1;\n```');
    expect(out).toContain('<pre class="md-pre">');
    expect(out).toContain('const x = 1;');
  });

  it('does NOT split whole words (no break-all artifacts) — text is intact', () => {
    const out = html('agent-os contracts and the first message');
    expect(out).toContain('agent-os contracts and the first message');
  });

  it('never injects raw HTML (text is escaped)', () => {
    const out = html('watch out <img src=x onerror=alert(1)> ok');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('does not linkify unsafe (javascript:) hrefs', () => {
    const out = html('[click](javascript:alert(1))');
    expect(out).not.toContain('<a');
    expect(out).toContain('[click](javascript:alert(1))');
  });

  it('linkifies safe http links', () => {
    const out = html('see [docs](https://recoder.xyz)');
    expect(out).toContain('href="https://recoder.xyz"');
    expect(out).toContain('>docs</a>');
  });
});
