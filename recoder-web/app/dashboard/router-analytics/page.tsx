/**
 * Router Analytics Dashboard
 * Web interface for viewing CLI router cost optimization and usage analytics
 */

'use client';

// Force dynamic rendering to avoid SSR issues
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  Activity,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Zap,
  Shield,
  RefreshCw,
  Download,
  Settings,
  AlertCircle,
  CheckCircle,
  Router,
  Server,
  Cpu,
  Clock
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

interface RouterMetrics {
  router_id: string;
  router_name: string;
  status: 'active' | 'idle' | 'disconnected';
  version: string;
  uptime: number;
  last_seen: string;
  enterprise_mode: boolean;
}

interface CostOptimizationData {
  router_id: string;
  time_period: {
    start: Date;
    end: Date;
    duration_hours: number;
  };
  cost_summary: {
    total_requests: number;
    total_cost: number;
    total_tokens: number;
    avg_cost_per_request: number;
    cost_by_provider: Record<string, number>;
    cost_by_model: Record<string, number>;
  };
  optimization_metrics: {
    baseline_cost: number;
    actual_cost: number;
    savings_amount: number;
    savings_percentage: number;
  };
  performance_metrics: {
    avg_response_time: number;
    p95_response_time: number;
    success_rate: number;
    error_rate: number;
  };
  recommendations: Array<{
    type: string;
    current_model: string;
    recommended_model: string;
    potential_savings: number;
    confidence_score: number;
    reasoning: string;
    estimated_quality_impact: number;
  }>;
}

interface RealTimeInsights {
  current_hourly_rate: number;
  projected_monthly_cost: number;
  top_cost_drivers: Array<{
    model: string;
    cost: number;
    percentage: number;
  }>;
  recent_savings: number;
  efficiency_score: number;
}

const CHART_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

function RouterAnalyticsContent() {
  const { data: session } = useSession();
  const [routers, setRouters] = useState<RouterMetrics[]>([]);
  const [selectedRouter, setSelectedRouter] = useState<string>('');
  const [costData, setCostData] = useState<CostOptimizationData | null>(null);
  const [realTimeInsights, setRealTimeInsights] = useState<RealTimeInsights | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');

  useEffect(() => {
    if (session?.user?.id) {
      loadRouters();
    }
  }, [session]);

  useEffect(() => {
    if (selectedRouter) {
      loadRouterAnalytics();
      // Set up real-time updates
      const interval = setInterval(loadRouterAnalytics, 30000); // Update every 30s
      return () => clearInterval(interval);
    }
  }, [selectedRouter, timeRange]);

  const loadRouters = async () => {
    try {
      const response = await fetch(`/api/user/${session?.user?.id}/routers`);
      if (!response.ok) throw new Error('Failed to load routers');
      
      const data = await response.json();
      setRouters(data.routers || []);
      
      if (data.routers?.length > 0 && !selectedRouter) {
        setSelectedRouter(data.routers[0].router_id);
      }
    } catch (error) {
      toast.error('Failed to load routers');
      console.error('Load routers error:', error);
    }
  };

  const loadRouterAnalytics = async () => {
    if (!selectedRouter) return;

    try {
      setIsLoading(true);
      
      // Load cost optimization data
      const [costResponse, insightsResponse] = await Promise.all([
        fetch(`/api/router/${selectedRouter}/cost-analytics?period=${timeRange}`),
        fetch(`/api/router/${selectedRouter}/real-time-insights`)
      ]);

      if (costResponse.ok) {
        const costData = await costResponse.json();
        setCostData(costData.data);
      }

      if (insightsResponse.ok) {
        const insightsData = await insightsResponse.json();
        setRealTimeInsights(insightsData.data);
      }

    } catch (error) {
      toast.error('Failed to load router analytics');
      console.error('Load analytics error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportData = async () => {
    if (!selectedRouter) return;

    try {
      const response = await fetch(`/api/router/${selectedRouter}/export-analytics?period=${timeRange}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `router-analytics-${selectedRouter}-${timeRange}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast.success('Analytics data exported successfully');
    } catch (error) {
      toast.error('Failed to export analytics data');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'idle': return 'bg-yellow-500';
      case 'disconnected': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4" />;
      case 'idle': return <Clock className="h-4 w-4" />;
      case 'disconnected': return <AlertCircle className="h-4 w-4" />;
      default: return <Server className="h-4 w-4" />;
    }
  };

  const selectedRouterData = routers.find(r => r.router_id === selectedRouter);

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Authentication Required</h2>
          <p className="text-muted-foreground mb-6">Please sign in to view router analytics.</p>
          <Button onClick={() => window.location.href = '/auth/signin'}>
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Router Analytics</h1>
          <p className="text-muted-foreground">
            Monitor cost optimization and performance metrics for your CLI routers
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={loadRouterAnalytics} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExportData} disabled={!selectedRouter}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Router Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Router className="h-5 w-5" />
            Connected Routers
          </CardTitle>
          <CardDescription>
            Select a router to view detailed analytics and cost optimization metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {routers.map((router) => (
              <Card
                key={router.router_id}
                className={`cursor-pointer transition-all ${
                  selectedRouter === router.router_id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setSelectedRouter(router.router_id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(router.status)}
                      <span className="font-medium">{router.router_name || router.router_id}</span>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(router.status)}`} />
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>Version: {router.version}</div>
                    <div>Uptime: {Math.floor(router.uptime / 3600)}h</div>
                    <div className="flex items-center gap-2">
                      {router.enterprise_mode && (
                        <Badge variant="secondary" className="text-xs">
                          Enterprise
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {router.status}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedRouter && selectedRouterData && (
        <>
          {/* Real-time Insights Cards */}
          {realTimeInsights && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Current Hourly Rate</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(realTimeInsights.current_hourly_rate)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Projected: {formatCurrency(realTimeInsights.projected_monthly_cost)}/month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Efficiency Score</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatPercentage(realTimeInsights.efficiency_score)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cost optimization performance
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recent Savings</CardTitle>
                  <TrendingDown className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(realTimeInsights.recent_savings)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Since last optimization
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Status</CardTitle>
                  {getStatusIcon(selectedRouterData.status)}
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold capitalize">
                    {selectedRouterData.status}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Last seen: {new Date(selectedRouterData.last_seen).toLocaleTimeString()}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Time Range Selector */}
          <div className="flex justify-between items-center">
            <Tabs value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
              <TabsList>
                <TabsTrigger value="1h">1 Hour</TabsTrigger>
                <TabsTrigger value="24h">24 Hours</TabsTrigger>
                <TabsTrigger value="7d">7 Days</TabsTrigger>
                <TabsTrigger value="30d">30 Days</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Analytics Tabs */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="costs">Costs</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="optimization">Optimization</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {costData && (
                <>
                  {/* Cost Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Activity className="h-5 w-5" />
                          Total Requests
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">
                          {costData.cost_summary.total_requests.toLocaleString()}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Avg cost: {formatCurrency(costData.cost_summary.avg_cost_per_request)}
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <DollarSign className="h-5 w-5" />
                          Total Cost
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">
                          {formatCurrency(costData.cost_summary.total_cost)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {costData.cost_summary.total_tokens.toLocaleString()} tokens
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingDown className="h-5 w-5 text-green-600" />
                          Cost Savings
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-green-600">
                          {formatCurrency(costData.optimization_metrics.savings_amount)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatPercentage(costData.optimization_metrics.savings_percentage)} saved
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Cost by Provider Chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Cost by Provider</CardTitle>
                      <CardDescription>
                        Distribution of costs across AI providers
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={Object.entries(costData.cost_summary.cost_by_provider).map(([provider, cost]) => ({
                              name: provider,
                              value: cost,
                              percentage: ((cost / costData.cost_summary.total_cost) * 100).toFixed(1)
                            }))}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percentage }) => `${name} ${percentage}%`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {Object.entries(costData.cost_summary.cost_by_provider).map((_, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: any) => formatCurrency(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            <TabsContent value="costs" className="space-y-6">
              {costData && (
                <>
                  {/* Cost Breakdown */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Cost by Model</CardTitle>
                      <CardDescription>
                        Detailed breakdown of costs by AI model
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart
                          data={Object.entries(costData.cost_summary.cost_by_model).map(([model, cost]) => ({
                            model,
                            cost,
                            percentage: ((cost / costData.cost_summary.total_cost) * 100)
                          }))}
                          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="model" angle={-45} textAnchor="end" height={100} />
                          <YAxis />
                          <Tooltip formatter={(value: any) => formatCurrency(value)} />
                          <Bar dataKey="cost" fill="#0088FE" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Top Cost Drivers */}
                  {realTimeInsights && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Top Cost Drivers</CardTitle>
                        <CardDescription>
                          Models consuming the most budget
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {realTimeInsights.top_cost_drivers.slice(0, 5).map((driver, index) => (
                            <div key={driver.model} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="text-2xl font-bold text-muted-foreground">
                                  #{index + 1}
                                </div>
                                <div>
                                  <div className="font-medium">{driver.model}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {formatPercentage(driver.percentage)} of total cost
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold">{formatCurrency(driver.cost)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="performance" className="space-y-6">
              {costData && (
                <>
                  {/* Performance Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Response Time</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between">
                              <span>Average</span>
                              <span className="font-bold">
                                {costData.performance_metrics.avg_response_time.toFixed(0)}ms
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between">
                              <span>95th Percentile</span>
                              <span className="font-bold">
                                {costData.performance_metrics.p95_response_time.toFixed(0)}ms
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Reliability</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between">
                              <span>Success Rate</span>
                              <span className="font-bold text-green-600">
                                {formatPercentage(costData.performance_metrics.success_rate * 100)}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between">
                              <span>Error Rate</span>
                              <span className="font-bold text-red-600">
                                {formatPercentage(costData.performance_metrics.error_rate * 100)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="optimization" className="space-y-6">
              {costData && (
                <>
                  {/* Optimization Overview */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Cost Optimization Performance</CardTitle>
                      <CardDescription>
                        How much you're saving compared to baseline costs
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-red-500">
                            {formatCurrency(costData.optimization_metrics.baseline_cost)}
                          </div>
                          <p className="text-sm text-muted-foreground">Baseline Cost</p>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-500">
                            {formatCurrency(costData.optimization_metrics.actual_cost)}
                          </div>
                          <p className="text-sm text-muted-foreground">Actual Cost</p>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-500">
                            {formatCurrency(costData.optimization_metrics.savings_amount)}
                          </div>
                          <p className="text-sm text-muted-foreground">Total Savings</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Optimization Recommendations */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Optimization Recommendations</CardTitle>
                      <CardDescription>
                        AI-powered suggestions to reduce costs further
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {costData.recommendations.map((recommendation, index) => (
                          <Card key={index} className="border-l-4 border-l-blue-500">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="secondary">{recommendation.type.replace('_', ' ')}</Badge>
                                    <Badge variant="outline">
                                      {formatPercentage(recommendation.confidence_score * 100)} confidence
                                    </Badge>
                                  </div>
                                  <p className="font-medium mb-2">{recommendation.reasoning}</p>
                                  <div className="text-sm text-muted-foreground">
                                    <div>Current: {recommendation.current_model}</div>
                                    <div>Recommended: {recommendation.recommended_model}</div>
                                    {recommendation.estimated_quality_impact !== 0 && (
                                      <div className={
                                        recommendation.estimated_quality_impact > 0 
                                          ? 'text-green-600' 
                                          : 'text-yellow-600'
                                      }>
                                        Quality impact: {recommendation.estimated_quality_impact > 0 ? '+' : ''}{recommendation.estimated_quality_impact}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-lg font-bold text-green-600">
                                    {formatCurrency(recommendation.potential_savings)}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    potential savings
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      {routers.length === 0 && !isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Router className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Routers Connected</h3>
            <p className="text-muted-foreground text-center mb-4">
              Connect your CLI router to start viewing analytics and cost optimization metrics.
            </p>
            <Button onClick={() => window.open('https://docs.recoder.xyz/router/setup', '_blank')}>
              Setup Router
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function RouterAnalyticsPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="container mx-auto py-8 space-y-8">
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return <RouterAnalyticsContent />;
}