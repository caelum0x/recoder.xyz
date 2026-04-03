const HASHLINE_ALPHABET = 'ZPMQVRWSNKTXJBYH';
const HASHLINE_REF_PATTERN = new RegExp(`^([1-9]\\d*)#([${HASHLINE_ALPHABET}]{2})$`);
const LINE_REF_EXTRACT_PATTERN = new RegExp(`([0-9]+#[${HASHLINE_ALPHABET}]{2})`);
const SIGNIFICANT_CONTENT_PATTERN = /[\p{L}\p{N}]/u;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const MISMATCH_CONTEXT = 2;

export interface LineRef {
  line: number;
  hash: string;
}

interface HashMismatch {
  line: number;
  expected: string;
}

function stableHash(input: string): number {
  let hash = FNV_OFFSET_BASIS;

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return hash >>> 0;
}

function encodeHashByte(byteValue: number): string {
  const high = (byteValue >> 4) & 0x0f;
  const low = byteValue & 0x0f;

  return `${HASHLINE_ALPHABET[high]}${HASHLINE_ALPHABET[low]}`;
}

function computeNormalizedLineHash(lineNumber: number, normalizedContent: string): string {
  const seed = SIGNIFICANT_CONTENT_PATTERN.test(normalizedContent) ? '' : String(lineNumber);
  const hash = stableHash(`${seed}\u0000${normalizedContent}`);

  return encodeHashByte(hash & 0xff);
}

export function computeLineHash(lineNumber: number, content: string): string {
  return computeNormalizedLineHash(lineNumber, content.replace(/\r/g, '').trimEnd());
}

export function computeLegacyLineHash(lineNumber: number, content: string): string {
  return computeNormalizedLineHash(lineNumber, content.replace(/\r/g, '').replace(/\s+/g, ''));
}

export function formatHashLine(lineNumber: number, content: string): string {
  return `${lineNumber}#${computeLineHash(lineNumber, content)}|${content}`;
}

export function formatHashLines(content: string, startLine = 1): string {
  if (!content) {
    return '';
  }

  return content
    .split('\n')
    .map((line, index) => formatHashLine(startLine + index, line))
    .join('\n');
}

function isCompatibleLineHash(lineNumber: number, content: string, hash: string): boolean {
  return computeLineHash(lineNumber, content) === hash || computeLegacyLineHash(lineNumber, content) === hash;
}

export function normalizeLineRef(ref: string): string {
  const originalTrimmed = ref.trim();
  let trimmed = originalTrimmed;

  trimmed = trimmed.replace(/^(?:>>>|[+-])\s*/, '');
  trimmed = trimmed.replace(/\s*#\s*/, '#');
  trimmed = trimmed.replace(/\|.*$/, '');
  trimmed = trimmed.trim();

  if (HASHLINE_REF_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const extracted = trimmed.match(LINE_REF_EXTRACT_PATTERN);
  if (extracted) {
    return extracted[1];
  }

  return originalTrimmed;
}

export function parseLineRef(ref: string): LineRef {
  const normalized = normalizeLineRef(ref);
  const match = normalized.match(HASHLINE_REF_PATTERN);

  if (match) {
    return {
      line: Number.parseInt(match[1], 10),
      hash: match[2],
    };
  }

  const hashIndex = normalized.indexOf('#');
  if (hashIndex > 0) {
    const prefix = normalized.slice(0, hashIndex);
    const suffix = normalized.slice(hashIndex + 1);

    if (!/^\d+$/.test(prefix) && new RegExp(`^[${HASHLINE_ALPHABET}]{2}$`).test(suffix)) {
      throw new Error(
        `Invalid line reference: "${ref}". "${prefix}" is not a line number. Use the actual line number from the read output.`,
      );
    }
  }

  throw new Error(`Invalid line reference format: "${ref}". Expected format: "{line_number}#{hash_id}"`);
}

function suggestLineForHash(ref: string, lines: string[]): string | null {
  const match = ref.trim().match(new RegExp(`#([${HASHLINE_ALPHABET}]{2})$`));
  if (!match) {
    return null;
  }

  const hash = match[1];

  for (let i = 0; i < lines.length; i++) {
    if (isCompatibleLineHash(i + 1, lines[i] ?? '', hash)) {
      return `Did you mean "${i + 1}#${computeLineHash(i + 1, lines[i] ?? '')}"?`;
    }
  }

  return null;
}

function parseLineRefWithHint(ref: string, lines: string[]): LineRef {
  try {
    return parseLineRef(ref);
  } catch (error) {
    const hint = suggestLineForHash(ref, lines);

    if (hint && error instanceof Error) {
      throw new Error(`${error.message} ${hint}`);
    }

    throw error;
  }
}

export class HashlineMismatchError extends Error {
  readonly remaps: ReadonlyMap<string, string>;

  constructor(
    private readonly mismatches: HashMismatch[],
    private readonly fileLines: string[],
  ) {
    super(HashlineMismatchError.formatMessage(mismatches, fileLines));
    this.name = 'HashlineMismatchError';

    const remaps = new Map<string, string>();

    for (const mismatch of mismatches) {
      const actual = computeLineHash(mismatch.line, fileLines[mismatch.line - 1] ?? '');
      remaps.set(`${mismatch.line}#${mismatch.expected}`, `${mismatch.line}#${actual}`);
    }

    this.remaps = remaps;
  }

  static formatMessage(mismatches: HashMismatch[], fileLines: string[]): string {
    const mismatchByLine = new Map<number, HashMismatch>();

    for (const mismatch of mismatches) {
      mismatchByLine.set(mismatch.line, mismatch);
    }

    const displayLines = new Set<number>();
    for (const mismatch of mismatches) {
      const low = Math.max(1, mismatch.line - MISMATCH_CONTEXT);
      const high = Math.min(fileLines.length, mismatch.line + MISMATCH_CONTEXT);

      for (let line = low; line <= high; line++) {
        displayLines.add(line);
      }
    }

    const sortedLines = [...displayLines].sort((a, b) => a - b);
    const output: string[] = [];

    output.push(
      `${mismatches.length} line${mismatches.length > 1 ? 's have' : ' has'} changed since last read. Use the updated {line_number}#{hash_id} references below. Changed lines are prefixed with >>>.`,
    );
    output.push('');

    let previousLine = -1;
    for (const line of sortedLines) {
      if (previousLine !== -1 && line > previousLine + 1) {
        output.push('    ...');
      }

      previousLine = line;

      const content = fileLines[line - 1] ?? '';
      const prefix = `${line}#${computeLineHash(line, content)}|${content}`;
      output.push(`${mismatchByLine.has(line) ? '>>> ' : '    '}${prefix}`);
    }

    return output.join('\n');
  }
}

export function validateLineRef(lines: string[], ref: string): LineRef {
  const parsed = parseLineRefWithHint(ref, lines);

  if (parsed.line < 1 || parsed.line > lines.length) {
    throw new Error(`Line number ${parsed.line} out of bounds. File has ${lines.length} lines.`);
  }

  const content = lines[parsed.line - 1] ?? '';
  if (!isCompatibleLineHash(parsed.line, content, parsed.hash)) {
    throw new HashlineMismatchError([{ line: parsed.line, expected: parsed.hash }], lines);
  }

  return parsed;
}

export function validateLineRefs(lines: string[], refs: string[]): void {
  const mismatches: HashMismatch[] = [];

  for (const ref of refs) {
    const parsed = parseLineRefWithHint(ref, lines);

    if (parsed.line < 1 || parsed.line > lines.length) {
      throw new Error(`Line number ${parsed.line} out of bounds. File has ${lines.length} lines.`);
    }

    const content = lines[parsed.line - 1] ?? '';
    if (!isCompatibleLineHash(parsed.line, content, parsed.hash)) {
      mismatches.push({ line: parsed.line, expected: parsed.hash });
    }
  }

  if (mismatches.length > 0) {
    throw new HashlineMismatchError(mismatches, lines);
  }
}

export function resolveLineRef(lines: string[], ref: string): number {
  return validateLineRef(lines, ref).line;
}
