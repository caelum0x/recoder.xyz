/**
 * Cmd+K Inline Editing Extension for CodeMirror 6
 *
 * Select code -> Cmd+K -> type instruction -> AI generates replacement
 * Shows inline diff before accepting.
 */

import {
  ViewPlugin,
  EditorView,
  Decoration,
  WidgetType,
  keymap,
  type ViewUpdate,
  type DecorationSet,
} from '@codemirror/view';
import {
  StateEffect,
  StateField,
  Prec,
  EditorSelection,
  type Extension,
} from '@codemirror/state';

// ========== State Effects ==========

/** Open the inline edit input at current selection */
const openInlineEditEffect = StateEffect.define<{
  from: number;
  to: number;
  selectedText: string;
}>();

/** Close the inline edit input */
const closeInlineEditEffect = StateEffect.define<void>();

/** Set the AI-generated replacement */
const setReplacementEffect = StateEffect.define<{
  replacement: string;
  from: number;
  to: number;
}>();

/** Accept the replacement */
const acceptReplacementEffect = StateEffect.define<void>();

/** Clear the replacement preview */
const clearReplacementEffect = StateEffect.define<void>();

// ========== State ==========

interface InlineEditState {
  active: boolean;
  from: number;
  to: number;
  selectedText: string;
  replacement: string | null;
  loading: boolean;
}

const defaultState: InlineEditState = {
  active: false,
  from: 0,
  to: 0,
  selectedText: '',
  replacement: null,
  loading: false,
};

const inlineEditStateField = StateField.define<InlineEditState>({
  create: () => defaultState,
  update(state, tr) {
    for (const effect of tr.effects) {
      if (effect.is(openInlineEditEffect)) {
        return {
          active: true,
          from: effect.value.from,
          to: effect.value.to,
          selectedText: effect.value.selectedText,
          replacement: null,
          loading: false,
        };
      }
      if (effect.is(closeInlineEditEffect) || effect.is(acceptReplacementEffect)) {
        return defaultState;
      }
      if (effect.is(setReplacementEffect)) {
        return {
          ...state,
          replacement: effect.value.replacement,
          loading: false,
        };
      }
      if (effect.is(clearReplacementEffect)) {
        return { ...state, replacement: null, loading: false };
      }
    }

    // Close if document changed by external edit while active
    if (state.active && tr.docChanged) {
      return defaultState;
    }

    return state;
  },
});

// ========== Widgets ==========

/** Floating input widget for typing the edit instruction */
class InlineEditInputWidget extends WidgetType {
  private onSubmit: (instruction: string) => void;
  private onCancel: () => void;

  constructor(onSubmit: (instruction: string) => void, onCancel: () => void) {
    super();
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-inline-edit-widget';
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      margin: 4px 0;
      background: var(--recoder-elements-background-depth-3, #1e1e2e);
      border: 1px solid var(--recoder-elements-borderColor, #45475a);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 50;
    `;

    const label = document.createElement('span');
    label.textContent = '✏️';
    label.style.cssText = 'font-size: 14px; flex-shrink: 0;';
    container.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Describe the edit...';
    input.style.cssText = `
      flex: 1;
      min-width: 250px;
      padding: 4px 8px;
      background: var(--recoder-elements-background-depth-1, #11111b);
      color: var(--recoder-elements-textPrimary, #cdd6f4);
      border: 1px solid var(--recoder-elements-borderColor, #45475a);
      border-radius: 4px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
    `;

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();

      if (e.key === 'Enter' && input.value.trim()) {
        this.onSubmit(input.value.trim());
        input.disabled = true;
        input.placeholder = 'Generating...';
        input.value = '';
      } else if (e.key === 'Escape') {
        this.onCancel();
      }
    });

    // Prevent CM from stealing focus
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('focus', (e) => e.stopPropagation());

    container.appendChild(input);

    // Focus input after a tick (needs to be in DOM first)
    requestAnimationFrame(() => input.focus());

    return container;
  }

  ignoreEvent() {
    return true;
  }
}

/** Shows the replacement diff inline */
class InlineReplacementWidget extends WidgetType {
  constructor(
    private originalText: string,
    private replacementText: string,
    private onAccept: () => void,
    private onReject: () => void,
  ) {
    super();
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-inline-replacement';
    container.style.cssText = `
      margin: 4px 0;
      border: 1px solid var(--recoder-elements-borderColor, #45475a);
      border-radius: 6px;
      overflow: hidden;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 13px;
    `;

    // Removed lines (original)
    if (this.originalText.trim()) {
      const removed = document.createElement('div');
      removed.style.cssText = `
        background: rgba(248, 81, 73, 0.15);
        color: #f85149;
        padding: 4px 8px;
        white-space: pre-wrap;
        text-decoration: line-through;
        opacity: 0.7;
      `;
      removed.textContent = this.originalText;
      container.appendChild(removed);
    }

    // Added lines (replacement)
    const added = document.createElement('div');
    added.style.cssText = `
      background: rgba(63, 185, 80, 0.15);
      color: #3fb950;
      padding: 4px 8px;
      white-space: pre-wrap;
    `;
    added.textContent = this.replacementText;
    container.appendChild(added);

    // Action buttons
    const actions = document.createElement('div');
    actions.style.cssText = `
      display: flex;
      gap: 8px;
      padding: 4px 8px;
      background: var(--recoder-elements-background-depth-3, #1e1e2e);
      border-top: 1px solid var(--recoder-elements-borderColor, #45475a);
    `;

    const acceptBtn = document.createElement('button');
    acceptBtn.textContent = 'Accept (Enter)';
    acceptBtn.style.cssText = `
      padding: 3px 10px;
      background: #3fb950;
      color: #000;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    `;
    acceptBtn.onclick = (e) => {
      e.stopPropagation();
      this.onAccept();
    };

    const rejectBtn = document.createElement('button');
    rejectBtn.textContent = 'Reject (Esc)';
    rejectBtn.style.cssText = `
      padding: 3px 10px;
      background: var(--recoder-elements-background-depth-1, #11111b);
      color: var(--recoder-elements-textPrimary, #cdd6f4);
      border: 1px solid var(--recoder-elements-borderColor, #45475a);
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    `;
    rejectBtn.onclick = (e) => {
      e.stopPropagation();
      this.onReject();
    };

    actions.appendChild(acceptBtn);
    actions.appendChild(rejectBtn);
    container.appendChild(actions);

    // Prevent CM from handling events inside this widget
    container.addEventListener('mousedown', (e) => e.stopPropagation());

    return container;
  }

  ignoreEvent() {
    return true;
  }
}

// ========== Decoration Plugin ==========

const inlineEditDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;

    update(update: ViewUpdate) {
      const state = update.state.field(inlineEditStateField);

      if (!state.active) {
        this.decorations = Decoration.none;
        return;
      }

      const decorations: any[] = [];

      if (state.replacement !== null) {
        // Show diff widget replacing the selected range
        const widget = new InlineReplacementWidget(
          state.selectedText,
          state.replacement,
          () => {
            // Accept: replace text and close
            const editState = update.view.state.field(inlineEditStateField);

            if (editState.replacement !== null) {
              update.view.dispatch({
                changes: {
                  from: editState.from,
                  to: editState.to,
                  insert: editState.replacement,
                },
                effects: acceptReplacementEffect.of(undefined),
                selection: EditorSelection.cursor(editState.from + editState.replacement.length),
              });
            }
          },
          () => {
            // Reject: close without changes
            update.view.dispatch({
              effects: closeInlineEditEffect.of(undefined),
            });
          },
        );

        decorations.push(
          Decoration.widget({ widget, block: true }).range(state.to),
        );

        // Highlight the original selection
        decorations.push(
          Decoration.mark({
            class: 'cm-inline-edit-highlight',
            attributes: {
              style: 'background: rgba(248, 81, 73, 0.1); text-decoration: line-through; opacity: 0.6;',
            },
          }).range(state.from, state.to),
        );
      } else {
        // Show input widget
        const widget = new InlineEditInputWidget(
          (instruction) => {
            // Submit instruction to API
            fetchInlineEdit(update.view, instruction);
          },
          () => {
            update.view.dispatch({
              effects: closeInlineEditEffect.of(undefined),
            });
          },
        );

        decorations.push(
          Decoration.widget({ widget, block: true }).range(state.to),
        );

        // Highlight the selected text
        decorations.push(
          Decoration.mark({
            class: 'cm-inline-edit-selection',
            attributes: {
              style: 'background: rgba(137, 180, 250, 0.2); border-bottom: 2px solid rgba(137, 180, 250, 0.5);',
            },
          }).range(state.from, state.to),
        );
      }

      this.decorations = Decoration.set(decorations, true);
    }
  },
  { decorations: (v) => v.decorations },
);

// ========== API Call ==========

async function fetchInlineEdit(view: EditorView, instruction: string) {
  const state = view.state.field(inlineEditStateField);

  if (!state.active) return;

  // Get context around the selection
  const doc = view.state.doc.toString();
  const prefix = doc.slice(Math.max(0, state.from - 1500), state.from);
  const selected = state.selectedText;
  const suffix = doc.slice(state.to, Math.min(doc.length, state.to + 500));

  try {
    const response = await fetch('/api/inline-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction,
        selectedCode: selected,
        prefix,
        suffix,
      }),
    });

    if (!response.ok) {
      view.dispatch({ effects: closeInlineEditEffect.of(undefined) });
      return;
    }

    const data = (await response.json()) as { replacement?: string };
    const replacement = data.replacement || selected;

    view.dispatch({
      effects: setReplacementEffect.of({
        replacement,
        from: state.from,
        to: state.to,
      }),
    });
  } catch {
    view.dispatch({ effects: closeInlineEditEffect.of(undefined) });
  }
}

// ========== Keymap ==========

const inlineEditKeymap = Prec.highest(
  keymap.of([
    {
      key: 'Mod-k',
      run: (view) => {
        const { from, to } = view.state.selection.main;

        // Need a non-empty selection
        if (from === to) return false;

        const selectedText = view.state.sliceDoc(from, to);

        view.dispatch({
          effects: openInlineEditEffect.of({ from, to, selectedText }),
        });

        return true;
      },
    },
    {
      // When replacement is shown, Enter accepts
      key: 'Enter',
      run: (view) => {
        const state = view.state.field(inlineEditStateField);

        if (!state.active || state.replacement === null) return false;

        view.dispatch({
          changes: {
            from: state.from,
            to: state.to,
            insert: state.replacement,
          },
          effects: acceptReplacementEffect.of(undefined),
          selection: EditorSelection.cursor(state.from + state.replacement.length),
        });

        return true;
      },
    },
    {
      // Escape closes inline edit at any stage
      key: 'Escape',
      run: (view) => {
        const state = view.state.field(inlineEditStateField);

        if (!state.active) return false;

        view.dispatch({
          effects: closeInlineEditEffect.of(undefined),
        });

        return true;
      },
    },
  ]),
);

// ========== Extension Export ==========

export function inlineEditExtension(): Extension {
  return [
    inlineEditStateField,
    inlineEditDecorationPlugin,
    inlineEditKeymap,
  ];
}
