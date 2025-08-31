'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';

interface AICodeSuggestion {
  id: string;
  text: string;
  position: monaco.Position;
  confidence: number;
  type: 'completion' | 'suggestion' | 'refactor';
}

interface AIInlineSuggestionsProps {
  editor: monaco.editor.IStandaloneCodeEditor | null;
  enabled: boolean;
  onAcceptSuggestion?: (suggestion: AICodeSuggestion) => void;
  onRejectSuggestion?: (suggestion: AICodeSuggestion) => void;
}

export default function AIInlineSuggestions({
  editor,
  enabled,
  onAcceptSuggestion,
  onRejectSuggestion
}: AIInlineSuggestionsProps) {
  const [currentSuggestion, setCurrentSuggestion] = useState<AICodeSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const suggestionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const decorationRef = useRef<string[]>([]);

  // AI suggestion generation (mock for now, will connect to OpenRouter)
  const generateAISuggestion = async (
    code: string, 
    position: monaco.Position
  ): Promise<AICodeSuggestion | null> => {
    // Mock AI suggestions - in production this would call OpenRouter
    const suggestions = [
      {
        trigger: 'console.',
        suggestion: 'console.log()',
        type: 'completion' as const
      },
      {
        trigger: 'function ',
        suggestion: 'function name() {\n  // TODO: implement\n}',
        type: 'completion' as const
      },
      {
        trigger: 'const ',
        suggestion: 'const [state, setState] = useState()',
        type: 'completion' as const
      },
      {
        trigger: 'useEffect',
        suggestion: 'useEffect(() => {\n  // effect logic\n}, [])',
        type: 'completion' as const
      },
      {
        trigger: 'try {',
        suggestion: 'try {\n  // code\n} catch (error) {\n  console.error(error);\n}',
        type: 'completion' as const
      }
    ];

    const currentLine = code.split('\n')[position.lineNumber - 1] || '';
    const matchedSuggestion = suggestions.find(s => currentLine.includes(s.trigger));

    if (matchedSuggestion) {
      return {
        id: `ai-suggestion-${Date.now()}`,
        text: matchedSuggestion.suggestion,
        position,
        confidence: 0.85,
        type: matchedSuggestion.type
      };
    }

    return null;
  };

  // Real AI suggestion generation (connects to production engine)
  const generateRealAISuggestion = async (
    code: string,
    position: monaco.Position,
    fileName: string
  ): Promise<AICodeSuggestion | null> => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/ai/inline-suggestion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          position: {
            line: position.lineNumber,
            column: position.column
          },
          fileName,
          context: {
            language: monaco.editor.getModel(editor?.getModel()?.uri!)?.getLanguageId() || 'typescript'
          }
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.suggestion) {
          return {
            id: `ai-suggestion-${Date.now()}`,
            text: data.suggestion.text,
            position,
            confidence: data.suggestion.confidence || 0.8,
            type: data.suggestion.type || 'completion'
          };
        }
      }
    } catch (error) {
      console.error('AI suggestion error:', error);
    } finally {
      setIsLoading(false);
    }

    return null;
  };

  // Handle cursor position changes
  useEffect(() => {
    if (!editor || !enabled) return;

    const handleCursorPositionChange = () => {
      if (suggestionTimeoutRef.current) {
        clearTimeout(suggestionTimeoutRef.current);
      }

      // Clear current suggestion
      setCurrentSuggestion(null);
      clearDecorations();

      // Generate new suggestion after a delay
      suggestionTimeoutRef.current = setTimeout(async () => {
        const position = editor.getPosition();
        if (!position) return;

        const model = editor.getModel();
        if (!model) return;

        const code = model.getValue();
        const fileName = model.uri.path.split('/').pop() || 'file.ts';

        // Try real AI suggestion first, fallback to mock
        let suggestion = await generateRealAISuggestion(code, position, fileName);
        if (!suggestion) {
          suggestion = await generateAISuggestion(code, position);
        }

        if (suggestion) {
          setCurrentSuggestion(suggestion);
          showInlineDecoration(suggestion);
        }
      }, 1000); // 1 second delay
    };

    const cursorDisposable = editor.onDidChangeCursorPosition(handleCursorPositionChange);

    return () => {
      cursorDisposable.dispose();
      if (suggestionTimeoutRef.current) {
        clearTimeout(suggestionTimeoutRef.current);
      }
    };
  }, [editor, enabled]);

  // Show inline decoration for AI suggestion
  const showInlineDecoration = (suggestion: AICodeSuggestion) => {
    if (!editor) return;

    const decorations = editor.deltaDecorations(decorationRef.current, [
      {
        range: new monaco.Range(
          suggestion.position.lineNumber,
          suggestion.position.column,
          suggestion.position.lineNumber,
          suggestion.position.column
        ),
        options: {
          afterContentClassName: 'ai-suggestion-decoration',
          hoverMessage: {
            value: `**AI Suggestion** (${Math.round(suggestion.confidence * 100)}% confidence)\n\`\`\`\n${suggestion.text}\n\`\`\`\n\nPress **Tab** to accept, **Esc** to dismiss`
          }
        }
      }
    ]);

    decorationRef.current = decorations;
  };

  // Clear decorations
  const clearDecorations = () => {
    if (!editor) return;
    
    decorationRef.current = editor.deltaDecorations(decorationRef.current, []);
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!editor || !enabled) return;

    const disposables: monaco.IDisposable[] = [];

    try {
      // Tab to accept suggestion - using onKeyDown instead of addCommand
      const keyDownDisposable = editor.onKeyDown((e) => {
        if (e.keyCode === monaco.KeyCode.Tab && currentSuggestion) {
          e.preventDefault();
          e.stopPropagation();
          
          const position = editor.getPosition();
          if (position) {
            editor.executeEdits('ai-suggestion', [{
              range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
              ),
              text: currentSuggestion.text
            }]);
            
            onAcceptSuggestion?.(currentSuggestion);
            setCurrentSuggestion(null);
            clearDecorations();
          }
        }
        
        if (e.keyCode === monaco.KeyCode.Escape && currentSuggestion) {
          e.preventDefault();
          e.stopPropagation();
          
          onRejectSuggestion?.(currentSuggestion);
          setCurrentSuggestion(null);
          clearDecorations();
        }
      });

      disposables.push(keyDownDisposable);
    } catch (error) {
      console.warn('Failed to add Monaco editor key handlers:', error);
    }

    return () => {
      try {
        disposables.forEach(disposable => disposable?.dispose());
      } catch (error) {
        console.warn('Failed to dispose Monaco editor handlers:', error);
      }
    };
  }, [editor, currentSuggestion, enabled, onAcceptSuggestion, onRejectSuggestion]);

  // Add CSS for inline suggestions
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .ai-suggestion-decoration::after {
        content: '💡 AI';
        background: rgba(0, 122, 255, 0.2);
        color: #007AFF;
        font-size: 11px;
        padding: 2px 4px;
        border-radius: 3px;
        margin-left: 8px;
        border: 1px solid rgba(0, 122, 255, 0.3);
        animation: pulse 2s infinite;
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Component doesn't render anything - it's a behavior hook
  return null;
}

// Hook for using AI inline suggestions
export const useAIInlineSuggestions = (
  editor: monaco.editor.IStandaloneCodeEditor | null,
  enabled: boolean = true
) => {
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);

  const handleAcceptSuggestion = (suggestion: AICodeSuggestion) => {
    setAcceptedCount(prev => prev + 1);
    console.log('AI suggestion accepted:', suggestion);
  };

  const handleRejectSuggestion = (suggestion: AICodeSuggestion) => {
    setRejectedCount(prev => prev + 1);
    console.log('AI suggestion rejected:', suggestion);
  };

  return {
    acceptedCount,
    rejectedCount,
    aiSuggestionsComponent: (
      <AIInlineSuggestions
        editor={editor}
        enabled={enabled}
        onAcceptSuggestion={handleAcceptSuggestion}
        onRejectSuggestion={handleRejectSuggestion}
      />
    )
  };
};
