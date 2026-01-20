/**
 * LSP Extensions for CodeMirror
 * Provides hover tooltips, go-to-definition, find references, and completions
 * Uses the TCP-based LSP backend via LSP client service
 *
 * This file provides backward compatibility with the standard LSP client.
 * For new code, consider using the enhanced client from '~/lib/lsp' directly.
 */

import { hoverTooltip, EditorView, type Tooltip } from '@codemirror/view';
import { autocompletion, type CompletionContext, type CompletionResult, type Completion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import {
  getLSPClient,
  getEnhancedLSPClient,
  type LSPLocation,
  type LSPHover,
  type LSPHoverContents,
  CompletionItemKind,
  type LSPCompletionItem,
  lspDiagnostics as diagnosticsExtension,
} from '~/lib/lsp';

// ============================================
// Types
// ============================================

export interface DefinitionLocation {
  uri: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
}

export interface LSPExtensionOptions {
  onGotoDefinition?: (file: string, line: number, character?: number) => void;
  onReferencesFound?: (locations: DefinitionLocation[]) => void;
  enableCompletions?: boolean;
  enableHover?: boolean;
  enableDefinition?: boolean;
  enableReferences?: boolean;
  enableDiagnostics?: boolean;
  useEnhancedClient?: boolean; // Use enhanced client with reconnection support
}

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

/** File extensions that support LSP */
const LSP_SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyi',
  '.go', '.mod', '.sum',
  '.rs',
]);

// ============================================
// Hover Tooltip
// ============================================

/**
 * Create an LSP hover tooltip extension
 * Shows type information and documentation on hover
 */
export function lspHoverTooltip(projectId: string, filePath: string) {
  return hoverTooltip(
    async (view, pos): Promise<Tooltip | null> => {
      // Check if file type is supported
      if (!isLSPSupported(filePath)) {
        return null;
      }

      const line = view.state.doc.lineAt(pos);
      const lineNumber = line.number - 1; // LSP uses 0-based lines
      const character = pos - line.from;
      const content = view.state.doc.toString();

      try {
        const client = getLSPClient(projectId);

        // Initialize if needed
        if (!client.isReady()) {
          const initialized = await client.initialize();
          if (!initialized) return null;
        }

        const hover = await client.getHover(filePath, { line: lineNumber, character }, content);

        if (!hover || !hover.contents) {
          return null;
        }

        return createHoverTooltip(pos, hover);
      } catch (err) {
        console.error('[LSP Hover] Error:', err);
        return null;
      }
    },
    {
      hideOnChange: true,
      hoverTime: 300,
    }
  );
}

function createHoverTooltip(pos: number, hover: LSPHover): Tooltip {
  return {
    pos,
    above: true,
    create() {
      const dom = document.createElement('div');
      dom.className = 'cm-hover-tooltip cm-lsp-hover';
      dom.style.cssText = `
        padding: 8px 12px;
        font-size: 12px;
        max-width: 600px;
        max-height: 400px;
        overflow: auto;
        font-family: ui-monospace, 'SF Mono', Menlo, Monaco, monospace;
        white-space: pre-wrap;
        background: var(--bolt-elements-background-depth-3, #1e1e1e);
        border: 1px solid var(--bolt-elements-borderColor, #333);
        border-radius: 6px;
        color: var(--bolt-elements-textPrimary, #e1e1e1);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        line-height: 1.5;
      `;

      const text = formatHoverContents(hover.contents);
      dom.textContent = text;

      return { dom };
    },
  };
}

function formatHoverContents(contents: LSPHoverContents): string {
  if (typeof contents === 'string') {
    return contents;
  }

  if (Array.isArray(contents)) {
    return contents
      .map((item) => (typeof item === 'string' ? item : item.value))
      .join('\n\n');
  }

  return contents.value || '';
}

// ============================================
// Go to Definition
// ============================================

/**
 * Create a go-to-definition extension
 * Ctrl+Click (Windows/Linux) or Cmd+Click (Mac) to jump to definition
 */
export function gotoDefinition(
  projectId: string,
  filePath: string,
  onGoto: (file: string, line: number, character?: number) => void
) {
  return EditorView.domEventHandlers({
    click(event, view) {
      // Cmd+Click (Mac) or Ctrl+Click (Windows/Linux)
      if (!event.metaKey && !event.ctrlKey) return false;

      // Check if file type is supported
      if (!isLSPSupported(filePath)) return false;

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      const line = view.state.doc.lineAt(pos);
      const lineNumber = line.number - 1;
      const character = pos - line.from;
      const content = view.state.doc.toString();

      // Perform definition lookup asynchronously
      (async () => {
        try {
          const client = getLSPClient(projectId);

          if (!client.isReady()) {
            const initialized = await client.initialize();
            if (!initialized) return;
          }

          const locations = await client.getDefinition(
            filePath,
            { line: lineNumber, character },
            content
          );

          if (locations.length > 0) {
            const location = locations[0];
            const targetFile = normalizeUri(location.uri);
            onGoto(targetFile, location.range.start.line + 1, location.range.start.character);
          }
        } catch (err) {
          console.error('[LSP Definition] Error:', err);
        }
      })();

      // Prevent default behavior
      event.preventDefault();
      return true;
    },
  });
}

// ============================================
// Find References
// ============================================

/**
 * Create a find-references extension
 * Shift+F12 to find all references
 */
export function findReferences(
  projectId: string,
  filePath: string,
  onFound: (locations: DefinitionLocation[]) => void
) {
  return EditorView.domEventHandlers({
    keydown(event, view) {
      // Shift+F12 for find references (VS Code shortcut)
      if (event.key === 'F12' && event.shiftKey) {
        event.preventDefault();

        // Check if file type is supported
        if (!isLSPSupported(filePath)) return false;

        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        const lineNumber = line.number - 1;
        const character = pos - line.from;
        const content = view.state.doc.toString();

        // Perform references lookup asynchronously
        (async () => {
          try {
            const client = getLSPClient(projectId);

            if (!client.isReady()) {
              const initialized = await client.initialize();
              if (!initialized) return;
            }

            const locations = await client.getReferences(
              filePath,
              { line: lineNumber, character },
              content
            );

            if (locations.length > 0) {
              onFound(
                locations.map((loc) => ({
                  uri: normalizeUri(loc.uri),
                  range: loc.range,
                }))
              );
            }
          } catch (err) {
            console.error('[LSP References] Error:', err);
          }
        })();

        return true;
      }
      return false;
    },
  });
}

// ============================================
// LSP Completions
// ============================================

/**
 * Create an LSP completion source for CodeMirror
 * Can be used with autocompletion({ override: [...] })
 */
export function lspCompletionSource(projectId: string, filePath: string) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    // Check if file type is supported
    if (!isLSPSupported(filePath)) {
      return null;
    }

    // Get word before cursor
    const word = context.matchBefore(/[\w.]+/);
    const charBefore = context.state.sliceDoc(context.pos - 1, context.pos);
    const isTriggerChar = ['.', ':', '<', '"', "'", '/', '@', '('].includes(charBefore);

    // Only trigger if explicit, after trigger char, or has typed characters
    if (!context.explicit && !isTriggerChar) {
      if (!word || word.text.length < 1) {
        return null;
      }
    }

    const line = context.state.doc.lineAt(context.pos);
    const lineNumber = line.number - 1;
    const character = context.pos - line.from;
    const content = context.state.doc.toString();

    try {
      const client = getLSPClient(projectId);

      if (!client.isReady()) {
        const initialized = await client.initialize();
        if (!initialized) return null;
      }

      const items = await client.getCompletions(
        filePath,
        { line: lineNumber, character },
        content,
        isTriggerChar ? charBefore : undefined
      );

      if (!items || items.length === 0) {
        return null;
      }

      const from = word ? word.from : context.pos;

      const completions: Completion[] = items.map((item) => ({
        label: item.label,
        type: item.kind ? COMPLETION_KIND_MAP[item.kind] || 'text' : 'text',
        detail: item.detail,
        info: formatCompletionDocumentation(item.documentation),
        apply: item.insertText || item.label,
        boost: getCompletionBoost(item),
      }));

      return {
        from,
        options: completions,
        validFor: /^[\w.]*$/,
      };
    } catch (err) {
      console.error('[LSP Completions] Error:', err);
      return null;
    }
  };
}

/**
 * Create a full autocompletion extension with LSP completions
 * Use when LSP should be the primary completion source
 */
export function lspCompletions(projectId: string, filePath: string) {
  return autocompletion({
    override: [lspCompletionSource(projectId, filePath)],
    defaultKeymap: true,
    closeOnBlur: true,
    maxRenderedOptions: 50,
    icons: true,
  });
}

function formatCompletionDocumentation(
  doc: string | { kind: 'plaintext' | 'markdown'; value: string } | undefined
): string | undefined {
  if (!doc) return undefined;
  if (typeof doc === 'string') return doc;
  return doc.value;
}

function getCompletionBoost(item: LSPCompletionItem): number {
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

// ============================================
// Combined LSP Extension
// ============================================

/**
 * Create a combined LSP extension with all features
 *
 * Features:
 * - Hover tooltips (show type info on hover)
 * - Go to definition (Ctrl/Cmd+Click)
 * - Find references (Shift+F12)
 * - Diagnostics (error/warning markers and gutters)
 *
 * Note: Completions should be integrated via lspCompletionSource()
 * into the editor's existing autocompletion configuration
 */
export function lspExtension(
  projectId: string,
  filePath: string,
  options: LSPExtensionOptions = {}
) {
  const {
    onGotoDefinition,
    onReferencesFound,
    enableHover = true,
    enableDefinition = true,
    enableReferences = true,
    enableDiagnostics = true,
    useEnhancedClient = false,
  } = options;

  const extensions: Extension[] = [];

  // Initialize enhanced client if requested
  if (useEnhancedClient) {
    const client = getEnhancedLSPClient(projectId);
    client.connect().catch((err) => {
      console.warn('[LSP] Failed to connect enhanced client:', err);
    });
  }

  // Add hover tooltip
  if (enableHover) {
    extensions.push(lspHoverTooltip(projectId, filePath));
  }

  // Add go-to-definition
  if (enableDefinition && onGotoDefinition) {
    extensions.push(gotoDefinition(projectId, filePath, onGotoDefinition));
  }

  // Add find references
  if (enableReferences && onReferencesFound) {
    extensions.push(findReferences(projectId, filePath, onReferencesFound));
  }

  // Add diagnostics
  if (enableDiagnostics && useEnhancedClient) {
    extensions.push(diagnosticsExtension(projectId, filePath));
  }

  return extensions;
}

// ============================================
// Helper Functions
// ============================================

function isLSPSupported(filePath: string): boolean {
  const ext = getExtension(filePath);
  return LSP_SUPPORTED_EXTENSIONS.has(ext);
}

function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  return lastDot >= 0 ? filePath.substring(lastDot).toLowerCase() : '';
}

function normalizeUri(uri: string): string {
  return uri
    .replace('file://', '')
    .replace(/^\/workspace\//, '')
    .replace(/^workspace\//, '');
}

// ============================================
// Auto-initialization Extension
// ============================================

/**
 * Create an extension that auto-initializes LSP when the editor mounts
 * This ensures the LSP client is ready before user interactions
 */
export function lspAutoInit(projectId: string, filePath: string) {
  return EditorView.updateListener.of((update) => {
    // Only run once on first update
    if (update.docChanged || !update.view.dom.isConnected) {
      return;
    }

    // Check if file type is supported
    if (!isLSPSupported(filePath)) {
      return;
    }

    // Initialize LSP client in background
    const client = getLSPClient(projectId);
    if (!client.isReady()) {
      client.initialize().catch((err) => {
        console.warn('[LSP] Auto-init failed:', err);
      });
    }
  });
}

// ============================================
// Document Sync Extension
// ============================================

/**
 * Create an extension that syncs document changes to LSP server
 * This enables diagnostics and better completions
 */
export function lspDocumentSync(projectId: string, filePath: string, debounceMs = 500) {
  let syncTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastContent = '';

  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) {
      return;
    }

    // Check if file type is supported
    if (!isLSPSupported(filePath)) {
      return;
    }

    const content = update.state.doc.toString();

    // Skip if content hasn't changed
    if (content === lastContent) {
      return;
    }

    // Clear existing timeout
    if (syncTimeout) {
      clearTimeout(syncTimeout);
    }

    // Debounce sync
    syncTimeout = setTimeout(async () => {
      try {
        const client = getLSPClient(projectId);
        if (client.isReady()) {
          await client.syncDocument(filePath, content);
          lastContent = content;
        }
      } catch (err) {
        console.warn('[LSP] Document sync failed:', err);
      }
    }, debounceMs);
  });
}

export default lspExtension;
