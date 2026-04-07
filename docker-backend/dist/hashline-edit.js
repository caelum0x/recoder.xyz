"use strict";
/**
 * @module hashline-edit
 *
 * Hash-anchored file editing for reliable multi-turn modifications.
 *
 * Instead of fragile search/replace (which breaks when content shifts),
 * each line gets a stable hash anchor: `lineNum#hash|content`.
 * The LLM references lines by their hash, making edits resilient to
 * insertions, deletions, and reordering between turns.
 *
 * Protocol:
 *   1. Read file → format with hash anchors → show to LLM
 *   2. LLM returns edit ops referencing `pos` (start anchor) and `end` (end anchor)
 *   3. Apply ops to produce the new file content
 *
 * Inspired by oh-my-openagent's hashline-edit, reimplemented for Node.js
 * without Bun dependencies.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatHashLine = formatHashLine;
exports.formatHashLines = formatHashLines;
exports.parseAnchor = parseAnchor;
exports.applyEdits = applyEdits;
exports.parseEdits = parseEdits;
const crypto_1 = __importDefault(require("crypto"));
// ---------------------------------------------------------------------------
// Hash dictionary — 256 short human-readable tokens for line identification
// ---------------------------------------------------------------------------
const HASH_DICT = [];
for (let i = 0; i < 256; i++) {
    // Generate 2-char base36 tokens: 00, 01, ..., 9z, a0, ..., zz
    HASH_DICT.push(i.toString(36).padStart(2, '0').toUpperCase());
}
// ---------------------------------------------------------------------------
// Hash computation
// ---------------------------------------------------------------------------
function computeLineHash(lineNumber, content) {
    const normalized = content.replace(/\r/g, '').trimEnd();
    const hasSignificant = /[\p{L}\p{N}]/u.test(normalized);
    const seed = hasSignificant ? '0' : String(lineNumber);
    const hash = crypto_1.default.createHash('md5').update(seed + normalized).digest();
    const index = hash[0]; // Use first byte (0-255)
    return HASH_DICT[index];
}
/**
 * Format a single line with its hash anchor.
 * Output: `lineNum#hash|content`
 */
function formatHashLine(lineNumber, content) {
    const hash = computeLineHash(lineNumber, content);
    return `${lineNumber}#${hash}|${content}`;
}
/**
 * Format an entire file with hash anchors on every line.
 */
function formatHashLines(content) {
    if (!content)
        return '';
    const lines = content.split('\n');
    return lines.map((line, i) => formatHashLine(i + 1, line)).join('\n');
}
/**
 * Parse a hash anchor reference like "5#A3" into { lineNumber, hash }.
 */
function parseAnchor(anchor) {
    const match = anchor.match(/^(\d+)#([A-Z0-9]{2})$/);
    if (!match)
        return null;
    return { lineNumber: parseInt(match[1], 10), hash: match[2] };
}
function indexLines(content) {
    return content.split('\n').map((line, i) => {
        const lineNumber = i + 1;
        const hash = computeLineHash(lineNumber, line);
        return {
            lineNumber,
            hash,
            anchor: `${lineNumber}#${hash}`,
            content: line,
        };
    });
}
function findAnchor(indexed, anchor) {
    // Exact match first
    const exact = indexed.findIndex(l => l.anchor === anchor);
    if (exact >= 0)
        return exact;
    // Fuzzy: match by hash only (line numbers may have shifted)
    const parsed = parseAnchor(anchor);
    if (!parsed)
        return -1;
    // Find closest line with matching hash
    const candidates = indexed.filter(l => l.hash === parsed.hash);
    if (candidates.length === 0)
        return -1;
    // Pick the one closest to the original line number
    candidates.sort((a, b) => Math.abs(a.lineNumber - parsed.lineNumber) - Math.abs(b.lineNumber - parsed.lineNumber));
    return indexed.indexOf(candidates[0]);
}
// ---------------------------------------------------------------------------
// Apply edits
// ---------------------------------------------------------------------------
/**
 * Apply a list of hash-anchored edits to file content.
 * Returns the new file content.
 *
 * Edits are applied in reverse order (highest line first) to preserve
 * earlier anchors during mutation.
 */
function applyEdits(content, edits) {
    const lines = content.split('\n');
    // Sort edits by position (descending) so later edits don't shift earlier anchors
    const sorted = [...edits].sort((a, b) => {
        const posA = a.op === 'prepend' && !a.pos ? 0 : (parseAnchor(a.pos ?? '0#00')?.lineNumber ?? 0);
        const posB = b.op === 'prepend' && !b.pos ? 0 : (parseAnchor(b.pos ?? '0#00')?.lineNumber ?? 0);
        return posB - posA;
    });
    const indexed = indexLines(content);
    for (const edit of sorted) {
        switch (edit.op) {
            case 'replace': {
                const startIdx = findAnchor(indexed, edit.pos);
                if (startIdx < 0) {
                    throw new Error(`Replace: start anchor not found: ${edit.pos}`);
                }
                const endIdx = edit.end ? findAnchor(indexed, edit.end) : startIdx;
                if (endIdx < 0) {
                    throw new Error(`Replace: end anchor not found: ${edit.end}`);
                }
                lines.splice(startIdx, endIdx - startIdx + 1, ...edit.lines);
                break;
            }
            case 'append': {
                if (!edit.pos) {
                    // Append at end
                    lines.push(...edit.lines);
                }
                else {
                    const idx = findAnchor(indexed, edit.pos);
                    if (idx < 0) {
                        throw new Error(`Append: anchor not found: ${edit.pos}`);
                    }
                    lines.splice(idx + 1, 0, ...edit.lines);
                }
                break;
            }
            case 'prepend': {
                if (!edit.pos) {
                    // Prepend at start
                    lines.unshift(...edit.lines);
                }
                else {
                    const idx = findAnchor(indexed, edit.pos);
                    if (idx < 0) {
                        throw new Error(`Prepend: anchor not found: ${edit.pos}`);
                    }
                    lines.splice(idx, 0, ...edit.lines);
                }
                break;
            }
        }
    }
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// Convenience: parse edit instructions from LLM output
// ---------------------------------------------------------------------------
/**
 * Parse a JSON edit instruction block from LLM output.
 * Expects: { "edits": [ { "op": "replace", "pos": "5#A3", ... }, ... ] }
 */
function parseEdits(json) {
    try {
        const parsed = JSON.parse(json);
        const edits = parsed.edits ?? parsed;
        if (!Array.isArray(edits))
            throw new Error('Expected array of edits');
        return edits.map((e) => {
            const lines = Array.isArray(e.lines) ? e.lines : (e.lines ?? '').split('\n');
            switch (e.op) {
                case 'replace':
                    return { op: 'replace', pos: e.pos, end: e.end, lines };
                case 'append':
                    return { op: 'append', pos: e.pos, lines };
                case 'prepend':
                    return { op: 'prepend', pos: e.pos, lines };
                default:
                    throw new Error(`Unknown edit op: ${e.op}`);
            }
        });
    }
    catch (err) {
        throw new Error(`Failed to parse edits: ${err instanceof Error ? err.message : err}`);
    }
}
