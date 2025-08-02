"use client";

import { Editor } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useState, useRef, useEffect } from "react";
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
  Palette
} from "lucide-react";

interface MonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  fileName?: string;
  readOnly?: boolean;
  minimap?: boolean;
  wordWrap?: "on" | "off" | "wordWrapColumn" | "bounded";
  fontSize?: number;
  theme?: "vs-dark" | "light" | "vs";
  height?: string;
  showToolbar?: boolean;
  onSave?: () => void;
  onRun?: () => void;
}

export default function MonacoEditor({
  value,
  onChange,
  language = "typescript",
  fileName = "untitled.ts",
  readOnly = false,
  minimap = true,
  wordWrap = "on",
  fontSize = 14,
  theme,
  height = "400px",
  showToolbar = true,
  onSave,
  onRun,
}: MonacoEditorProps) {
  const { theme: systemTheme } = useTheme();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editorSettings, setEditorSettings] = useState({
    minimap,
    wordWrap,
    fontSize,
    lineNumbers: "on" as const,
    formatOnPaste: true,
    formatOnType: true,
  });
  const [showSettings, setShowSettings] = useState(false);
  const editorRef = useRef<any>(null);

  const editorTheme = theme || (systemTheme === "dark" ? "vs-dark" : "light");

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;

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
      typeRoots: ["node_modules/@types"],
    });

    // Add React type definitions
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
      }
    `;

    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      reactTypes,
      "file:///node_modules/@types/react/index.d.ts"
    );

    // Set up keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (onSave) onSave();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (onRun) onRun();
    });

    // Auto-format on save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      editor.getAction("editor.action.formatDocument").run();
      if (onSave) onSave();
    });
  };

  const formatCode = () => {
    if (editorRef.current) {
      editorRef.current.getAction("editor.action.formatDocument").run();
    }
  };

  const copyCode = async () => {
    if (navigator.clipboard && value) {
      await navigator.clipboard.writeText(value);
    }
  };

  const downloadCode = () => {
    const blob = new Blob([value], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
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
      case "typescript":
      case "javascript":
        return <Code className="w-4 h-4 text-blue-500" />;
      case "html":
        return <FileText className="w-4 h-4 text-orange-500" />;
      case "css":
        return <Palette className="w-4 h-4 text-purple-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className={`relative border border-gray-200 rounded-lg overflow-hidden ${
      isFullscreen ? "fixed inset-0 z-50 bg-white" : ""
    }`}>
      {showToolbar && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {getLanguageIcon(language)}
            <span className="text-sm font-medium text-gray-700">{fileName}</span>
            <span className="text-xs text-gray-500 px-2 py-1 bg-gray-200 rounded">
              {language}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
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
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
              title="Format Code"
            >
              <Code className="w-4 h-4" />
            </button>
            
            <button
              onClick={copyCode}
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
              title="Copy Code"
            >
              <Copy className="w-4 h-4" />
            </button>
            
            <button
              onClick={downloadCode}
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
              title="Download File"
            >
              <Download className="w-4 h-4" />
            </button>
            
            {onSave && (
              <button
                onClick={onSave}
                className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
                title="Save (Ctrl+S)"
              >
                <Save className="w-4 h-4" />
              </button>
            )}
            
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
              title="Editor Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            
            <button
              onClick={toggleFullscreen}
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="absolute top-12 right-4 z-10 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-4">
          <h3 className="font-medium text-gray-900 mb-3">Editor Settings</h3>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Font Size</label>
              <input
                type="range"
                min="10"
                max="24"
                value={editorSettings.fontSize}
                onChange={(e) => setEditorSettings(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
                className="w-full"
              />
              <span className="text-xs text-gray-500">{editorSettings.fontSize}px</span>
            </div>
            
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-700">Minimap</label>
              <button
                onClick={() => setEditorSettings(prev => ({ ...prev, minimap: !prev.minimap }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  editorSettings.minimap ? "bg-blue-600" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    editorSettings.minimap ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            
            <div>
              <label className="block text-sm text-gray-700 mb-1">Word Wrap</label>
              <select
                value={editorSettings.wordWrap}
                onChange={(e) => setEditorSettings(prev => ({ ...prev, wordWrap: e.target.value as any }))}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="on">On</option>
                <option value="off">Off</option>
                <option value="wordWrapColumn">Column</option>
                <option value="bounded">Bounded</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <Editor
        height={isFullscreen ? "calc(100vh - 48px)" : height}
        defaultLanguage={language}
        language={language}
        value={value}
        onChange={(val) => onChange(val || "")}
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
            showKeywords: true,
            showSnippets: true,
            showClasses: true,
            showFunctions: true,
            showVariables: true,
          },
          quickSuggestions: {
            other: true,
            comments: true,
            strings: true,
          },
          parameterHints: {
            enabled: true,
          },
          hover: {
            enabled: true,
          },
          contextmenu: true,
          mouseWheelZoom: true,
          cursorBlinking: "blink",
          cursorSmoothCaretAnimation: "on",
          smoothScrolling: true,
        }}
      />
    </div>
  );
}