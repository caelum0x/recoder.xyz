'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, Wand2, Loader2, Check, X, ArrowRight, 
  Lightbulb, Code2, RefreshCw, Zap, Brain,
  Sparkles, Target, FileText, Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AISuggestion {
  id: string;
  type: 'completion' | 'refactor' | 'fix' | 'optimize' | 'explain' | 'generate';
  title: string;
  description: string;
  code: string;
  confidence: number;
  reasoning: string;
  impact: 'low' | 'medium' | 'high';
  category: string;
}

interface AICodeAssistProps {
  currentCode: string;
  filePath: string;
  language: string;
  cursorPosition: { line: number; column: number };
  onCodeInsert: (code: string, position?: { line: number; column: number }) => void;
  onCodeReplace: (startLine: number, endLine: number, newCode: string) => void;
  isVisible: boolean;
  onClose: () => void;
}

const AIPoweredCodeAssist: React.FC<AICodeAssistProps> = ({
  currentCode,
  filePath,
  language,
  cursorPosition,
  onCodeInsert,
  onCodeReplace,
  isVisible,
  onClose
}) => {
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState<AISuggestion | null>(null);
  const [assistMode, setAssistMode] = useState<'auto' | 'custom' | 'refactor' | 'debug'>('auto');
  const [showExplanation, setShowExplanation] = useState(false);
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  // Auto-generate suggestions based on context
  useEffect(() => {
    if (isVisible && currentCode && assistMode === 'auto') {
      generateAutoSuggestions();
    }
  }, [isVisible, currentCode, cursorPosition, assistMode]);

  const generateAutoSuggestions = async () => {
    setLoading(true);
    try {
      // Extract context around cursor position
      const lines = currentCode.split('\n');
      const contextStart = Math.max(0, cursorPosition.line - 5);
      const contextEnd = Math.min(lines.length, cursorPosition.line + 5);
      const contextCode = lines.slice(contextStart, contextEnd).join('\n');

      const response = await fetch('/api/ai/smart-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: currentCode,
          contextCode,
          filePath,
          language,
          cursorPosition,
          analysisType: 'auto'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Failed to generate auto suggestions:', error);
    }
    setLoading(false);
  };

  const generateCustomSuggestion = async () => {
    if (!customPrompt.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/ai/smart-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: currentCode,
          filePath,
          language,
          cursorPosition,
          customPrompt,
          analysisType: 'custom'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Failed to generate custom suggestion:', error);
    }
    setLoading(false);
  };

  const applySuggestion = async (suggestion: AISuggestion) => {
    setProcessingAction(suggestion.id);
    
    try {
      // Apply the code change based on suggestion type
      switch (suggestion.type) {
        case 'completion':
          onCodeInsert(suggestion.code, cursorPosition);
          break;
        case 'refactor':
        case 'fix':
        case 'optimize':
          // For refactoring, replace the current selection or function
          const lines = currentCode.split('\n');
          const currentLine = cursorPosition.line;
          onCodeReplace(currentLine, currentLine, suggestion.code);
          break;
        case 'generate':
          onCodeInsert(suggestion.code);
          break;
      }

      // Track successful application
      await fetch('/api/analytics/ai-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suggestion_applied',
          suggestionType: suggestion.type,
          confidence: suggestion.confidence,
          filePath,
          language
        })
      });

    } catch (error) {
      console.error('Failed to apply suggestion:', error);
    }
    
    setProcessingAction(null);
  };

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'completion': return <Code2 className="h-4 w-4" />;
      case 'refactor': return <RefreshCw className="h-4 w-4" />;
      case 'fix': return <Zap className="h-4 w-4" />;
      case 'optimize': return <Target className="h-4 w-4" />;
      case 'explain': return <Lightbulb className="h-4 w-4" />;
      case 'generate': return <Sparkles className="h-4 w-4" />;
      default: return <Bot className="h-4 w-4" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'border-green-500 bg-green-50';
      case 'medium': return 'border-yellow-500 bg-yellow-50';
      case 'low': return 'border-gray-500 bg-gray-50';
      default: return 'border-gray-300';
    }
  };

  if (!isVisible) return null;

  return (
    <Dialog open={isVisible} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            AI-Powered Code Assistant
            <Badge variant="secondary" className="ml-auto">
              OpenRouter Integration
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Get intelligent code suggestions, optimizations, and explanations powered by advanced AI models.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Assistant Mode Selection */}
          <div className="flex items-center gap-4">
            <Label>Mode:</Label>
            <Select value={assistMode} onValueChange={(value: any) => setAssistMode(value)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto Suggestions</SelectItem>
                <SelectItem value="custom">Custom Request</SelectItem>
                <SelectItem value="refactor">Code Refactoring</SelectItem>
                <SelectItem value="debug">Debug Helper</SelectItem>
              </SelectContent>
            </Select>
            
            {assistMode === 'auto' && (
              <Button 
                onClick={generateAutoSuggestions} 
                disabled={loading}
                size="sm"
                variant="outline"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
            )}
          </div>

          {/* Custom Prompt Input */}
          {assistMode === 'custom' && (
            <div className="space-y-2">
              <Label>Describe what you want to achieve:</Label>
              <div className="flex gap-2">
                <Textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g., 'Add error handling to this function', 'Convert this to TypeScript', 'Optimize for performance'..."
                  className="flex-1"
                  rows={3}
                />
                <Button 
                  onClick={generateCustomSuggestion}
                  disabled={loading || !customPrompt.trim()}
                  className="self-end"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {/* Context Information */}
          <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
            <div>
              <strong>File:</strong> {filePath.split('/').pop()}
            </div>
            <div>
              <strong>Language:</strong> {language}
            </div>
            <div>
              <strong>Position:</strong> Line {cursorPosition.line + 1}, Col {cursorPosition.column + 1}
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
                  <span>Analyzing code and generating suggestions...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI Suggestions */}
          {!loading && suggestions.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                AI Suggestions ({suggestions.length})
              </h3>
              
              <div className="grid gap-4">
                {suggestions.map((suggestion) => (
                  <Card 
                    key={suggestion.id}
                    className={`transition-all hover:shadow-md cursor-pointer ${getImpactColor(suggestion.impact)}`}
                    onClick={() => setSelectedSuggestion(suggestion)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {getSuggestionIcon(suggestion.type)}
                          <CardTitle className="text-base">{suggestion.title}</CardTitle>
                          <Badge variant="outline" className="capitalize">
                            {suggestion.type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${getConfidenceColor(suggestion.confidence)}`} />
                          <span className="text-xs text-gray-500">
                            {Math.round(suggestion.confidence * 100)}% confidence
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 mb-3">{suggestion.description}</p>
                      
                      <div className="bg-gray-900 rounded p-3 mb-3">
                        <pre className="text-green-400 text-xs overflow-x-auto">
                          {suggestion.code.substring(0, 150)}
                          {suggestion.code.length > 150 && '...'}
                        </pre>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {suggestion.category}
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${
                              suggestion.impact === 'high' ? 'border-green-500 text-green-700' :
                              suggestion.impact === 'medium' ? 'border-yellow-500 text-yellow-700' :
                              'border-gray-500 text-gray-700'
                            }`}
                          >
                            {suggestion.impact} impact
                          </Badge>
                        </div>
                        
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowExplanation(true);
                              setSelectedSuggestion(suggestion);
                            }}
                          >
                            <Lightbulb className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              applySuggestion(suggestion);
                            }}
                            disabled={processingAction === suggestion.id}
                          >
                            {processingAction === suggestion.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Check className="h-3 w-3" />
                                Apply
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* No Suggestions State */}
          {!loading && suggestions.length === 0 && assistMode === 'auto' && (
            <Card>
              <CardContent className="text-center py-8">
                <Bot className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">
                  No suggestions available for the current context.
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Try moving your cursor to different parts of the code or switch to custom mode.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Explanation Dialog */}
        {showExplanation && selectedSuggestion && (
          <Dialog open={showExplanation} onOpenChange={setShowExplanation}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5" />
                  AI Reasoning
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Suggestion:</h4>
                  <p className="text-gray-700">{selectedSuggestion.title}</p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Reasoning:</h4>
                  <p className="text-gray-700">{selectedSuggestion.reasoning}</p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Full Code:</h4>
                  <div className="bg-gray-900 rounded p-4">
                    <pre className="text-green-400 text-sm overflow-x-auto whitespace-pre-wrap">
                      {selectedSuggestion.code}
                    </pre>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AIPoweredCodeAssist;
