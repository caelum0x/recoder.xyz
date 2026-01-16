import {
  ViewPlugin,
  EditorView,
  ViewUpdate,
  Decoration,
  WidgetType,
  keymap,
} from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import {
  StateEffect,
  Text,
  Facet,
  Prec,
  StateField,
  EditorState,
  EditorSelection,
} from '@codemirror/state';
import type { TransactionSpec } from '@codemirror/state';
import { debouncePromise } from './utils';

type InlineFetchFn = (state: EditorState) => Promise<string>;

const InlineSuggestionState = StateField.define<{ suggestion: null | string }>({
  create() {
    return { suggestion: null };
  },
  update(previousValue, tr) {
    const inlineSuggestion = tr.effects.find((e) => e.is(InlineSuggestionEffect));
    if (tr.state.doc) {
      if (inlineSuggestion && tr.state.doc == inlineSuggestion.value.doc) {
        return { suggestion: inlineSuggestion.value.text };
      } else if (!tr.docChanged && !tr.selection) {
        return previousValue;
      }
    }
    return { suggestion: null };
  },
});

const InlineSuggestionEffect = StateEffect.define<{ text: string | null; doc: Text }>();

export const suggestionConfigFacet = Facet.define<
  { acceptOnClick: boolean; fetchFn: InlineFetchFn },
  { acceptOnClick: boolean; fetchFn: InlineFetchFn | undefined }
>({
  combine(value) {
    return {
      acceptOnClick: !!value.at(-1)?.acceptOnClick,
      fetchFn: value.at(-1)?.fetchFn,
    };
  },
});

class InlineSuggestionWidget extends WidgetType {
  constructor(public suggestion: string) {
    super();
  }

  toDOM(view: EditorView) {
    const span = document.createElement('span');
    span.style.opacity = '0.4';
    span.className = 'cm-inline-suggestion';
    span.textContent = this.suggestion;
    span.onclick = (e) => {
      const config = view.state.facet(suggestionConfigFacet);
      if (!config.acceptOnClick) return;
      e.stopPropagation();
      e.preventDefault();
      const suggestionText = view.state.field(InlineSuggestionState)?.suggestion;
      if (!suggestionText) return;
      view.dispatch(insertCompletionText(view.state, suggestionText, view.state.selection.main.head, view.state.selection.main.head));
    };
    return span;
  }
}

function inlineSuggestionDecoration(view: EditorView, suggestionText: string) {
  const pos = view.state.selection.main.head;
  const w = Decoration.widget({
    widget: new InlineSuggestionWidget(suggestionText),
    side: 1,
  });
  return Decoration.set([w.range(pos)]);
}

const fetchSuggestion = ViewPlugin.fromClass(
  class {
    async update(update: ViewUpdate) {
      if (!update.docChanged) return;
      if (update.transactions.some((t) => t.isUserEvent('input.complete'))) return;

      const doc = update.state.doc;
      const config = update.view.state.facet(suggestionConfigFacet);
      if (!config.fetchFn) return;

      const result = await config.fetchFn(update.state);
      update.view.dispatch({
        effects: InlineSuggestionEffect.of({ text: result, doc }),
      });
    }
  }
);

const renderInlineSuggestionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;

    update(update: ViewUpdate) {
      const suggestionText = update.state.field(InlineSuggestionState)?.suggestion;
      this.decorations = suggestionText ? inlineSuggestionDecoration(update.view, suggestionText) : Decoration.none;
    }
  },
  { decorations: (v) => v.decorations }
);

const inlineSuggestionKeymap = Prec.highest(
  keymap.of([
    {
      key: 'Tab',
      run: (view) => {
        const suggestionText = view.state.field(InlineSuggestionState)?.suggestion;
        if (!suggestionText) return false;
        view.dispatch(insertCompletionText(view.state, suggestionText, view.state.selection.main.head, view.state.selection.main.head));
        return true;
      },
    },
  ])
);

function insertCompletionText(state: EditorState, text: string, from: number, to: number): TransactionSpec {
  return {
    ...state.changeByRange((range) => {
      if (range == state.selection.main) {
        return {
          changes: { from, to, insert: text },
          range: EditorSelection.cursor(from + text.length),
        };
      }
      const len = to - from;
      if (!range.empty || (len && state.sliceDoc(range.from - len, range.from) != state.sliceDoc(from, to))) {
        return { range };
      }
      return {
        changes: { from: range.from - len, to: range.from, insert: text },
        range: EditorSelection.cursor(range.from - len + text.length),
      };
    }),
    userEvent: 'input.complete',
  };
}

type InlineSuggestionOptions = {
  fetchFn: InlineFetchFn;
  delay?: number;
  acceptOnClick?: boolean;
};

export function inlineSuggestion(options: InlineSuggestionOptions) {
  const { delay = 500, acceptOnClick = true } = options;
  const fetchFn = debouncePromise(options.fetchFn, delay);
  return [
    suggestionConfigFacet.of({ acceptOnClick, fetchFn }),
    InlineSuggestionState,
    fetchSuggestion,
    renderInlineSuggestionPlugin,
    inlineSuggestionKeymap,
  ];
}
