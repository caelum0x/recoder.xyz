'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WebAIAssistant, type RefactoringRequest, type RefactoringResponse } from '@/lib/ai-assistant/web-ai-assistant';
import { 
  Wand2, 
  Code, 
  Zap, 
  CheckCircle, 
  AlertCircle, 
  Info, 
  Sparkles,
  ArrowRight,
  Clock,
  Target,
  Gauge
} from 'lucide-react';

interface IntelligentRefactoringPanelProps {
  code: string;
  language: string;
  selection: { start: number; end: number };
  onRefactoringApply: (newCode: string) => void;
  onClose: () => void;
  className?: string;
}

interface RefactoringOption {
  id: string;
  title: string;
  description: string;
  preview: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
}

const REFACTORING_TYPES = [
  { id: 'extract-function', label: 'Extract Function', icon: Code },
  { id: 'rename', label: 'Rename Symbol', icon: Wand2 },
  { id: 'optimize', label: 'Optimize Performance', icon: Zap },
  { id: 'modernize', label: 'Modernize Syntax', icon: Sparkles },
  { id: 'auto', label: 'Auto Suggestions', icon: Target }
];

export function IntelligentRefactoringPanel({
  code,
  language,
  selection,
  onRefactoringApply,
  onClose,
  className = ''
}: IntelligentRefactoringPanelProps) {
  const [refactoringOptions, setRefactoringOptions] = useState<RefactoringOption[]>([]);
  const [selectedType, setSelectedType] = useState<string>('auto');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState<string | null>(null);
  const [analysisMetadata, setAnalysisMetadata] = useState({
    analysisTime: 0,
    suggestionsCount: 0
  });

  const aiAssistant = useRef<WebAIAssistant | null>(null);
  const selectedCode = code.substring(selection.start, selection.end);

  // Initialize AI Assistant
  useEffect(() => {
    const initializeAssistant = async () => {
      try {
        aiAssistant.current = new WebAIAssistant({
          ai: {
            defaultModel: 'claude-3-sonnet',
            fallbackModels: ['gemini-2.0-flash', 'groq-llama'],
            maxContextTokens: 8000,
            temperature: 0.2,
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
        console.log('🔧 Intelligent Refactoring Panel initialized');
      } catch (error) {
        console.error('Failed to initialize AI assistant:', error);
      }
    };

    initializeAssistant();

    return () => {
      aiAssistant.current?.shutdown();
    };
  }, []);

  // Analyze code for refactoring suggestions
  const analyzeRefactoring = useCallback(async (refactoringType: string) => {
    if (!aiAssistant.current || !selectedCode.trim()) {
      return;
    }

    setIsAnalyzing(true);
    setRefactoringOptions([]);
    setSelectedOption(null);

    try {
      const request: RefactoringRequest = {
        code: selectedCode,
        selection: { start: 0, end: selectedCode.length },
        language,
        refactoringType: refactoringType === 'auto' ? undefined : refactoringType as any
      };

      const response: RefactoringResponse = await aiAssistant.current.getRefactoringSuggestions(request);
      
      setRefactoringOptions(response.options);
      setAnalysisMetadata(response.metadata);
      
      if (response.options.length > 0) {
        setSelectedOption(response.options[0].id);
      }

    } catch (error) {
      console.error('Failed to analyze refactoring:', error);
      setRefactoringOptions([]);
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedCode, language]);

  // Analyze when type changes or component mounts
  useEffect(() => {
    analyzeRefactoring(selectedType);
  }, [selectedType, analyzeRefactoring]);

  // Apply refactoring
  const applyRefactoring = useCallback((option: RefactoringOption) => {
    const newCode = code.substring(0, selection.start) + 
                   option.preview + 
                   code.substring(selection.end);
    onRefactoringApply(newCode);
  }, [code, selection, onRefactoringApply]);

  // Get impact color
  const getImpactColor = (impact: RefactoringOption['impact']) => {
    switch (impact) {
      case 'low': return 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30';
      case 'medium': return 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/30';
      case 'high': return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30';
    }
  };

  // Get confidence color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Wand2 className="w-5 h-5 text-purple-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Intelligent Refactoring
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            ×
          </button>
        </div>
        
        {/* Metadata */}
        <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center space-x-1">
            <Clock className="w-4 h-4" />
            <span>{analysisMetadata.analysisTime}ms</span>
          </div>
          <div className="flex items-center space-x-1">
            <Target className="w-4 h-4" />
            <span>{analysisMetadata.suggestionsCount} suggestions</span>
          </div>
          <div className="flex items-center space-x-1">
            <Code className="w-4 h-4" />
            <span>{selectedCode.length} chars selected</span>
          </div>
        </div>
      </div>

      {/* Refactoring Types */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-2">
          {REFACTORING_TYPES.map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.id}
                onClick={() => setSelectedType(type.id)}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  selectedType === type.id
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Code Preview */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Selected Code:
        </h4>
        <div className="bg-gray-800 rounded-md p-3 overflow-x-auto">
          <pre className="text-sm text-gray-300">
            <code>{selectedCode}</code>
          </pre>
        </div>
      </div>

      {/* Refactoring Options */}
      <div className="px-4 py-3">
        {isAnalyzing ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Gauge className="w-8 h-8 mx-auto mb-3 text-purple-500 animate-pulse" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Analyzing code for refactoring opportunities...
              </p>
            </div>
          </div>
        ) : refactoringOptions.length > 0 ? (
          <div className="space-y-3">
            {refactoringOptions.map((option, index) => (
              <div
                key={option.id}
                className={`border rounded-lg p-4 transition-all cursor-pointer ${
                  selectedOption === option.id
                    ? 'border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
                onClick={() => setSelectedOption(option.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h5 className="font-medium text-gray-900 dark:text-gray-100">
                        {option.title}
                      </h5>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getImpactColor(option.impact)}`}>
                        {option.impact} impact
                      </span>
                      <span className={`text-sm font-medium ${getConfidenceColor(option.confidence)}`}>
                        {Math.round(option.confidence * 100)}%
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      {option.description}
                    </p>
                  </div>
                </div>

                {/* Preview Toggle */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewExpanded(
                        previewExpanded === option.id ? null : option.id
                      );
                    }}
                    className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center space-x-1"
                  >
                    <span>{previewExpanded === option.id ? 'Hide' : 'Show'} Preview</span>
                    <ArrowRight className={`w-4 h-4 transition-transform ${
                      previewExpanded === option.id ? 'rotate-90' : ''
                    }`} />
                  </button>
                  
                  {selectedOption === option.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        applyRefactoring(option);
                        onClose();
                      }}
                      className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-sm font-medium flex items-center space-x-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Apply Refactoring</span>
                    </button>
                  )}
                </div>

                {/* Preview Code */}
                {previewExpanded === option.id && (
                  <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
                    <div className="bg-gray-800 rounded-md p-3 overflow-x-auto">
                      <pre className="text-sm text-gray-300">
                        <code>{option.preview}</code>
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Info className="w-8 h-8 mx-auto mb-3 text-gray-400" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No refactoring suggestions available for the selected code.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Try selecting a different code block or refactoring type.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-lg">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>
            💡 Tip: Select specific code blocks for better refactoring suggestions
          </span>
          <div className="flex items-center space-x-2">
            <span>Powered by</span>
            <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded">
              Recoder AI
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default IntelligentRefactoringPanel;