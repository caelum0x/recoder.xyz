/**
 * Agentic Workflow Interface for Recoder.xyz
 * 
 * Interactive interface for managing AI agent workflows with Kimi K2
 * Provides real-time monitoring and tool call visualization
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface WorkflowStep {
  id: string;
  type: 'analysis' | 'tool_call' | 'decision' | 'generation' | 'validation';
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: any;
  cost?: number;
  timestamp?: string;
}

interface AgentCapability {
  name: string;
  description: string;
  models: string[];
  tools: string[];
  useCases: string[];
  complexity: 'low' | 'medium' | 'high';
}

interface WorkflowSession {
  id: string;
  goal: string;
  status: 'running' | 'completed' | 'error';
  progress: number;
  steps: WorkflowStep[];
  reasoning: string[];
  totalCost: number;
  startTime: string;
  endTime?: string;
}

export default function AgenticWorkflowInterface() {
  const [sessions, setSessions] = useState<WorkflowSession[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [goal, setGoal] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('research');
  const [loading, setLoading] = useState(false);
  const [capabilities, setCapabilities] = useState<AgentCapability[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCapabilities();
    loadActiveSessions();
    
    // Set up polling for active sessions
    const interval = setInterval(loadActiveSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Auto-scroll logs
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const loadCapabilities = async () => {
    try {
      const response = await fetch('/api/agents/capabilities');
      if (response.ok) {
        const data = await response.json();
        setCapabilities(data);
      }
    } catch (error) {
      console.error('Failed to load capabilities:', error);
    }
  };

  const loadActiveSessions = async () => {
    try {
      const response = await fetch('/api/agents/sessions');
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
        
        // Update logs with new activity
        data.forEach((session: WorkflowSession) => {
          if (session.reasoning) {
            session.reasoning.forEach(reasoning => {
              const logEntry = `[${session.id}] ${reasoning}`;
              if (!logs.includes(logEntry)) {
                setLogs(prev => [...prev, logEntry]);
              }
            });
          }
        });
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const startWorkflow = async () => {
    if (!goal.trim()) return;
    
    try {
      setLoading(true);
      const response = await fetch('/api/agents/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          agentType: selectedAgent,
          options: {
            maxSteps: 10,
            timeout: 300000 // 5 minutes
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        setActiveSession(data.sessionId);
        setGoal('');
        setLogs(prev => [...prev, `Started workflow: ${goal}`]);
        loadActiveSessions();
      }
    } catch (error) {
      console.error('Failed to start workflow:', error);
      setLogs(prev => [...prev, `Error starting workflow: ${error instanceof Error ? error.message : 'Unknown error'}`]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'running': return 'bg-blue-500';
      case 'error': return 'bg-red-500';
      case 'pending': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'analysis': return '🔍';
      case 'tool_call': return '🛠️';
      case 'decision': return '🤔';
      case 'generation': return '⚡';
      case 'validation': return '✅';
      default: return '📋';
    }
  };

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Agentic Workflows</h1>
        <Badge variant="outline">
          Powered by Kimi K2 & Multi-AI
        </Badge>
      </div>

      {/* Agent Selection & Goal Input */}
      <Card>
        <CardHeader>
          <CardTitle>Start New Agentic Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Agent Type
            </label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="research">Research Agent</option>
              <option value="code-analysis">Code Analysis Agent</option>
              <option value="code-generation">Code Generation Agent</option>
              <option value="decision-making">Decision Making Agent</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Goal Description
            </label>
            <Textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Describe what you want the AI agent to accomplish..."
              className="w-full h-24"
            />
          </div>

          <Button 
            onClick={startWorkflow}
            disabled={loading || !goal.trim()}
            className="w-full"
          >
            {loading ? 'Starting Workflow...' : 'Start Agentic Workflow'}
          </Button>
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sessions List */}
        <Card>
          <CardHeader>
            <CardTitle>Active Workflows</CardTitle>
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
                      {session.goal}
                    </h4>
                    <Badge className={`ml-2 ${getStatusColor(session.status)} text-white`}>
                      {session.status}
                    </Badge>
                  </div>
                  
                  <div className="space-y-1">
                    <Progress value={session.progress * 100} className="h-2" />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{Math.round(session.progress * 100)}% complete</span>
                      <span>{formatCost(session.totalCost)}</span>
                    </div>
                  </div>
                  
                  <div className="text-xs text-gray-400 mt-1">
                    Started: {new Date(session.startTime).toLocaleTimeString()}
                  </div>
                </div>
              ))}
              
              {sessions.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No active workflows. Start one above!
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Session Details */}
        <Card>
          <CardHeader>
            <CardTitle>
              {activeSession ? 'Workflow Details' : 'Select a Workflow'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeSession ? (
              <div className="space-y-4">
                {(() => {
                  const session = sessions.find(s => s.id === activeSession);
                  if (!session) return <div>Session not found</div>;

                  return (
                    <>
                      <div>
                        <h4 className="font-medium mb-2">Goal</h4>
                        <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                          {session.goal}
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Steps</h4>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {session.steps.map((step, index) => (
                            <div
                              key={step.id}
                              className="flex items-center space-x-3 p-2 border border-gray-200 rounded"
                            >
                              <span className="text-lg">{getStepIcon(step.type)}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {step.description}
                                </p>
                                <div className="flex items-center space-x-2 text-xs text-gray-500">
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs ${getStatusColor(step.status)} text-white`}
                                  >
                                    {step.status}
                                  </Badge>
                                  {step.cost && <span>{formatCost(step.cost)}</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Summary</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Status:</span>
                            <Badge className={`ml-2 ${getStatusColor(session.status)} text-white`}>
                              {session.status}
                            </Badge>
                          </div>
                          <div>
                            <span className="text-gray-500">Cost:</span>
                            <span className="ml-2 font-medium">{formatCost(session.totalCost)}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Steps:</span>
                            <span className="ml-2">{session.steps.length}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Progress:</span>
                            <span className="ml-2">{Math.round(session.progress * 100)}%</span>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Select a workflow from the list to view details
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agent Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle>Available Agent Capabilities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {capabilities.map((capability, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium">{capability.name}</h4>
                  <Badge variant={capability.complexity === 'high' ? 'destructive' : 'outline'}>
                    {capability.complexity}
                  </Badge>
                </div>
                
                <p className="text-sm text-gray-600 mb-3">
                  {capability.description}
                </p>
                
                <div className="space-y-2">
                  <div>
                    <span className="text-xs font-medium text-gray-500">Models:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {capability.models.map((model, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {model.split('/').pop()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <span className="text-xs font-medium text-gray-500">Use Cases:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {capability.useCases.map((useCase, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {useCase}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Real-time Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Real-time Agent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-black text-green-400 font-mono text-sm p-4 rounded h-64 overflow-y-auto">
            {logs.map((log, index) => (
              <div key={index} className="mb-1">
                <span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span> {log}
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-gray-500">Waiting for agent activity...</div>
            )}
            <div ref={logsEndRef} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}