/**
 * Analytics Types
 * Type definitions for the analytics dashboard
 */

// Time range options for analytics queries
export type TimeRange = '24h' | '7d' | '30d' | '90d' | 'all';

// Metric types for different analytics views
export type MetricType =
  | 'projects'
  | 'ai_requests'
  | 'tokens'
  | 'compute_time'
  | 'deployments'
  | 'files_changed';

// Chart data point for time-series visualizations
export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

// Chart data with metadata
export interface ChartData {
  points: ChartDataPoint[];
  total: number;
  average: number;
  min: number;
  max: number;
  trend: 'up' | 'down' | 'stable';
  trendPercent: number;
}

// Usage analytics summary
export interface UsageAnalytics {
  totalProjects: number;
  activeProjects: number;
  totalAIRequests: number;
  totalTokensUsed: number;
  totalComputeMinutes: number;
  totalDeployments: number;
  totalFilesChanged: number;
  totalLinesOfCode: number;
  dailyUsage: ChartDataPoint[];
  weeklyUsage: ChartDataPoint[];
  monthlyUsage: ChartDataPoint[];
}

// Project-specific analytics
export interface ProjectAnalytics {
  projectId: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  filesCount: number;
  linesOfCode: number;
  commits: number;
  collaborators: number;
  aiInteractions: number;
  tokensUsed: number;
  computeMinutes: number;
  deployments: number;
  lastActivity: string;
  activityScore: number; // 0-100 activity score
  languages: Array<{ name: string; percent: number; color: string }>;
}

// AI usage breakdown
export interface AIAnalytics {
  totalRequests: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalTokens: number;
  estimatedCost: number;
  savingsFromCache: number;
  requestsByType: {
    chat: number;
    completion: number;
    edit: number;
    generation: number;
    other: number;
  };
  requestsByModel: Array<{
    model: string;
    provider: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
  dailyRequests: ChartDataPoint[];
  tokensOverTime: ChartDataPoint[];
  averageLatency: number;
  successRate: number;
  errorRate: number;
}

// Activity data for heatmap
export interface ActivityData {
  date: string; // ISO date string YYYY-MM-DD
  count: number;
  level: 0 | 1 | 2 | 3 | 4; // Intensity level for coloring
}

// Activity heatmap data (GitHub style)
export interface ActivityHeatmap {
  data: ActivityData[];
  totalContributions: number;
  longestStreak: number;
  currentStreak: number;
  busiestDay: string;
  busiestDayCount: number;
}

// Top project entry
export interface TopProject {
  projectId: string;
  projectName: string;
  activityScore: number;
  aiRequests: number;
  filesChanged: number;
  lastActivity: string;
  trend: 'up' | 'down' | 'stable';
}

// Overview card data
export interface OverviewCard {
  title: string;
  value: number | string;
  formattedValue: string;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  icon: string;
  color: string;
}

// Complete analytics dashboard data
export interface AnalyticsDashboardData {
  timeRange: TimeRange;
  lastUpdated: string;
  overview: {
    totalProjects: OverviewCard;
    aiRequests: OverviewCard;
    tokensUsed: OverviewCard;
    computeTime: OverviewCard;
  };
  usage: UsageAnalytics;
  ai: AIAnalytics;
  topProjects: TopProject[];
  activityHeatmap: ActivityHeatmap;
  projectAnalytics: ProjectAnalytics[];
}

// API response wrapper
export interface AnalyticsResponse<T> {
  success: boolean;
  data: T | null;
  error?: string;
  cached?: boolean;
  cacheExpiry?: string;
}

// Export data format options
export type ExportFormat = 'json' | 'csv' | 'pdf';

export interface ExportOptions {
  format: ExportFormat;
  timeRange: TimeRange;
  includeProjects: boolean;
  includeAI: boolean;
  includeActivity: boolean;
}
