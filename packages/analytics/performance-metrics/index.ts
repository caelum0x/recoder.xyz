interface CodeQualityMetric {
  id: string;
  name: string;
  category: 'maintainability' | 'reliability' | 'security' | 'performance' | 'coverage' | 'complexity';
  value: number;
  unit: 'percentage' | 'count' | 'ratio' | 'score' | 'milliseconds' | 'bytes';
  threshold: {
    good: number;
    acceptable: number;
    poor: number;
  };
  trend: 'improving' | 'stable' | 'declining';
  measuredAt: Date;
  source: 'static-analysis' | 'dynamic-analysis' | 'ai-analysis' | 'manual-review';
}

interface PerformanceSnapshot {
  id: string;
  projectId: string;
  timestamp: Date;
  commitHash?: string;
  branch: string;
  environment: 'development' | 'staging' | 'production';
  metrics: {
    codeQuality: CodeQualityMetric[];
    buildPerformance: BuildMetric[];
    testCoverage: CoverageMetric[];
    dependencies: DependencyMetric[];
    security: SecurityMetric[];
    aiUsage: AIUsageMetric[];
  };
  summary: {
    overallScore: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    recommendations: string[];
    blockers: string[];
  };
}

interface BuildMetric {
  stage: 'compile' | 'bundle' | 'test' | 'lint' | 'deploy';
  duration: number; // milliseconds
  success: boolean;
  resourceUsage: {
    cpu: number; // percentage
    memory: number; // MB
    disk: number; // MB
  };
  cacheHitRate: number; // percentage
  parallelization: number; // concurrent processes
  errors: string[];
  warnings: string[];
}

interface CoverageMetric {
  type: 'line' | 'branch' | 'function' | 'statement';
  percentage: number;
  covered: number;
  total: number;
  uncoveredFiles: Array<{
    file: string;
    coverage: number;
    criticalMissing: string[];
  }>;
}

interface DependencyMetric {
  total: number;
  outdated: number;
  vulnerable: number;
  bloat: number; // unused dependencies
  duplicates: number;
  licenses: Record<string, number>;
  bundleSize: {
    total: number; // bytes
    gzipped: number;
    treeshakeable: number;
  };
  loadTime: {
    initial: number; // milliseconds
    async: number;
  };
}

interface SecurityMetric {
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  compliance: {
    score: number; // 0-100
    standards: string[];
    violations: Array<{
      rule: string;
      severity: string;
      count: number;
    }>;
  };
  secrets: {
    exposed: number;
    hardcoded: number;
    weakPasswords: number;
  };
  permissions: {
    excessive: number;
    unused: number;
    risky: number;
  };
}

interface AIUsageMetric {
  model: string;
  requestCount: number;
  totalTokens: number;
  averageLatency: number;
  errorRate: number;
  cost: number;
  efficiency: {
    cacheHitRate: number;
    reusabilityScore: number;
    relevanceScore: number;
  };
  usage: {
    codeGeneration: number;
    codeReview: number;
    documentation: number;
    debugging: number;
    testing: number;
  };
}

interface TrendAnalysis {
  metric: string;
  timeframe: 'hour' | 'day' | 'week' | 'month' | 'quarter';
  dataPoints: Array<{
    timestamp: Date;
    value: number;
  }>;
  trend: {
    direction: 'up' | 'down' | 'stable';
    velocity: number; // rate of change
    confidence: number; // 0-1
  };
  forecasts: Array<{
    timestamp: Date;
    predicted: number;
    confidence: number;
  }>;
  anomalies: Array<{
    timestamp: Date;
    value: number;
    severity: 'minor' | 'major' | 'critical';
    description: string;
  }>;
}

interface Benchmark {
  id: string;
  name: string;
  category: string;
  baseline: {
    value: number;
    timestamp: Date;
    source: string;
  };
  industry: {
    average: number;
    topQuartile: number;
    topDecile: number;
  };
  internal: {
    bestProject: number;
    teamAverage: number;
    organizationAverage: number;
  };
}

interface Alert {
  id: string;
  type: 'threshold' | 'anomaly' | 'trend' | 'compliance';
  severity: 'info' | 'warning' | 'critical';
  metric: string;
  title: string;
  description: string;
  threshold?: {
    operator: '>' | '<' | '=' | '!=' | 'between';
    value: number | [number, number];
  };
  currentValue: number;
  triggeredAt: Date;
  acknowledged: boolean;
  resolvedAt?: Date;
  actions: Array<{
    type: 'notify' | 'block' | 'escalate' | 'auto-fix';
    target: string;
    executed: boolean;
  }>;
}

export class PerformanceMetricsCollector {
  private snapshots: Map<string, PerformanceSnapshot[]> = new Map();
  private trends: Map<string, TrendAnalysis> = new Map();
  private benchmarks: Map<string, Benchmark> = new Map();
  private alerts: Alert[] = [];
  private collectors: Map<string, MetricCollector> = new Map();

  constructor() {
    this.initializeCollectors();
    this.loadBenchmarks();
  }

  async collectMetrics(projectId: string, options: {
    commitHash?: string;
    branch?: string;
    environment?: PerformanceSnapshot['environment'];
    includeAI?: boolean;
    includeSecurity?: boolean;
  }): Promise<PerformanceSnapshot> {
    const snapshot: PerformanceSnapshot = {
      id: this.generateSnapshotId(),
      projectId,
      timestamp: new Date(),
      commitHash: options.commitHash,
      branch: options.branch || 'main',
      environment: options.environment || 'development',
      metrics: {
        codeQuality: await this.collectCodeQualityMetrics(projectId),
        buildPerformance: await this.collectBuildMetrics(projectId),
        testCoverage: await this.collectCoverageMetrics(projectId),
        dependencies: await this.collectDependencyMetrics(projectId),
        security: options.includeSecurity ? await this.collectSecurityMetrics(projectId) : [],
        aiUsage: options.includeAI ? await this.collectAIUsageMetrics(projectId) : []
      },
      summary: {
        overallScore: 0,
        riskLevel: 'low',
        recommendations: [],
        blockers: []
      }
    };

    // Calculate overall score and risk assessment
    snapshot.summary = await this.calculateSummary(snapshot);

    // Store snapshot
    const projectSnapshots = this.snapshots.get(projectId) || [];
    projectSnapshots.push(snapshot);
    this.snapshots.set(projectId, projectSnapshots);

    // Update trends
    await this.updateTrends(projectId, snapshot);

    // Check for alerts
    await this.checkAlerts(snapshot);

    return snapshot;
  }

  async getMetricHistory(projectId: string, options: {
    metric: string;
    timeframe: TrendAnalysis['timeframe'];
    startDate?: Date;
    endDate?: Date;
    aggregation?: 'raw' | 'average' | 'max' | 'min';
  }): Promise<TrendAnalysis> {
    const trendKey = `${projectId}_${options.metric}_${options.timeframe}`;
    return this.trends.get(trendKey) || this.generateEmptyTrend(options.metric, options.timeframe);
  }

  async compareProjects(projectIds: string[], metric: string): Promise<{
    comparison: Array<{
      projectId: string;
      current: number;
      trend: 'improving' | 'stable' | 'declining';
      rank: number;
    }>;
    insights: string[];
  }> {
    const comparison = [];
    
    for (const projectId of projectIds) {
      const latestSnapshot = await this.getLatestSnapshot(projectId);
      if (!latestSnapshot) continue;

      const metricValue = this.extractMetricValue(latestSnapshot, metric);
      const trend = await this.getMetricTrend(projectId, metric);
      
      comparison.push({
        projectId,
        current: metricValue,
        trend: trend.trend.direction === 'up' ? 'improving' : 
               trend.trend.direction === 'down' ? 'declining' : 'stable',
        rank: 0 // Will be calculated after sorting
      });
    }

    // Sort and assign ranks
    comparison.sort((a, b) => b.current - a.current);
    comparison.forEach((item, index) => {
      item.rank = index + 1;
    });

    const insights = this.generateComparisonInsights(comparison, metric);

    return { comparison, insights };
  }

  async getBenchmarkAnalysis(projectId: string): Promise<{
    scores: Record<string, {
      current: number;
      benchmark: number;
      percentile: number;
      status: 'excellent' | 'good' | 'average' | 'poor';
    }>;
    recommendations: string[];
    strengths: string[];
    weaknesses: string[];
  }> {
    const latestSnapshot = await this.getLatestSnapshot(projectId);
    if (!latestSnapshot) {
      throw new Error(`No metrics found for project ${projectId}`);
    }

    const scores: Record<string, any> = {};
    const recommendations: string[] = [];
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    // Compare against benchmarks
    for (const [benchmarkId, benchmark] of this.benchmarks.entries()) {
      const currentValue = this.extractMetricValue(latestSnapshot, benchmark.name);
      const percentile = this.calculatePercentile(currentValue, benchmark);
      
      let status: 'excellent' | 'good' | 'average' | 'poor';
      if (percentile >= 90) status = 'excellent';
      else if (percentile >= 75) status = 'good';
      else if (percentile >= 50) status = 'average';
      else status = 'poor';

      scores[benchmark.name] = {
        current: currentValue,
        benchmark: benchmark.industry.average,
        percentile,
        status
      };

      // Generate insights
      if (status === 'excellent') {
        strengths.push(`${benchmark.name} is in the top 10% of industry standards`);
      } else if (status === 'poor') {
        weaknesses.push(`${benchmark.name} is below industry average`);
        recommendations.push(`Improve ${benchmark.name} to reach industry standards`);
      }
    }

    return { scores, recommendations, strengths, weaknesses };
  }

  async createAlert(alert: Omit<Alert, 'id' | 'triggeredAt' | 'acknowledged'>): Promise<Alert> {
    const newAlert: Alert = {
      ...alert,
      id: this.generateAlertId(),
      triggeredAt: new Date(),
      acknowledged: false
    };

    this.alerts.push(newAlert);
    
    // Execute alert actions
    await this.executeAlertActions(newAlert);

    return newAlert;
  }

  async getActiveAlerts(projectId?: string): Promise<Alert[]> {
    let alerts = this.alerts.filter(alert => !alert.acknowledged && !alert.resolvedAt);
    
    if (projectId) {
      // Filter alerts related to specific project (simplified)
      alerts = alerts.filter(alert => alert.description.includes(projectId));
    }

    return alerts.sort((a, b) => {
      const severityOrder = { critical: 3, warning: 2, info: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  async generateReport(projectId: string, options: {
    type: 'executive' | 'technical' | 'compliance';
    timeframe: 'week' | 'month' | 'quarter';
    includeComparisons?: boolean;
    includeBenchmarks?: boolean;
  }): Promise<{
    summary: {
      overallHealth: number;
      keyMetrics: Record<string, number>;
      trends: Record<string, 'improving' | 'stable' | 'declining'>;
    };
    sections: Array<{
      title: string;
      content: string;
      charts: Array<{
        type: 'line' | 'bar' | 'pie' | 'gauge';
        data: any[];
        config: any;
      }>;
    }>;
    recommendations: Array<{
      priority: 'high' | 'medium' | 'low';
      title: string;
      description: string;
      impact: string;
      effort: string;
    }>;
  }> {
    const latestSnapshot = await this.getLatestSnapshot(projectId);
    if (!latestSnapshot) {
      throw new Error(`No metrics found for project ${projectId}`);
    }

    const report = {
      summary: {
        overallHealth: latestSnapshot.summary.overallScore,
        keyMetrics: this.extractKeyMetrics(latestSnapshot),
        trends: await this.getTrendSummary(projectId, options.timeframe)
      },
      sections: await this.generateReportSections(projectId, options),
      recommendations: await this.generateRecommendations(latestSnapshot, options)
    };

    return report;
  }

  private async collectCodeQualityMetrics(projectId: string): Promise<CodeQualityMetric[]> {
    const collector = this.collectors.get('code-quality');
    if (!collector) return [];

    return await collector.collect(projectId);
  }

  private async collectBuildMetrics(projectId: string): Promise<BuildMetric[]> {
    const collector = this.collectors.get('build');
    if (!collector) return [];

    return await collector.collect(projectId);
  }

  private async collectCoverageMetrics(projectId: string): Promise<CoverageMetric[]> {
    const collector = this.collectors.get('coverage');
    if (!collector) return [];

    return await collector.collect(projectId);
  }

  private async collectDependencyMetrics(projectId: string): Promise<DependencyMetric[]> {
    const collector = this.collectors.get('dependencies');
    if (!collector) return [];

    return await collector.collect(projectId);
  }

  private async collectSecurityMetrics(projectId: string): Promise<SecurityMetric[]> {
    const collector = this.collectors.get('security');
    if (!collector) return [];

    return await collector.collect(projectId);
  }

  private async collectAIUsageMetrics(projectId: string): Promise<AIUsageMetric[]> {
    const collector = this.collectors.get('ai-usage');
    if (!collector) return [];

    return await collector.collect(projectId);
  }

  private async calculateSummary(snapshot: PerformanceSnapshot): Promise<PerformanceSnapshot['summary']> {
    let totalScore = 0;
    let metricCount = 0;
    const recommendations: string[] = [];
    const blockers: string[] = [];

    // Calculate weighted score from all metrics
    snapshot.metrics.codeQuality.forEach(metric => {
      const score = this.normalizeMetricValue(metric);
      totalScore += score * this.getMetricWeight(metric.category);
      metricCount++;

      if (score < 0.5) {
        recommendations.push(`Improve ${metric.name} (currently ${metric.value}${metric.unit})`);
      }
      if (score < 0.3) {
        blockers.push(`Critical issue: ${metric.name} is below acceptable threshold`);
      }
    });

    // Add other metric categories
    const buildSuccess = snapshot.metrics.buildPerformance.every(build => build.success);
    if (!buildSuccess) {
      blockers.push('Build failures detected');
      totalScore -= 20;
    }

    const overallScore = Math.max(0, Math.min(100, (totalScore / Math.max(1, metricCount)) * 100));
    
    let riskLevel: PerformanceSnapshot['summary']['riskLevel'] = 'low';
    if (overallScore < 30 || blockers.length > 0) riskLevel = 'critical';
    else if (overallScore < 50) riskLevel = 'high';
    else if (overallScore < 70) riskLevel = 'medium';

    return {
      overallScore,
      riskLevel,
      recommendations: recommendations.slice(0, 10), // Top 10
      blockers
    };
  }

  private normalizeMetricValue(metric: CodeQualityMetric): number {
    // Normalize metric value to 0-1 scale based on thresholds
    if (metric.value >= metric.threshold.good) return 1;
    if (metric.value >= metric.threshold.acceptable) return 0.7;
    if (metric.value >= metric.threshold.poor) return 0.4;
    return 0.2;
  }

  private getMetricWeight(category: CodeQualityMetric['category']): number {
    const weights = {
      maintainability: 0.25,
      reliability: 0.25,
      security: 0.25,
      performance: 0.15,
      coverage: 0.05,
      complexity: 0.05
    };
    return weights[category] || 0.1;
  }

  private async updateTrends(projectId: string, snapshot: PerformanceSnapshot): Promise<void> {
    // Update trend analysis for each metric
    const allMetrics = [
      ...snapshot.metrics.codeQuality,
      // Add other metric types as needed
    ];

    for (const metric of allMetrics) {
      const trendKey = `${projectId}_${metric.name}_day`;
      let trend = this.trends.get(trendKey);
      
      if (!trend) {
        trend = this.generateEmptyTrend(metric.name, 'day');
      }

      // Add new data point
      trend.dataPoints.push({
        timestamp: snapshot.timestamp,
        value: metric.value
      });

      // Keep only last 30 days for daily trends
      if (trend.dataPoints.length > 30) {
        trend.dataPoints = trend.dataPoints.slice(-30);
      }

      // Recalculate trend direction
      trend.trend = this.calculateTrendDirection(trend.dataPoints);

      this.trends.set(trendKey, trend);
    }
  }

  private calculateTrendDirection(dataPoints: TrendAnalysis['dataPoints']): TrendAnalysis['trend'] {
    if (dataPoints.length < 2) {
      return { direction: 'stable', velocity: 0, confidence: 0 };
    }

    const recent = dataPoints.slice(-7); // Last 7 points
    const older = dataPoints.slice(-14, -7); // Previous 7 points

    if (recent.length === 0 || older.length === 0) {
      return { direction: 'stable', velocity: 0, confidence: 0.5 };
    }

    const recentAvg = recent.reduce((sum, p) => sum + p.value, 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + p.value, 0) / older.length;

    const change = recentAvg - olderAvg;
    const velocity = Math.abs(change / olderAvg);
    
    let direction: 'up' | 'down' | 'stable';
    if (Math.abs(change) < olderAvg * 0.05) direction = 'stable';
    else if (change > 0) direction = 'up';
    else direction = 'down';

    const confidence = Math.min(1, dataPoints.length / 14); // More confident with more data

    return { direction, velocity, confidence };
  }

  private async checkAlerts(snapshot: PerformanceSnapshot): Promise<void> {
    // Check predefined alert conditions
    for (const metric of snapshot.metrics.codeQuality) {
      if (metric.value < metric.threshold.poor) {
        await this.createAlert({
          type: 'threshold',
          severity: 'critical',
          metric: metric.name,
          title: `${metric.name} Below Threshold`,
          description: `${metric.name} is ${metric.value}${metric.unit}, below the minimum threshold of ${metric.threshold.poor}${metric.unit}`,
          threshold: {
            operator: '<',
            value: metric.threshold.poor
          },
          currentValue: metric.value,
          actions: [{
            type: 'notify',
            target: 'development-team',
            executed: false
          }]
        });
      }
    }

    // Check for build failures
    const failedBuilds = snapshot.metrics.buildPerformance.filter(build => !build.success);
    if (failedBuilds.length > 0) {
      await this.createAlert({
        type: 'threshold',
        severity: 'critical',
        metric: 'build-success',
        title: 'Build Failures Detected',
        description: `${failedBuilds.length} build stage(s) failed`,
        currentValue: failedBuilds.length,
        actions: [{
          type: 'block',
          target: 'deployment',
          executed: false
        }]
      });
    }
  }

  private async executeAlertActions(alert: Alert): Promise<void> {
    for (const action of alert.actions) {
      try {
        switch (action.type) {
          case 'notify':
            await this.sendNotification(alert, action.target);
            break;
          case 'block':
            await this.blockAction(action.target);
            break;
          case 'escalate':
            await this.escalateAlert(alert, action.target);
            break;
          case 'auto-fix':
            await this.attemptAutoFix(alert);
            break;
        }
        action.executed = true;
      } catch (error) {
        console.error(`Failed to execute alert action ${action.type}:`, error);
      }
    }
  }

  private async sendNotification(alert: Alert, target: string): Promise<void> {
    // Send notification to team/individual
    console.log(`Sending notification about ${alert.title} to ${target}`);
  }

  private async blockAction(target: string): Promise<void> {
    // Block deployment or other actions
    console.log(`Blocking ${target} due to alert condition`);
  }

  private async escalateAlert(alert: Alert, target: string): Promise<void> {
    // Escalate to management or on-call
    console.log(`Escalating alert ${alert.title} to ${target}`);
  }

  private async attemptAutoFix(alert: Alert): Promise<void> {
    // Attempt automated remediation
    console.log(`Attempting auto-fix for ${alert.title}`);
  }

  private extractMetricValue(snapshot: PerformanceSnapshot, metricName: string): number {
    // Find and extract specific metric value from snapshot
    const metric = snapshot.metrics.codeQuality.find(m => m.name === metricName);
    return metric ? metric.value : 0;
  }

  private async getMetricTrend(projectId: string, metric: string): Promise<TrendAnalysis> {
    const trendKey = `${projectId}_${metric}_day`;
    return this.trends.get(trendKey) || this.generateEmptyTrend(metric, 'day');
  }

  private calculatePercentile(value: number, benchmark: Benchmark): number {
    // Calculate what percentile this value represents
    if (value >= benchmark.industry.topDecile) return 95;
    if (value >= benchmark.industry.topQuartile) return 80;
    if (value >= benchmark.industry.average) return 60;
    return 30; // Below average
  }

  private generateComparisonInsights(comparison: any[], metric: string): string[] {
    const insights = [];
    
    const topPerformer = comparison[0];
    const bottomPerformer = comparison[comparison.length - 1];
    
    insights.push(`${topPerformer.projectId} leads in ${metric} with a score of ${topPerformer.current}`);
    
    if (bottomPerformer.current < topPerformer.current * 0.8) {
      insights.push(`${bottomPerformer.projectId} significantly trails behind the leader`);
    }

    const improving = comparison.filter(p => p.trend === 'improving').length;
    if (improving > comparison.length / 2) {
      insights.push(`${improving} out of ${comparison.length} projects show improvement in ${metric}`);
    }

    return insights;
  }

  private extractKeyMetrics(snapshot: PerformanceSnapshot): Record<string, number> {
    const keyMetrics: Record<string, number> = {};
    
    // Extract most important metrics
    const maintainabilityMetric = snapshot.metrics.codeQuality.find(m => m.category === 'maintainability');
    if (maintainabilityMetric) {
      keyMetrics['Maintainability'] = maintainabilityMetric.value;
    }

    const buildSuccess = snapshot.metrics.buildPerformance.every(b => b.success) ? 100 : 0;
    keyMetrics['Build Success'] = buildSuccess;

    const avgCoverage = snapshot.metrics.testCoverage.reduce((sum, c) => sum + c.percentage, 0) / 
                       Math.max(1, snapshot.metrics.testCoverage.length);
    keyMetrics['Test Coverage'] = avgCoverage;

    return keyMetrics;
  }

  private async getTrendSummary(projectId: string, timeframe: string): Promise<Record<string, 'improving' | 'stable' | 'declining'>> {
    const trendSummary: Record<string, 'improving' | 'stable' | 'declining'> = {};
    
    // Get trends for key metrics
    const keyMetrics = ['maintainability', 'build-success', 'test-coverage'];
    
    for (const metric of keyMetrics) {
      const trend = await this.getMetricTrend(projectId, metric);
      trendSummary[metric] = trend.trend.direction === 'up' ? 'improving' :
                            trend.trend.direction === 'down' ? 'declining' : 'stable';
    }

    return trendSummary;
  }

  private generateEmptyTrend(metric: string, timeframe: TrendAnalysis['timeframe']): TrendAnalysis {
    return {
      metric,
      timeframe,
      dataPoints: [],
      trend: { direction: 'stable', velocity: 0, confidence: 0 },
      forecasts: [],
      anomalies: []
    };
  }

  private async getLatestSnapshot(projectId: string): Promise<PerformanceSnapshot | null> {
    const snapshots = this.snapshots.get(projectId);
    if (!snapshots || snapshots.length === 0) return null;
    
    return snapshots[snapshots.length - 1];
  }

  private async generateReportSections(projectId: string, options: any): Promise<any[]> {
    // Generate report sections based on type
    return [
      {
        title: 'Code Quality Overview',
        content: 'Summary of code quality metrics and trends',
        charts: []
      }
    ];
  }

  private async generateRecommendations(snapshot: PerformanceSnapshot, options: any): Promise<any[]> {
    return snapshot.summary.recommendations.map(rec => ({
      priority: 'medium' as const,
      title: rec,
      description: rec,
      impact: 'Improves code quality',
      effort: 'Medium'
    }));
  }

  private initializeCollectors(): void {
    this.collectors.set('code-quality', new CodeQualityCollector());
    this.collectors.set('build', new BuildMetricsCollector());
    this.collectors.set('coverage', new CoverageCollector());
    this.collectors.set('dependencies', new DependencyCollector());
    this.collectors.set('security', new SecurityCollector());
    this.collectors.set('ai-usage', new AIUsageCollector());
  }

  private loadBenchmarks(): void {
    // Load industry and internal benchmarks
    this.benchmarks.set('maintainability', {
      id: 'maintainability',
      name: 'Maintainability Index',
      category: 'Code Quality',
      baseline: { value: 70, timestamp: new Date(), source: 'internal' },
      industry: { average: 75, topQuartile: 85, topDecile: 90 },
      internal: { bestProject: 88, teamAverage: 72, organizationAverage: 70 }
    });
  }

  private generateSnapshotId(): string {
    return `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Metric Collector Classes
abstract class MetricCollector {
  abstract collect(projectId: string): Promise<any[]>;
}

class CodeQualityCollector extends MetricCollector {
  async collect(projectId: string): Promise<CodeQualityMetric[]> {
    // Mock implementation - would integrate with actual analysis tools
    return [
      {
        id: 'maintainability_1',
        name: 'Maintainability Index',
        category: 'maintainability',
        value: 75,
        unit: 'score',
        threshold: { good: 80, acceptable: 60, poor: 40 },
        trend: 'stable',
        measuredAt: new Date(),
        source: 'static-analysis'
      },
      {
        id: 'complexity_1',
        name: 'Cyclomatic Complexity',
        category: 'complexity',
        value: 8,
        unit: 'count',
        threshold: { good: 5, acceptable: 10, poor: 15 },
        trend: 'improving',
        measuredAt: new Date(),
        source: 'static-analysis'
      }
    ];
  }
}

class BuildMetricsCollector extends MetricCollector {
  async collect(projectId: string): Promise<BuildMetric[]> {
    return [
      {
        stage: 'compile',
        duration: 45000,
        success: true,
        resourceUsage: { cpu: 80, memory: 512, disk: 100 },
        cacheHitRate: 75,
        parallelization: 4,
        errors: [],
        warnings: ['Unused import in file.ts']
      }
    ];
  }
}

class CoverageCollector extends MetricCollector {
  async collect(projectId: string): Promise<CoverageMetric[]> {
    return [
      {
        type: 'line',
        percentage: 85,
        covered: 850,
        total: 1000,
        uncoveredFiles: [
          {
            file: 'utils/helper.ts',
            coverage: 45,
            criticalMissing: ['error handling', 'edge cases']
          }
        ]
      }
    ];
  }
}

class DependencyCollector extends MetricCollector {
  async collect(projectId: string): Promise<DependencyMetric[]> {
    return [
      {
        total: 150,
        outdated: 12,
        vulnerable: 3,
        bloat: 8,
        duplicates: 2,
        licenses: { 'MIT': 120, 'Apache-2.0': 20, 'GPL': 5, 'BSD': 5 },
        bundleSize: { total: 2048000, gzipped: 512000, treeshakeable: 1536000 },
        loadTime: { initial: 1200, async: 800 }
      }
    ];
  }
}

class SecurityCollector extends MetricCollector {
  async collect(projectId: string): Promise<SecurityMetric[]> {
    return [
      {
        vulnerabilities: { critical: 0, high: 2, medium: 5, low: 8 },
        compliance: {
          score: 85,
          standards: ['OWASP', 'SANS'],
          violations: [
            { rule: 'Input validation', severity: 'medium', count: 3 }
          ]
        },
        secrets: { exposed: 0, hardcoded: 1, weakPasswords: 2 },
        permissions: { excessive: 3, unused: 5, risky: 1 }
      }
    ];
  }
}

class AIUsageCollector extends MetricCollector {
  async collect(projectId: string): Promise<AIUsageMetric[]> {
    return [
      {
        model: 'gpt-4',
        requestCount: 245,
        totalTokens: 125000,
        averageLatency: 2300,
        errorRate: 0.02,
        cost: 15.75,
        efficiency: { cacheHitRate: 35, reusabilityScore: 78, relevanceScore: 85 },
        usage: { codeGeneration: 120, codeReview: 45, documentation: 30, debugging: 35, testing: 15 }
      }
    ];
  }
}

export {
  type CodeQualityMetric,
  type PerformanceSnapshot,
  type TrendAnalysis,
  type Benchmark,
  type Alert
};