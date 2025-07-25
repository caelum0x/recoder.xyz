/**
 * Reasoning Sessions API
 * 
 * Manages DeepSeek R1 reasoning sessions and provides visualization data
 */

import { NextRequest, NextResponse } from 'next/server';
import { activeSessions } from '../start/route';

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    
    if (sessionId) {
      // Get specific session with visualization data
      const session = activeSessions.get(sessionId);
      if (!session) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        );
      }
      
      const visualizationData = generateVisualizationData(session);
      return NextResponse.json(visualizationData);
    } else {
      // Get all sessions with basic visualization data
      const sessions = Array.from(activeSessions.values()).map(session => {
        const visualizationData = generateVisualizationData(session);
        return visualizationData;
      });
      
      return NextResponse.json(sessions);
    }

  } catch (error) {
    console.error('Error fetching reasoning sessions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function generateVisualizationData(session: any) {
  const flowChart = generateFlowChart(session.steps);
  const timeline = generateTimeline(session.steps);
  const insights = generateInsights(session.steps);
  const statistics = calculateStatistics(session);
  const finalConclusion = extractFinalConclusion(session.steps);

  return {
    id: session.id,
    problem: session.problem,
    goal: session.goal,
    status: session.status,
    steps: session.steps,
    flowChart,
    timeline,
    insights,
    statistics,
    finalConclusion,
    confidence: session.confidence || calculateOverallConfidence(session.steps),
    totalCost: session.totalCost,
    startTime: session.startTime,
    endTime: session.endTime
  };
}

function generateFlowChart(steps: any[]): ReasoningNode[] {
  const nodes: ReasoningNode[] = [];
  const nodeWidth = 120;
  const nodeHeight = 60;
  const levelHeight = 100;
  const horizontalSpacing = 150;
  
  // Group steps by type for better layout
  const stepsByType = new Map();
  steps.forEach((step, index) => {
    if (!stepsByType.has(step.type)) {
      stepsByType.set(step.type, []);
    }
    stepsByType.get(step.type).push({ ...step, originalIndex: index });
  });
  
  let currentY = 50;
  let levelIndex = 0;
  
  // Layout nodes by reasoning flow
  const typeOrder = ['observation', 'hypothesis', 'analysis', 'reflection', 'decision', 'conclusion'];
  
  typeOrder.forEach(type => {
    const stepsOfType = stepsByType.get(type) || [];
    if (stepsOfType.length === 0) return;
    
    stepsOfType.forEach((step, indexInType) => {
      const x = 50 + (indexInType * horizontalSpacing);
      const y = currentY;
      
      const node: ReasoningNode = {
        id: step.id,
        label: `${type}: ${step.content.substring(0, 30)}...`,
        type: step.type,
        position: { x, y },
        connections: step.dependencies || [],
        confidence: step.confidence,
        status: 'completed'
      };
      
      nodes.push(node);
    });
    
    if (stepsOfType.length > 0) {
      currentY += levelHeight;
      levelIndex++;
    }
  });
  
  return nodes;
}

function generateTimeline(steps: any[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  
  steps.forEach(step => {
    const impactLevel = step.confidence > 0.8 ? 'high' : 
                      step.confidence > 0.6 ? 'medium' : 'low';
    
    events.push({
      timestamp: step.timestamp,
      step: step.id,
      description: `${step.type.charAt(0).toUpperCase() + step.type.slice(1)}: ${step.content.substring(0, 80)}...`,
      type: step.type === 'conclusion' || step.type === 'decision' ? 'decision' : 'step_complete',
      impact: impactLevel
    });
  });
  
  return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function generateInsights(steps: any[]): ReasoningInsight[] {
  const insights: ReasoningInsight[] = [];
  
  if (steps.length === 0) return insights;
  
  // Analyze confidence trends
  const confidenceValues = steps.map(s => s.confidence);
  const isIncreasing = isIncreasingTrend(confidenceValues);
  
  if (isIncreasing) {
    insights.push({
      type: 'pattern',
      description: 'Confidence steadily increased throughout the reasoning process, indicating strong logical progression',
      relevance: 0.85,
      actionable: false,
      relatedSteps: steps.map(s => s.id)
    });
  } else {
    const lowConfidenceSteps = steps.filter(s => s.confidence < 0.6);
    if (lowConfidenceSteps.length > 0) {
      insights.push({
        type: 'gap',
        description: `${lowConfidenceSteps.length} reasoning steps have lower confidence, suggesting areas that need more evidence`,
        relevance: 0.7,
        actionable: true,
        relatedSteps: lowConfidenceSteps.map(s => s.id)
      });
    }
  }
  
  // Check for multiple conclusions or decisions
  const conclusions = steps.filter(s => s.type === 'conclusion' || s.type === 'decision');
  if (conclusions.length > 1) {
    insights.push({
      type: 'contradiction',
      description: 'Multiple conclusions reached - consider consolidating or choosing the strongest one',
      relevance: 0.9,
      actionable: true,
      relatedSteps: conclusions.map(s => s.id)
    });
  }
  
  // Look for reasoning depth
  const maxDependencies = Math.max(...steps.map(s => (s.dependencies || []).length));
  if (maxDependencies >= 3) {
    insights.push({
      type: 'pattern',
      description: 'Deep reasoning chains detected - shows thorough analytical thinking',
      relevance: 0.8,
      actionable: false,
      relatedSteps: steps.filter(s => (s.dependencies || []).length >= 2).map(s => s.id)
    });
  }
  
  // Check for alternatives consideration
  const stepsWithAlternatives = steps.filter(s => s.alternatives && s.alternatives.length > 0);
  if (stepsWithAlternatives.length > 0) {
    insights.push({
      type: 'optimization',
      description: 'Alternative options were considered, demonstrating comprehensive analysis',
      relevance: 0.75,
      actionable: false,
      relatedSteps: stepsWithAlternatives.map(s => s.id)
    });
  }
  
  // Look for potential breakthroughs (high confidence jumps)
  for (let i = 1; i < steps.length; i++) {
    const confidenceJump = steps[i].confidence - steps[i-1].confidence;
    if (confidenceJump > 0.3) {
      insights.push({
        type: 'breakthrough',
        description: `Significant confidence increase at step ${i+1} suggests a key insight was reached`,
        relevance: 0.8,
        actionable: false,
        relatedSteps: [steps[i].id]
      });
      break; // Only report the first major breakthrough
    }
  }
  
  return insights;
}

function calculateStatistics(session: any): ReasoningStats {
  const steps = session.steps;
  if (steps.length === 0) {
    return {
      totalSteps: 0,
      averageConfidence: 0,
      reasoningDepth: 0,
      branchingFactor: 0,
      timeToConclusion: 0,
      costEfficiency: 0
    };
  }
  
  const startTime = new Date(session.startTime).getTime();
  const endTime = session.endTime ? new Date(session.endTime).getTime() : Date.now();
  const timeToConclusion = (endTime - startTime) / 1000; // seconds
  
  const averageConfidence = steps.reduce((sum: number, step: any) => sum + step.confidence, 0) / steps.length;
  
  const maxDepth = Math.max(...steps.map((step: any) => (step.dependencies || []).length + 1));
  
  const totalAlternatives = steps.reduce((sum: number, step: any) => 
    sum + (step.alternatives ? step.alternatives.length : 0), 0);
  const branchingFactor = totalAlternatives / steps.length;
  
  const costEfficiency = session.totalCost / steps.length;
  
  return {
    totalSteps: steps.length,
    averageConfidence,
    reasoningDepth: maxDepth,
    branchingFactor,
    timeToConclusion,
    costEfficiency
  };
}

function extractFinalConclusion(steps: any[]): string {
  // Look for conclusion or decision steps
  const conclusionSteps = steps.filter(s => s.type === 'conclusion' || s.type === 'decision');
  
  if (conclusionSteps.length > 0) {
    // Return the last conclusion
    return conclusionSteps[conclusionSteps.length - 1].content;
  }
  
  // Fallback to the last step if no explicit conclusion
  if (steps.length > 0) {
    return steps[steps.length - 1].content;
  }
  
  return 'No conclusion reached yet';
}

function calculateOverallConfidence(steps: any[]): number {
  if (steps.length === 0) return 0;
  
  // Weight later steps more heavily as they build on previous reasoning
  let weightedSum = 0;
  let totalWeight = 0;
  
  steps.forEach((step: any, index: number) => {
    const weight = index + 1; // Later steps have higher weight
    weightedSum += step.confidence * weight;
    totalWeight += weight;
  });
  
  return weightedSum / totalWeight;
}

function isIncreasingTrend(values: number[]): boolean {
  if (values.length < 2) return false;
  
  let increasingCount = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) {
      increasingCount++;
    }
  }
  
  // Consider it an increasing trend if more than 60% of transitions are increases
  return increasingCount / (values.length - 1) > 0.6;
}