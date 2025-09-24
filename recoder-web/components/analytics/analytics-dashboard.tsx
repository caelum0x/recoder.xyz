'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  Activity,
  Users,
  Brain,
  TrendingUp,
  Download,
  Eye,
  Clock,
  Zap,
  AlertCircle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';

interface AnalyticsDashboardProps {
  timeRange: 'day' | 'week' | 'month' | 'year';
  userId?: string;
}

interface UsageMetrics {
  sessions: {
    total: number;
    active: number;
    avgDuration: number;
    bounceRate: number;
    returning: number;
    new: number;
  };
  activities: {
    total: number;
    byType: Record<string, number>;
    byCategory: Record<string, number>;
    trends: Array<{ date: string; count: number }>;
  };
  features: {
    total: number;
    popular: Array<{ name: string; usage: number; growth: number }>;
    adoption: Array<{ feature: string; users: number; percentage: number }>;
  };
  ai: {
    totalRequests: number;
    totalTokens: number;
    avgResponseTime: number;
    successRate: number;
    topModels: Array<{ model: string; usage: number; performance: number }>;
    errorRate: number;
  };
  business: {
    activeUsers: number;
    retention: { d1: number; d7: number; d30: number };
    engagement: number;
    conversion: number;
    revenue: number;
    growth: number;
  };
  realtime: {
    activeUsers: number;
    currentRequests: number;
    systemLoad: number;
    errorRate: number;
  };
}

interface Insight {
  id: string;
  type: 'performance' | 'usage' | 'business' | 'technical';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommendation: string;
  impact: 'low' | 'medium' | 'high';
  confidence: number;
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088FE', '#00C49F'];

export function AnalyticsDashboard({ timeRange, userId }: AnalyticsDashboardProps) {
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all analytics data in parallel
      const [usageRes, featuresRes, aiRes, businessRes, realtimeRes, insightsRes] = await Promise.all([
        fetch(`/api/analytics/usage-stats?timeRange=${timeRange}${userId ? `&userId=${userId}` : ''}`),
        fetch(`/api/analytics/features?timeRange=${timeRange}`),
        fetch(`/api/analytics/ai-usage?timeRange=${timeRange}`),
        fetch(`/api/analytics/business?timeRange=${timeRange}`),
        fetch('/api/analytics/realtime'),
        fetch(`/api/analytics/insights?timeRange=${timeRange}`)
      ]);

      if (!usageRes.ok || !featuresRes.ok || !aiRes.ok || !businessRes.ok || !realtimeRes.ok || !insightsRes.ok) {
        throw new Error('Failed to fetch analytics data');
      }

      const [usage, features, ai, business, realtime, insightsData] = await Promise.all([
        usageRes.json(),
        featuresRes.json(),
        aiRes.json(),
        businessRes.json(),
        realtimeRes.json(),
        insightsRes.json()
      ]);

      setMetrics({
        sessions: usage.sessions,
        activities: usage.activities,
        features,
        ai,
        business,
        realtime
      });

      setInsights(insightsData.insights || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange, userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive">{error}</p>
          <Button onClick={fetchAnalytics} className="mt-4">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'warning': return 'bg-yellow-500';
      default: return 'bg-blue-500';
    }
  };

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case 'high': return <Badge variant="destructive">High Impact</Badge>;
      case 'medium': return <Badge variant="secondary">Medium Impact</Badge>;
      default: return <Badge variant="outline">Low Impact</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Comprehensive usage analytics and insights for {timeRange}
          </p>
        </div>
        <Button 
          onClick={refreshData} 
          disabled={refreshing}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Real-time Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.realtime.activeUsers}</div>
            <div className="flex items-center text-xs text-green-600">
              <TrendingUp className="h-3 w-3 mr-1" />
              Live
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.realtime.currentRequests}</div>
            <div className="flex items-center text-xs text-blue-600">
              <Zap className="h-3 w-3 mr-1" />
              Processing
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Load</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.realtime.systemLoad.toFixed(1)}%</div>
            <div className="flex items-center text-xs text-yellow-600">
              <Clock className="h-3 w-3 mr-1" />
              {metrics.realtime.systemLoad > 80 ? 'High' : 'Normal'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(100 - metrics.realtime.errorRate).toFixed(1)}%</div>
            <div className="flex items-center text-xs text-green-600">
              <CheckCircle className="h-3 w-3 mr-1" />
              Operational
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="ai">AI Usage</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Session Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Session Overview</CardTitle>
                <CardDescription>User session metrics for {timeRange}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Total Sessions:</span>
                    <span className="font-bold">{metrics.sessions.total.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Active Sessions:</span>
                    <span className="font-bold">{metrics.sessions.active.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg Duration:</span>
                    <span className="font-bold">{Math.round(metrics.sessions.avgDuration / 60)}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bounce Rate:</span>
                    <span className="font-bold">{metrics.sessions.bounceRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Returning Users:</span>
                    <span className="font-bold">{metrics.sessions.returning.toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Activity Trends */}
            <Card>
              <CardHeader>
                <CardTitle>Activity Trends</CardTitle>
                <CardDescription>User activity over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={metrics.activities.trends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Activity by Type */}
            <Card>
              <CardHeader>
                <CardTitle>Activity Distribution</CardTitle>
                <CardDescription>Activities by type</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={Object.entries(metrics.activities.byType).map(([name, value]) => ({ name, value }))}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(props: any) => `${props.name || props.segment || props.category || props.cycle || props.period || "Item"}: ${props.value || props.customerCount || props.totalRevenue || props.count || 0}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {Object.entries(metrics.activities.byType).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Business Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Business Metrics</CardTitle>
                <CardDescription>Key business indicators</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Active Users:</span>
                    <span className="font-bold">{metrics.business.activeUsers.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Day 1 Retention:</span>
                    <span className="font-bold">{metrics.business.retention.d1.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Day 7 Retention:</span>
                    <span className="font-bold">{metrics.business.retention.d7.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Engagement Score:</span>
                    <span className="font-bold">{metrics.business.engagement.toFixed(1)}/10</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Conversion Rate:</span>
                    <span className="font-bold">{metrics.business.conversion.toFixed(1)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="features" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Popular Features */}
            <Card>
              <CardHeader>
                <CardTitle>Popular Features</CardTitle>
                <CardDescription>Most used features this {timeRange}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={metrics.features.popular}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="usage" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Feature Adoption */}
            <Card>
              <CardHeader>
                <CardTitle>Feature Adoption</CardTitle>
                <CardDescription>User adoption rates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {metrics.features.adoption.slice(0, 8).map((feature, index) => (
                    <div key={feature.feature} className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex justify-between text-sm">
                          <span>{feature.feature}</span>
                          <span>{feature.percentage.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${feature.percentage}%` }}
                          ></div>
                        </div>
                      </div>
                      <span className="ml-4 text-sm text-muted-foreground">
                        {feature.users} users
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* AI Usage Overview */}
            <Card>
              <CardHeader>
                <CardTitle>AI Usage Overview</CardTitle>
                <CardDescription>AI interaction metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Total Requests:</span>
                    <span className="font-bold">{metrics.ai.totalRequests.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Tokens:</span>
                    <span className="font-bold">{metrics.ai.totalTokens.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg Response Time:</span>
                    <span className="font-bold">{metrics.ai.avgResponseTime.toFixed(0)}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Success Rate:</span>
                    <span className="font-bold">{metrics.ai.successRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Error Rate:</span>
                    <span className="font-bold text-red-600">{metrics.ai.errorRate.toFixed(1)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top AI Models */}
            <Card>
              <CardHeader>
                <CardTitle>Top AI Models</CardTitle>
                <CardDescription>Most used AI models by performance</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={metrics.ai.topModels}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="model" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="usage" fill="#8884d8" />
                    <Bar dataKey="performance" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="business" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>User Retention</CardTitle>
                <CardDescription>Retention rates over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{metrics.business.retention.d1.toFixed(1)}%</div>
                    <div className="text-sm text-muted-foreground">Day 1</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{metrics.business.retention.d7.toFixed(1)}%</div>
                    <div className="text-sm text-muted-foreground">Day 7</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{metrics.business.retention.d30.toFixed(1)}%</div>
                    <div className="text-sm text-muted-foreground">Day 30</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Engagement</CardTitle>
                <CardDescription>User engagement score</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="text-4xl font-bold">{metrics.business.engagement.toFixed(1)}</div>
                  <div className="text-sm text-muted-foreground">out of 10</div>
                  <div className="mt-4">
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-green-600 h-3 rounded-full" 
                        style={{ width: `${(metrics.business.engagement / 10) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Growth</CardTitle>
                <CardDescription>Growth rate this {timeRange}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="text-4xl font-bold text-green-600">
                    +{metrics.business.growth.toFixed(1)}%
                  </div>
                  <div className="text-sm text-muted-foreground">vs previous {timeRange}</div>
                  <div className="mt-4 flex items-center justify-center text-green-600">
                    <TrendingUp className="h-4 w-4 mr-1" />
                    Growing
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {insights.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No insights available for this time period.</p>
                </CardContent>
              </Card>
            ) : (
              insights.map((insight) => (
                <Card key={insight.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${getSeverityColor(insight.severity)}`}></div>
                        <CardTitle className="text-lg">{insight.title}</CardTitle>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getImpactBadge(insight.impact)}
                        <Badge variant="outline">{insight.confidence}% confidence</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground mb-4">{insight.description}</p>
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-blue-900 mb-2">Recommendation:</h4>
                      <p className="text-blue-800">{insight.recommendation}</p>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}