'use client';

import React, { forwardRef, useEffect, useRef, useImperativeHandle } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// Dynamically import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then(mod => ({ default: mod.Editor })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center bg-[#1e1e1e]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading editor...</span>
        </div>
      </div>
    )
  }
);

interface CodeEditorProps {
  language: string;
  value: string;
  onChange: (value: string) => void;
  theme?: string;
  options?: any;
  className?: string;
}

interface CodeEditorRef {
  getEditor: () => any;
  focus: () => void;
  insertText: (text: string) => void;
  getSelection: () => string;
}

// Language mapping for Monaco Editor
const MONACO_LANGUAGE_MAP: Record<string, string> = {
  'javascript': 'javascript',
  'typescript': 'typescript',
  'python': 'python',
  'java': 'java',
  'cpp': 'cpp',
  'c': 'c',
  'rust': 'rust',
  'go': 'go',
  'php': 'php',
  'ruby': 'ruby',
  'swift': 'swift',
  'kotlin': 'kotlin',
  'scala': 'scala',
  'csharp': 'csharp',
  'html': 'html',
  'css': 'css',
  'sql': 'sql',
  'shell': 'shell',
  'bash': 'shell',
  'powershell': 'powershell'
};

export const CodeEditor = forwardRef<CodeEditorRef, CodeEditorProps>(({
  language,
  value,
  onChange,
  theme = 'vs-dark',
  options = {},
  className = ''
}, ref) => {
  const editorRef = useRef<any>(null);
  const monacoLanguage = MONACO_LANGUAGE_MAP[language] || 'plaintext';

  useImperativeHandle(ref, () => ({
    getEditor: () => editorRef.current,
    focus: () => {
      if (editorRef.current) {
        editorRef.current.focus();
      }
    },
    insertText: (text: string) => {
      if (editorRef.current) {
        const editor = editorRef.current;
        const selection = editor.getSelection();
        editor.executeEdits('insert-text', [
          {
            range: selection,
            text: text,
            forceMoveMarkers: true
          }
        ]);
      }
    },
    getSelection: () => {
      if (editorRef.current) {
        const editor = editorRef.current;
        const selection = editor.getSelection();
        return editor.getModel()?.getValueInRange(selection) || '';
      }
      return '';
    }
  }));

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;

    // Configure Monaco themes
    monaco.editor.defineTheme('recoder-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955' },
        { token: 'keyword', foreground: '569CD6' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'type', foreground: '4EC9B0' },
        { token: 'function', foreground: 'DCDCAA' },
      ],
      colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#c9d1d9',
        'editorCursor.foreground': '#58a6ff',
        'editor.lineHighlightBackground': '#161b22',
        'editorLineNumber.foreground': '#484f58',
        'editor.selectionBackground': '#264f78',
        'editor.inactiveSelectionBackground': '#3a3d41'
      }
    });

    // Set up auto-completion and intellisense
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      reactNamespace: 'React',
      allowJs: true,
      typeRoots: ['node_modules/@types']
    });

    // Enable bracket matching and folding
    editor.onDidChangeCursorPosition(() => {
      // Custom cursor change handling if needed
    });

    // Custom keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      // Trigger code execution - this will be handled by parent component
      const event = new CustomEvent('execute-code');
      window.dispatchEvent(event);
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_SLASH, () => {
      editor.getAction('editor.action.commentLine').run();
    });

    // Focus the editor
    editor.focus();
  };

  const defaultOptions = {
    fontSize: 14,
    fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
    lineHeight: 1.6,
    minimap: { enabled: true },
    wordWrap: 'on' as const,
    lineNumbers: 'on' as const,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    insertSpaces: true,
    detectIndentation: false,
    roundedSelection: false,
    scrollbar: {
      vertical: 'visible' as const,
      horizontal: 'visible' as const,
      verticalScrollbarSize: 12,
      horizontalScrollbarSize: 12
    },
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: 'on' as const,
    acceptSuggestionOnCommitCharacter: true,
    quickSuggestions: true,
    parameterHints: { enabled: true },
    formatOnPaste: true,
    formatOnType: true,
    folding: true,
    foldingStrategy: 'indentation' as const,
    showFoldingControls: 'always' as const,
    bracketPairColorization: { enabled: true },
    guides: {
      bracketPairs: true,
      indentation: true
    },
    ...options
  };

  return (
    <div className={`w-full h-full ${className}`}>
      <MonacoEditor
        language={monacoLanguage}
        theme={theme === 'vs-dark' ? 'recoder-dark' : theme}
        value={value}
        onChange={(newValue) => onChange(newValue || '')}
        onMount={handleEditorDidMount}
        options={defaultOptions}
        loading={
          <div className="h-full flex items-center justify-center bg-[#1e1e1e]">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Initializing editor...</span>
            </div>
          </div>
        }
      />
    </div>
  );
});

CodeEditor.displayName = 'CodeEditor';
