/**
 * Analytics Client
 * Client-side service for fetching and managing analytics data
 */

import { atom, computed } from 'nanostores';
import type {
  TimeRange,
  UsageAnalytics,
  ProjectAnalytics,
  AIAnalytics,
  ActivityHeatmap,
  TopProject,
  AnalyticsDashboardData,
  AnalyticsResponse,
  ChartDataPoint,
  OverviewCard,
  ExportOptions,
} from './types';

// ============================================================================
// State Stores
// ============================================================================

export const analyticsTimeRange = atom<TimeRange>('30d');
export const analyticsLoading = atom<boolean>(false);
export const analyticsError = atom<string | null>(null);
export const analyticsData = atom<AnalyticsDashboardData | null>(null);
export const analyticsLastFetch = atom<number>(0);

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// ============================================================================
// Computed Values
// ============================================================================

export const isAnalyticsCached = computed(
  [analyticsLastFetch, analyticsData],
  (lastFetch, data) => {
    if (!data) return false;
    return Date.now() - lastFetch < CACHE_DURATION;
  }
);

export const analyticsOverview = computed(analyticsData, (data) => data?.overview ?? null);
export const analyticsUsage = computed(analyticsData, (data) => data?.usage ?? null);
export const analyticsAI = computed(analyticsData, (data) => data?.ai ?? null);
export const analyticsTopProjects = computed(analyticsData, (data) => data?.topProjects ?? []);
export const analyticsHeatmap = computed(analyticsData, (data) => data?.activityHeatmap ?? null);

// ============================================================================
// Helper Functions
// ============================================================================

function getUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('userId');
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function calculateTrend(current: number, previous: number): { trend: 'up' | 'down' | 'stable'; percent: number } {
  if (previous === 0) {
    return { trend: current > 0 ? 'up' : 'stable', percent: current > 0 ? 100 : 0 };
  }
  const percent = ((current - previous) / previous) * 100;
  if (Math.abs(percent) < 1) {
    return { trend: 'stable', percent: 0 };
  }
  return {
    trend: percent > 0 ? 'up' : 'down',
    percent: Math.abs(Math.round(percent)),
  };
}

function getTimeRangeDays(range: TimeRange): number {
  switch (range) {
    case '24h': return 1;
    case '7d': return 7;
    case '30d': return 30;
    case '90d': return 90;
    case 'all': return 365;
    default: return 30;
  }
}

// ============================================================================
// Data Fetching Functions
// ============================================================================

export async function fetchAnalyticsDashboard(
  timeRange: TimeRange = '30d',
  forceRefresh = false
): Promise<AnalyticsResponse<AnalyticsDashboardData>> {
  const cached = isAnalyticsCached.get();
  const currentRange = analyticsTimeRange.get();

  // Return cached data if available and not forcing refresh
  if (cached && !forceRefresh && currentRange === timeRange) {
    const data = analyticsData.get();
    if (data) {
      return { success: true, data, cached: true };
    }
  }

  analyticsLoading.set(true);
  analyticsError.set(null);
  analyticsTimeRange.set(timeRange);

  try {
    const userId = getUserId();
    const response = await fetch(`/api/analytics/dashboard?range=${timeRange}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(userId && { 'x-user-id': userId }),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch analytics: ${response.statusText}`);
    }

    const result = await response.json() as AnalyticsResponse<AnalyticsDashboardData>;

    if (result.success && result.data) {
      analyticsData.set(result.data);
      analyticsLastFetch.set(Date.now());
    } else {
      // Generate mock data if API doesn't return real data
      const mockData = generateMockAnalytics(timeRange);
      analyticsData.set(mockData);
      analyticsLastFetch.set(Date.now());
      return { success: true, data: mockData, cached: false };
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    analyticsError.set(message);

    // Return mock data on error for demo purposes
    const mockData = generateMockAnalytics(timeRange);
    analyticsData.set(mockData);
    analyticsLastFetch.set(Date.now());

    return { success: true, data: mockData, cached: false };
  } finally {
    analyticsLoading.set(false);
  }
}

export async function fetchUsageOverTime(
  timeRange: TimeRange = '30d'
): Promise<AnalyticsResponse<ChartDataPoint[]>> {
  try {
    const userId = getUserId();
    const response = await fetch(`/api/analytics/usage?range=${timeRange}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(userId && { 'x-user-id': userId }),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch usage data: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    const days = getTimeRangeDays(timeRange);
    const mockData = generateMockChartData(days);
    return { success: true, data: mockData, cached: false };
  }
}

export async function fetchProjectStats(
  projectId?: string
): Promise<AnalyticsResponse<ProjectAnalytics[]>> {
  try {
    const userId = getUserId();
    const url = projectId
      ? `/api/analytics/projects/${projectId}`
      : '/api/analytics/projects';

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(userId && { 'x-user-id': userId }),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch project stats: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    const mockData = generateMockProjectAnalytics();
    return { success: true, data: mockData, cached: false };
  }
}

export async function fetchAIUsage(
  timeRange: TimeRange = '30d'
): Promise<AnalyticsResponse<AIAnalytics>> {
  try {
    const userId = getUserId();
    const response = await fetch(`/api/analytics/ai?range=${timeRange}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(userId && { 'x-user-id': userId }),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch AI usage: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    const mockData = generateMockAIAnalytics(timeRange);
    return { success: true, data: mockData, cached: false };
  }
}

export async function fetchActivityHeatmap(): Promise<AnalyticsResponse<ActivityHeatmap>> {
  try {
    const userId = getUserId();
    const response = await fetch('/api/analytics/activity', {
      headers: {
        'Content-Type': 'application/json',
        ...(userId && { 'x-user-id': userId }),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch activity data: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    const mockData = generateMockActivityHeatmap();
    return { success: true, data: mockData, cached: false };
  }
}

// ============================================================================
// Export Functions
// ============================================================================

export async function exportAnalytics(options: ExportOptions): Promise<Blob | null> {
  const data = analyticsData.get();
  if (!data) return null;

  const exportData: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    timeRange: options.timeRange,
  };

  if (options.includeProjects) {
    exportData.projects = data.projectAnalytics;
    exportData.topProjects = data.topProjects;
  }

  if (options.includeAI) {
    exportData.aiAnalytics = data.ai;
  }

  if (options.includeActivity) {
    exportData.activityHeatmap = data.activityHeatmap;
    exportData.usage = data.usage;
  }

  switch (options.format) {
    case 'json':
      return new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });

    case 'csv':
      return generateCSVExport(data, options);

    default:
      return new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  }
}

function generateCSVExport(data: AnalyticsDashboardData, options: ExportOptions): Blob {
  const lines: string[] = [];

  // Overview section
  lines.push('Section,Metric,Value');
  lines.push(`Overview,Total Projects,${data.overview.totalProjects.value}`);
  lines.push(`Overview,AI Requests,${data.overview.aiRequests.value}`);
  lines.push(`Overview,Tokens Used,${data.overview.tokensUsed.value}`);
  lines.push(`Overview,Compute Time,${data.overview.computeTime.value}`);

  if (options.includeProjects && data.topProjects.length > 0) {
    lines.push('');
    lines.push('Project,Activity Score,AI Requests,Files Changed,Last Activity');
    data.topProjects.forEach(p => {
      lines.push(`${p.projectName},${p.activityScore},${p.aiRequests},${p.filesChanged},${p.lastActivity}`);
    });
  }

  if (options.includeAI && data.ai) {
    lines.push('');
    lines.push('AI Metric,Value');
    lines.push(`Total Requests,${data.ai.totalRequests}`);
    lines.push(`Total Tokens,${data.ai.totalTokens}`);
    lines.push(`Estimated Cost,${data.ai.estimatedCost}`);
    lines.push(`Success Rate,${data.ai.successRate}%`);
  }

  return new Blob([lines.join('\n')], { type: 'text/csv' });
}

// ============================================================================
// Mock Data Generators (for development/demo)
// ============================================================================

function generateMockChartData(days: number): ChartDataPoint[] {
  const data: ChartDataPoint[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Generate realistic-looking data with some variation
    const baseValue = 50 + Math.random() * 100;
    const weekendFactor = [0, 6].includes(date.getDay()) ? 0.6 : 1;
    const value = Math.round(baseValue * weekendFactor);

    data.push({
      date: date.toISOString().split('T')[0],
      value,
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  }

  return data;
}

function generateMockProjectAnalytics(): ProjectAnalytics[] {
  const projects = [
    { name: 'E-commerce Platform', files: 156, lines: 28500 },
    { name: 'Dashboard App', files: 89, lines: 15200 },
    { name: 'API Backend', files: 45, lines: 8900 },
    { name: 'Mobile App', files: 112, lines: 21000 },
    { name: 'Landing Page', files: 23, lines: 3200 },
  ];

  return projects.map((p, i) => ({
    projectId: `proj_${i + 1}`,
    projectName: p.name,
    createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    filesCount: p.files,
    linesOfCode: p.lines,
    commits: Math.floor(Math.random() * 200) + 10,
    collaborators: Math.floor(Math.random() * 5) + 1,
    aiInteractions: Math.floor(Math.random() * 500) + 50,
    tokensUsed: Math.floor(Math.random() * 500000) + 10000,
    computeMinutes: Math.floor(Math.random() * 120) + 10,
    deployments: Math.floor(Math.random() * 20) + 1,
    lastActivity: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
    activityScore: Math.floor(Math.random() * 40) + 60,
    languages: [
      { name: 'TypeScript', percent: 65, color: '#3178c6' },
      { name: 'JavaScript', percent: 20, color: '#f7df1e' },
      { name: 'CSS', percent: 10, color: '#264de4' },
      { name: 'HTML', percent: 5, color: '#e34f26' },
    ],
  }));
}

function generateMockAIAnalytics(timeRange: TimeRange): AIAnalytics {
  const days = getTimeRangeDays(timeRange);
  const baseRequests = days * 25;
  const baseTokens = baseRequests * 800;

  return {
    totalRequests: baseRequests + Math.floor(Math.random() * 200),
    totalTokensInput: Math.floor(baseTokens * 0.3),
    totalTokensOutput: Math.floor(baseTokens * 0.7),
    totalTokens: baseTokens,
    estimatedCost: baseTokens * 0.00002,
    savingsFromCache: baseTokens * 0.000005,
    requestsByType: {
      chat: Math.floor(baseRequests * 0.4),
      completion: Math.floor(baseRequests * 0.25),
      edit: Math.floor(baseRequests * 0.2),
      generation: Math.floor(baseRequests * 0.1),
      other: Math.floor(baseRequests * 0.05),
    },
    requestsByModel: [
      { model: 'Claude 3.5 Sonnet', provider: 'Anthropic', requests: Math.floor(baseRequests * 0.5), tokens: Math.floor(baseTokens * 0.6), cost: baseTokens * 0.00001 },
      { model: 'GPT-4o', provider: 'OpenAI', requests: Math.floor(baseRequests * 0.3), tokens: Math.floor(baseTokens * 0.25), cost: baseTokens * 0.000008 },
      { model: 'Gemini Pro', provider: 'Google', requests: Math.floor(baseRequests * 0.2), tokens: Math.floor(baseTokens * 0.15), cost: baseTokens * 0.000002 },
    ],
    dailyRequests: generateMockChartData(days),
    tokensOverTime: generateMockChartData(days).map(p => ({ ...p, value: p.value * 800 })),
    averageLatency: 1200 + Math.random() * 500,
    successRate: 97 + Math.random() * 3,
    errorRate: Math.random() * 3,
  };
}

function generateMockActivityHeatmap(): ActivityHeatmap {
  const data: ActivityHeatmap['data'] = [];
  const now = new Date();
  let totalContributions = 0;
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let busiestDay = '';
  let busiestDayCount = 0;

  // Generate data for the past year
  for (let i = 364; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Generate count with some patterns (weekends lower, recent days higher)
    const isWeekend = [0, 6].includes(date.getDay());
    const recencyBoost = Math.max(0, (365 - i) / 365);
    const randomFactor = Math.random();

    let count = 0;
    if (randomFactor > 0.3) {
      count = Math.floor(
        (isWeekend ? 2 : 5) * recencyBoost * (1 + Math.random() * 3)
      );
    }

    const level = count === 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 10 ? 3 : 4;

    data.push({
      date: date.toISOString().split('T')[0],
      count,
      level: level as 0 | 1 | 2 | 3 | 4,
    });

    totalContributions += count;

    if (count > 0) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 0;
    }

    if (count > busiestDayCount) {
      busiestDayCount = count;
      busiestDay = date.toISOString().split('T')[0];
    }
  }

  // Calculate current streak from today
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].count > 0) {
      currentStreak++;
    } else {
      break;
    }
  }

  return {
    data,
    totalContributions,
    longestStreak,
    currentStreak,
    busiestDay,
    busiestDayCount,
  };
}

function generateMockAnalytics(timeRange: TimeRange): AnalyticsDashboardData {
  const days = getTimeRangeDays(timeRange);
  const projectAnalytics = generateMockProjectAnalytics();
  const aiAnalytics = generateMockAIAnalytics(timeRange);
  const activityHeatmap = generateMockActivityHeatmap();

  const totalProjects = projectAnalytics.length;
  const totalRequests = aiAnalytics.totalRequests;
  const totalTokens = aiAnalytics.totalTokens;
  const totalCompute = projectAnalytics.reduce((sum, p) => sum + p.computeMinutes, 0);

  return {
    timeRange,
    lastUpdated: new Date().toISOString(),
    overview: {
      totalProjects: {
        title: 'Total Projects',
        value: totalProjects,
        formattedValue: totalProjects.toString(),
        change: 2,
        changePercent: 15,
        trend: 'up',
        icon: 'i-ph:folder',
        color: 'blue',
      },
      aiRequests: {
        title: 'AI Requests',
        value: totalRequests,
        formattedValue: formatNumber(totalRequests),
        change: Math.floor(totalRequests * 0.12),
        changePercent: 12,
        trend: 'up',
        icon: 'i-ph:robot',
        color: 'purple',
      },
      tokensUsed: {
        title: 'Tokens Used',
        value: totalTokens,
        formattedValue: formatNumber(totalTokens),
        change: Math.floor(totalTokens * 0.08),
        changePercent: 8,
        trend: 'up',
        icon: 'i-ph:coins',
        color: 'green',
      },
      computeTime: {
        title: 'Compute Time',
        value: totalCompute,
        formattedValue: formatDuration(totalCompute),
        change: Math.floor(totalCompute * 0.05),
        changePercent: 5,
        trend: 'stable',
        icon: 'i-ph:timer',
        color: 'orange',
      },
    },
    usage: {
      totalProjects,
      activeProjects: Math.ceil(totalProjects * 0.8),
      totalAIRequests: totalRequests,
      totalTokensUsed: totalTokens,
      totalComputeMinutes: totalCompute,
      totalDeployments: projectAnalytics.reduce((sum, p) => sum + p.deployments, 0),
      totalFilesChanged: projectAnalytics.reduce((sum, p) => sum + p.filesCount, 0) * 3,
      totalLinesOfCode: projectAnalytics.reduce((sum, p) => sum + p.linesOfCode, 0),
      dailyUsage: generateMockChartData(Math.min(days, 30)),
      weeklyUsage: generateMockChartData(Math.min(days, 12)).map(p => ({ ...p, value: p.value * 7 })),
      monthlyUsage: generateMockChartData(Math.min(days, 6)).map(p => ({ ...p, value: p.value * 30 })),
    },
    ai: aiAnalytics,
    topProjects: projectAnalytics
      .sort((a, b) => b.activityScore - a.activityScore)
      .slice(0, 5)
      .map(p => ({
        projectId: p.projectId,
        projectName: p.projectName,
        activityScore: p.activityScore,
        aiRequests: p.aiInteractions,
        filesChanged: p.filesCount,
        lastActivity: p.lastActivity,
        trend: Math.random() > 0.3 ? 'up' : Math.random() > 0.5 ? 'down' : 'stable',
      })),
    activityHeatmap,
    projectAnalytics,
  };
}

// ============================================================================
// Utility Exports
// ============================================================================

export {
  formatNumber,
  formatDuration,
  formatCurrency,
  calculateTrend,
  getTimeRangeDays,
};
