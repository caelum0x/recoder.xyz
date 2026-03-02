import { acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, codeFolding, foldAll, foldCode, foldGutter, foldKeymap, indentOnInput, indentUnit, unfoldAll, unfoldCode } from '@codemirror/language';
import { lintGutter, lintKeymap, setDiagnostics } from '@codemirror/lint';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorSelection, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  highlightWhitespace,
  hoverTooltip,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
  scrollPastEnd,
  showTooltip,
  tooltips,
  type Tooltip,
} from '@codemirror/view';
import { memo, useEffect, useRef, useState, useCallback, type MutableRefObject } from 'react';
import { useStore } from '@nanostores/react';
import { errorsAtom, selectedErrorAtom, selectError, type BuildError } from '~/lib/stores/errors';
import { preferencesStore, updateEditorPreferences } from '~/lib/stores/settings';
import { editorConfigStore, getEffectiveConfig, type EditorConfig } from '~/lib/stores/editor-config';
import { workbenchStore } from '~/lib/stores/workbench';
import { setCursorPosition } from '~/lib/stores/status-bar';
import { createStaticDiagnostics } from './diagnostics';
import type { Theme } from '~/types/theme';
import { classNames } from '~/utils/classNames';
import { debounce } from '~/utils/debounce';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BinaryContent } from './BinaryContent';
import { getTheme, reconfigureTheme, reconfigureCleanMode } from './cm-theme';
import { inlineCopilot } from './inline-copilot';
import { indentKeyBinding } from './indent';
import { getLanguage } from './languages';
import { lspExtension, lspDocumentSync, lspAutoInit, type DefinitionLocation } from './lsp-extensions';
import { getLSPClient } from '~/lib/lsp/lsp-client';
import { getCompletionSources } from './combined-completions';
import { Minimap } from './minimap';
import { stickyScroll, toggleStickyScroll } from './sticky-scroll';
import { rainbowBrackets } from './rainbow-brackets';
import { errorHighlighting, updateErrors } from './error-highlighting';
import { indentGuides, toggleIndentGuides } from './indent-guides';
import { inlineEditExtension } from './inline-edit-widget';

const logger = createScopedLogger('CodeMirrorEditor');

export interface EditorDocument {
  value: string;
  isBinary: boolean;
  filePath: string;
  scroll?: ScrollPosition;
}

export interface EditorSettings {
  fontSize?: string;
  gutterFontSize?: string;
  tabSize?: number;
}

type TextEditorDocument = EditorDocument & {
  value: string;
};

export interface ScrollPosition {
  top: number;
  left: number;
}

export interface EditorUpdate {
  selection: EditorSelection;
  content: string;
}

export type OnChangeCallback = (update: EditorUpdate) => void;
export type OnScrollCallback = (position: ScrollPosition) => void;
export type OnSaveCallback = () => void;

interface Props {
  theme: Theme;
  id?: unknown;
  doc?: EditorDocument;
  editable?: boolean;
  debounceChange?: number;
  debounceScroll?: number;
  autoFocusOnDocumentChange?: boolean;
  onChange?: OnChangeCallback;
  onScroll?: OnScrollCallback;
  onSave?: OnSaveCallback;
  onGotoDefinition?: (file: string, line: number, character?: number) => void;
  onReferencesFound?: (locations: DefinitionLocation[]) => void;
  projectId?: string;
  className?: string;
  settings?: EditorSettings;
  /** Enable LSP features (hover, completions, go-to-definition) */
  enableLSP?: boolean;
  /** Override minimap visibility (uses settings store if not provided) */
  showMinimap?: boolean;
}

type EditorStates = Map<string, EditorState>;

const readOnlyTooltipStateEffect = StateEffect.define<boolean>();

const editableTooltipField = StateField.define<readonly Tooltip[]>({
  create: () => [],
  update(_tooltips, transaction) {
    if (!transaction.state.readOnly) {
      return [];
    }

    for (const effect of transaction.effects) {
      if (effect.is(readOnlyTooltipStateEffect) && effect.value) {
        return getReadOnlyTooltip(transaction.state);
      }
    }

    return [];
  },
  provide: (field) => {
    return showTooltip.computeN([field], (state) => state.field(field));
  },
});

const editableStateEffect = StateEffect.define<boolean>();

const editableStateField = StateField.define<boolean>({
  create() {
    return true;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(editableStateEffect)) {
        return effect.value;
      }
    }

    return value;
  },
});

export const CodeMirrorEditor = memo(
  ({
    id,
    doc,
    debounceScroll = 100,
    debounceChange = 150,
    autoFocusOnDocumentChange = false,
    editable = true,
    onScroll,
    onChange,
    onSave,
    onGotoDefinition,
    onReferencesFound,
    projectId,
    theme,
    settings,
    className = '',
    enableLSP = true,
    showMinimap: showMinimapProp,
  }: Props) => {
    renderLogger.trace('CodeMirrorEditor');

    const [languageCompartment] = useState(new Compartment());
    const [lspCompartment] = useState(new Compartment());
    const [wordWrapCompartment] = useState(new Compartment());
    const [rainbowBracketsCompartment] = useState(new Compartment());
    const [indentGuidesCompartment] = useState(new Compartment());
    const [cleanModeCompartment] = useState(new Compartment());
    const errors = useStore(errorsAtom);
    const preferences = useStore(preferencesStore);
    const editorConfig = useStore(editorConfigStore);
    const effectiveConfig = getEffectiveConfig(editorConfig);

    // Minimap visibility - use prop if provided, otherwise use settings
    const showMinimap = showMinimapProp ?? preferences.editor.minimap;
    const wordWrap = preferences.editor.wordWrap;
    const bracketColorization = preferences.editor.bracketPairColorization;
    const indentGuidesEnabled = preferences.editor.indentGuides;

    // State to trigger re-render when view is ready
    const [viewReady, setViewReady] = useState(false);

    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | undefined>(undefined);
    const themeRef = useRef<Theme | undefined>(undefined);
    const docRef = useRef<EditorDocument | undefined>(undefined);
    const editorStatesRef = useRef<EditorStates | undefined>(undefined);
    const onScrollRef = useRef(onScroll);
    const onChangeRef = useRef(onChange);
    const onSaveRef = useRef(onSave);
    const onGotoDefinitionRef = useRef(onGotoDefinition);
    const onReferencesFoundRef = useRef(onReferencesFound);

    /**
     * This effect is used to avoid side effects directly in the render function
     * and instead the refs are updated after each render.
     */
    useEffect(() => {
      onScrollRef.current = onScroll;
      onChangeRef.current = onChange;
      onSaveRef.current = onSave;
      onGotoDefinitionRef.current = onGotoDefinition;
      onReferencesFoundRef.current = onReferencesFound;
      docRef.current = doc;
      themeRef.current = theme;
    });

    useEffect(() => {
      const onUpdate = debounce((update: EditorUpdate) => {
        onChangeRef.current?.(update);
      }, debounceChange);

      const view = new EditorView({
        parent: containerRef.current!,
        dispatchTransactions(transactions) {
          const previousSelection = view.state.selection;

          view.update(transactions);

          const newSelection = view.state.selection;

          const selectionChanged =
            newSelection !== previousSelection &&
            (newSelection === undefined || previousSelection === undefined || !newSelection.eq(previousSelection));

          if (docRef.current && (transactions.some((transaction) => transaction.docChanged) || selectionChanged)) {
            onUpdate({
              selection: view.state.selection,
              content: view.state.doc.toString(),
            });

            editorStatesRef.current!.set(docRef.current.filePath, view.state);
          }

          // Update cursor position in status bar whenever selection changes
          if (selectionChanged) {
            const mainSelection = view.state.selection.main;
            const lineInfo = view.state.doc.lineAt(mainSelection.head);
            const line = lineInfo.number;
            const column = mainSelection.head - lineInfo.from + 1;

            // Check if there's a selection
            if (mainSelection.from !== mainSelection.to) {
              const startLine = view.state.doc.lineAt(mainSelection.from);
              const endLine = view.state.doc.lineAt(mainSelection.to);
              const selectedChars = mainSelection.to - mainSelection.from;
              const selectedLines = endLine.number - startLine.number + 1;

              setCursorPosition({
                line,
                column,
                selection: {
                  start: { line: startLine.number, column: mainSelection.from - startLine.from + 1 },
                  end: { line: endLine.number, column: mainSelection.to - endLine.from + 1 },
                  selectedChars,
                  selectedLines,
                },
              });
            } else {
              setCursorPosition({ line, column });
            }
          }
        },
      });

      viewRef.current = view;
      setViewReady(true);

      return () => {
        viewRef.current?.destroy();
        viewRef.current = undefined;
        setViewReady(false);
      };
    }, []);

    useEffect(() => {
      if (!viewRef.current) {
        return;
      }

      viewRef.current.dispatch({
        effects: [reconfigureTheme(theme)],
      });
    }, [theme]);

    useEffect(() => {
      editorStatesRef.current = new Map<string, EditorState>();
    }, [id]);

    // Initialize LSP when projectId changes
    useEffect(() => {
      if (!projectId || !enableLSP) return;

      // Initialize LSP client in background when project loads
      const client = getLSPClient(projectId);
      if (!client.isReady()) {
        client.initialize().catch((err) => {
          logger.warn('LSP initialization failed:', err);
        });
      }

      return () => {
        // Note: We don't dispose the client here as it may be shared
        // The client will be cleaned up when the project is closed
      };
    }, [projectId, enableLSP]);

    useEffect(() => {
      const editorStates = editorStatesRef.current!;
      const view = viewRef.current!;
      const theme = themeRef.current!;

      // Build LSP extensions if projectId is available and LSP is enabled
      // Includes hover, go-to-definition, find references, and document sync
      const lspExtensions: Extension[] = [];

      if (enableLSP && projectId && doc?.filePath) {
        // Add core LSP features (hover, go-to-definition, find references)
        lspExtensions.push(
          ...lspExtension(projectId, doc.filePath, {
            onGotoDefinition: (file, line, character) => onGotoDefinitionRef.current?.(file, line, character),
            onReferencesFound: (locations) => onReferencesFoundRef.current?.(locations),
            enableHover: true,
            enableDefinition: true,
            enableReferences: true,
          })
        );

        // Add document sync for better LSP accuracy
        lspExtensions.push(lspDocumentSync(projectId, doc.filePath, 500));

        // Add auto-init to ensure LSP is ready
        lspExtensions.push(lspAutoInit(projectId, doc.filePath));
      }

      if (!doc) {
        const state = newEditorState({
          content: '',
          theme,
          settings,
          editorConfig: effectiveConfig,
          onScrollRef,
          debounceScroll,
          onFileSaveRef: onSaveRef,
          extensions: [
            languageCompartment.of([]),
            lspCompartment.of([]),
            wordWrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
            rainbowBracketsCompartment.of(bracketColorization ? rainbowBrackets() : []),
            indentGuidesCompartment.of(indentGuidesEnabled ? indentGuides() : []),
            cleanModeCompartment.of([]),
          ],
          enableCodeFolding: preferences.editor.codeFolding,
          enableStickyScroll: preferences.editor.stickyScroll,
        });

        view.setState(state);

        setNoDocument(view);

        return;
      }

      if (doc.isBinary) {
        return;
      }

      if (doc.filePath === '') {
        logger.warn('File path should not be empty');
      }

      let state = editorStates.get(doc.filePath);

      if (!state) {
        state = newEditorState({
          content: doc.value,
          theme,
          settings,
          editorConfig: effectiveConfig,
          onScrollRef,
          debounceScroll,
          onFileSaveRef: onSaveRef,
          extensions: [
            languageCompartment.of([]),
            lspCompartment.of(lspExtensions),
            wordWrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
            rainbowBracketsCompartment.of(bracketColorization ? rainbowBrackets() : []),
            indentGuidesCompartment.of(indentGuidesEnabled ? indentGuides() : []),
            cleanModeCompartment.of([]),
          ],
          filePath: doc.filePath,
          projectId,
          enableLSP,
          enableCodeFolding: preferences.editor.codeFolding,
          enableStickyScroll: preferences.editor.stickyScroll,
        });

        editorStates.set(doc.filePath, state);
      }

      view.setState(state);

      // Update LSP extensions when file changes
      view.dispatch({ effects: lspCompartment.reconfigure(lspExtensions) });

      setEditorDocument(
        view,
        theme,
        editable,
        languageCompartment,
        autoFocusOnDocumentChange,
        doc as TextEditorDocument,
      );
    }, [doc?.value, editable, doc?.filePath, autoFocusOnDocumentChange, projectId, enableLSP]);

    // Update diagnostics (red underlines) and error highlighting when errors change
    useEffect(() => {
      const view = viewRef.current;

      if (!view || !doc?.filePath) {
        return;
      }

      // Skip diagnostics if showDiagnostics is disabled or cleanMode is enabled
      if (!effectiveConfig.showDiagnostics) {
        // Clear any existing diagnostics
        view.dispatch(setDiagnostics(view.state, []));
        return;
      }

      // Create diagnostics for current file
      const diagnostics = createStaticDiagnostics(errors, view.state.doc, doc.filePath);

      // Update the view with new diagnostics
      view.dispatch(setDiagnostics(view.state, diagnostics));

      // Update error highlighting (line backgrounds, gutter icons)
      updateErrors(view, errors, doc.filePath);
    }, [errors, doc?.filePath, effectiveConfig.showDiagnostics]);

    // Update sticky scroll when preference changes
    useEffect(() => {
      const view = viewRef.current;

      if (!view) {
        return;
      }

      toggleStickyScroll(view, preferences.editor.stickyScroll);
    }, [preferences.editor.stickyScroll]);

    // Update word wrap when preference changes
    useEffect(() => {
      const view = viewRef.current;

      if (!view) {
        return;
      }

      view.dispatch({
        effects: wordWrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
      });
    }, [wordWrap, wordWrapCompartment]);

    // Update rainbow brackets when preference changes
    useEffect(() => {
      const view = viewRef.current;

      if (!view) {
        return;
      }

      view.dispatch({
        effects: rainbowBracketsCompartment.reconfigure(bracketColorization ? rainbowBrackets() : []),
      });
    }, [bracketColorization, rainbowBracketsCompartment]);

    // Update indent guides when preference changes
    useEffect(() => {
      const view = viewRef.current;

      if (!view) {
        return;
      }

      view.dispatch({
        effects: indentGuidesCompartment.reconfigure(indentGuidesEnabled ? indentGuides() : []),
      });
    }, [indentGuidesEnabled, indentGuidesCompartment]);

    // Update clean mode when config changes
    useEffect(() => {
      const view = viewRef.current;

      if (!view) {
        return;
      }

      view.dispatch({
        effects: [reconfigureCleanMode(effectiveConfig.cleanMode)],
      });

      // Add/remove clean-mode class for CSS targeting
      if (effectiveConfig.cleanMode) {
        view.dom.classList.add('clean-mode');
      } else {
        view.dom.classList.remove('clean-mode');
      }
    }, [effectiveConfig.cleanMode]);

    // Handle selected error from Problems panel - scroll to error line
    const selectedError = useStore(selectedErrorAtom);

    useEffect(() => {
      const view = viewRef.current;

      if (!view || !doc?.filePath || !selectedError) {
        return;
      }

      // Normalize paths for comparison
      const normalizedFilePath = doc.filePath.replace(/^\/workspace/, '').replace(/^\//, '');
      const errorFilePath = selectedError.filePath?.replace(/^\/workspace/, '').replace(/^\//, '');

      // Only scroll if this is the file with the error
      if (!errorFilePath || errorFilePath !== normalizedFilePath) {
        return;
      }

      if (!selectedError.line) {
        return;
      }

      // Wait a frame for stability
      requestAnimationFrame(() => {
        try {
          const targetLine = Math.min(Math.max(1, selectedError.line!), view.state.doc.lines);
          const lineInfo = view.state.doc.line(targetLine);
          const pos = lineInfo.from + (selectedError.column ? selectedError.column - 1 : 0);

          // Set cursor and scroll to the error line
          view.dispatch({
            selection: { anchor: pos },
            scrollIntoView: true,
          });

          view.focus();
        } catch (err) {
          logger.warn('Failed to navigate to error line:', err);
        }
      });
    }, [selectedError, doc?.filePath]);

    // Handle pending navigation (go-to-definition) - scroll to line after file loads
    const pendingNavigation = useStore(workbenchStore.pendingNavigation);

    useEffect(() => {
      const view = viewRef.current;

      if (!view || !doc?.filePath || !pendingNavigation) {
        return;
      }

      // Only process if this is the file we're navigating to
      if (doc.filePath !== pendingNavigation.filePath) {
        return;
      }

      // Consume the navigation request
      workbenchStore.consumePendingNavigation();

      // Wait a frame for the document to be fully rendered
      requestAnimationFrame(() => {
        try {
          const { line, character } = pendingNavigation;

          // Convert 1-based line to position
          const targetLine = Math.min(Math.max(1, line), view.state.doc.lines);
          const lineInfo = view.state.doc.line(targetLine);
          const pos = lineInfo.from + (character || 0);

          // Set cursor position and scroll to it
          view.dispatch({
            selection: { anchor: pos },
            scrollIntoView: true,
          });

          // Focus the editor
          view.focus();

          logger.debug(`Navigated to line ${line}, character ${character || 0}`);
        } catch (err) {
          logger.warn('Failed to navigate to line:', err);
        }
      });
    }, [doc?.filePath, pendingNavigation]);

    return (
      <div className={classNames('relative h-full flex', className)}>
        <div className="flex-1 h-full overflow-hidden relative">
          {doc?.isBinary && <BinaryContent />}
          <div className="h-full overflow-auto" ref={containerRef} />
        </div>
        {showMinimap && viewReady && !doc?.isBinary && (
          <div className="h-full border-l border-recoder-elements-borderColor flex-shrink-0">
            <Minimap
              view={viewRef.current}
              theme={theme}
            />
          </div>
        )}
      </div>
    );
  },
);

export default CodeMirrorEditor;

CodeMirrorEditor.displayName = 'CodeMirrorEditor';

interface EditorStateOptions {
  content: string;
  theme: Theme;
  settings: EditorSettings | undefined;
  editorConfig?: EditorConfig;
  onScrollRef: MutableRefObject<OnScrollCallback | undefined>;
  debounceScroll: number;
  onFileSaveRef: MutableRefObject<OnSaveCallback | undefined>;
  extensions: Extension[];
  filePath?: string;
  projectId?: string;
  enableLSP?: boolean;
  enableCodeFolding?: boolean;
  enableStickyScroll?: boolean;
}

function newEditorState(options: EditorStateOptions) {
  const {
    content,
    theme,
    settings,
    editorConfig,
    onScrollRef,
    debounceScroll,
    onFileSaveRef,
    extensions,
    filePath = '',
    projectId,
    enableLSP = true,
    enableCodeFolding = true,
    enableStickyScroll = true,
  } = options;

  // Get effective config (applies cleanMode overrides)
  const effectiveConfig = editorConfig ? getEffectiveConfig(editorConfig) : undefined;

  // Build completion sources based on file type and LSP availability
  const completionSources = filePath
    ? getCompletionSources(filePath, {
        enableSnippets: true,
        enableImportCompletions: true,
        enableLSP: enableLSP && !!projectId,
        projectId,
      })
    : [];

  return EditorState.create({
    doc: content,
    extensions: [
      EditorView.domEventHandlers({
        scroll: debounce((event, view) => {
          if (event.target !== view.scrollDOM) {
            return;
          }

          onScrollRef.current?.({ left: view.scrollDOM.scrollLeft, top: view.scrollDOM.scrollTop });
        }, debounceScroll),
        keydown: (event, view) => {
          if (view.state.readOnly) {
            view.dispatch({
              effects: [readOnlyTooltipStateEffect.of(event.key !== 'Escape')],
            });

            return true;
          }

          return false;
        },
      }),
      getTheme(theme, settings, effectiveConfig),
      history(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...lintKeymap,
        ...closeBracketsKeymap,
        ...(enableCodeFolding ? foldKeymap : []),
        ...completionKeymap,
        { key: 'Tab', run: acceptCompletion },
        {
          key: 'Mod-s',
          preventDefault: true,
          run: () => {
            onFileSaveRef.current?.();
            return true;
          },
        },
        indentKeyBinding,
        // Custom fold/unfold keyboard shortcuts
        ...(enableCodeFolding ? [
          { key: 'Mod-Shift-[', run: foldCode, preventDefault: true },
          { key: 'Mod-Shift-]', run: unfoldCode, preventDefault: true },
          { key: 'Mod-k Mod-0', run: foldAll, preventDefault: true },
          { key: 'Mod-k Mod-j', run: unfoldAll, preventDefault: true },
        ] : []),
      ]),
      search(),
      highlightSelectionMatches(),
      rectangularSelection(),
      crosshairCursor(),
      placeholder('Start typing...'),
      lintGutter(),
      indentUnit.of('\t'),
      autocompletion({
        closeOnBlur: false,
        override: completionSources.length > 0 ? completionSources : undefined,
        maxRenderedOptions: 50,
        icons: true,
      }),
      tooltips({
        position: 'absolute',
        parent: document.body,
        tooltipSpace: (view) => {
          const rect = view.dom.getBoundingClientRect();

          return {
            top: rect.top - 50,
            left: rect.left,
            bottom: rect.bottom,
            right: rect.right + 10,
          };
        },
      }),
      closeBrackets(),
      lineNumbers(),
      highlightSpecialChars(),
      scrollPastEnd(),
      dropCursor(),
      drawSelection(),
      bracketMatching(),
      ...(enableCodeFolding ? [codeFolding()] : []),
      EditorState.tabSize.of(settings?.tabSize ?? 2),
      indentOnInput(),
      EditorState.allowMultipleSelections.of(true),
      editableTooltipField,
      editableStateField,
      EditorState.readOnly.from(editableStateField, (editable) => !editable),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      ...(enableCodeFolding ? [foldGutter({
        markerDOM: (open) => {
          const icon = document.createElement('div');

          icon.className = `fold-icon ${open ? 'i-ph-caret-down-bold' : 'i-ph-caret-right-bold'}`;

          return icon;
        },
      })] : []),
      inlineCopilot(async (prefix, suffix) => {
        try {
          const res = await fetch('/api/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix, suffix }),
          });
          if (!res.ok) return '';
          const data = await res.json() as { completion?: string };
          return data.completion || '';
        } catch {
          return '';
        }
      }, 800),
      // Cmd+K inline editing - select code, press Cmd+K, type instruction
      inlineEditExtension(),
      // Sticky scroll - shows current scope context at top of editor
      ...(enableStickyScroll ? [stickyScroll({ includeBlocks: false })] : []),
      // Error highlighting - line backgrounds, gutter icons, hover tooltips
      errorHighlighting({
        onErrorClick: (error) => {
          // Select the error when gutter icon is clicked
          selectError(error);
        },
      }),
      ...extensions,
    ],
  });
}

function setNoDocument(view: EditorView) {
  view.dispatch({
    selection: { anchor: 0 },
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: '',
    },
  });

  view.scrollDOM.scrollTo(0, 0);
}

function setEditorDocument(
  view: EditorView,
  theme: Theme,
  editable: boolean,
  languageCompartment: Compartment,
  autoFocus: boolean,
  doc: TextEditorDocument,
) {
  if (doc.value !== view.state.doc.toString()) {
    view.dispatch({
      selection: { anchor: 0 },
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: doc.value,
      },
    });
  }

  view.dispatch({
    effects: [editableStateEffect.of(editable && !doc.isBinary)],
  });

  getLanguage(doc.filePath).then((languageSupport) => {
    if (!languageSupport) {
      return;
    }

    view.dispatch({
      effects: [languageCompartment.reconfigure([languageSupport]), reconfigureTheme(theme)],
    });

    requestAnimationFrame(() => {
      const currentLeft = view.scrollDOM.scrollLeft;
      const currentTop = view.scrollDOM.scrollTop;
      const newLeft = doc.scroll?.left ?? 0;
      const newTop = doc.scroll?.top ?? 0;

      const needsScrolling = currentLeft !== newLeft || currentTop !== newTop;

      if (autoFocus && editable) {
        if (needsScrolling) {
          // we have to wait until the scroll position was changed before we can set the focus
          view.scrollDOM.addEventListener(
            'scroll',
            () => {
              view.focus();
            },
            { once: true },
          );
        } else {
          // if the scroll position is still the same we can focus immediately
          view.focus();
        }
      }

      view.scrollDOM.scrollTo(newLeft, newTop);
    });
  });
}

function getReadOnlyTooltip(state: EditorState) {
  if (!state.readOnly) {
    return [];
  }

  return state.selection.ranges
    .filter((range) => {
      return range.empty;
    })
    .map((range) => {
      return {
        pos: range.head,
        above: true,
        strictSide: true,
        arrow: true,
        create: () => {
          const divElement = document.createElement('div');
          divElement.className = 'cm-readonly-tooltip';
          divElement.textContent = 'Cannot edit file while AI response is being generated';

          return { dom: divElement };
        },
      };
    });
}
