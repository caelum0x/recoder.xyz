/**
 * A small, dependency-free Markdown renderer for agent output.
 *
 * Claude Code (and every other coding agent) emits Markdown — **bold**, `code`,
 * fenced blocks, `-` lists, headings. The cockpit was showing it as raw
 * pre-wrapped text, so lists, emphasis, and code all read as literal syntax.
 * This turns the common Markdown subset into real Preact vnodes.
 *
 * SAFETY: everything is built as vnodes / text nodes (Preact escapes them) —
 * there is NO `dangerouslySetInnerHTML`, so agent text can never inject markup.
 * Link hrefs are restricted to http(s)/mailto; anything else renders as text.
 *
 * Scope is intentionally small (block: fenced code, headings, ordered/unordered
 * lists, blockquote, paragraph; inline: code, bold, italic, strikethrough,
 * links). It is resilient to partial input (the streaming tail) — an unclosed
 * token just renders as its literal characters until the rest streams in.
 */
import { h } from 'preact';
import type { VNode } from 'preact';

type Child = string | VNode;

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

/** Render inline markdown (code, bold, italic, strikethrough, links) to nodes. */
function renderInline(text: string): Child[] {
  const out: Child[] = [];
  // Match the FIRST inline token; order matters (code before emphasis so
  // `**` inside a code span is not treated as bold).
  const re =
    /(`[^`\n]+`)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\n]+\*|_[^_\n]+_)|(\[[^\]\n]+\]\([^)\n]+\))/;
  let rest = text;
  let guard = 0;
  while (rest && guard++ < 5000) {
    const m = re.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const tok = m[0];
    if (tok.startsWith('`')) {
      out.push(<code class="md-code">{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      out.push(<strong>{renderInline(tok.slice(2, -2))}</strong>);
    } else if (tok.startsWith('~~')) {
      out.push(<del>{renderInline(tok.slice(2, -2))}</del>);
    } else if (tok.startsWith('[')) {
      const lm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      if (lm && SAFE_HREF.test(lm[2])) {
        out.push(
          <a class="md-link" href={lm[2]} target="_blank" rel="noreferrer">
            {renderInline(lm[1])}
          </a>,
        );
      } else {
        out.push(tok); // unsafe/malformed link → show literally, never linkify.
      }
    } else {
      out.push(<em>{renderInline(tok.slice(1, -1))}</em>);
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*```/;

/** Parse a Markdown string into an array of block-level Preact vnodes. */
export function renderMarkdown(src: string): VNode[] {
  const lines = (src || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: VNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block — verbatim, whitespace preserved.
    if (FENCE.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume the closing fence
      blocks.push(
        <pre class="md-pre" key={key++}>
          <code>{buf.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // Blank line — paragraph separator.
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // Heading (mapped to h3–h6 so agent prose stays calm, never a giant h1).
    const hm = HEADING.exec(line);
    if (hm) {
      const level = Math.min(hm[1].length + 2, 6);
      blocks.push(h(`h${level}`, { class: 'md-h', key: key++ }, renderInline(hm[2])) as VNode);
      i++;
      continue;
    }

    // Unordered list — gather consecutive bullet lines.
    if (BULLET.test(line)) {
      const items: VNode[] = [];
      while (i < lines.length && BULLET.test(lines[i])) {
        const bm = BULLET.exec(lines[i])!;
        items.push(<li key={items.length}>{renderInline(bm[3])}</li>);
        i++;
      }
      blocks.push(
        <ul class="md-ul" key={key++}>
          {items}
        </ul>,
      );
      continue;
    }

    // Ordered list.
    if (ORDERED.test(line)) {
      const items: VNode[] = [];
      while (i < lines.length && ORDERED.test(lines[i])) {
        const om = ORDERED.exec(lines[i])!;
        items.push(<li key={items.length}>{renderInline(om[3])}</li>);
        i++;
      }
      blocks.push(
        <ol class="md-ol" key={key++}>
          {items}
        </ol>,
      );
      continue;
    }

    // Blockquote.
    if (QUOTE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        buf.push(QUOTE.exec(lines[i])![1]);
        i++;
      }
      blocks.push(
        <blockquote class="md-quote" key={key++}>
          {renderInline(buf.join(' '))}
        </blockquote>,
      );
      continue;
    }

    // Paragraph — consecutive non-blank, non-block lines joined as soft wraps.
    const para: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !FENCE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !ORDERED.test(lines[i]) &&
      !QUOTE.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p class="md-p" key={key++}>
        {renderInline(para.join('\n'))}
      </p>,
    );
  }

  return blocks;
}
