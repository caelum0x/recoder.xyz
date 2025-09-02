"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Brain, 
  Lightbulb, 
  Code, 
  FileText, 
  GitBranch, 
  Bug, 
  Shield, 
  Zap, 
  Target, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Play, 
  Pause, 
  Square, 
  RotateCcw,
  Save,
  Download,
  Upload,
  Settings,
  X
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

interface AIContextAnalysis {
  codeComplexity: number;
  securityIssues: string[];
  performanceIssues: string[];
  suggestions: string[];
  refactoringOpportunities: string[];
  testCoverage: number;
  maintainabilityScore: number;
}

interface IntelligentAssistantProps {
  currentCode: string;
  filePath: string;
  language: string;
  projectContext: {
    framework: string;
    dependencies: string[];
    fileCount: number;
    totalLines: number;
  };
  onCodeUpdate: (newCode: string) => void;
  onInsertCode: (code: string, position?: { line: number; column: number }) => void;
  isVisible: boolean;
  onClose: () => void;
}

export default function IntelligentAssistant({
  currentCode,
  filePath,
  language,
  projectContext,
  onCodeUpdate,
  onInsertCode,
  isVisible,
  onClose
}: IntelligentAssistantProps) {
  const [activeTab, setActiveTab] = useState('analysis');
  const [analysis, setAnalysis] = useState<AIContextAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [autoAnalysis, setAutoAnalysis] = useState(true);
  const [analysisInterval, setAnalysisInterval] = useState<NodeJS.Timeout | null>(null);

  // Real-time code analysis
  useEffect(() => {
    if (autoAnalysis && currentCode && isVisible) {
      if (analysisInterval) {
        clearTimeout(analysisInterval);
      }
      
      const timeout = setTimeout(() => {
        performIntelligentAnalysis();
      }, 2000); // Debounce analysis for 2 seconds
      
      setAnalysisInterval(timeout);
    }
    
    return () => {
      if (analysisInterval) {
        clearTimeout(analysisInterval);
      }
    };
  }, [currentCode, autoAnalysis, isVisible]);

  const performIntelligentAnalysis = async () => {
    if (!currentCode.trim()) return;
    
    try {
      setLoading(true);
      
      const response = await fetch('/api/ai/intelligent-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: currentCode,
          filePath,
          language,
          projectContext
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setAnalysis(data.analysis);
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateAICode = async (prompt: string, mode: 'generate' | 'refactor' | 'optimize' | 'test') => {
    try {
      setLoading(true);
      
      const response = await fetch('/api/ai/intelligent-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          currentCode,
          mode,
          language,
          filePath,
          projectContext,
          analysis
        })
      });
      
      const data = await response.json();
      if (data.success) {
        if (mode === 'refactor' || mode === 'optimize') {
          onCodeUpdate(data.generatedCode);
        } else {
          onInsertCode(data.generatedCode);
        }
      }
    } catch (error) {
      console.error('AI generation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const applySuggestion = async (suggestion: string) => {
    await generateAICode(suggestion, 'optimize');
  };

  const getComplexityColor = (complexity: number) => {
    if (complexity < 3) return 'text-green-600';
    if (complexity < 7) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreColor = (score: number) => {
    if (score > 80) return 'text-green-600';
    if (score > 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (!isVisible) return null;

  return (
    <div className="fixed top-16 right-4 w-[600px] h-[700px] bg-white dark:bg-gray-800 shadow-xl rounded-lg border z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-600" />
          <h3 className="font-semibold">Intelligent AI Assistant</h3>
          <Badge variant="outline">Advanced</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAutoAnalysis(!autoAnalysis)}
            className={autoAnalysis ? 'text-green-600' : 'text-gray-400'}
          >
            <Zap className="w-4 h-4" />
          </Button>
          <X 
            className="w-4 h-4 cursor-pointer hover:text-red-500" 
            onClick={onClose}
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-4 mx-4 mt-2">
          <TabsTrigger value="analysis" className="flex items-center gap-1">
            <Brain className="w-3 h-3" />
            Analysis
          </TabsTrigger>
          <TabsTrigger value="suggestions" className="flex items-center gap-1">
            <Lightbulb className="w-3 h-3" />
            Suggestions
          </TabsTrigger>
          <TabsTrigger value="generate" className="flex items-center gap-1">
            <Code className="w-3 h-3" />
            Generate
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-1">
            <Shield className="w-3 h-3" />
            Security
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="analysis" className="mt-4 mx-4 h-full overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Code Analysis</h4>
                <Button
                  onClick={performIntelligentAnalysis}
                  disabled={loading}
                  size="sm"
                  variant="outline"
                >
                  {loading ? <RotateCcw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  {loading ? 'Analyzing...' : 'Analyze'}
                </Button>
              </div>

              {analysis ? (
                <div className="space-y-4">
                  {/* Complexity Metrics */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Code Metrics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Complexity</span>
                        <span className={`font-medium ${getComplexityColor(analysis.codeComplexity)}`}>
                          {analysis.codeComplexity}/10
                        </span>
                      </div>
                      <Progress value={analysis.codeComplexity * 10} className="h-2" />
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Maintainability</span>
                        <span className={`font-medium ${getScoreColor(analysis.maintainabilityScore)}`}>
                          {analysis.maintainabilityScore}%
                        </span>
                      </div>
                      <Progress value={analysis.maintainabilityScore} className="h-2" />
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Test Coverage</span>
                        <span className={`font-medium ${getScoreColor(analysis.testCoverage)}`}>
                          {analysis.testCoverage}%
                        </span>
                      </div>
                      <Progress value={analysis.testCoverage} className="h-2" />
                    </CardContent>
                  </Card>

                  {/* Issues */}
                  {analysis.securityIssues.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                          Security Issues ({analysis.securityIssues.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {analysis.securityIssues.map((issue, index) => (
                            <div key={index} className="text-xs p-2 bg-red-50 border border-red-200 rounded">
                              {issue}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {analysis.performanceIssues.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-yellow-500" />
                          Performance Issues ({analysis.performanceIssues.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {analysis.performanceIssues.map((issue, index) => (
                            <div key={index} className="text-xs p-2 bg-yellow-50 border border-yellow-200 rounded">
                              {issue}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Refactoring Opportunities */}
                  {analysis.refactoringOpportunities.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <GitBranch className="w-4 h-4 text-blue-500" />
                          Refactoring Opportunities
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {analysis.refactoringOpportunities.map((opportunity, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded">
                              <span className="text-xs flex-1">{opportunity}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="ml-2 h-6 px-2 text-xs"
                                onClick={() => applySuggestion(opportunity)}
                              >
                                Apply
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Brain className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-600">Run analysis to see code insights</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="suggestions" className="mt-4 mx-4 h-full overflow-y-auto">
            <div className="space-y-4">
              <h4 className="font-medium">AI Suggestions</h4>
              
              {suggestions.length > 0 ? (
                <div className="space-y-3">
                  {suggestions.map((suggestion, index) => (
                    <Card key={index}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Lightbulb className="w-4 h-4 text-yellow-500" />
                              <span className="text-sm font-medium">Suggestion {index + 1}</span>
                            </div>
                            <p className="text-xs text-gray-600">{suggestion}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => applySuggestion(suggestion)}
                            disabled={loading}
                          >
                            Apply
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Lightbulb className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-600">No suggestions available</p>
                  <p className="text-xs text-gray-500">Run code analysis to get suggestions</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="generate" className="mt-4 mx-4 h-full overflow-y-auto">
            <div className="space-y-4">
              <h4 className="font-medium">AI Code Generation</h4>
              
              <div className="space-y-3">
                <div>
                  <Label htmlFor="ai-prompt" className="text-sm">Describe what you want to generate</Label>
                  <Textarea
                    id="ai-prompt"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g., Add error handling, Create unit tests, Optimize performance..."
                    className="mt-1 h-20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => generateAICode(aiPrompt, 'generate')}
                    disabled={!aiPrompt.trim() || loading}
                    className="gap-2"
                  >
                    <Code className="w-4 h-4" />
                    Generate
                  </Button>
                  <Button
                    onClick={() => generateAICode(aiPrompt, 'refactor')}
                    disabled={!aiPrompt.trim() || loading}
                    variant="outline"
                    className="gap-2"
                  >
                    <GitBranch className="w-4 h-4" />
                    Refactor
                  </Button>
                  <Button
                    onClick={() => generateAICode(aiPrompt, 'optimize')}
                    disabled={!aiPrompt.trim() || loading}
                    variant="outline"
                    className="gap-2"
                  >
                    <TrendingUp className="w-4 h-4" />
                    Optimize
                  </Button>
                  <Button
                    onClick={() => generateAICode(aiPrompt, 'test')}
                    disabled={!aiPrompt.trim() || loading}
                    variant="outline"
                    className="gap-2"
                  >
                    <Bug className="w-4 h-4" />
                    Add Tests
                  </Button>
                </div>

                {/* Quick Templates */}
                <div>
                  <Label className="text-sm">Quick Templates</Label>
                  <div className="grid grid-cols-1 gap-2 mt-2">
                    {[
                      'Add comprehensive error handling',
                      'Create unit tests for this function',
                      'Optimize for better performance',
                      'Add TypeScript types and interfaces',
                      'Implement proper logging',
                      'Add input validation'
                    ].map((template) => (
                      <Button
                        key={template}
                        variant="ghost"
                        size="sm"
                        className="justify-start text-xs h-8"
                        onClick={() => setAiPrompt(template)}
                      >
                        {template}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="security" className="mt-4 mx-4 h-full overflow-y-auto">
            <div className="space-y-4">
              <h4 className="font-medium">Security Analysis</h4>
              
              {analysis?.securityIssues ? (
                <div className="space-y-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Shield className="w-4 h-4 text-green-500" />
                        Security Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        {analysis.securityIssues.length === 0 ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-sm text-green-600">No security issues detected</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                            <span className="text-sm text-red-600">
                              {analysis.securityIssues.length} security issue(s) found
                            </span>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {analysis.securityIssues.map((issue, index) => (
                    <Card key={index}>
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-red-700">{issue}</p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2 h-6 px-2 text-xs"
                              onClick={() => generateAICode(`Fix security issue: ${issue}`, 'optimize')}
                            >
                              Auto-fix
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Shield className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-600">Run security analysis</p>
                  <Button
                    onClick={performIntelligentAnalysis}
                    disabled={loading}
                    className="mt-2"
                    size="sm"
                  >
                    Analyze Security
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {loading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg flex items-center gap-3">
            <RotateCcw className="w-5 h-5 animate-spin text-blue-500" />
            <span className="text-sm">AI is analyzing your code...</span>
          </div>
        </div>
      )}
    </div>
  );
}
