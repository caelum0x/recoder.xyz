/**
 * Advanced Usage Tracking & Cost Monitoring System
 * Tracks usage, costs, and provides detailed analytics for cost optimization
 */

import { Logger } from 'recoder-shared';
import { ConfigManager } from '../utils/config';
import { AuthService } from './auth';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export interface TokenStructure {
  userId: string;
  tier: 'free' | 'premium' | 'pro' | 'enterprise';
  tokenLimit: number;
  tokensUsed: number;
  requestsUsed: number;
  requestLimit: number;
  resetDate: string;
  features: string[];
  costTracking: {
    estimatedMonthlyCost: number;
    actualCosts: number;
    savingsFromOptimization: number;
  };
}

export interface UsageSession {
  id: string;
  timestamp: string;
  command: string;
  agent: string;
  modelUsed: string;
  tokensUsed: number;
  cost: number;
  success: boolean;
  executionTime: number;
  userTier: string;
}

export interface CostBreakdown {
  totalCost: number;
  modelCosts: Record<string, number>;
  agentUsage: Record<string, number>;
  dailySpend: Array<{ date: string; cost: number; tokens: number }>;
  projectedMonthlyCost: number;
  optimizationSavings: number;
}

export class UsageTracker {
  private usageFile: string;
  private sessionsFile: string;
  private currentSession: UsageSession | null = null;

  constructor() {
    const configDir = path.join(os.homedir(), '.recoder');
    this.usageFile = path.join(configDir, 'usage.json');
    this.sessionsFile = path.join(configDir, 'sessions.json');
  }

  /**
   * Initialize usage tracking for a command session
   */
  async startSession(command: string, agent: string): Promise<string> {
    const tokenData = this.getCurrentTokenData();
    
    this.currentSession = {
      id: this.generateSessionId(),
      timestamp: new Date().toISOString(),
      command,
      agent,
      modelUsed: '', // Will be set when model is selected
      tokensUsed: 0,
      cost: 0,
      success: false,
      executionTime: 0,
      userTier: tokenData.tier
    };

    Logger.debug(`Started usage session: ${this.currentSession.id}`);
    return this.currentSession.id;
  }

  /**
   * Update session with model selection and usage details
   */
  async updateSession(modelUsed: string, tokensUsed: number, cost: number): Promise<void> {
    if (!this.currentSession) {
      Logger.warn('No active session to update');
      return;
    }

    this.currentSession.modelUsed = modelUsed;
    this.currentSession.tokensUsed = tokensUsed;
    this.currentSession.cost = cost;
    this.currentSession.executionTime = Date.now() - new Date(this.currentSession.timestamp).getTime();

    // Update local usage data
    await this.updateLocalUsage(tokensUsed, cost, modelUsed);
    
    // Sync with server if authenticated
    await this.syncUsageWithServer(tokensUsed, 1);

    Logger.info(`Usage updated: ${tokensUsed} tokens, $${cost.toFixed(4)} cost using ${modelUsed}`);
  }

  /**
   * Complete the current session
   */
  async endSession(success: boolean = true): Promise<void> {
    if (!this.currentSession) return;

    this.currentSession.success = success;
    this.currentSession.executionTime = Date.now() - new Date(this.currentSession.timestamp).getTime();

    // Save session to history
    await this.saveSession(this.currentSession);
    
    // Display usage summary if verbose
    if (ConfigManager.getPreference('verboseLogging')) {
      await this.displaySessionSummary(this.currentSession);
    }

    this.currentSession = null;
  }

  /**
   * Get current token structure with usage data
   */
  getCurrentTokenData(): TokenStructure {
    const user = ConfigManager.getCurrentUser();
    const localUsage = this.getLocalUsage();

    return {
      userId: user?.id || 'anonymous',
      tier: user?.plan || 'free',
      tokenLimit: this.getTierLimits(user?.plan || 'free').tokens,
      tokensUsed: localUsage.tokensUsed,
      requestsUsed: localUsage.requestsUsed,
      requestLimit: this.getTierLimits(user?.plan || 'free').requests,
      resetDate: localUsage.resetDate,
      features: this.getTierFeatures(user?.plan || 'free'),
      costTracking: {
        estimatedMonthlyCost: localUsage.estimatedMonthlyCost,
        actualCosts: localUsage.actualCosts,
        savingsFromOptimization: localUsage.savingsFromOptimization
      }
    };
  }

  /**
   * Get detailed cost breakdown and analytics
   */
  async getCostBreakdown(): Promise<CostBreakdown> {
    const sessions = await this.loadSessions();
    const last30Days = sessions.filter(s => 
      new Date(s.timestamp) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );

    const totalCost = last30Days.reduce((sum, session) => sum + session.cost, 0);
    
    const modelCosts: Record<string, number> = {};
    const agentUsage: Record<string, number> = {};
    
    for (const session of last30Days) {
      modelCosts[session.modelUsed] = (modelCosts[session.modelUsed] || 0) + session.cost;
      agentUsage[session.agent] = (agentUsage[session.agent] || 0) + session.tokensUsed;
    }

    // Calculate daily spend
    const dailySpend = this.calculateDailySpend(last30Days);
    
    // Project monthly cost based on current usage
    const avgDailyCost = totalCost / Math.min(30, last30Days.length / (24 * 60 * 60 * 1000));
    const projectedMonthlyCost = avgDailyCost * 30;

    // Calculate optimization savings (difference between using premium models vs optimized routing)
    const optimizationSavings = this.calculateOptimizationSavings(last30Days);

    return {
      totalCost,
      modelCosts,
      agentUsage,
      dailySpend,
      projectedMonthlyCost,
      optimizationSavings
    };
  }

  /**
   * Check if user can make a request based on usage limits
   */
  async canMakeRequest(estimatedTokens: number = 1000): Promise<{
    allowed: boolean;
    reason?: string;
    suggestion?: string;
  }> {
    const tokenData = this.getCurrentTokenData();
    
    if (tokenData.tier === 'free') {
      return {
        allowed: true,
        suggestion: 'Using local models only on free tier'
      };
    }

    // Check token limit
    if (tokenData.tokensUsed + estimatedTokens > tokenData.tokenLimit) {
      return {
        allowed: false,
        reason: `Token limit exceeded (${tokenData.tokensUsed}/${tokenData.tokenLimit})`,
        suggestion: 'Upgrade plan or wait for monthly reset'
      };
    }

    // Check request limit
    if (tokenData.requestsUsed >= tokenData.requestLimit) {
      return {
        allowed: false,
        reason: `Request limit exceeded (${tokenData.requestsUsed}/${tokenData.requestLimit})`,
        suggestion: 'Upgrade plan or wait for monthly reset'
      };
    }

    // Check if approaching limits (warn at 80%)
    const tokenUsagePercent = (tokenData.tokensUsed / tokenData.tokenLimit) * 100;
    const requestUsagePercent = (tokenData.requestsUsed / tokenData.requestLimit) * 100;

    if (tokenUsagePercent > 80 || requestUsagePercent > 80) {
      return {
        allowed: true,
        suggestion: `High usage detected (${Math.max(tokenUsagePercent, requestUsagePercent).toFixed(0)}%). Consider upgrading.`
      };
    }

    return { allowed: true };
  }

  /**
   * Display detailed usage analytics
   */
  async displayUsageAnalytics(): Promise<void> {
    const tokenData = this.getCurrentTokenData();
    const costBreakdown = await this.getCostBreakdown();

    console.log('\n📊 Usage Analytics');
    console.log('='.repeat(50));
    
    console.log(`👤 User: ${tokenData.userId}`);
    console.log(`📦 Tier: ${tokenData.tier.toUpperCase()}`);
    console.log(`🎯 Tokens: ${tokenData.tokensUsed.toLocaleString()} / ${tokenData.tokenLimit.toLocaleString()}`);
    console.log(`📞 Requests: ${tokenData.requestsUsed.toLocaleString()} / ${tokenData.requestLimit.toLocaleString()}`);
    console.log(`📅 Reset Date: ${new Date(tokenData.resetDate).toLocaleDateString()}`);
    
    console.log('\n💰 Cost Breakdown (Last 30 Days)');
    console.log('-'.repeat(30));
    console.log(`Total Spent: $${costBreakdown.totalCost.toFixed(2)}`);
    console.log(`Projected Monthly: $${costBreakdown.projectedMonthlyCost.toFixed(2)}`);
    console.log(`Optimization Savings: $${costBreakdown.optimizationSavings.toFixed(2)}`);
    
    console.log('\n🤖 Model Usage');
    console.log('-'.repeat(20));
    Object.entries(costBreakdown.modelCosts).forEach(([model, cost]) => {
      console.log(`${model}: $${cost.toFixed(4)}`);
    });

    console.log('\n🎯 Agent Usage (Tokens)');
    console.log('-'.repeat(25));
    Object.entries(costBreakdown.agentUsage).forEach(([agent, tokens]) => {
      console.log(`${agent}: ${tokens.toLocaleString()}`);
    });

    // Show optimization tips
    this.displayOptimizationTips(costBreakdown);
  }

  /**
   * Reset usage for a new billing period
   */
  async resetUsage(): Promise<void> {
    const resetDate = new Date();
    resetDate.setMonth(resetDate.getMonth() + 1);
    
    const localUsage = {
      tokensUsed: 0,
      requestsUsed: 0,
      resetDate: resetDate.toISOString(),
      estimatedMonthlyCost: 0,
      actualCosts: 0,
      savingsFromOptimization: 0,
      lastUpdated: new Date().toISOString()
    };

    await fs.writeJSON(this.usageFile, localUsage, { spaces: 2 });
    Logger.info('Usage counters reset for new billing period');
  }

  /**
   * Export usage data for analysis
   */
  async exportUsageData(format: 'json' | 'csv' = 'json'): Promise<string> {
    const sessions = await this.loadSessions();
    const costBreakdown = await this.getCostBreakdown();
    const tokenData = this.getCurrentTokenData();

    const exportData = {
      summary: tokenData,
      costBreakdown,
      sessions: sessions.slice(-100) // Last 100 sessions
    };

    const exportDir = path.join(os.homedir(), '.recoder', 'exports');
    await fs.ensureDir(exportDir);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `usage-export-${timestamp}.${format}`;
    const filepath = path.join(exportDir, filename);

    if (format === 'json') {
      await fs.writeJSON(filepath, exportData, { spaces: 2 });
    } else {
      // Convert to CSV format
      const csvContent = this.convertToCSV(sessions);
      await fs.writeFile(filepath, csvContent);
    }

    Logger.info(`Usage data exported to: ${filepath}`);
    return filepath;
  }

  // Private helper methods
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getTierLimits(tier: string): { tokens: number; requests: number } {
    const limits = {
      free: { tokens: 0, requests: 0 },
      premium: { tokens: 400000, requests: 5000 },
      pro: { tokens: 2000000, requests: 25000 },
      enterprise: { tokens: -1, requests: -1 }
    };
    return limits[tier as keyof typeof limits] || limits.free;
  }

  private getTierFeatures(tier: string): string[] {
    const features = {
      free: ['local-models', 'basic-cli'],
      premium: ['agents', 'planning', 'validation', 'cloud-models', 'priority-support'],
      pro: ['all-premium', 'team-collaboration', 'custom-integrations', 'phone-support'],
      enterprise: ['unlimited', 'on-premise', 'sla', 'dedicated-support']
    };
    return features[tier as keyof typeof features] || features.free;
  }

  private getLocalUsage(): any {
    try {
      return fs.readJSONSync(this.usageFile);
    } catch {
      return {
        tokensUsed: 0,
        requestsUsed: 0,
        resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        estimatedMonthlyCost: 0,
        actualCosts: 0,
        savingsFromOptimization: 0,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  private async updateLocalUsage(tokens: number, cost: number, model: string): Promise<void> {
    const usage = this.getLocalUsage();
    
    usage.tokensUsed += tokens;
    usage.requestsUsed += 1;
    usage.actualCosts += cost;
    usage.lastUpdated = new Date().toISOString();

    // Calculate optimization savings
    const premiumModelCost = tokens * (3.0 / 1000000); // Claude Sonnet 4 cost
    const actualCost = cost;
    usage.savingsFromOptimization += Math.max(0, premiumModelCost - actualCost);

    await fs.writeJSON(this.usageFile, usage, { spaces: 2 });
  }

  private async syncUsageWithServer(tokens: number, requests: number): Promise<void> {
    try {
      const token = ConfigManager.getAuthToken();
      if (token) {
        await AuthService.updateUsage(token, tokens, requests);
      }
    } catch (error) {
      Logger.warn('Failed to sync usage with server:', error);
    }
  }

  private async saveSession(session: UsageSession): Promise<void> {
    const sessions = await this.loadSessions();
    sessions.push(session);
    
    // Keep only last 1000 sessions
    if (sessions.length > 1000) {
      sessions.splice(0, sessions.length - 1000);
    }
    
    await fs.writeJSON(this.sessionsFile, sessions, { spaces: 2 });
  }

  private async loadSessions(): Promise<UsageSession[]> {
    try {
      return await fs.readJSON(this.sessionsFile);
    } catch {
      return [];
    }
  }

  private calculateDailySpend(sessions: UsageSession[]): Array<{ date: string; cost: number; tokens: number }> {
    const dailyData: Record<string, { cost: number; tokens: number }> = {};
    
    for (const session of sessions) {
      const date = new Date(session.timestamp).toISOString().split('T')[0];
      
      if (!dailyData[date]) {
        dailyData[date] = { cost: 0, tokens: 0 };
      }
      
      dailyData[date].cost += session.cost;
      dailyData[date].tokens += session.tokensUsed;
    }
    
    return Object.entries(dailyData).map(([date, data]) => ({
      date,
      cost: data.cost,
      tokens: data.tokens
    })).sort((a, b) => a.date.localeCompare(b.date));
  }

  private calculateOptimizationSavings(sessions: UsageSession[]): number {
    let totalSavings = 0;
    
    for (const session of sessions) {
      // Calculate what it would cost with premium model (Claude Sonnet 4)
      const premiumCost = session.tokensUsed * (3.0 / 1000000);
      const actualCost = session.cost;
      
      totalSavings += Math.max(0, premiumCost - actualCost);
    }
    
    return totalSavings;
  }

  private displayOptimizationTips(costBreakdown: CostBreakdown): void {
    console.log('\n💡 Optimization Tips');
    console.log('-'.repeat(20));
    
    if (costBreakdown.optimizationSavings > 0.1) {
      console.log(`✅ Smart routing saved you $${costBreakdown.optimizationSavings.toFixed(2)} this month!`);
    }
    
    // Find most expensive model
    const expensiveModel = Object.entries(costBreakdown.modelCosts)
      .sort(([,a], [,b]) => b - a)[0];
    
    if (expensiveModel && expensiveModel[1] > costBreakdown.totalCost * 0.5) {
      console.log(`💰 ${expensiveModel[0]} accounts for ${((expensiveModel[1] / costBreakdown.totalCost) * 100).toFixed(0)}% of costs`);
      console.log('   Consider using simpler prompts for basic tasks');
    }
    
    if (costBreakdown.projectedMonthlyCost > 15) {
      console.log('🚀 Consider upgrading to Pro for better value at high usage');
    }
  }

  private async displaySessionSummary(session: UsageSession): Promise<void> {
    console.log(`\n📊 Session Summary: ${session.id}`);
    console.log(`⏱️  Duration: ${(session.executionTime / 1000).toFixed(1)}s`);
    console.log(`🤖 Agent: ${session.agent}`);
    console.log(`🧠 Model: ${session.modelUsed}`);
    console.log(`🎯 Tokens: ${session.tokensUsed.toLocaleString()}`);
    console.log(`💰 Cost: $${session.cost.toFixed(4)}`);
    console.log(`✅ Success: ${session.success ? 'Yes' : 'No'}`);
  }

  private convertToCSV(sessions: UsageSession[]): string {
    const headers = ['timestamp', 'command', 'agent', 'model', 'tokens', 'cost', 'success', 'executionTime'];
    const rows = sessions.map(session => [
      session.timestamp,
      session.command.replace(/"/g, '""'),
      session.agent,
      session.modelUsed,
      session.tokensUsed,
      session.cost,
      session.success,
      session.executionTime
    ]);
    
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
}

// Export singleton instance
export const UsageTracker_Instance = new UsageTracker();