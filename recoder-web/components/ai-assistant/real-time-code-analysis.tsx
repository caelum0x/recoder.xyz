'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WebAIAssistant, type CodeAnalysisResult } from '@/lib/ai-assistant/web-ai-assistant';
import { 
  Shield, 
  Zap, 
  AlertTriangle, 
  CheckCircle, 
  Info, 
  Bug,
  Eye,
  Gauge,
  TrendingUp,
  Lock,
  Accessibility,
  RefreshCw,
  BarChart3
} from 'lucide-react';

interface RealTimeCodeAnalysisProps {
  code: string;
  language: string;
  fileName?: string;
  isVisible: boolean;
  onToggleVisibility: () => void;
  className?: string;
}

interface CodeIssue {
  line: number;
  column: number;
  type: 'error' | 'warning' | 'info' | 'suggestion';
  category: 'syntax' | 'logic' | 'performance' | 'security' | 'style';
  message: string;
  fix?: string;
  severity: number;
}

interface CodeMetrics {
  complexity: number;
  maintainability: number;
  testability: number;
  performance: number;
}

interface CodeSuggestion {
  type: 'optimization' | 'security' | 'accessibility' | 'modernization';
  description: string;
  code: string;
  impact: 'low' | 'medium' | 'high';
}

const ISSUE_ICONS = {
  error: Bug,
  warning: AlertTriangle,
  info: Info,
  suggestion: Eye
};

const CATEGORY_ICONS = {
  syntax: Bug,
  logic: AlertTriangle,
  performance: Zap,
  security: Shield,
  style: Eye
};

const SUGGESTION_ICONS = {
  optimization: TrendingUp,
  security: Lock,
  accessibility: Accessibility,
  modernization: RefreshCw
};

export function RealTimeCodeAnalysis({
  code,
  language,
  fileName,
  isVisible,
  onToggleVisibility,
  className = ''
}: RealTimeCodeAnalysisProps) {
  const [analysis, setAnalysis] = useState<CodeAnalysisResult>({
    issues: [],
    metrics: { complexity: 0, maintainability: 0, testability: 0, performance: 0 },
    suggestions: []
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'issues' | 'metrics' | 'suggestions'>('issues');
  const [filteredCategory, setFilteredCategory] = useState<string>('all');

  const aiAssistant = useRef<WebAIAssistant | null>(null);
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
            analysisThrottleMs: 1000, // Longer throttle for analysis
            cacheTimeout: 300000,
            maxConcurrentRequests: 3
          }
        });

        await aiAssistant.current.initialize();
        console.log('🔍 Real-time Code Analysis initialized');
      } catch (error) {
        console.error('Failed to initialize AI assistant:', error);
      }
    };

    initializeAssistant();

    return () => {
      aiAssistant.current?.shutdown();
    };
  }, []);

  // Analyze code with debouncing
  const analyzeCode = useCallback(async () => {
    if (!aiAssistant.current || !code.trim()) {
      setAnalysis({
        issues: [],
        metrics: { complexity: 0, maintainability: 0, testability: 0, performance: 0 },
        suggestions: []
      });
      return;
    }

    setIsAnalyzing(true);

    try {
      const result = await aiAssistant.current.analyzeCode(code, language);
      setAnalysis(result);
    } catch (error) {
      console.error('Failed to analyze code:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [code, language]);

  // Debounced analysis
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (isVisible) {
        analyzeCode();
      }
    }, 1000);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [analyzeCode, isVisible]);

  // Get issue color
  const getIssueColor = (type: CodeIssue['type']) => {
    switch (type) {
      case 'error': return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30';
      case 'warning': return 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/30';
      case 'info': return 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30';
      case 'suggestion': return 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/30';
    }
  };

  // Get metric color
  const getMetricColor = (value: number) => {
    if (value >= 8) return 'text-green-600';
    if (value >= 6) return 'text-yellow-600';
    if (value >= 4) return 'text-orange-600';
    return 'text-red-600';
  };

  // Filter issues by category
  const filteredIssues = filteredCategory === 'all' 
    ? analysis.issues 
    : analysis.issues.filter(issue => issue.category === filteredCategory);

  // Get category counts
  const categoryCounts = analysis.issues.reduce((acc, issue) => {
    acc[issue.category] = (acc[issue.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (!isVisible) {
    return (
      <button
        onClick={onToggleVisibility}
        className={`fixed bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all ${className}`}
      >
        <BarChart3 className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Code Analysis
            </h3>
            {isAnalyzing && (
              <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
            )}
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {fileName || 'Untitled'}
            </span>
            <button
              onClick={onToggleVisibility}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {[
          { id: 'issues', label: 'Issues', count: analysis.issues.length },
          { id: 'metrics', label: 'Metrics', count: null },
          { id: 'suggestions', label: 'Suggestions', count: analysis.suggestions.length }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedTab(tab.id as any)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              selectedTab === tab.id
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {tab.label}
            {tab.count !== null && (
              <span className="ml-2 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-xs">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4 h-96 overflow-y-auto">
        {isAnalyzing ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Gauge className="w-8 h-8 mx-auto mb-3 text-blue-500 animate-pulse" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Analyzing code quality, security, and performance...
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Issues Tab */}
            {selectedTab === 'issues' && (
              <div>
                {/* Category Filter */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    onClick={() => setFilteredCategory('all')}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      filteredCategory === 'all'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    All ({analysis.issues.length})
                  </button>
                  {Object.entries(categoryCounts).map(([category, count]) => {
                    const Icon = CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS];
                    return (
                      <button
                        key={category}
                        onClick={() => setFilteredCategory(category)}
                        className={`flex items-center space-x-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                          filteredCategory === category
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{category} ({count})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Issues List */}
                {filteredIssues.length > 0 ? (
                  <div className="space-y-3">
                    {filteredIssues.map((issue, index) => {
                      const IssueIcon = ISSUE_ICONS[issue.type];
                      const CategoryIcon = CATEGORY_ICONS[issue.category];
                      return (
                        <div
                          key={index}
                          className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                        >
                          <div className="flex items-start space-x-3">
                            <IssueIcon className={`w-5 h-5 mt-0.5 ${getIssueColor(issue.type).split(' ')[0]}`} />
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getIssueColor(issue.type)}`}>
                                  {issue.type}
                                </span>
                                <span className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
                                  <CategoryIcon className="w-3 h-3" />
                                  <span>{issue.category}</span>
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  Line {issue.line}:{issue.column}
                                </span>
                                <span className={`text-xs font-medium ${
                                  issue.severity >= 8 ? 'text-red-600' :
                                  issue.severity >= 6 ? 'text-yellow-600' :
                                  'text-blue-600'
                                }`}>
                                  Severity {issue.severity}
                                </span>
                              </div>
                              <p className="text-sm text-gray-900 dark:text-gray-100 mb-2">
                                {issue.message}
                              </p>
                              {issue.fix && (
                                <div className="bg-gray-50 dark:bg-gray-700 rounded p-2">
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                                    Suggested fix:
                                  </p>
                                  <code className="text-xs text-green-700 dark:text-green-300">
                                    {issue.fix}
                                  </code>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle className="w-8 h-8 mx-auto mb-3 text-green-500" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      No issues found in this category
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Metrics Tab */}
            {selectedTab === 'metrics' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(analysis.metrics).map(([metric, value]) => (
                    <div key={metric} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                          {metric}
                        </span>
                        <span className={`text-lg font-bold ${getMetricColor(value)}`}>
                          {value}/10
                        </span>
                      </div>
                      <div className="mt-2 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            value >= 8 ? 'bg-green-500' :
                            value >= 6 ? 'bg-yellow-500' :
                            value >= 4 ? 'bg-orange-500' :
                            'bg-red-500'
                          }`}
                          style={{ width: `${(value / 10) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
                    Overall Code Quality
                  </h4>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    Based on complexity, maintainability, testability, and performance metrics
                  </p>
                  <div className="mt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-blue-700 dark:text-blue-300">Score</span>
                      <span className="text-lg font-bold text-blue-700 dark:text-blue-300">
                        {Math.round(Object.values(analysis.metrics).reduce((a, b) => a + b, 0) / 4)}/10
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Suggestions Tab */}
            {selectedTab === 'suggestions' && (
              <div>
                {analysis.suggestions.length > 0 ? (
                  <div className="space-y-3">
                    {analysis.suggestions.map((suggestion, index) => {
                      const SuggestionIcon = SUGGESTION_ICONS[suggestion.type];
                      return (
                        <div
                          key={index}
                          className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                        >
                          <div className="flex items-start space-x-3">
                            <SuggestionIcon className="w-5 h-5 mt-0.5 text-purple-500" />
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
                                  {suggestion.type}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  suggestion.impact === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                                  suggestion.impact === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' :
                                  'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                }`}>
                                  {suggestion.impact} impact
                                </span>
                              </div>
                              <p className="text-sm text-gray-900 dark:text-gray-100 mb-3">
                                {suggestion.description}
                              </p>
                              <div className="bg-gray-800 rounded p-2">
                                <pre className="text-xs text-gray-300 overflow-x-auto">
                                  <code>{suggestion.code}</code>
                                </pre>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <TrendingUp className="w-8 h-8 mx-auto mb-3 text-purple-500" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      No optimization suggestions available
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default RealTimeCodeAnalysis;