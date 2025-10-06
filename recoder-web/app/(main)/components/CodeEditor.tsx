'use client';

/**
 * 🎨 Code Editor Component
 * CodeMirror-based editor for the Workbench
 */

import { useEffect, useRef } from 'react';

interface CodeEditorProps {
  value: string;
  language?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}

export default function CodeEditor({ value, language = 'javascript', onChange, readOnly = false }: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<any>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    // Dynamically import CodeMirror
    import('@codemirror/state').then(({ EditorState }) => {
      import('@codemirror/view').then(({ EditorView, keymap }) => {
        import('@codemirror/lang-javascript').then(({ javascript }) => {
          import('@codemirror/commands').then(({ defaultKeymap }) => {
            import('@codemirror/theme-one-dark').then(({ oneDark }) => {
              const startState = EditorState.create({
                doc: value,
                extensions: [
                  javascript({ typescript: language === 'typescript' }),
                  oneDark,
                  keymap.of(defaultKeymap),
                  EditorView.updateListener.of((update) => {
                    if (update.docChanged && onChange && !readOnly) {
                      onChange(update.state.doc.toString());
                    }
                  }),
                  EditorState.readOnly.of(readOnly),
                  EditorView.theme({
                    '&': {
                      height: '100%',
                      fontSize: '14px',
                    },
                    '.cm-scroller': {
                      overflow: 'auto',
                    },
                  }),
                ],
              });

              const view = new EditorView({
                state: startState,
                parent: editorRef.current!,
              });

              editorViewRef.current = view;

              return () => {
                view.destroy();
              };
            });
          });
        });
      });
    });
  }, []);

  // Update editor content when value changes externally
  useEffect(() => {
    if (editorViewRef.current && editorViewRef.current.state.doc.toString() !== value) {
      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: editorViewRef.current.state.doc.length,
          insert: value,
        },
      });
    }
  }, [value]);

  if (readOnly && !value) {
    return (
      <div className="h-full flex items-center justify-center bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary">
        Select a file to view
      </div>
    );
  }

  return <div ref={editorRef} className="h-full w-full" />;
}
