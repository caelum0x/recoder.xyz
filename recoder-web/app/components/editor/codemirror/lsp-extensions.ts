/**
 * LSP Extensions for CodeMirror
 * Provides hover tooltips, go-to-definition, find references, and completions
 * Uses the TCP-based LSP backend via LSP client service
 *
 * This file provides backward compatibility with the standard LSP client.
 * For new code, consider using the enhanced client from '~/lib/lsp' directly.
 */

import { hoverTooltip, EditorView, keymap, Decoration, type DecorationSet, type Tooltip } from '@codemirror/view';
import { autocompletion, type CompletionContext, type CompletionResult, type Completion } from '@codemirror/autocomplete';
import { StateField, StateEffect, type Extension } from '@codemirror/state';
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
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('LSPExtensions');

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
        logger.error('[LSP Hover] Error:', err);
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
        background: var(--recoder-elements-background-depth-3, #1e1e1e);
        border: 1px solid var(--recoder-elements-borderColor, #333);
        border-radius: 6px;
        color: var(--recoder-elements-textPrimary, #e1e1e1);
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
 * Perform go-to-definition lookup at the current cursor position
 */
async function performGotoDefinition(
  view: EditorView,
  projectId: string,
  filePath: string,
  onGoto: (file: string, line: number, character?: number) => void
): Promise<boolean> {
  // Check if file type is supported
  if (!isLSPSupported(filePath)) return false;

  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const lineNumber = line.number - 1;
  const character = pos - line.from;
  const content = view.state.doc.toString();

  try {
    const client = getLSPClient(projectId);

    if (!client.isReady()) {
      const initialized = await client.initialize();
      if (!initialized) return false;
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
      return true;
    }
  } catch (err) {
    logger.error('[LSP Definition] Error:', err);
  }
  return false;
}

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
          logger.error('[LSP Definition] Error:', err);
        }
      })();

      // Prevent default behavior
      event.preventDefault();
      return true;
    },
  });
}

/**
 * Create F12 keyboard shortcut for go-to-definition
 */
export function gotoDefinitionKeymap(
  projectId: string,
  filePath: string,
  onGoto: (file: string, line: number, character?: number) => void
) {
  return keymap.of([
    {
      key: 'F12',
      run: (view) => {
        performGotoDefinition(view, projectId, filePath, onGoto);
        return true;
      },
    },
  ]);
}

// ============================================
// Cmd/Ctrl Hover Underline
// ============================================

/** State effect to update hover underline position */
const setHoverUnderline = StateEffect.define<{ from: number; to: number } | null>();

/** Decoration for the hover underline */
const hoverUnderlineMark = Decoration.mark({
  class: 'cm-definition-underline',
});

/** State field to track hover underline decorations */
const hoverUnderlineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(underlines, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setHoverUnderline)) {
        if (effect.value === null) {
          return Decoration.none;
        }
        return Decoration.set([
          hoverUnderlineMark.range(effect.value.from, effect.value.to),
        ]);
      }
    }
    return underlines;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** CSS styles for the hover underline */
const hoverUnderlineStyles = EditorView.baseTheme({
  '.cm-definition-underline': {
    textDecoration: 'underline',
    textDecorationColor: 'var(--recoder-elements-textLink, #60a5fa)',
    textUnderlineOffset: '2px',
    cursor: 'pointer',
  },
});

/**
 * Get the word boundaries at a position
 */
function getWordAtPosition(view: EditorView, pos: number): { from: number; to: number } | null {
  const line = view.state.doc.lineAt(pos);
  const text = line.text;
  const offset = pos - line.from;

  // Find word start
  let start = offset;
  while (start > 0 && /[\w$]/.test(text[start - 1])) {
    start--;
  }

  // Find word end
  let end = offset;
  while (end < text.length && /[\w$]/.test(text[end])) {
    end++;
  }

  // If we're not on a word, return null
  if (start === end) {
    return null;
  }

  return { from: line.from + start, to: line.from + end };
}

/**
 * Create Cmd/Ctrl hover underline extension
 * Shows a subtle underline when hovering over a symbol while holding Cmd/Ctrl
 */
export function cmdHoverUnderline(filePath: string) {
  let modifierPressed = false;
  let lastHoverPos: number | null = null;

  return [
    hoverUnderlineField,
    hoverUnderlineStyles,
    EditorView.domEventHandlers({
      keydown(event, view) {
        if ((event.metaKey || event.ctrlKey) && !modifierPressed) {
          modifierPressed = true;
          // If we have a last hover position, show underline
          if (lastHoverPos !== null && isLSPSupported(filePath)) {
            const word = getWordAtPosition(view, lastHoverPos);
            if (word) {
              view.dispatch({ effects: setHoverUnderline.of(word) });
            }
          }
        }
        return false;
      },
      keyup(event, view) {
        if (!event.metaKey && !event.ctrlKey && modifierPressed) {
          modifierPressed = false;
          view.dispatch({ effects: setHoverUnderline.of(null) });
        }
        return false;
      },
      mousemove(event, view) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        lastHoverPos = pos;

        if (modifierPressed && pos !== null && isLSPSupported(filePath)) {
          const word = getWordAtPosition(view, pos);
          if (word) {
            view.dispatch({ effects: setHoverUnderline.of(word) });
          } else {
            view.dispatch({ effects: setHoverUnderline.of(null) });
          }
        } else if (!modifierPressed) {
          // Clear underline when modifier is not pressed
          const currentUnderlines = view.state.field(hoverUnderlineField);
          if (currentUnderlines.size > 0) {
            view.dispatch({ effects: setHoverUnderline.of(null) });
          }
        }
        return false;
      },
      mouseleave(_event, view) {
        lastHoverPos = null;
        view.dispatch({ effects: setHoverUnderline.of(null) });
        return false;
      },
      blur(_event, view) {
        modifierPressed = false;
        lastHoverPos = null;
        view.dispatch({ effects: setHoverUnderline.of(null) });
        return false;
      },
    }),
  ];
}

// ============================================
// Context Menu
// ============================================

/**
 * Create a context menu extension for Go to Definition
 */
export function gotoDefinitionContextMenu(
  projectId: string,
  filePath: string,
  onGoto: (file: string, line: number, character?: number) => void
) {
  return EditorView.domEventHandlers({
    contextmenu(event, view) {
      // Only handle if LSP is supported
      if (!isLSPSupported(filePath)) return false;

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      // Check if we're on a word
      const word = getWordAtPosition(view, pos);
      if (!word) return false;

      // Prevent default context menu
      event.preventDefault();

      // Move cursor to clicked position
      view.dispatch({
        selection: { anchor: pos },
      });

      // Create and show custom context menu
      showContextMenu(event.clientX, event.clientY, view, projectId, filePath, onGoto);
      return true;
    },
  });
}

/**
 * Show the custom context menu
 */
function showContextMenu(
  x: number,
  y: number,
  view: EditorView,
  projectId: string,
  filePath: string,
  onGoto: (file: string, line: number, character?: number) => void
) {
  // Remove any existing context menu
  const existingMenu = document.querySelector('.cm-context-menu');
  if (existingMenu) {
    existingMenu.remove();
  }

  // Create context menu
  const menu = document.createElement('div');
  menu.className = 'cm-context-menu';
  menu.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    z-index: 9999;
    background: var(--recoder-elements-background-depth-3, #1e1e1e);
    border: 1px solid var(--recoder-elements-borderColor, #333);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    padding: 4px 0;
    min-width: 180px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
  `;

  // Helper to create menu items
  const createMenuItem = (label: string, shortcut: string, onClick: () => void) => {
    const item = document.createElement('div');
    item.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      cursor: pointer;
      color: var(--recoder-elements-textPrimary, #e1e1e1);
      transition: background-color 0.1s;
    `;
    item.innerHTML = `
      <span>${label}</span>
      <span style="color: var(--recoder-elements-textTertiary, #888); font-size: 11px; margin-left: 24px;">${shortcut}</span>
    `;
    item.addEventListener('mouseenter', () => {
      item.style.backgroundColor = 'var(--recoder-elements-background-depth-4, #333)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.backgroundColor = 'transparent';
    });
    item.addEventListener('click', () => {
      menu.remove();
      onClick();
    });
    return item;
  };

  // Add "Go to Definition" item
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const gotoDefItem = createMenuItem('Go to Definition', 'F12', () => {
    performGotoDefinition(view, projectId, filePath, onGoto);
  });
  menu.appendChild(gotoDefItem);

  // Add separator
  const separator = document.createElement('div');
  separator.style.cssText = `
    height: 1px;
    background: var(--recoder-elements-borderColor, #333);
    margin: 4px 0;
  `;
  menu.appendChild(separator);

  // Add "Find All References" item
  const findRefsItem = createMenuItem('Find All References', 'Shift+F12', () => {
    // This will trigger the find references functionality
    const customEvent = new KeyboardEvent('keydown', {
      key: 'F12',
      shiftKey: true,
      bubbles: true,
    });
    view.dom.dispatchEvent(customEvent);
  });
  menu.appendChild(findRefsItem);

  // Add "Peek Definition" info item (future feature)
  const peekItem = createMenuItem('Peek Definition', `${isMac ? '⌥' : 'Alt'}+F12`, () => {
    // For now, just do go to definition
    performGotoDefinition(view, projectId, filePath, onGoto);
  });
  menu.appendChild(peekItem);

  // Append to body
  document.body.appendChild(menu);

  // Adjust position if menu goes off screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 8}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 8}px`;
  }

  // Close menu on click outside or escape
  const closeMenu = (e: MouseEvent | KeyboardEvent) => {
    if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
    if (e instanceof MouseEvent && menu.contains(e.target as Node)) return;
    menu.remove();
    document.removeEventListener('click', closeMenu);
    document.removeEventListener('keydown', closeMenu);
  };

  // Delay adding listeners to prevent immediate close
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', closeMenu);
  }, 0);
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
            logger.error('[LSP References] Error:', err);
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
      logger.error('[LSP Completions] Error:', err);
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
 * - Go to definition (Ctrl/Cmd+Click, F12)
 * - Find references (Shift+F12)
 * - Context menu with "Go to Definition" option
 * - Cmd/Ctrl hover underline effect
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

  // Initialize enhanced client if requested (only when container is ready)
  if (useEnhancedClient && workbenchStore.containerReady.get()) {
    const client = getEnhancedLSPClient(projectId);
    client.connect().catch((err) => {
      logger.warn('[LSP] Failed to connect enhanced client:', err);
    });
  }

  // Add hover tooltip
  if (enableHover) {
    extensions.push(lspHoverTooltip(projectId, filePath));
  }

  // Add go-to-definition features
  if (enableDefinition && onGotoDefinition) {
    // Cmd/Ctrl+Click
    extensions.push(gotoDefinition(projectId, filePath, onGotoDefinition));
    // F12 keyboard shortcut
    extensions.push(gotoDefinitionKeymap(projectId, filePath, onGotoDefinition));
    // Right-click context menu
    extensions.push(gotoDefinitionContextMenu(projectId, filePath, onGotoDefinition));
    // Cmd/Ctrl hover underline
    extensions.push(...cmdHoverUnderline(filePath));
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

    // Don't start LSP until container is ready
    if (!workbenchStore.containerReady.get()) {
      return;
    }

    // Initialize LSP client in background
    const client = getLSPClient(projectId);
    if (!client.isReady()) {
      client.initialize().catch((err) => {
        logger.warn('[LSP] Auto-init failed:', err);
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
        logger.warn('[LSP] Document sync failed:', err);
      }
    }, debounceMs);
  });
}

export default lspExtension;
