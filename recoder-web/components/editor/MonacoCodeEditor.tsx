'use client';

import React, { useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useAIInlineSuggestions } from './AIInlineSuggestions';
import { useCollaborativeEditor } from './CollaborativeEditor';

interface MonacoCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  theme?: 'vs-dark' | 'light' | 'vs';
  readOnly?: boolean;
  className?: string;
  enableAISuggestions?: boolean;
  enableCollaboration?: boolean;
  projectId?: string;
  user?: { id: string; name: string };
}

export default function MonacoCodeEditor({
  value,
  onChange,
  language = 'typescript',
  theme = 'vs-dark',
  readOnly = false,
  className = '',
  enableAISuggestions = true,
  enableCollaboration = false,
  projectId,
  user
}: MonacoCodeEditorProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  
  // AI inline suggestions
  const { acceptedCount, rejectedCount, aiSuggestionsComponent } = useAIInlineSuggestions(
    editorRef.current,
    enableAISuggestions && !readOnly
  );

  // Collaborative editing
  const { collaborators, isConnected, collaborativeEditorComponent } = useCollaborativeEditor(
    editorRef.current,
    projectId || '',
    user || { id: 'anonymous', name: 'Anonymous' }
  );

  const handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    
    // Configure editor options for professional development experience
    editor.updateOptions({
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Consolas, Monaco, monospace',
      lineHeight: 21,
      letterSpacing: 0.5,
      minimap: { enabled: true },
      wordWrap: 'on',
      automaticLayout: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'blink',
      cursorSmoothCaretAnimation: 'on',
      renderWhitespace: 'selection',
      renderLineHighlight: 'all',
      formatOnPaste: true,
      formatOnType: true,
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      quickSuggestions: {
        other: true,
        comments: true,
        strings: true
      },
      parameterHints: { enabled: true },
      folding: true,
      foldingStrategy: 'indentation',
      showFoldingControls: 'always',
      bracketPairColorization: { enabled: true },
      guides: {
        bracketPairs: true,
        bracketPairsHorizontal: true,
        highlightActiveBracketPair: true,
        indentation: true
      }
    });

    // Add keyboard shortcuts for competitive parity with Cursor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash, () => {
      editor.trigger('keyboard', 'editor.action.commentLine', {});
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, () => {
      editor.trigger('keyboard', 'editor.action.addSelectionToNextFindMatch', {});
    });

    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.UpArrow, () => {
      editor.trigger('keyboard', 'editor.action.moveLinesUpAction', {});
    });

    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.DownArrow, () => {
      editor.trigger('keyboard', 'editor.action.moveLinesDownAction', {});
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyK, () => {
      editor.trigger('keyboard', 'editor.action.deleteLines', {});
    });

    // Focus editor
    editor.focus();
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      onChange(value);
    }
  };

  // Auto-detect language based on content
  const detectLanguage = (content: string): string => {
    if (content.includes('import React') || content.includes('export default')) {
      return content.includes('.tsx') || content.includes('JSX.Element') ? 'typescript' : 'javascript';
    }
    if (content.includes('<?php')) return 'php';
    if (content.includes('def ') || content.includes('import ')) return 'python';
    if (content.includes('package ') || content.includes('public class')) return 'java';
    if (content.includes('#include') || content.includes('int main')) return 'cpp';
    if (content.includes('<!DOCTYPE html') || content.includes('<html')) return 'html';
    if (content.includes('body {') || content.includes('.class')) return 'css';
    if (content.includes('{') && content.includes('"')) return 'json';
    if (content.includes('# ') || content.includes('## ')) return 'markdown';
    return language;
  };

  const detectedLanguage = detectLanguage(value);

  return (
    <div className={`w-full h-full relative ${className}`}>
      {aiSuggestionsComponent}
      {enableCollaboration && collaborativeEditorComponent}
      <Editor
        value={value}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        language={detectedLanguage}
        theme={theme}
        options={{
          readOnly,
          selectOnLineNumbers: true,
          roundedSelection: false,
          scrollbar: {
            vertical: 'visible',
            horizontal: 'visible',
            arrowSize: 11,
            useShadows: false,
            verticalHasArrows: true,
            horizontalHasArrows: true,
            verticalScrollbarSize: 14,
            horizontalScrollbarSize: 14
          }
        }}
        loading={
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading Monaco Editor...</div>
          </div>
        }
      />
      
      {/* AI Suggestions Status */}
      {enableAISuggestions && !readOnly && (acceptedCount > 0 || rejectedCount > 0) && (
        <div className="absolute bottom-2 right-2 text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
          AI: {acceptedCount} accepted, {rejectedCount} rejected
        </div>
      )}

      {/* Collaboration Status */}
      {enableCollaboration && collaborators.length > 0 && (
        <div className="absolute top-2 right-2 text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          {collaborators.length} collaborator{collaborators.length > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

// Utility function to get Monaco language from file extension
export const getMonacoLanguage = (fileName: string): string => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'json': 'json',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    'md': 'markdown',
    'markdown': 'markdown',
    'py': 'python',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'cs': 'csharp',
    'php': 'php',
    'go': 'go',
    'rs': 'rust',
    'rb': 'ruby',
    'sh': 'shell',
    'bash': 'shell',
    'zsh': 'shell',
    'fish': 'shell',
    'ps1': 'powershell',
    'xml': 'xml',
    'yml': 'yaml',
    'yaml': 'yaml',
    'toml': 'toml',
    'ini': 'ini',
    'conf': 'ini',
    'env': 'shell',
    'dockerfile': 'dockerfile',
    'sql': 'sql',
    'graphql': 'graphql',
    'vue': 'vue',
    'svelte': 'svelte'
  };

  return languageMap[extension || ''] || 'plaintext';
};
