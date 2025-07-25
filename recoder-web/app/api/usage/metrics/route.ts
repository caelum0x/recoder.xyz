/**
 * Usage Metrics API for Cost Monitoring Dashboard
 * 
 * Provides real-time usage tracking and cost optimization insights
 */

import { NextRequest, NextResponse } from 'next/server';

interface UsageRecord {
  id: string;
  userId: string;
  model: string;
  cost: number;
  tokens: number;
  requestType: string;
  timestamp: Date;
}

interface UsageMetrics {
  totalCost: number;
  dailyCost: number;
  weeklyCost: number;
  monthlyCost: number;
  requestCount: number;
  tokenUsage: number;
  currentMargin: number;
  projectedMargin: number;
  costByModel: { [model: string]: number };
  costByDay: { date: string; cost: number }[];
  recommendations: OptimizationRecommendation[];
}

interface OptimizationRecommendation {
  type: 'model_switch' | 'context_caching' | 'batch_processing' | 'tier_upgrade';
  description: string;
  potentialSavings: number;
  implementationEffort: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
}

// Simulated usage data - replace with actual database queries
const generateMockUsageData = (timeframe: string): UsageRecord[] => {
  const now = new Date();
  const records: UsageRecord[] = [];
  
  const days = timeframe === '24h' ? 1 : timeframe === '7d' ? 7 : 30;
  const recordsPerDay = timeframe === '24h' ? 24 : 10;
  
  // Model distribution based on cost optimization strategy
  const models = [
    { name: 'meta-llama/llama-3.3-70b-instruct', cost: 0.0004, weight: 0.5 }, // 50% usage
    { name: 'qwen/qwen-3-coder-480b', cost: 0.0008, weight: 0.3 }, // 30% usage  
    { name: 'moonshot/kimi-k2', cost: 0.0025, weight: 0.15 }, // 15% usage
    { name: 'deepseek/deepseek-r1', cost: 0.0022, weight: 0.04 }, // 4% usage
    { name: 'anthropic/claude-3.5-sonnet', cost: 0.015, weight: 0.01 }, // 1% usage
  ];
  
  for (let day = 0; day < days; day++) {
    for (let record = 0; record < recordsPerDay; record++) {
      const date = new Date(now);
      date.setDate(date.getDate() - day);
      date.setHours(Math.floor(Math.random() * 24));
      
      // Select model based on weight distribution
      const rand = Math.random();
      let cumulative = 0;
      let selectedModel = models[0];
      
      for (const model of models) {
        cumulative += model.weight;
        if (rand <= cumulative) {
          selectedModel = model;
          break;
        }
      }
      
      const tokens = Math.floor(Math.random() * 2000) + 500;
      const cost = selectedModel.cost * (tokens / 1000) * (0.8 + Math.random() * 0.4); // Add variance
      
      records.push({
        id: `record_${day}_${record}`,
        userId: 'user_1',
        model: selectedModel.name,
        cost,
        tokens,
        requestType: ['code-generation', 'reasoning', 'analysis', 'review'][Math.floor(Math.random() * 4)],
        timestamp: date,
      });
    }
  }
  
  return records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};

const calculateMetrics = (records: UsageRecord[], timeframe: string): UsageMetrics => {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  // Filter records by timeframe
  const dailyRecords = records.filter(r => r.timestamp >= oneDayAgo);
  const weeklyRecords = records.filter(r => r.timestamp >= oneWeekAgo);
  const monthlyRecords = records.filter(r => r.timestamp >= oneMonthAgo);
  
  // Calculate costs
  const totalCost = records.reduce((sum, r) => sum + r.cost, 0);
  const dailyCost = dailyRecords.reduce((sum, r) => sum + r.cost, 0);
  const weeklyCost = weeklyRecords.reduce((sum, r) => sum + r.cost, 0);
  const monthlyCost = monthlyRecords.reduce((sum, r) => sum + r.cost, 0);
  
  // Calculate totals
  const requestCount = records.length;
  const tokenUsage = records.reduce((sum, r) => sum + r.tokens, 0);
  
  // Calculate margins (assuming $20 monthly plan)
  const monthlyRevenue = 20;
  const currentMargin = Math.max(0, (monthlyRevenue - monthlyCost) / monthlyRevenue);
  
  // Cost by model
  const costByModel: { [model: string]: number } = {};
  records.forEach(record => {
    const modelName = record.model.split('/').pop() || record.model;
    costByModel[modelName] = (costByModel[modelName] || 0) + record.cost;
  });
  
  // Cost by day
  const costByDay: { date: string; cost: number }[] = [];
  const days = timeframe === '24h' ? 1 : timeframe === '7d' ? 7 : 30;
  
  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    
    const dayCost = records
      .filter(r => r.timestamp >= dayStart && r.timestamp < dayEnd)
      .reduce((sum, r) => sum + r.cost, 0);
    
    costByDay.unshift({
      date: dayStart.toISOString().split('T')[0],
      cost: dayCost,
    });
  }
  
  // Generate optimization recommendations
  const recommendations: OptimizationRecommendation[] = [];
  
  // High-cost model usage recommendation
  const claudeCost = costByModel['claude-3.5-sonnet'] || 0;
  if (claudeCost > monthlyCost * 0.3) {
    recommendations.push({
      type: 'model_switch',
      description: 'Switch complex reasoning tasks to DeepSeek R1 (60% cost reduction)',
      potentialSavings: claudeCost * 0.6,
      implementationEffort: 'low',
      riskLevel: 'low',
    });
  }
  
  // Context caching recommendation
  if (requestCount > 100) {
    recommendations.push({
      type: 'context_caching',
      description: 'Enable context caching for repeated queries (50-90% savings)',
      potentialSavings: monthlyCost * 0.4,
      implementationEffort: 'medium',
      riskLevel: 'low',
    });
  }
  
  // Batch processing recommendation
  if (requestCount > 500) {
    recommendations.push({
      type: 'batch_processing',
      description: 'Batch similar requests to reduce API overhead (20% savings)',
      potentialSavings: monthlyCost * 0.2,
      implementationEffort: 'medium',
      riskLevel: 'low',
    });
  }
  
  // Calculate projected margin with optimizations
  const totalPotentialSavings = recommendations.reduce((sum, r) => sum + r.potentialSavings, 0);
  const optimizedCost = Math.max(1, monthlyCost - totalPotentialSavings * 0.7); // 70% implementation rate
  const projectedMargin = (monthlyRevenue - optimizedCost) / monthlyRevenue;
  
  return {
    totalCost,
    dailyCost,
    weeklyCost,
    monthlyCost,
    requestCount,
    tokenUsage,
    currentMargin,
    projectedMargin,
    costByModel,
    costByDay,
    recommendations,
  };
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe') || '7d';
    
    // Validate timeframe
    if (!['24h', '7d', '30d'].includes(timeframe)) {
      return NextResponse.json(
        { error: 'Invalid timeframe. Must be 24h, 7d, or 30d' },
        { status: 400 }
      );
    }
    
    // TODO: Replace with actual database queries
    // const userId = await getCurrentUserId(request);
    // const records = await getUserUsageRecords(userId, timeframe);
    
    // For now, use mock data
    const records = generateMockUsageData(timeframe);
    const metrics = calculateMetrics(records, timeframe);
    
    return NextResponse.json(metrics);
  } catch (error) {
    console.error('Error fetching usage metrics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model, cost, tokens, requestType } = body;
    
    // TODO: Store usage record in database
    // await storeUsageRecord({
    //   userId: await getCurrentUserId(request),
    //   model,
    //   cost,
    //   tokens,
    //   requestType,
    //   timestamp: new Date(),
    // });
    
    console.log('Usage tracked:', { model, cost, tokens, requestType });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error tracking usage:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}