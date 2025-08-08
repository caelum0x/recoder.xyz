'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Editor } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { 
  Play, 
  Save, 
  Download, 
  Copy, 
  Settings, 
  Maximize2, 
  Minimize2,
  FileText,
  Code,
  Palette,
  Wand2,
  Lightbulb,
  BarChart3,
  Brain,
  Zap,
  Shield
} from 'lucide-react';

import IntelligentCodeCompletion from './intelligent-code-completion';
import IntelligentRefactoringPanel from './intelligent-refactoring-panel';
import RealTimeCodeAnalysis from './real-time-code-analysis';

interface EnhancedMonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  fileName?: string;
  readOnly?: boolean;
  minimap?: boolean;
  wordWrap?: 'on' | 'off' | 'wordWrapColumn' | 'bounded';
  fontSize?: number;
  theme?: 'vs-dark' | 'light' | 'vs';
  height?: string;
  showToolbar?: boolean;
  enableAI?: boolean;
  onSave?: () => void;
  onRun?: () => void;
  className?: string;
}

interface CursorPosition {
  line: number;
  column: number;
}

interface Selection {
  start: number;
  end: number;
}

export function EnhancedMonacoEditor({
  value,
  onChange,
  language = 'typescript',
  fileName = 'untitled.ts',
  readOnly = false,
  minimap = true,
  wordWrap = 'on',
  fontSize = 14,
  theme,
  height = '400px',
  showToolbar = true,
  enableAI = true,
  onSave,
  onRun,
  className = ''
}: EnhancedMonacoEditorProps) {
  const { theme: systemTheme } = useTheme();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({ line: 1, column: 1 });
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [showRefactoring, setShowRefactoring] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [editorSettings, setEditorSettings] = useState({
    minimap,
    wordWrap,
    fontSize,
    lineNumbers: 'on' as const,
    formatOnPaste: true,
    formatOnType: true,
    enableIntelliSense: true,
    enableCodeLens: true,
    enableLiveErrorSquiggles: true
  });
  const [showSettings, setShowSettings] = useState(false);
  const [aiFeatures, setAiFeatures] = useState({
    codeCompletion: enableAI,
    refactoring: enableAI,
    analysis: enableAI,
    suggestions: enableAI
  });

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const editorTheme = theme || (systemTheme === 'dark' ? 'vs-dark' : 'light');

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Configure TypeScript compiler options
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.Latest,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      allowJs: true,
      typeRoots: ['node_modules/@types'],
      strict: true,
      strictNullChecks: true,
    });

    // Add React and Next.js type definitions
    const reactTypes = `
      declare module 'react' {
        export interface FC<P = {}> {
          (props: P): ReactElement | null;
        }
        export interface ReactElement<P = any> {
          type: any;
          props: P;
          key: string | number | null;
        }
        export function useState<T>(initialState: T): [T, (value: T) => void];
        export function useEffect(effect: () => void, deps?: any[]): void;
        export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T;
        export function useMemo<T>(factory: () => T, deps: any[]): T;
        export function useRef<T>(initialValue: T): { current: T };
      }
      
      declare module 'next/router' {
        export function useRouter(): any;
      }
      
      declare module 'next/link' {
        export default function Link(props: any): any;
      }
    `;

    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      reactTypes,
      'file:///node_modules/@types/react/index.d.ts'
    );

    // Enhanced keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (onSave) onSave();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (onRun) onRun();
    });

    // AI-powered shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyR, () => {
      if (aiFeatures.refactoring) {
        handleRefactoring();
      }
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyA, () => {
      if (aiFeatures.analysis) {
        setShowAnalysis(!showAnalysis);
      }
    });

    // Auto-format and save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      editor.getAction('editor.action.formatDocument').run();
      if (onSave) onSave();
    });

    // Track cursor position and selection
    editor.onDidChangeCursorPosition((e: any) => {
      setCursorPosition({
        line: e.position.lineNumber,
        column: e.position.column
      });
    });

    editor.onDidChangeCursorSelection((e: any) => {
      const model = editor.getModel();
      if (model) {
        const startOffset = model.getOffsetAt(e.selection.getStartPosition());
        const endOffset = model.getOffsetAt(e.selection.getEndPosition());
        setSelection({ start: startOffset, end: endOffset });
        
        // Show refactoring panel if text is selected
        if (startOffset !== endOffset && aiFeatures.refactoring) {
          setShowRefactoring(true);
        } else {
          setShowRefactoring(false);
        }
      }
    });

    // Enable code completion on typing
    if (aiFeatures.codeCompletion) {
      editor.onDidChangeModelContent(() => {
        // Trigger intelligent completion
        setShowCompletion(true);
      });
    }

    // Configure IntelliSense
    monaco.languages.registerCompletionItemProvider(language, {
      provideCompletionItems: (model: any, position: any) => {
        if (!aiFeatures.codeCompletion) return { suggestions: [] };
        
        // This will be enhanced by our AI completion system
        return { suggestions: [] };
      }
    });

    // Configure code actions (refactoring)
    monaco.languages.registerCodeActionProvider(language, {
      provideCodeActions: (model: any, range: any, context: any) => {
        if (!aiFeatures.refactoring) return { actions: [] };
        
        const actions = [
          {
            title: 'AI Refactor: Extract Function',
            id: 'ai.refactor.extractFunction',
            kind: 'refactor.extract'
          },
          {
            title: 'AI Refactor: Optimize Performance',
            id: 'ai.refactor.optimize',
            kind: 'refactor.improve'
          },
          {
            title: 'AI Refactor: Modernize Syntax',
            id: 'ai.refactor.modernize',
            kind: 'refactor.improve'
          }
        ];
        
        return { actions };
      }
    });
  };

  const handleRefactoring = useCallback(() => {
    if (selection.start !== selection.end) {
      setShowRefactoring(true);
    }
  }, [selection]);

  const handleCompletionSelect = useCallback((completion: string) => {
    if (editorRef.current) {
      const position = editorRef.current.getPosition();
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      };
      
      editorRef.current.executeEdits('ai-completion', [
        { range, text: completion }
      ]);
    }
    setShowCompletion(false);
  }, []);

  const handleRefactoringApply = useCallback((newCode: string) => {
    onChange(newCode);
    setShowRefactoring(false);
  }, [onChange]);

  const formatCode = () => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument').run();
    }
  };

  const copyCode = async () => {
    if (navigator.clipboard && value) {
      await navigator.clipboard.writeText(value);
    }
  };

  const downloadCode = () => {
    const blob = new Blob([value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const getLanguageIcon = (lang: string) => {
    switch (lang) {
      case 'typescript':
      case 'javascript':
        return <Code className="w-4 h-4 text-blue-500" />;
      case 'html':
        return <FileText className="w-4 h-4 text-orange-500" />;
      case 'css':
        return <Palette className="w-4 h-4 text-purple-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className={`relative border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${
      isFullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900' : ''
    } ${className}`}>
      {showToolbar && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            {getLanguageIcon(language)}
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{fileName}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">
              {language}
            </span>
            {enableAI && (
              <div className="flex items-center gap-1">
                <Brain className="w-3 h-3 text-purple-500" />
                <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">AI Enhanced</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* AI Feature Toggles */}
            {enableAI && (
              <>
                <button
                  onClick={() => setShowAnalysis(!showAnalysis)}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                    showAnalysis 
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  title="Toggle Code Analysis (Ctrl+Shift+A)"
                >
                  <BarChart3 className="w-3 h-3" />
                  Analysis
                </button>
                
                <button
                  onClick={() => setAiFeatures(prev => ({ ...prev, codeCompletion: !prev.codeCompletion }))}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                    aiFeatures.codeCompletion 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  title="Toggle AI Code Completion"
                >
                  <Lightbulb className="w-3 h-3" />
                  Complete
                </button>
                
                <button
                  onClick={() => setAiFeatures(prev => ({ ...prev, refactoring: !prev.refactoring }))}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                    aiFeatures.refactoring 
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  title="Toggle AI Refactoring (Ctrl+Shift+R)"
                >
                  <Wand2 className="w-3 h-3" />
                  Refactor
                </button>
              </>
            )}

            {onRun && (
              <button
                onClick={onRun}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                title="Run (Ctrl+Enter)"
              >
                <Play className="w-3 h-3" />
                Run
              </button>
            )}
            
            <button
              onClick={formatCode}
              className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              title="Format Code"
            >
              <Code className="w-4 h-4" />
            </button>
            
            <button
              onClick={copyCode}
              className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              title="Copy Code"
            >
              <Copy className="w-4 h-4" />
            </button>
            
            <button
              onClick={downloadCode}
              className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              title="Download File"
            >
              <Download className="w-4 h-4" />
            </button>
            
            {onSave && (
              <button
                onClick={onSave}
                className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                title="Save (Ctrl+S)"
              >
                <Save className="w-4 h-4" />
              </button>
            )}
            
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              title="Editor Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            
            <button
              onClick={toggleFullscreen}
              className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Editor Settings Panel */}
      {showSettings && (
        <div className="absolute top-12 right-4 z-10 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Editor Settings</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Font Size</label>
              <input
                type="range"
                min="10"
                max="24"
                value={editorSettings.fontSize}
                onChange={(e) => setEditorSettings(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
                className="w-full"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">{editorSettings.fontSize}px</span>
            </div>
            
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-700 dark:text-gray-300">Minimap</label>
              <button
                onClick={() => setEditorSettings(prev => ({ ...prev, minimap: !prev.minimap }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  editorSettings.minimap ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    editorSettings.minimap ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-700 dark:text-gray-300">IntelliSense</label>
              <button
                onClick={() => setEditorSettings(prev => ({ ...prev, enableIntelliSense: !prev.enableIntelliSense }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  editorSettings.enableIntelliSense ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    editorSettings.enableIntelliSense ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Word Wrap</label>
              <select
                value={editorSettings.wordWrap}
                onChange={(e) => setEditorSettings(prev => ({ ...prev, wordWrap: e.target.value as any }))}
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="on">On</option>
                <option value="off">Off</option>
                <option value="wordWrapColumn">Column</option>
                <option value="bounded">Bounded</option>
              </select>
            </div>

            {enableAI && (
              <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">AI Features</h4>
                
                {Object.entries(aiFeatures).map(([feature, enabled]) => (
                  <div key={feature} className="flex items-center justify-between mb-2">
                    <label className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                      {feature.replace(/([A-Z])/g, ' $1').trim()}
                    </label>
                    <button
                      onClick={() => setAiFeatures(prev => ({ ...prev, [feature]: !enabled }))}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        enabled ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                          enabled ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-1 bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600">
        <div className="flex items-center space-x-4">
          <span>Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
          {selection.start !== selection.end && (
            <span>({selection.end - selection.start} chars selected)</span>
          )}
          <span>{value.length} chars</span>
          <span>{value.split('\n').length} lines</span>
        </div>
        <div className="flex items-center space-x-2">
          <span>{language.toUpperCase()}</span>
          {enableAI && (
            <div className="flex items-center space-x-1">
              <Brain className="w-3 h-3 text-purple-500" />
              <span className="text-purple-600 dark:text-purple-400">AI</span>
            </div>
          )}
        </div>
      </div>

      {/* Monaco Editor */}
      <Editor
        height={isFullscreen ? 'calc(100vh - 96px)' : `calc(${height} - 24px)`}
        defaultLanguage={language}
        language={language}
        value={value}
        onChange={(val) => onChange(val || '')}
        onMount={handleEditorDidMount}
        theme={editorTheme}
        options={{
          readOnly,
          minimap: { enabled: editorSettings.minimap },
          wordWrap: editorSettings.wordWrap,
          fontSize: editorSettings.fontSize,
          lineNumbers: editorSettings.lineNumbers,
          formatOnPaste: editorSettings.formatOnPaste,
          formatOnType: editorSettings.formatOnType,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          fixedOverflowWidgets: true,
          suggest: {
            showKeywords: editorSettings.enableIntelliSense,
            showSnippets: editorSettings.enableIntelliSense,
            showClasses: editorSettings.enableIntelliSense,
            showFunctions: editorSettings.enableIntelliSense,
            showVariables: editorSettings.enableIntelliSense,
          },
          quickSuggestions: editorSettings.enableIntelliSense ? {
            other: true,
            comments: true,
            strings: true,
          } : false,
          parameterHints: {
            enabled: editorSettings.enableIntelliSense,
          },
          hover: {
            enabled: true,
          },
          contextmenu: true,
          mouseWheelZoom: true,
          cursorBlinking: 'blink',
          cursorSmoothCaretAnimation: 'on',
          smoothScrolling: true,
          codeLens: editorSettings.enableCodeLens
        }}
      />

      {/* AI Assistant Components */}
      {enableAI && aiFeatures.codeCompletion && showCompletion && (
        <IntelligentCodeCompletion
          code={value}
          language={language}
          position={cursorPosition}
          fileName={fileName}
          framework="react"
          onCompletionSelect={handleCompletionSelect}
          onRefactoringSuggestion={() => setShowRefactoring(true)}
          className="absolute top-16 left-4 z-20"
        />
      )}

      {enableAI && aiFeatures.refactoring && showRefactoring && selection.start !== selection.end && (
        <IntelligentRefactoringPanel
          code={value}
          language={language}
          selection={selection}
          onRefactoringApply={handleRefactoringApply}
          onClose={() => setShowRefactoring(false)}
          className="absolute top-16 right-4 z-20 w-96"
        />
      )}

      {enableAI && aiFeatures.analysis && (
        <RealTimeCodeAnalysis
          code={value}
          language={language}
          fileName={fileName}
          isVisible={showAnalysis}
          onToggleVisibility={() => setShowAnalysis(!showAnalysis)}
          className={showAnalysis ? 'absolute top-16 right-4 z-20 w-96' : ''}
        />
      )}
    </div>
  );
}

export default EnhancedMonacoEditor;