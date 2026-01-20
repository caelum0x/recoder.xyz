/**
 * CodeMirror Collaboration Extensions
 *
 * Provides Yjs integration with CodeMirror for real-time collaborative editing.
 * Features:
 * - Remote cursor rendering with user names
 * - Remote selection highlights
 * - Yjs document binding for text synchronization
 */

import { EditorView, Decoration, WidgetType, ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import type { Extension, Text } from '@codemirror/state';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import type { UserInfo, CursorPosition, SelectionRange } from './yjs-provider';
import { getLightColor } from './awareness';

// Configuration for collaboration
export interface CollaborationConfig {
  doc: Y.Doc;
  awareness: Awareness;
  user: UserInfo;
  onCursorUpdate?: (cursor: CursorPosition | null) => void;
  onSelectionUpdate?: (selection: SelectionRange | null) => void;
}

// Remote user state for rendering
interface RemoteUserState {
  clientId: number;
  user: UserInfo;
  cursor?: CursorPosition;
  selection?: SelectionRange;
}

/**
 * Widget for rendering remote cursor (caret with user name label)
 */
class RemoteCursorWidget extends WidgetType {
  constructor(
    private user: UserInfo,
    private isAtLineStart: boolean
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-remote-cursor-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline';
    wrapper.style.marginLeft = '-1px';
    wrapper.style.marginRight = '-1px';

    // Cursor caret
    const caret = document.createElement('span');
    caret.className = 'cm-remote-cursor-caret';
    caret.style.cssText = `
      position: absolute;
      width: 2px;
      height: 1.2em;
      background-color: ${this.user.color};
      animation: cm-cursor-blink 1s ease-in-out infinite;
      z-index: 10;
      pointer-events: none;
    `;

    // User name label
    const label = document.createElement('span');
    label.className = 'cm-remote-cursor-label';
    label.textContent = this.user.name;
    label.style.cssText = `
      position: absolute;
      bottom: calc(100% + 2px);
      left: ${this.isAtLineStart ? '0' : '-2px'};
      padding: 1px 4px;
      font-size: 10px;
      font-weight: 500;
      line-height: 1.2;
      color: white;
      background-color: ${this.user.color};
      border-radius: 2px;
      white-space: nowrap;
      z-index: 20;
      pointer-events: none;
      opacity: 0.9;
    `;

    wrapper.appendChild(caret);
    wrapper.appendChild(label);

    return wrapper;
  }

  eq(other: RemoteCursorWidget): boolean {
    return other.user.id === this.user.id && other.isAtLineStart === this.isAtLineStart;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Convert line/column position to document offset
 */
function positionToOffset(doc: Text, pos: CursorPosition): number {
  const lineCount = doc.lines;
  const line = Math.min(Math.max(1, pos.line + 1), lineCount);
  const lineInfo = doc.line(line);
  const column = Math.min(Math.max(0, pos.column), lineInfo.length);
  return lineInfo.from + column;
}

/**
 * Convert document offset to line/column position
 */
function offsetToPosition(doc: Text, offset: number): CursorPosition {
  const line = doc.lineAt(Math.min(Math.max(0, offset), doc.length));
  return {
    line: line.number - 1, // 0-indexed
    column: offset - line.from,
  };
}

/**
 * State effect for updating remote users
 */
const updateRemoteUsersEffect = StateEffect.define<RemoteUserState[]>();

/**
 * State field for tracking remote user decorations
 */
const remoteUsersField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    // Check for update effect
    for (const effect of tr.effects) {
      if (effect.is(updateRemoteUsersEffect)) {
        return buildDecorations(tr.state.doc, effect.value);
      }
    }

    // Map decorations through document changes
    if (tr.docChanged) {
      return decorations.map(tr.changes);
    }

    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * Build decorations for remote users
 */
function buildDecorations(doc: Text, users: RemoteUserState[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const decorations: Array<{ from: number; to: number; decoration: Decoration }> = [];

  for (const user of users) {
    // Add selection highlight
    if (user.selection) {
      const anchorOffset = positionToOffset(doc, user.selection.anchor);
      const headOffset = positionToOffset(doc, user.selection.head);
      const from = Math.min(anchorOffset, headOffset);
      const to = Math.max(anchorOffset, headOffset);

      if (from !== to && from >= 0 && to <= doc.length) {
        const selectionMark = Decoration.mark({
          class: 'cm-remote-selection',
          attributes: {
            style: `background-color: ${getLightColor(user.user.color, 0.3)};`,
          },
        });

        decorations.push({ from, to, decoration: selectionMark });
      }
    }

    // Add cursor widget
    if (user.cursor) {
      const offset = positionToOffset(doc, user.cursor);
      if (offset >= 0 && offset <= doc.length) {
        const line = doc.lineAt(offset);
        const isAtLineStart = offset === line.from;

        const cursorWidget = Decoration.widget({
          widget: new RemoteCursorWidget(user.user, isAtLineStart),
          side: 1, // After the character
        });

        decorations.push({ from: offset, to: offset, decoration: cursorWidget });
      }
    }
  }

  // Sort decorations by position (required for RangeSetBuilder)
  decorations.sort((a, b) => a.from - b.from || a.to - b.to);

  for (const { from, to, decoration } of decorations) {
    builder.add(from, to, decoration);
  }

  return builder.finish();
}

/**
 * View plugin for awareness updates
 */
function createAwarenessPlugin(awareness: Awareness, localClientId: number) {
  return ViewPlugin.fromClass(
    class {
      private unsubscribe: (() => void) | null = null;

      constructor(private view: EditorView) {
        this.subscribe();
      }

      private subscribe() {
        const handler = () => this.updateDecorations();
        awareness.on('change', handler);
        awareness.on('update', handler);
        this.unsubscribe = () => {
          awareness.off('change', handler);
          awareness.off('update', handler);
        };

        // Initial update
        this.updateDecorations();
      }

      private updateDecorations() {
        const states = awareness.getStates();
        const remoteUsers: RemoteUserState[] = [];

        states.forEach((state: any, clientId: number) => {
          if (clientId === localClientId) return;
          if (!state.user) return;

          remoteUsers.push({
            clientId,
            user: state.user,
            cursor: state.cursor,
            selection: state.selection,
          });
        });

        this.view.dispatch({
          effects: updateRemoteUsersEffect.of(remoteUsers),
        });
      }

      update(update: ViewUpdate) {
        // Could react to view updates here if needed
      }

      destroy() {
        this.unsubscribe?.();
      }
    }
  );
}

/**
 * View plugin for syncing local cursor/selection to awareness
 */
function createLocalCursorPlugin(
  awareness: Awareness,
  onCursorUpdate?: (cursor: CursorPosition | null) => void,
  onSelectionUpdate?: (selection: SelectionRange | null) => void
) {
  return ViewPlugin.fromClass(
    class {
      constructor(private view: EditorView) {
        this.syncToAwareness();
      }

      update(update: ViewUpdate) {
        if (update.selectionSet || update.docChanged) {
          this.syncToAwareness();
        }
      }

      private syncToAwareness() {
        const { state } = this.view;
        const mainSelection = state.selection.main;

        // Calculate cursor position
        const cursor = offsetToPosition(state.doc, mainSelection.head);
        onCursorUpdate?.(cursor);
        awareness.setLocalStateField('cursor', cursor);

        // Calculate selection if not empty
        if (!mainSelection.empty) {
          const selection: SelectionRange = {
            anchor: offsetToPosition(state.doc, mainSelection.anchor),
            head: cursor,
          };
          onSelectionUpdate?.(selection);
          awareness.setLocalStateField('selection', selection);
        } else {
          onSelectionUpdate?.(null);
          awareness.setLocalStateField('selection', null);
        }
      }

      destroy() {
        // Clear cursor/selection when leaving
        awareness.setLocalStateField('cursor', null);
        awareness.setLocalStateField('selection', null);
      }
    }
  );
}

/**
 * Create Yjs text binding for CodeMirror
 * This syncs the CodeMirror document with a Yjs Text type
 */
function createYjsBinding(yDoc: Y.Doc) {
  const yText = yDoc.getText('content');

  return ViewPlugin.fromClass(
    class {
      private observer: ((event: Y.YTextEvent, tr: Y.Transaction) => void) | null = null;
      private isLocalUpdate = false;

      constructor(private view: EditorView) {
        this.setupYjsObserver();
        this.syncFromYjs();
      }

      private setupYjsObserver() {
        this.observer = (event: Y.YTextEvent, tr: Y.Transaction) => {
          if (tr.local) return; // Ignore local changes

          this.isLocalUpdate = true;

          let pos = 0;
          const changes: Array<{ from: number; to: number; insert: string }> = [];

          event.delta.forEach((op) => {
            if (op.retain !== undefined) {
              pos += op.retain;
            } else if (op.insert !== undefined) {
              const text = typeof op.insert === 'string' ? op.insert : '';
              changes.push({ from: pos, to: pos, insert: text });
              pos += text.length;
            } else if (op.delete !== undefined) {
              changes.push({ from: pos, to: pos + op.delete, insert: '' });
            }
          });

          if (changes.length > 0) {
            this.view.dispatch({
              changes,
              // Mark as remote - annotation removed as Y.Transaction.local doesn't exist
            });
          }

          this.isLocalUpdate = false;
        };

        yText.observe(this.observer);
      }

      private syncFromYjs() {
        const yjsContent = yText.toString();
        const currentContent = this.view.state.doc.toString();

        if (yjsContent !== currentContent && yjsContent.length > 0) {
          this.isLocalUpdate = true;
          this.view.dispatch({
            changes: { from: 0, to: currentContent.length, insert: yjsContent },
          });
          this.isLocalUpdate = false;
        }
      }

      update(update: ViewUpdate) {
        if (this.isLocalUpdate) return;
        if (!update.docChanged) return;

        // Sync local changes to Yjs
        yDoc.transact(() => {
          update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
            if (toA > fromA) {
              yText.delete(fromA, toA - fromA);
            }
            if (inserted.length > 0) {
              yText.insert(fromA, inserted.toString());
            }
          });
        });
      }

      destroy() {
        if (this.observer) {
          yText.unobserve(this.observer);
        }
      }
    }
  );
}

/**
 * CSS styles for remote cursors and selections
 */
const collaborationStyles = EditorView.baseTheme({
  '.cm-remote-cursor-wrapper': {
    position: 'relative',
  },
  '.cm-remote-cursor-caret': {
    animation: 'cm-cursor-blink 1s ease-in-out infinite',
  },
  '.cm-remote-cursor-label': {
    transition: 'opacity 0.2s ease',
  },
  '.cm-remote-selection': {
    borderRadius: '1px',
  },
  '@keyframes cm-cursor-blink': {
    '0%, 100%': { opacity: '1' },
    '50%': { opacity: '0.5' },
  },
});

/**
 * Create all collaboration extensions for CodeMirror
 */
export function createCollaborationExtensions(config: CollaborationConfig): Extension[] {
  const { doc, awareness, user, onCursorUpdate, onSelectionUpdate } = config;
  const localClientId = awareness.clientID;

  // Set initial user info in awareness
  awareness.setLocalStateField('user', user);

  return [
    // Styles
    collaborationStyles,

    // Remote user decorations state
    remoteUsersField,

    // Awareness plugin (renders remote cursors)
    createAwarenessPlugin(awareness, localClientId),

    // Local cursor sync plugin
    createLocalCursorPlugin(awareness, onCursorUpdate, onSelectionUpdate),

    // Yjs document binding
    createYjsBinding(doc),
  ];
}

/**
 * Create a minimal set of extensions (without Yjs binding)
 * Useful when you want to manage document sync separately
 */
export function createCursorExtensions(config: Omit<CollaborationConfig, 'doc'>): Extension[] {
  const { awareness, user, onCursorUpdate, onSelectionUpdate } = config;
  const localClientId = awareness.clientID;

  awareness.setLocalStateField('user', user);

  return [
    collaborationStyles,
    remoteUsersField,
    createAwarenessPlugin(awareness, localClientId),
    createLocalCursorPlugin(awareness, onCursorUpdate, onSelectionUpdate),
  ];
}

export default createCollaborationExtensions;
