/**
 * LSP Completions Provider for CodeMirror
 * Integrates LSP completions with CodeMirror's autocompletion system
 */

import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import { getLSPClient, CompletionItemKind, type LSPCompletionItem } from './lsp-client';

// ============================================
// Constants
// ============================================

/** Map LSP completion kinds to CodeMirror types */
const COMPLETION_KIND_MAP: Record<number, string> = {
  [CompletionItemKind.Text]: 'text',
  [CompletionItemKind.Method]: 'method',
  [CompletionItemKind.Function]: 'function',
  [CompletionItemKind.Constructor]: 'constructor',
  [CompletionItemKind.Field]: 'field',
  [CompletionItemKind.Variable]: 'variable',
  [CompletionItemKind.Class]: 'class',
  [CompletionItemKind.Interface]: 'interface',
  [CompletionItemKind.Module]: 'namespace',
  [CompletionItemKind.Property]: 'property',
  [CompletionItemKind.Unit]: 'constant',
  [CompletionItemKind.Value]: 'constant',
  [CompletionItemKind.Enum]: 'enum',
  [CompletionItemKind.Keyword]: 'keyword',
  [CompletionItemKind.Snippet]: 'text',
  [CompletionItemKind.Color]: 'constant',
  [CompletionItemKind.File]: 'text',
  [CompletionItemKind.Reference]: 'text',
  [CompletionItemKind.Folder]: 'text',
  [CompletionItemKind.EnumMember]: 'enum',
  [CompletionItemKind.Constant]: 'constant',
  [CompletionItemKind.Struct]: 'class',
  [CompletionItemKind.Event]: 'text',
  [CompletionItemKind.Operator]: 'keyword',
  [CompletionItemKind.TypeParameter]: 'type',
};

/** Characters that trigger completion */
const TRIGGER_CHARACTERS = ['.', ':', '<', '"', "'", '/', '@', '('];

/** Extensions that should use LSP completions */
const LSP_SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyi',
  '.go', '.mod',
  '.rs',
]);

// ============================================
// Completion Source Factory
// ============================================

export interface LSPCompletionOptions {
  /** Minimum characters before triggering completions */
  minChars?: number;
  /** Maximum number of completions to show */
  maxResults?: number;
  /** Custom filter function */
  filter?: (item: LSPCompletionItem) => boolean;
  /** Whether to show deprecated items */
  showDeprecated?: boolean;
}

/**
 * Create an LSP completion source for CodeMirror
 * Returns a function that can be used with autocompletion({ override: [...] })
 */
export function createLSPCompletionSource(
  projectId: string,
  filePath: string,
  options: LSPCompletionOptions = {}
): (context: CompletionContext) => Promise<CompletionResult | null> {
  const {
    minChars = 1,
    maxResults = 100,
    filter,
    showDeprecated = true,
  } = options;

  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    // Check if file extension is supported
    const ext = getExtension(filePath);
    if (!LSP_SUPPORTED_EXTENSIONS.has(ext)) {
      return null;
    }

    // Get the text before cursor to determine trigger
    const word = context.matchBefore(/[\w.]+/);
    const charBefore = context.state.sliceDoc(context.pos - 1, context.pos);
    const isTriggerChar = TRIGGER_CHARACTERS.includes(charBefore);

    // Only trigger if:
    // 1. Explicitly invoked (Ctrl+Space)
    // 2. After a trigger character
    // 3. Has minimum characters typed
    if (!context.explicit && !isTriggerChar) {
      if (!word || word.text.length < minChars) {
        return null;
      }
    }

    // Get LSP client
    const client = getLSPClient(projectId);
    if (!client.isReady()) {
      const initialized = await client.initialize();
      if (!initialized) {
        return null;
      }
    }

    // Calculate LSP position (0-based)
    const line = context.state.doc.lineAt(context.pos);
    const lineNumber = line.number - 1;
    const character = context.pos - line.from;
    const content = context.state.doc.toString();

    // Get completions from LSP
    const items = await client.getCompletions(
      filePath,
      { line: lineNumber, character },
      content,
      isTriggerChar ? charBefore : undefined
    );

    if (!items || items.length === 0) {
      return null;
    }

    // Filter and transform items
    let completions = items;

    if (!showDeprecated) {
      completions = completions.filter(item => !item.deprecated);
    }

    if (filter) {
      completions = completions.filter(filter);
    }

    // Limit results
    if (completions.length > maxResults) {
      completions = completions.slice(0, maxResults);
    }

    // Calculate completion start position
    const from = word ? word.from : context.pos;

    // Transform to CodeMirror completions
    const cmCompletions: Completion[] = completions.map(item => ({
      label: item.label,
      type: item.kind ? COMPLETION_KIND_MAP[item.kind] || 'text' : 'text',
      detail: item.detail,
      info: formatDocumentation(item.documentation),
      apply: item.insertText || item.label,
      boost: getCompletionBoost(item),
      section: getCompletionSection(item),
    }));

    return {
      from,
      options: cmCompletions,
      validFor: /^[\w.]*$/,
    };
  };
}

/**
 * Create an LSP completion source that works with existing autocompletion
 * This adds LSP completions as an additional source
 */
export function lspCompletionSource(
  projectId: string,
  filePath: string
): (context: CompletionContext) => Promise<CompletionResult | null> {
  return createLSPCompletionSource(projectId, filePath);
}

// ============================================
// Helper Functions
// ============================================

function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  return lastDot >= 0 ? filePath.substring(lastDot).toLowerCase() : '';
}

function formatDocumentation(
  doc: string | { kind: string; value: string } | undefined
): string | undefined {
  if (!doc) return undefined;
  if (typeof doc === 'string') return doc;
  return doc.value;
}

function getCompletionBoost(item: LSPCompletionItem): number {
  // Boost based on kind
  switch (item.kind) {
    case CompletionItemKind.Method:
    case CompletionItemKind.Function:
      return 3;
    case CompletionItemKind.Variable:
    case CompletionItemKind.Property:
    case CompletionItemKind.Field:
      return 2;
    case CompletionItemKind.Class:
    case CompletionItemKind.Interface:
    case CompletionItemKind.Struct:
      return 1;
    case CompletionItemKind.Keyword:
      return -1;
    case CompletionItemKind.Snippet:
      return -2;
    default:
      return 0;
  }
}

function getCompletionSection(item: LSPCompletionItem): { name: string; rank?: number } | undefined {
  // Group completions by kind
  switch (item.kind) {
    case CompletionItemKind.Method:
    case CompletionItemKind.Function:
      return { name: 'Functions', rank: 0 };
    case CompletionItemKind.Variable:
    case CompletionItemKind.Property:
    case CompletionItemKind.Field:
      return { name: 'Variables', rank: 1 };
    case CompletionItemKind.Class:
    case CompletionItemKind.Interface:
    case CompletionItemKind.Struct:
      return { name: 'Types', rank: 2 };
    case CompletionItemKind.Keyword:
      return { name: 'Keywords', rank: 3 };
    default:
      return undefined;
  }
}

// ============================================
// Signature Help Integration
// ============================================

export interface SignatureHelpResult {
  signatures: Array<{
    label: string;
    documentation?: string;
    parameters?: Array<{
      label: string;
      documentation?: string;
    }>;
    activeParameter?: number;
  }>;
  activeSignature: number;
}

/**
 * Get signature help at a position
 * Can be used with CodeMirror's tooltip system
 */
export async function getSignatureHelpAtPosition(
  projectId: string,
  filePath: string,
  line: number,
  character: number,
  content: string
): Promise<SignatureHelpResult | null> {
  const client = getLSPClient(projectId);
  if (!client.isReady()) {
    return null;
  }

  const result = await client.getSignatureHelp(
    filePath,
    { line, character },
    content
  );

  if (!result || !result.signatures || result.signatures.length === 0) {
    return null;
  }

  return {
    signatures: result.signatures.map(sig => ({
      label: sig.label,
      documentation: formatDocumentation(sig.documentation),
      parameters: sig.parameters?.map(param => ({
        label: typeof param.label === 'string' ? param.label : sig.label.substring(param.label[0], param.label[1]),
        documentation: formatDocumentation(param.documentation),
      })),
      activeParameter: result.activeParameter,
    })),
    activeSignature: result.activeSignature ?? 0,
  };
}

// ============================================
// Document Symbols Integration
// ============================================

export interface DocumentSymbol {
  name: string;
  kind: string;
  detail?: string;
  range: { from: number; to: number };
  children?: DocumentSymbol[];
}

const SYMBOL_KIND_NAMES: Record<number, string> = {
  1: 'File',
  2: 'Module',
  3: 'Namespace',
  4: 'Package',
  5: 'Class',
  6: 'Method',
  7: 'Property',
  8: 'Field',
  9: 'Constructor',
  10: 'Enum',
  11: 'Interface',
  12: 'Function',
  13: 'Variable',
  14: 'Constant',
  15: 'String',
  16: 'Number',
  17: 'Boolean',
  18: 'Array',
  19: 'Object',
  20: 'Key',
  21: 'Null',
  22: 'EnumMember',
  23: 'Struct',
  24: 'Event',
  25: 'Operator',
  26: 'TypeParameter',
};

/**
 * Get document symbols for outline/breadcrumb
 */
export async function getDocumentSymbols(
  projectId: string,
  filePath: string,
  content: string
): Promise<DocumentSymbol[]> {
  const client = getLSPClient(projectId);
  if (!client.isReady()) {
    return [];
  }

  const symbols = await client.getDocumentSymbols(filePath, content);

  const lines = content.split('\n');
  const lineStarts: number[] = [0];
  for (let i = 0; i < lines.length; i++) {
    lineStarts.push(lineStarts[i] + lines[i].length + 1);
  }

  function positionToOffset(line: number, character: number): number {
    if (line >= lineStarts.length - 1) {
      return content.length;
    }
    return lineStarts[line] + character;
  }

  function transformSymbol(sym: {
    name: string;
    kind: number;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    selectionRange: { start: { line: number; character: number }; end: { line: number; character: number } };
    children?: Array<unknown>;
  }): DocumentSymbol {
    return {
      name: sym.name,
      kind: SYMBOL_KIND_NAMES[sym.kind] || 'Unknown',
      range: {
        from: positionToOffset(sym.range.start.line, sym.range.start.character),
        to: positionToOffset(sym.range.end.line, sym.range.end.character),
      },
      children: sym.children?.map(child => transformSymbol(child as typeof sym)),
    };
  }

  return symbols.map(sym => transformSymbol(sym as Parameters<typeof transformSymbol>[0]));
}

export default createLSPCompletionSource;
