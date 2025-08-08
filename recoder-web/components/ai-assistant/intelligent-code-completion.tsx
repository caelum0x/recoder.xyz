'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { WebAIAssistant, type CodeCompletionRequest, type CodeCompletionResponse } from '@/lib/ai-assistant/web-ai-assistant';
import { Lightbulb, Zap, Code, RefreshCw } from 'lucide-react';

interface IntelligentCodeCompletionProps {
  code: string;
  language: string;
  position: { line: number; column: number };
  fileName?: string;
  framework?: string;
  onCompletionSelect: (completion: string) => void;
  onRefactoringSuggestion: (suggestion: any) => void;
  className?: string;
}

interface CompletionItem {
  text: string;
  displayText: string;
  insertText: string;
  kind: 'function' | 'variable' | 'class' | 'snippet' | 'keyword';
  detail?: string;
  documentation?: string;
  confidence: number;
}

export function IntelligentCodeCompletion({
  code,
  language,
  position,
  fileName,
  framework,
  onCompletionSelect,
  onRefactoringSuggestion,
  className = ''
}: IntelligentCodeCompletionProps) {
  const [completions, setCompletions] = useState<CompletionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [assistantStats, setAssistantStats] = useState({
    responseTime: 0,
    cached: false,
    model: 'unknown'
  });

  const aiAssistant = useRef<WebAIAssistant | null>(null);
  const completionRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize AI Assistant
  useEffect(() => {
    const initializeAssistant = async () => {
      try {
        aiAssistant.current = new WebAIAssistant({
          ai: {
            defaultModel: 'claude-3-sonnet',
            fallbackModels: ['gemini-2.0-flash', 'groq-llama'],
            maxContextTokens: 8000,
            temperature: 0.1,
            enableStreaming: true
          },
          features: {
            codeCompletion: true,
            inlineRefactoring: true,
            smartSuggestions: true,
            contextAwareness: true,
            realTimeAnalysis: true,
            collaborativeEditing: false
          },
          performance: {
            completionDebounceMs: 150,
            analysisThrottleMs: 500,
            cacheTimeout: 300000,
            maxConcurrentRequests: 3
          }
        });

        await aiAssistant.current.initialize();
        console.log('🧠 Intelligent Code Completion initialized');
      } catch (error) {
        console.error('Failed to initialize AI assistant:', error);
      }
    };

    initializeAssistant();

    return () => {
      aiAssistant.current?.shutdown();
    };
  }, []);

  // Debounced completion fetching
  const fetchCompletions = useCallback(async () => {
    if (!aiAssistant.current || !code.trim()) {
      setCompletions([]);
      setIsVisible(false);
      return;
    }

    setIsLoading(true);

    try {
      const request: CodeCompletionRequest = {
        code,
        position,
        language,
        context: {
          fileName,
          framework,
          projectType: 'web'
        },
        trigger: 'typing'
      };

      const response: CodeCompletionResponse = await aiAssistant.current.getCodeCompletion(request);
      
      setCompletions(response.completions);
      setAssistantStats({
        responseTime: response.metadata.responseTime,
        cached: response.metadata.cached,
        model: response.metadata.model
      });
      setSelectedIndex(0);
      setIsVisible(response.completions.length > 0);

    } catch (error) {
      console.error('Failed to fetch completions:', error);
      setCompletions([]);
      setIsVisible(false);
    } finally {
      setIsLoading(false);
    }
  }, [code, position, language, fileName, framework]);

  // Debounce completion requests
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchCompletions();
    }, 150);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [fetchCompletions]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible || completions.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % completions.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + completions.length) % completions.length);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          if (completions[selectedIndex]) {
            onCompletionSelect(completions[selectedIndex].insertText);
            setIsVisible(false);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsVisible(false);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, completions, selectedIndex, onCompletionSelect]);

  // Get icon for completion kind
  const getCompletionIcon = (kind: CompletionItem['kind']) => {
    switch (kind) {
      case 'function':
        return <Code className="w-4 h-4 text-blue-500" />;
      case 'variable':
        return <div className="w-4 h-4 bg-green-500 rounded-sm" />;
      case 'class':
        return <div className="w-4 h-4 bg-purple-500 rounded" />;
      case 'snippet':
        return <Lightbulb className="w-4 h-4 text-yellow-500" />;
      case 'keyword':
        return <div className="w-4 h-4 bg-red-500 rounded-sm" />;
      default:
        return <div className="w-4 h-4 bg-gray-500 rounded-sm" />;
    }
  };

  // Get confidence color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-500';
    if (confidence >= 0.6) return 'text-yellow-500';
    return 'text-red-500';
  };

  if (!isVisible && !isLoading) {
    return null;
  }

  return (
    <div className={`fixed z-50 ${className}`} ref={completionRef}>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-w-md w-96">
        {/* Header */}
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                AI Completions
              </span>
              {isLoading && (
                <RefreshCw className="w-3 h-3 text-gray-400 animate-spin" />
              )}
            </div>
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              {assistantStats.cached && (
                <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                  Cached
                </span>
              )}
              <span>{assistantStats.responseTime}ms</span>
            </div>
          </div>
        </div>

        {/* Completions List */}
        <div className="max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-4 text-center text-gray-500 dark:text-gray-400">
              <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin" />
              <p className="text-sm">Generating intelligent completions...</p>
            </div>
          ) : completions.length > 0 ? (
            <div className="py-1">
              {completions.map((completion, index) => (
                <div
                  key={index}
                  className={`px-3 py-2 cursor-pointer transition-colors ${
                    index === selectedIndex
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-l-2 border-blue-500'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                  onClick={() => {
                    onCompletionSelect(completion.insertText);
                    setIsVisible(false);
                  }}
                >
                  <div className="flex items-center space-x-3">
                    {getCompletionIcon(completion.kind)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {completion.displayText}
                        </p>
                        <span className={`text-xs font-medium ${getConfidenceColor(completion.confidence)}`}>
                          {Math.round(completion.confidence * 100)}%
                        </span>
                      </div>
                      {completion.detail && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 truncate mt-0.5">
                          {completion.detail}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 py-4 text-center text-gray-500 dark:text-gray-400">
              <Lightbulb className="w-5 h-5 mx-auto mb-2" />
              <p className="text-sm">No completions available</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {completions.length > 0 && (
          <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-lg">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>
                Use ↑↓ to navigate, Enter/Tab to select, Esc to close
              </span>
              <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
                {assistantStats.model}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default IntelligentCodeCompletion;