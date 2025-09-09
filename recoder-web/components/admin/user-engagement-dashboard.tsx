'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { Users, Activity, Clock, Target, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Eye, MousePointer, Zap, Calendar, Award, UserCheck } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { addDays, format } from 'date-fns';

interface EngagementOverview {
  totalActiveUsers: number;
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  dau_mau_ratio: number;
  wau_mau_ratio: number;
  totalSessions: number;
  newUsers: number;
  avgSessionsPerUser: number;
}

interface UserActivity {
  averageActionsPerUser: number;
  averageActiveDaysPerUser: number;
  activityFrequencyDistribution: Array<{
    range: string;
    count: number;
  }>;
  mostActiveUsers: Array<{
    userId: string;
    totalActions: number;
    activeDays: number;
  }>;
  leastActiveUsers: Array<{
    userId: string;
    totalActions: number;
    activeDays: number;
  }>;
}

interface SessionAnalytics {
  avgSessionDurationMinutes: number;
  medianSessionDurationMinutes: number;
  avgActionsPerSession: number;
  totalSessions: number;
  sessionsByHour: Array<{
    hour: number;
    uniqueUsers: number;
    totalActions: number;
  }>;
  sessionsByDayOfWeek: Array<{
    dayOfWeek: number;
    uniqueUsers: number;
    totalActions: number;
  }>;
}

interface FeatureUsage {
  topFeatures: Array<{
    action: string;
    platform: string;
    usageCount: number;
    uniqueUsers: number;
    successRate: number;
    adoptionRate: number;
  }>;
  platformUsage: Array<{
    platform: string;
    totalUsage: number;
  }>;
  totalFeatureInteractions: number;
  averageSuccessRate: number;
}

interface TimeSeries {
  period: string;
  activeUsers: number;
  totalActions: number;
  logins: number;
  successRate: number;
  actionsPerUser: number;
}

interface CohortAnalysis {
  cohortMonth: string;
  cohortSize: number;
  activeUsers: number;
  activationRate: number;
  avgActionsPerUser: number;
  avgActiveDays: number;
  highlyEngagedUsers: number;
  recentlyActive: number;
}

interface EngagementScoring {
  userScores: Array<{
    userId: string;
    name: string;
    email: string;
    signupDate: string;
    totalActions: number;
    activeDays: number;
    uniqueFeaturesUsed: number;
    successRate: number;
    lastActivity: string;
    engagementScore: number;
    engagementLevel: string;
  }>;
  distribution: Array<{
    level: string;
    count: number;
  }>;
  averageScore: number;
}

interface ContentEngagement {
  contentType: string;
  totalInteractions: number;
  uniqueUsers: number;
  successRate: number;
  successfulInteractions: number;
}

interface RetentionAnalysis {
  firstWeek: string;
  cohortSize: number;
  week1Retained: number;
  week2Retained: number;
  week4Retained: number;
  week8Retained: number;
  week1RetentionRate: number;
  week2RetentionRate: number;
  week4RetentionRate: number;
  week8RetentionRate: number;
}

interface DetailedMetrics {
  powerUsers: Array<{
    userId: string;
    name: string;
    email: string;
    totalActions: number;
    uniqueActions: number;
    activeDays: number;
  }>;
  atRiskUsers: Array<{
    userId: string;
    name: string;
    email: string;
    recentActions: number;
    previousActions: number;
    activityChangePercent: number;
  }>;
}

interface UserEngagementData {
  period: string;
  dateRange: { startDate: string; endDate: string };
  overview: EngagementOverview;
  userActivity: UserActivity;
  sessionAnalytics: SessionAnalytics;
  featureUsage: FeatureUsage;
  timeSeries: TimeSeries[];
  cohortAnalysis: CohortAnalysis[];
  engagementScoring: EngagementScoring;
  contentEngagement: ContentEngagement[];
  retentionAnalysis: RetentionAnalysis[];
  segmentedAnalysis?: Array<{
    segment: string;
    uniqueUsers: number;
    totalActions: number;
    successRate: number;
    uniqueFeaturesUsed: number;
    totalActiveDays: number;
    actionsPerUser: number;
  }>;
  detailedMetrics: DetailedMetrics | null;
  lastUpdated: string;
}

export default function UserEngagementDashboard() {
  const [data, setData] = useState<UserEngagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('month');
  const [granularity, setGranularity] = useState('day');
  const [segmentBy, setSegmentBy] = useState('');
  const [includeDetailedMetrics, setIncludeDetailedMetrics] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: addDays(new Date(), -30),
    to: new Date(),
  });
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchEngagementData();
  }, [period, granularity, segmentBy, includeDetailedMetrics, dateRange]);

  const fetchEngagementData = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        period,
        granularity,
        includeDetailedMetrics: includeDetailedMetrics.toString(),
      });

      if (segmentBy) params.append('segmentBy', segmentBy);
      if (dateRange?.from) params.append('startDate', dateRange.from.toISOString());
      if (dateRange?.to) params.append('endDate', dateRange.to.toISOString());

      const response = await fetch(`/api/admin/user-engagement?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch user engagement data: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('User engagement fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatPercentage = (percentage: number) => {
    return `${percentage.toFixed(1)}%`;
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 1) return `${Math.round(minutes * 60)}s`;
    if (minutes < 60) return `${Math.round(minutes)}m`;
    return `${Math.round(minutes / 60)}h ${Math.round(minutes % 60)}m`;
  };

  const getEngagementColor = (level: string) => {
    switch (level) {
      case 'High': return 'text-green-600';
      case 'Medium': return 'text-yellow-600';
      case 'Low': return 'text-orange-600';
      default: return 'text-red-600';
    }
  };

  const getEngagementBadge = (level: string) => {
    switch (level) {
      case 'High': return 'default';
      case 'Medium': return 'secondary';
      case 'Low': return 'secondary';
      default: return 'destructive';
    }
  };

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#d084d0', '#ffb347'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading user engagement data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-700">Error Loading Engagement Data</h3>
          <p className="text-gray-600">{error}</p>
          <Button onClick={fetchEngagementData} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div>No engagement data available</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Engagement Analytics</h1>
          <p className="text-gray-600">Comprehensive user behavior and engagement insights</p>
          <p className="text-sm text-gray-500 mt-1">Last updated: {new Date(data.lastUpdated).toLocaleString()}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <DatePickerWithRange
            date={dateRange}
            onDateChange={setDateRange}
            className="w-72"
          />
          
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="quarter">Quarter</SelectItem>
              <SelectItem value="year">Year</SelectItem>
            </SelectContent>
          </Select>

          <Select value={granularity} onValueChange={setGranularity}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hour">Hourly</SelectItem>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
            </SelectContent>
          </Select>

          <Select value={segmentBy} onValueChange={setSegmentBy}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Segment by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              <SelectItem value="user_type">User Type</SelectItem>
              <SelectItem value="plan">Plan</SelectItem>
              <SelectItem value="acquisition_channel">Channel</SelectItem>
              <SelectItem value="company_size">Company Size</SelectItem>
              <SelectItem value="region">Region</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={fetchEngagementData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Key Engagement Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Daily Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overview.dailyActiveUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              DAU/MAU: {formatPercentage(data.overview.dau_mau_ratio)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Active Users</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overview.monthlyActiveUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              WAU/MAU: {formatPercentage(data.overview.wau_mau_ratio)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Session Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(data.sessionAnalytics.avgSessionDurationMinutes)}</div>
            <p className="text-xs text-muted-foreground">
              {data.sessionAnalytics.avgActionsPerSession.toFixed(1)} actions/session
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Feature Success Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercentage(data.featureUsage.averageSuccessRate)}</div>
            <p className="text-xs text-muted-foreground">
              {data.featureUsage.totalFeatureInteractions.toLocaleString()} total interactions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* At-Risk Users Alert */}
      {data.detailedMetrics && data.detailedMetrics.atRiskUsers.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">User Engagement Alert</AlertTitle>
          <AlertDescription className="text-amber-700">
            {data.detailedMetrics.atRiskUsers.length} previously active users have shown significant decline in engagement.
            Consider implementing re-engagement strategies.
          </AlertDescription>
        </Alert>
      )}

      {/* Engagement Score Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Engagement Score Distribution</CardTitle>
          <CardDescription>User engagement levels based on activity, recency, and feature usage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {data.engagementScoring.distribution.map((dist) => (
              <div key={dist.level} className="text-center p-4 rounded-lg border">
                <div className={`text-2xl font-bold ${getEngagementColor(dist.level)}`}>
                  {dist.count}
                </div>
                <Badge variant={getEngagementBadge(dist.level)} className="mt-1">
                  {dist.level}
                </Badge>
              </div>
            ))}
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-600">Average Engagement Score</div>
            <div className="text-3xl font-bold text-blue-600">{data.engagementScoring.averageScore.toFixed(1)}</div>
          </div>
        </CardContent>
      </Card>

      {/* Main Engagement Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="cohorts">Cohorts</TabsTrigger>
          <TabsTrigger value="retention">Retention</TabsTrigger>
          <TabsTrigger value="users">Top Users</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Engagement Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Engagement Trend</CardTitle>
                <CardDescription>Active users and actions over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={data.timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="activeUsers" fill="#8884d8" name="Active Users" />
                    <Line yAxisId="right" type="monotone" dataKey="actionsPerUser" stroke="#82ca9d" name="Actions/User" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Activity Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Activity Frequency Distribution</CardTitle>
                <CardDescription>How users distribute across activity levels</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.userActivity.activityFrequencyDistribution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="range" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8884d8" name="User Count" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Content Engagement */}
          <Card>
            <CardHeader>
              <CardTitle>Content Engagement</CardTitle>
              <CardDescription>User interaction with key features</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.contentEngagement}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="contentType" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="totalInteractions" fill="#8884d8" name="Total Interactions" />
                  <Bar dataKey="uniqueUsers" fill="#82ca9d" name="Unique Users" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Average Actions/User</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {data.userActivity.averageActionsPerUser.toFixed(1)}
                </div>
                <p className="text-sm text-gray-600 mt-1">actions in period</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Average Active Days</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {data.userActivity.averageActiveDaysPerUser.toFixed(1)}
                </div>
                <p className="text-sm text-gray-600 mt-1">days per user</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Total Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-purple-600">
                  {data.overview.totalSessions.toLocaleString()}
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {data.overview.avgSessionsPerUser.toFixed(1)} per user
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Segmented Analysis */}
          {data.segmentedAnalysis && (
            <Card>
              <CardHeader>
                <CardTitle>Segmented Engagement Analysis</CardTitle>
                <CardDescription>Engagement metrics by {segmentBy}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 p-3 text-left">Segment</th>
                        <th className="border border-gray-300 p-3 text-right">Users</th>
                        <th className="border border-gray-300 p-3 text-right">Actions/User</th>
                        <th className="border border-gray-300 p-3 text-right">Success Rate</th>
                        <th className="border border-gray-300 p-3 text-right">Features Used</th>
                        <th className="border border-gray-300 p-3 text-right">Active Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.segmentedAnalysis.map((segment, index) => (
                        <tr key={segment.segment} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="border border-gray-300 p-3 font-medium">{segment.segment}</td>
                          <td className="border border-gray-300 p-3 text-right">{segment.uniqueUsers}</td>
                          <td className="border border-gray-300 p-3 text-right">{segment.actionsPerUser.toFixed(1)}</td>
                          <td className="border border-gray-300 p-3 text-right">{formatPercentage(segment.successRate)}</td>
                          <td className="border border-gray-300 p-3 text-right">{segment.uniqueFeaturesUsed}</td>
                          <td className="border border-gray-300 p-3 text-right">{segment.totalActiveDays}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="features" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Features by Usage</CardTitle>
              <CardDescription>Most used features and their adoption rates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.featureUsage.topFeatures.slice(0, 15).map((feature, index) => (
                  <div key={`${feature.action}-${feature.platform}`} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-bold text-blue-600">
                        #{index + 1}
                      </div>
                      <div>
                        <div className="font-semibold">{feature.action.replace(/_/g, ' ').toUpperCase()}</div>
                        <div className="text-sm text-gray-600">
                          Platform: {feature.platform} | Success: {formatPercentage(feature.successRate)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{feature.usageCount.toLocaleString()}</div>
                      <div className="text-sm text-gray-600">{feature.uniqueUsers} users</div>
                      <Badge variant="secondary">{formatPercentage(feature.adoptionRate)} adoption</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Platform Usage Distribution</CardTitle>
              <CardDescription>Feature usage across platforms</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.featureUsage.platformUsage}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ platform, totalUsage }) => `${platform}: ${totalUsage.toLocaleString()}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="totalUsage"
                  >
                    {data.featureUsage.platformUsage.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sessions by Hour */}
            <Card>
              <CardHeader>
                <CardTitle>Activity by Hour of Day</CardTitle>
                <CardDescription>When users are most active</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.sessionAnalytics.sessionsByHour}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" tickFormatter={(value) => `${value}:00`} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="uniqueUsers" fill="#8884d8" name="Unique Users" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Sessions by Day of Week */}
            <Card>
              <CardHeader>
                <CardTitle>Activity by Day of Week</CardTitle>
                <CardDescription>Weekly usage patterns</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.sessionAnalytics.sessionsByDayOfWeek}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="dayOfWeek" tickFormatter={(value) => dayNames[value]} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="uniqueUsers" fill="#82ca9d" name="Unique Users" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Avg Duration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatDuration(data.sessionAnalytics.avgSessionDurationMinutes)}</div>
                <p className="text-sm text-gray-600 mt-1">per session</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Median Duration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatDuration(data.sessionAnalytics.medianSessionDurationMinutes)}</div>
                <p className="text-sm text-gray-600 mt-1">per session</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Actions/Session</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.sessionAnalytics.avgActionsPerSession.toFixed(1)}</div>
                <p className="text-sm text-gray-600 mt-1">average</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Total Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.sessionAnalytics.totalSessions.toLocaleString()}</div>
                <p className="text-sm text-gray-600 mt-1">in period</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="cohorts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>User Cohort Analysis</CardTitle>
              <CardDescription>Engagement metrics by signup cohort</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 p-2 text-left">Cohort Month</th>
                      <th className="border border-gray-300 p-2 text-right">Size</th>
                      <th className="border border-gray-300 p-2 text-right">Active Users</th>
                      <th className="border border-gray-300 p-2 text-right">Activation Rate</th>
                      <th className="border border-gray-300 p-2 text-right">Avg Actions/User</th>
                      <th className="border border-gray-300 p-2 text-right">Highly Engaged</th>
                      <th className="border border-gray-300 p-2 text-right">Recently Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cohortAnalysis.map((cohort, index) => (
                      <tr key={cohort.cohortMonth} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 p-2">
                          {new Date(cohort.cohortMonth).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                        </td>
                        <td className="border border-gray-300 p-2 text-right font-medium">{cohort.cohortSize}</td>
                        <td className="border border-gray-300 p-2 text-right">{cohort.activeUsers}</td>
                        <td className="border border-gray-300 p-2 text-right">
                          <Badge variant={cohort.activationRate >= 70 ? 'default' : cohort.activationRate >= 50 ? 'secondary' : 'destructive'}>
                            {formatPercentage(cohort.activationRate)}
                          </Badge>
                        </td>
                        <td className="border border-gray-300 p-2 text-right">{cohort.avgActionsPerUser.toFixed(1)}</td>
                        <td className="border border-gray-300 p-2 text-right">{cohort.highlyEngagedUsers}</td>
                        <td className="border border-gray-300 p-2 text-right">{cohort.recentlyActive}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="retention" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>User Retention Analysis</CardTitle>
              <CardDescription>Weekly retention rates by cohort</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 p-2 text-left">First Week</th>
                      <th className="border border-gray-300 p-2 text-right">Cohort Size</th>
                      <th className="border border-gray-300 p-2 text-right">Week 1</th>
                      <th className="border border-gray-300 p-2 text-right">Week 2</th>
                      <th className="border border-gray-300 p-2 text-right">Week 4</th>
                      <th className="border border-gray-300 p-2 text-right">Week 8</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.retentionAnalysis.map((retention, index) => (
                      <tr key={retention.firstWeek} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 p-2">
                          {new Date(retention.firstWeek).toLocaleDateString()}
                        </td>
                        <td className="border border-gray-300 p-2 text-right font-medium">{retention.cohortSize}</td>
                        <td className="border border-gray-300 p-2 text-right">
                          <div className="text-sm">
                            <div>{formatPercentage(retention.week1RetentionRate)}</div>
                            <div className="text-gray-500">({retention.week1Retained})</div>
                          </div>
                        </td>
                        <td className="border border-gray-300 p-2 text-right">
                          <div className="text-sm">
                            <div>{formatPercentage(retention.week2RetentionRate)}</div>
                            <div className="text-gray-500">({retention.week2Retained})</div>
                          </div>
                        </td>
                        <td className="border border-gray-300 p-2 text-right">
                          <div className="text-sm">
                            <div>{formatPercentage(retention.week4RetentionRate)}</div>
                            <div className="text-gray-500">({retention.week4Retained})</div>
                          </div>
                        </td>
                        <td className="border border-gray-300 p-2 text-right">
                          <div className="text-sm">
                            <div>{formatPercentage(retention.week8RetentionRate)}</div>
                            <div className="text-gray-500">({retention.week8Retained})</div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          {data.detailedMetrics && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Power Users (Top 10% Most Active)</CardTitle>
                  <CardDescription>Users with highest activity levels</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {data.detailedMetrics.powerUsers.slice(0, 20).map((user, index) => (
                      <div key={user.userId} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-4">
                          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-sm font-bold text-green-600">
                            #{index + 1}
                          </div>
                          <div>
                            <h4 className="font-semibold">{user.name || user.email}</h4>
                            <div className="flex items-center space-x-4 mt-1">
                              <span className="text-sm text-gray-600">
                                Actions: {user.totalActions}
                              </span>
                              <span className="text-sm text-gray-600">
                                Features: {user.uniqueActions}
                              </span>
                              <span className="text-sm text-gray-600">
                                Active Days: {user.activeDays}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Badge variant="default">
                          <Award className="h-3 w-3 mr-1" />
                          Power User
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>At-Risk Users</CardTitle>
                  <CardDescription>Previously active users showing declining engagement</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {data.detailedMetrics.atRiskUsers.slice(0, 20).map((user) => (
                      <div key={user.userId} className="flex items-center justify-between p-4 border rounded-lg bg-amber-50">
                        <div>
                          <h4 className="font-semibold">{user.name || user.email}</h4>
                          <div className="flex items-center space-x-4 mt-1">
                            <span className="text-sm text-gray-600">
                              Recent: {user.recentActions} actions
                            </span>
                            <span className="text-sm text-gray-600">
                              Previous: {user.previousActions} actions
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant="destructive">
                            {user.activityChangePercent.toFixed(0)}% decline
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}