/**
 * Reasoning Visualization Component for DeepSeek R1
 * 
 * Interactive visualization of transparent thinking and step-by-step reasoning
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';

interface ReasoningStep {
  id: string;
  type: 'observation' | 'hypothesis' | 'analysis' | 'conclusion' | 'decision' | 'reflection';
  content: string;
  confidence: number;
  timestamp: string;
  dependencies: string[];
  evidence: string[];
  alternatives?: string[];
  reasoning_chain: string;
}

interface ReasoningNode {
  id: string;
  label: string;
  type: 'observation' | 'hypothesis' | 'analysis' | 'conclusion' | 'decision';
  position: { x: number; y: number };
  connections: string[];
  confidence: number;
  status: 'active' | 'completed' | 'discarded';
}

interface TimelineEvent {
  timestamp: string;
  step: string;
  description: string;
  type: 'step_start' | 'step_complete' | 'insight' | 'decision';
  impact: 'low' | 'medium' | 'high';
}

interface ReasoningInsight {
  type: 'pattern' | 'contradiction' | 'gap' | 'breakthrough' | 'optimization';
  description: string;
  relevance: number;
  actionable: boolean;
  relatedSteps: string[];
}

interface ReasoningStats {
  totalSteps: number;
  averageConfidence: number;
  reasoningDepth: number;
  branchingFactor: number;
  timeToConclusion: number;
  costEfficiency: number;
}

interface ReasoningSession {
  id: string;
  problem: string;
  goal: string;
  status: 'active' | 'completed' | 'error';
  steps: ReasoningStep[];
  flowChart: ReasoningNode[];
  timeline: TimelineEvent[];
  insights: ReasoningInsight[];
  statistics: ReasoningStats;
  finalConclusion?: string;
  confidence: number;
  totalCost: number;
}

export default function ReasoningVisualization() {
  const [sessions, setSessions] = useState<ReasoningSession[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const [goal, setGoal] = useState('');
  const [approach, setApproach] = useState<'analytical' | 'creative' | 'logical' | 'strategic'>('analytical');
  const [loading, setLoading] = useState(false);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'steps' | 'flowchart' | 'timeline' | 'insights'>('steps');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    loadReasoningSessions();
    const interval = setInterval(loadReasoningSessions, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (viewMode === 'flowchart' && activeSession) {
      drawFlowChart();
    }
  }, [viewMode, activeSession, sessions]);

  const loadReasoningSessions = async () => {
    try {
      const response = await fetch('/api/reasoning/sessions');
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (error) {
      console.error('Failed to load reasoning sessions:', error);
    }
  };

  const startReasoning = async () => {
    if (!problem.trim() || !goal.trim()) return;
    
    try {
      setLoading(true);
      const response = await fetch('/api/reasoning/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem,
          goal,
          approach,
          options: {
            maxSteps: 15,
            domain: 'software-development'
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        setActiveSession(data.sessionId);
        setProblem('');
        setGoal('');
        loadReasoningSessions();
      }
    } catch (error) {
      console.error('Failed to start reasoning:', error);
    } finally {
      setLoading(false);
    }
  };

  const drawFlowChart = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const session = sessions.find(s => s.id === activeSession);
    if (!session || !session.flowChart) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw connections first
    session.flowChart.forEach(node => {
      node.connections.forEach(connectionId => {
        const connectedNode = session.flowChart.find(n => n.id === connectionId);
        if (connectedNode) {
          ctx.strokeStyle = '#e5e7eb';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(node.position.x + 50, node.position.y + 25);
          ctx.lineTo(connectedNode.position.x + 50, connectedNode.position.y + 25);
          ctx.stroke();
        }
      });
    });

    // Draw nodes
    session.flowChart.forEach(node => {
      const x = node.position.x;
      const y = node.position.y;
      const width = 100;
      const height = 50;

      // Node background
      ctx.fillStyle = getNodeColor(node.type, node.confidence);
      ctx.fillRect(x, y, width, height);

      // Node border
      ctx.strokeStyle = selectedStep === node.id ? '#3b82f6' : '#d1d5db';
      ctx.lineWidth = selectedStep === node.id ? 3 : 1;
      ctx.strokeRect(x, y, width, height);

      // Node text
      ctx.fillStyle = '#1f2937';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      const text = node.label.length > 12 ? node.label.substring(0, 12) + '...' : node.label;
      ctx.fillText(text, x + width/2, y + height/2 + 4);

      // Confidence indicator
      ctx.fillStyle = getConfidenceColor(node.confidence);
      ctx.fillRect(x + width - 10, y, 10, height * node.confidence);
    });
  };

  const getNodeColor = (type: string, confidence: number): string => {
    const alpha = Math.max(0.3, confidence);
    switch (type) {
      case 'observation': return `rgba(59, 130, 246, ${alpha})`;
      case 'hypothesis': return `rgba(245, 158, 11, ${alpha})`;
      case 'analysis': return `rgba(139, 92, 246, ${alpha})`;
      case 'conclusion': return `rgba(16, 185, 129, ${alpha})`;
      case 'decision': return `rgba(239, 68, 68, ${alpha})`;
      default: return `rgba(107, 114, 128, ${alpha})`;
    }
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return '#10b981';
    if (confidence >= 0.6) return '#f59e0b';
    return '#ef4444';
  };

  const getStepIcon = (type: string): string => {
    switch (type) {
      case 'observation': return '👁️';
      case 'hypothesis': return '💡';
      case 'analysis': return '🔍';
      case 'conclusion': return '✅';
      case 'decision': return '⚡';
      case 'reflection': return '🤔';
      default: return '📋';
    }
  };

  const getInsightIcon = (type: string): string => {
    switch (type) {
      case 'pattern': return '🔗';
      case 'contradiction': return '⚠️';
      case 'gap': return '🕳️';
      case 'breakthrough': return '🎯';
      case 'optimization': return '⚡';
      default: return '💡';
    }
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    return `${(seconds / 60).toFixed(1)}m`;
  };

  const formatCurrency = (amount: number): string => `$${amount.toFixed(4)}`;

  const activeSessionData = sessions.find(s => s.id === activeSession);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">DeepSeek R1 Reasoning</h1>
        <Badge variant="outline">
          Transparent Thinking & Step-by-Step Analysis
        </Badge>
      </div>

      {/* Start New Reasoning */}
      <Card>
        <CardHeader>
          <CardTitle>Start Transparent Reasoning</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Problem Statement
            </label>
            <Textarea
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder="Describe the problem you want to reason through..."
              className="w-full h-20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Goal
            </label>
            <Textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What do you want to achieve?"
              className="w-full h-16"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reasoning Approach
            </label>
            <select
              value={approach}
              onChange={(e) => setApproach(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="analytical">Analytical - Systematic evidence-based analysis</option>
              <option value="creative">Creative - Multiple perspectives and innovation</option>
              <option value="logical">Logical - Step-by-step logical deduction</option>
              <option value="strategic">Strategic - Long-term strategic thinking</option>
            </select>
          </div>

          <Button 
            onClick={startReasoning}
            disabled={loading || !problem.trim() || !goal.trim()}
            className="w-full"
          >
            {loading ? 'Starting Reasoning...' : 'Start Transparent Reasoning'}
          </Button>
        </CardContent>
      </Card>

      {/* Session List and Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sessions List */}
        <Card>
          <CardHeader>
            <CardTitle>Reasoning Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    activeSession === session.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setActiveSession(session.id)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-sm truncate flex-1">
                      {session.problem.substring(0, 60)}...
                    </h4>
                    <Badge className={`ml-2 ${
                      session.status === 'completed' ? 'bg-green-500' :
                      session.status === 'error' ? 'bg-red-500' : 'bg-blue-500'
                    } text-white`}>
                      {session.status}
                    </Badge>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{session.steps.length} steps</span>
                      <span>{Math.round(session.confidence * 100)}% confidence</span>
                    </div>
                    <Progress value={session.confidence * 100} className="h-1" />
                  </div>
                  
                  <div className="text-xs text-gray-400 mt-1">
                    Cost: {formatCurrency(session.totalCost)}
                  </div>
                </div>
              ))}
              
              {sessions.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No reasoning sessions yet. Start one above!
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Session Details */}
        <div className="lg:col-span-2">
          {activeSessionData ? (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle>Reasoning Analysis</CardTitle>
                  <div className="flex space-x-2">
                    {(['steps', 'flowchart', 'timeline', 'insights'] as const).map((mode) => (
                      <Button
                        key={mode}
                        variant={viewMode === mode ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setViewMode(mode)}
                      >
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Problem and Goal */}
                <div className="mb-6 space-y-2">
                  <div>
                    <span className="text-sm font-medium text-gray-500">Problem:</span>
                    <p className="text-sm mt-1 bg-gray-50 p-2 rounded">{activeSessionData.problem}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Goal:</span>
                    <p className="text-sm mt-1 bg-gray-50 p-2 rounded">{activeSessionData.goal}</p>
                  </div>
                </div>

                {/* View Content */}
                {viewMode === 'steps' && (
                  <div className="space-y-4">
                    {activeSessionData.steps.map((step, index) => (
                      <div
                        key={step.id}
                        className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                          selectedStep === step.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}
                        onClick={() => setSelectedStep(selectedStep === step.id ? null : step.id)}
                      >
                        <div className="flex items-start space-x-3">
                          <span className="text-lg">{getStepIcon(step.type)}</span>
                          <div className="flex-1">
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-medium">
                                Step {index + 1}: {step.type.charAt(0).toUpperCase() + step.type.slice(1)}
                              </h4>
                              <div className="flex items-center space-x-2">
                                <Badge variant="outline">
                                  {Math.round(step.confidence * 100)}% confidence
                                </Badge>
                                <div className={`w-3 h-3 rounded-full ${getConfidenceColor(step.confidence)}`}></div>
                              </div>
                            </div>
                            
                            <p className="text-sm text-gray-700 mb-3">{step.content}</p>
                            
                            {selectedStep === step.id && (
                              <div className="space-y-3 border-t pt-3">
                                {step.evidence.length > 0 && (
                                  <div>
                                    <span className="text-xs font-medium text-gray-500">Evidence:</span>
                                    <ul className="text-xs text-gray-600 mt-1 list-disc list-inside">
                                      {step.evidence.map((evidence, idx) => (
                                        <li key={idx}>{evidence}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                
                                {step.alternatives && step.alternatives.length > 0 && (
                                  <div>
                                    <span className="text-xs font-medium text-gray-500">Alternatives Considered:</span>
                                    <ul className="text-xs text-gray-600 mt-1 list-disc list-inside">
                                      {step.alternatives.map((alt, idx) => (
                                        <li key={idx}>{alt}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                
                                <div>
                                  <span className="text-xs font-medium text-gray-500">Reasoning Chain:</span>
                                  <p className="text-xs text-gray-600 mt-1">{step.reasoning_chain}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {viewMode === 'flowchart' && (
                  <div className="space-y-4">
                    <div className="text-center">
                      <canvas
                        ref={canvasRef}
                        width={600}
                        height={400}
                        className="border border-gray-200 rounded-lg mx-auto"
                        onClick={(e) => {
                          // Handle canvas clicks to select nodes
                          const rect = canvasRef.current?.getBoundingClientRect();
                          if (rect && activeSessionData.flowChart) {
                            const x = e.clientX - rect.left;
                            const y = e.clientY - rect.top;
                            
                            const clickedNode = activeSessionData.flowChart.find(node => 
                              x >= node.position.x && x <= node.position.x + 100 &&
                              y >= node.position.y && y <= node.position.y + 50
                            );
                            
                            if (clickedNode) {
                              setSelectedStep(clickedNode.id);
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 text-center">
                      Click on nodes to see details. Confidence shown as colored bar on right.
                    </div>
                  </div>
                )}

                {viewMode === 'timeline' && (
                  <div className="space-y-3">
                    {activeSessionData.timeline.map((event, index) => (
                      <div key={index} className="flex items-start space-x-3 pb-3 border-b border-gray-100 last:border-b-0">
                        <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${
                          event.impact === 'high' ? 'bg-green-500' :
                          event.impact === 'medium' ? 'bg-yellow-500' : 'bg-gray-400'
                        }`}></div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <p className="text-sm">{event.description}</p>
                            <span className="text-xs text-gray-500">
                              {new Date(event.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <Badge variant="outline" className="text-xs mt-1">
                            {event.type.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {viewMode === 'insights' && (
                  <div className="space-y-4">
                    {/* Statistics */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{activeSessionData.statistics.totalSteps}</div>
                        <div className="text-xs text-gray-500">Total Steps</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {Math.round(activeSessionData.statistics.averageConfidence * 100)}%
                        </div>
                        <div className="text-xs text-gray-500">Avg Confidence</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">{activeSessionData.statistics.reasoningDepth}</div>
                        <div className="text-xs text-gray-500">Reasoning Depth</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">
                          {activeSessionData.statistics.branchingFactor.toFixed(1)}
                        </div>
                        <div className="text-xs text-gray-500">Branching Factor</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">
                          {formatTime(activeSessionData.statistics.timeToConclusion)}
                        </div>
                        <div className="text-xs text-gray-500">Time to Conclusion</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-600">
                          {formatCurrency(activeSessionData.statistics.costEfficiency)}
                        </div>
                        <div className="text-xs text-gray-500">Cost per Step</div>
                      </div>
                    </div>

                    {/* Insights */}
                    <div className="space-y-3">
                      <h4 className="font-medium">Reasoning Insights</h4>
                      {activeSessionData.insights.map((insight, index) => (
                        <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                          <span className="text-lg">{getInsightIcon(insight.type)}</span>
                          <div className="flex-1">
                            <div className="flex justify-between items-start mb-1">
                              <h5 className="font-medium text-sm capitalize">{insight.type}</h5>
                              <div className="flex items-center space-x-2">
                                <Badge variant={insight.actionable ? 'default' : 'secondary'} className="text-xs">
                                  {insight.actionable ? 'Actionable' : 'Informational'}
                                </Badge>
                                <span className="text-xs text-gray-500">
                                  {Math.round(insight.relevance * 100)}% relevant
                                </span>
                              </div>
                            </div>
                            <p className="text-sm text-gray-700">{insight.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Final Conclusion */}
                    {activeSessionData.finalConclusion && (
                      <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <h4 className="font-medium text-green-800 mb-2">Final Conclusion</h4>
                        <p className="text-sm text-green-700">{activeSessionData.finalConclusion}</p>
                        <div className="mt-2 text-xs text-green-600">
                          Overall Confidence: {Math.round(activeSessionData.confidence * 100)}%
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <div className="text-gray-500 mb-4">
                  <div className="text-4xl mb-2">🧠</div>
                  <h3 className="text-lg font-medium">Select a Reasoning Session</h3>
                  <p className="text-sm">Choose a session from the list to view transparent thinking analysis</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}