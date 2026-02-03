/**
 * Sticky Scroll Extension for CodeMirror
 *
 * Shows a sticky header at the top of the editor displaying the current scope context.
 * Similar to VS Code's sticky scroll feature.
 */

import { syntaxTree } from '@codemirror/language';
import { EditorState, StateField, StateEffect, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, Decoration, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

// Types for scope information
export interface ScopeInfo {
  name: string;
  type: 'function' | 'class' | 'method' | 'interface' | 'block' | 'arrow' | 'object';
  line: number;
  from: number;
  to: number;
  text: string;
}

// Maximum number of sticky lines to show
const MAX_STICKY_LINES = 4;

// Node names that represent scope boundaries in JavaScript/TypeScript
const SCOPE_NODE_TYPES = new Set([
  // Functions
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunction',
  // Classes
  'ClassDeclaration',
  'ClassExpression',
  'ClassBody',
  // Methods
  'MethodDeclaration',
  'MethodDefinition',
  // TypeScript specific
  'InterfaceDeclaration',
  'TypeDeclaration',
  'EnumDeclaration',
  // Other scopes
  'ObjectExpression',
]);

// Node names that represent block scopes (optional, can be enabled)
const BLOCK_NODE_TYPES = new Set([
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoStatement',
  'SwitchStatement',
  'TryStatement',
  'CatchClause',
]);

/**
 * Extracts scope information from a syntax node
 */
function getScopeInfo(node: SyntaxNode, state: EditorState): ScopeInfo | null {
  const nodeType = node.name;
  const from = node.from;
  const to = node.to;
  const line = state.doc.lineAt(from).number;

  // Get the line text for display
  const lineStart = state.doc.line(line).from;
  const lineEnd = state.doc.line(line).to;
  let lineText = state.doc.sliceString(lineStart, lineEnd).trim();

  // Truncate long lines
  if (lineText.length > 80) {
    lineText = lineText.substring(0, 77) + '...';
  }

  // Remove trailing open brace for cleaner display
  lineText = lineText.replace(/\s*\{\s*$/, '');

  let name = '';
  let type: ScopeInfo['type'] = 'block';

  // Extract name based on node type
  switch (nodeType) {
    case 'FunctionDeclaration':
    case 'FunctionExpression': {
      type = 'function';
      // Find the function name
      const defNode = node.getChild('VariableDefinition') || node.getChild('PropertyDefinition');
      if (defNode) {
        name = state.doc.sliceString(defNode.from, defNode.to);
      } else {
        // Try to extract from line text
        const match = lineText.match(/function\s+(\w+)/);
        if (match) name = match[1];
        else name = 'anonymous';
      }
      break;
    }

    case 'ArrowFunction': {
      type = 'arrow';
      // Try to find the variable name this arrow is assigned to
      const parent = node.parent;
      if (parent?.name === 'VariableDeclarator') {
        const varDef = parent.getChild('VariableDefinition');
        if (varDef) {
          name = state.doc.sliceString(varDef.from, varDef.to);
        }
      } else if (parent?.name === 'Property') {
        const propDef = parent.getChild('PropertyDefinition');
        if (propDef) {
          name = state.doc.sliceString(propDef.from, propDef.to);
        }
      }
      if (!name) name = 'arrow function';
      break;
    }

    case 'ClassDeclaration':
    case 'ClassExpression': {
      type = 'class';
      const defNode = node.getChild('VariableDefinition');
      if (defNode) {
        name = state.doc.sliceString(defNode.from, defNode.to);
      } else {
        const match = lineText.match(/class\s+(\w+)/);
        if (match) name = match[1];
        else name = 'anonymous class';
      }
      break;
    }

    case 'MethodDeclaration':
    case 'MethodDefinition': {
      type = 'method';
      const propDef = node.getChild('PropertyDefinition');
      if (propDef) {
        name = state.doc.sliceString(propDef.from, propDef.to);
      } else {
        // Extract method name from line text
        const match = lineText.match(/(?:async\s+)?(\w+)\s*\(/);
        if (match) name = match[1];
        else name = 'method';
      }
      break;
    }

    case 'InterfaceDeclaration': {
      type = 'interface';
      const match = lineText.match(/interface\s+(\w+)/);
      if (match) name = match[1];
      else name = 'interface';
      break;
    }

    case 'TypeDeclaration': {
      type = 'interface';
      const match = lineText.match(/type\s+(\w+)/);
      if (match) name = match[1];
      else name = 'type';
      break;
    }

    case 'EnumDeclaration': {
      type = 'class';
      const match = lineText.match(/enum\s+(\w+)/);
      if (match) name = match[1];
      else name = 'enum';
      break;
    }

    case 'ObjectExpression': {
      type = 'object';
      // Get parent to find what this object is assigned to
      const parent = node.parent;
      if (parent?.name === 'VariableDeclarator') {
        const varDef = parent.getChild('VariableDefinition');
        if (varDef) {
          name = state.doc.sliceString(varDef.from, varDef.to);
        }
      }
      if (!name) {
        // Skip anonymous objects
        return null;
      }
      break;
    }

    // Block scopes
    case 'IfStatement':
      type = 'block';
      name = 'if';
      break;
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
      type = 'block';
      name = 'for';
      break;
    case 'WhileStatement':
      type = 'block';
      name = 'while';
      break;
    case 'DoStatement':
      type = 'block';
      name = 'do...while';
      break;
    case 'SwitchStatement':
      type = 'block';
      name = 'switch';
      break;
    case 'TryStatement':
      type = 'block';
      name = 'try';
      break;
    case 'CatchClause':
      type = 'block';
      name = 'catch';
      break;

    default:
      return null;
  }

  return { name, type, line, from, to, text: lineText };
}

/**
 * Find all enclosing scopes at a given position
 */
function findEnclosingScopes(
  state: EditorState,
  pos: number,
  includeBlocks: boolean = false
): ScopeInfo[] {
  const scopes: ScopeInfo[] = [];
  const tree = syntaxTree(state);

  // Walk up the tree from the current position
  let node: SyntaxNode | null = tree.resolveInner(pos, -1);

  while (node) {
    const isScope = SCOPE_NODE_TYPES.has(node.name);
    const isBlock = includeBlocks && BLOCK_NODE_TYPES.has(node.name);

    if (isScope || isBlock) {
      const scopeInfo = getScopeInfo(node, state);
      if (scopeInfo) {
        scopes.unshift(scopeInfo); // Add to beginning so parent scopes come first
      }
    }

    node = node.parent;
  }

  // Limit to MAX_STICKY_LINES
  return scopes.slice(0, MAX_STICKY_LINES);
}

/**
 * State effect to update sticky scroll visibility
 */
export const toggleStickyScrollEffect = StateEffect.define<boolean>();

/**
 * State field to track sticky scroll enabled state
 */
const stickyScrollEnabledField = StateField.define<boolean>({
  create() {
    return true;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(toggleStickyScrollEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

/**
 * Create the sticky scroll extension
 */
export function stickyScroll(options: {
  includeBlocks?: boolean;
  maxLines?: number;
  onClick?: (line: number) => void;
} = {}): Extension {
  const { includeBlocks = false, onClick } = options;

  return [
    stickyScrollEnabledField,
    ViewPlugin.fromClass(
      class StickyScrollPlugin {
        container: HTMLElement;
        view: EditorView;
        scopes: ScopeInfo[] = [];

        constructor(view: EditorView) {
          this.view = view;
          this.container = document.createElement('div');
          this.container.className = 'cm-sticky-scroll';
          this.container.style.cssText = `
            position: sticky;
            top: 0;
            z-index: 10;
            background: var(--cm-backgroundColor, #1e1e1e);
            border-bottom: 1px solid var(--cm-sticky-scroll-border, rgba(255, 255, 255, 0.1));
            font-family: inherit;
            font-size: inherit;
            display: none;
          `;

          // Insert at the top of the scroll container
          const scroller = view.scrollDOM;
          const contentDOM = view.contentDOM;
          scroller.insertBefore(this.container, contentDOM);

          this.updateScopes();
        }

        update(update: ViewUpdate) {
          // Check if sticky scroll is enabled
          const enabled = update.state.field(stickyScrollEnabledField);
          if (!enabled) {
            this.container.style.display = 'none';
            return;
          }

          // Update when viewport changes or document changes
          // Use requestMeasure to defer reading layout until after the update
          if (update.viewportChanged || update.docChanged || update.geometryChanged) {
            this.view.requestMeasure({
              read: () => {
                this.updateScopes();
              },
            });
          }
        }

        updateScopes() {
          const view = this.view;

          // Safety check - don't read layout if view is not attached
          if (!view.dom.isConnected) {
            return;
          }

          const enabled = view.state.field(stickyScrollEnabledField);

          if (!enabled) {
            this.container.style.display = 'none';
            return;
          }

          // Get the first visible line - safe to call now since we're in requestMeasure callback
          const scrollTop = view.scrollDOM.scrollTop;
          let firstVisiblePos: number;
          try {
            firstVisiblePos = view.lineBlockAtHeight(scrollTop).from;
          } catch (e) {
            // Layout not available, skip this update
            return;
          }
          const firstVisibleLine = view.state.doc.lineAt(firstVisiblePos).number;

          // Find enclosing scopes
          const scopes = findEnclosingScopes(view.state, firstVisiblePos, includeBlocks);

          // Filter out scopes that start at or after the first visible line
          // (they should be visible in the editor)
          const stickyScopes = scopes.filter(scope => scope.line < firstVisibleLine);

          // Only show if there are scopes to display
          if (stickyScopes.length === 0) {
            this.container.style.display = 'none';
            this.scopes = [];
            return;
          }

          // Check if scopes changed
          const scopesChanged =
            this.scopes.length !== stickyScopes.length ||
            this.scopes.some((s, i) => s.line !== stickyScopes[i].line);

          if (!scopesChanged) {
            return;
          }

          this.scopes = stickyScopes;
          this.container.style.display = 'block';

          // Render the sticky scroll content
          this.container.innerHTML = '';

          for (const scope of stickyScopes) {
            const line = document.createElement('div');
            line.className = 'cm-sticky-scroll-line';
            line.style.cssText = `
              padding: 2px 4px 2px ${4 + scope.type !== 'class' && scope.type !== 'interface' ? 0 : 0}px;
              cursor: pointer;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              line-height: 1.5;
              color: var(--cm-textColor, #d4d4d4);
            `;

            // Add icon based on scope type
            const icon = document.createElement('span');
            icon.style.cssText = `
              display: inline-block;
              width: 16px;
              margin-right: 4px;
              text-align: center;
              opacity: 0.7;
            `;

            switch (scope.type) {
              case 'function':
              case 'arrow':
                icon.textContent = 'f';
                icon.style.color = '#dcdcaa';
                break;
              case 'class':
                icon.textContent = 'C';
                icon.style.color = '#4ec9b0';
                break;
              case 'method':
                icon.textContent = 'm';
                icon.style.color = '#dcdcaa';
                break;
              case 'interface':
                icon.textContent = 'I';
                icon.style.color = '#4ec9b0';
                break;
              case 'object':
                icon.textContent = 'O';
                icon.style.color = '#9cdcfe';
                break;
              case 'block':
                icon.textContent = 'B';
                icon.style.color = '#c586c0';
                break;
            }

            const text = document.createElement('span');
            text.textContent = scope.text;

            line.appendChild(icon);
            line.appendChild(text);

            // Add hover effect
            line.addEventListener('mouseenter', () => {
              line.style.backgroundColor = 'var(--cm-activeLineBackgroundColor, rgba(255, 255, 255, 0.05))';
            });
            line.addEventListener('mouseleave', () => {
              line.style.backgroundColor = 'transparent';
            });

            // Add click handler to navigate to scope definition
            line.addEventListener('click', () => {
              const lineInfo = view.state.doc.line(scope.line);
              view.dispatch({
                selection: { anchor: lineInfo.from },
                scrollIntoView: true,
                effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start' }),
              });
              view.focus();
              onClick?.(scope.line);
            });

            this.container.appendChild(line);
          }
        }

        destroy() {
          this.container.remove();
        }
      }
    ),
    // Add theme styles
    EditorView.theme({
      '.cm-sticky-scroll': {
        background: 'var(--cm-backgroundColor)',
        borderBottom: '1px solid var(--cm-sticky-scroll-border, rgba(255, 255, 255, 0.1))',
      },
      '.cm-sticky-scroll-line': {
        '&:hover': {
          background: 'var(--cm-activeLineBackgroundColor)',
        },
      },
    }),
  ];
}

/**
 * Toggle sticky scroll visibility
 */
export function toggleStickyScroll(view: EditorView, enabled: boolean) {
  view.dispatch({
    effects: toggleStickyScrollEffect.of(enabled),
  });
}
