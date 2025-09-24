'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Users, AlertTriangle, Target, Zap, RefreshCw, Download, Calendar, Activity, CreditCard, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { addDays, format } from 'date-fns';

interface SubscriptionOverview {
  activeSubscriptions: number;
  newSubscriptions: number;
  cancelledSubscriptions: number;
  netGrowth: number;
  statusBreakdown: Array<{
    status: string;
    count: number;
  }>;
  billingCycleBreakdown: Array<{
    cycle: string;
    count: number;
    totalRevenue: number;
  }>;
  planDistribution: Array<{
    plan: string;
    count: number;
    totalRevenue: number;
  }>;
}

interface SubscriptionLifecycle {
  trialConversions: number;
  totalTrials: number;
  trialConversionRate: number;
  avgDurationDays: number;
  subscriptionChanges: Array<{
    changeType: string;
    count: number;
  }>;
}

interface SubscriptionRevenue {
  mrr: number;
  arr: number;
  newMRR: number;
  churnedMRR: number;
  expansionMRR: number;
  contractionMRR: number;
  netNewMRR: number;
  netExpansionMRR: number;
  totalNetMRR: number;
}

interface TimeSeries {
  period: string;
  newSubscriptions: number;
  activeSubscriptions: number;
  revenue: number;
  avgAmount: number;
}

interface PlanPerformance {
  plan: string;
  totalSubscriptions: number;
  activeSubscriptions: number;
  churnedSubscriptions: number;
  churnRate: number;
  totalRevenue: number;
  avgRevenue: number;
  avgLifetimeDays: number;
}

interface ChurnAnalysis {
  totalChurned: number;
  churnRate: number;
  churnByPlan: Array<{
    plan: string;
    count: number;
  }>;
  churnTimingDistribution: Array<{
    period: string;
    count: number;
  }>;
  avgDaysToChurn: number;
}

interface UpgradeDowngradePatterns {
  totalUpgrades: number;
  totalDowngrades: number;
  netUpgrades: number;
  upgradePatterns: Array<{
    pattern: string;
    count: number;
  }>;
  downgradePatterns: Array<{
    pattern: string;
    count: number;
  }>;
  avgTimeToUpgrade: number;
  totalRevenueImpact: number;
}

interface CohortRetention {
  cohortMonth: string;
  cohortSize: number;
  retainedMonth1: number;
  retentionRate1: number;
  retainedMonth3: number;
  retentionRate3: number;
  retainedMonth6: number;
  retentionRate6: number;
  retainedMonth12: number;
  retentionRate12: number;
}

interface SubscriptionForecasts {
  currentMRR: number;
  monthlyGrowthRate: number;
  forecasts: Array<{
    month: number;
    projectedMRR: number;
    projectedARR: number;
    projectedSubscriptions: number;
    confidenceInterval: {
      low: number;
      high: number;
    };
  }>;
}

interface SubscriptionMetricsData {
  period: string;
  dateRange: { startDate: string; endDate: string };
  overview: SubscriptionOverview;
  lifecycle: SubscriptionLifecycle;
  revenue: SubscriptionRevenue;
  timeSeries: TimeSeries[];
  planPerformance: PlanPerformance[];
  churnAnalysis: ChurnAnalysis;
  upgradeDowngradePatterns: UpgradeDowngradePatterns;
  cohortRetention: CohortRetention[];
  segmentedAnalysis?: Array<{
    segment: string;
    totalSubscriptions: number;
    activeSubscriptions: number;
    churnedInPeriod: number;
    churnRate: number;
    totalRevenue: number;
    avgRevenue: number;
    avgLifetimeDays: number;
  }>;
  forecasts: SubscriptionForecasts | null;
  lastUpdated: string;
}

export default function SubscriptionMetricsDashboard() {
  const [data, setData] = useState<SubscriptionMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('month');
  const [granularity, setGranularity] = useState('day');
  const [segmentBy, setSegmentBy] = useState('');
  const [includeForecasts, setIncludeForecasts] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: addDays(new Date(), -30),
    to: new Date(),
  });
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchSubscriptionMetrics();
  }, [period, granularity, segmentBy, includeForecasts, dateRange]);

  const fetchSubscriptionMetrics = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        period,
        granularity,
        includeForecasts: includeForecasts.toString(),
      });

      if (segmentBy) params.append('segmentBy', segmentBy);
      if (dateRange?.from) params.append('startDate', dateRange.from.toISOString());
      if (dateRange?.to) params.append('endDate', dateRange.to.toISOString());

      const response = await fetch(`/api/admin/subscription-metrics?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch subscription metrics: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Subscription metrics fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatPercentage = (percentage: number) => {
    return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(2)}%`;
  };

  const getChurnColor = (churnRate: number) => {
    if (churnRate <= 5) return 'text-green-600';
    if (churnRate <= 10) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getChurnBadge = (churnRate: number) => {
    if (churnRate <= 5) return 'default';
    if (churnRate <= 10) return 'secondary';
    return 'destructive';
  };

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#d084d0', '#ffb347'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading subscription metrics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-700">Error Loading Subscription Metrics</h3>
          <p className="text-gray-600">{error}</p>
          <Button onClick={fetchSubscriptionMetrics} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div>No subscription data available</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Subscription Metrics</h1>
          <p className="text-gray-600">Comprehensive subscription analytics and performance monitoring</p>
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
              <SelectItem value="plan">Plan</SelectItem>
              <SelectItem value="billing_cycle">Billing Cycle</SelectItem>
              <SelectItem value="acquisition_channel">Channel</SelectItem>
              <SelectItem value="user_type">User Type</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={fetchSubscriptionMetrics}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Recurring Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.revenue.mrr)}</div>
            <p className="text-xs text-muted-foreground">
              ARR: {formatCurrency(data.revenue.arr)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overview.activeSubscriptions.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {data.overview.netGrowth >= 0 ? (
                <span className="text-green-600 flex items-center">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +{data.overview.netGrowth} net growth
                </span>
              ) : (
                <span className="text-red-600 flex items-center">
                  <TrendingDown className="h-3 w-3 mr-1" />
                  {data.overview.netGrowth} net decline
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Churn Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getChurnColor(data.churnAnalysis.churnRate)}`}>
              {data.churnAnalysis.churnRate.toFixed(2)}%
            </div>
            <Badge variant={getChurnBadge(data.churnAnalysis.churnRate)}>
              {data.churnAnalysis.churnRate <= 5 ? 'Excellent' : 
               data.churnAnalysis.churnRate <= 10 ? 'Good' : 'Needs Attention'}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trial Conversion</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.lifecycle.trialConversionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {data.lifecycle.trialConversions}/{data.lifecycle.totalTrials} trials converted
            </p>
          </CardContent>
        </Card>
      </div>

      {/* High Churn Alert */}
      {data.churnAnalysis.churnRate > 10 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">High Churn Rate Alert</AlertTitle>
          <AlertDescription className="text-red-700">
            Your churn rate of {data.churnAnalysis.churnRate.toFixed(2)}% is above the recommended threshold of 10%. 
            Consider implementing retention strategies for at-risk customers.
          </AlertDescription>
        </Alert>
      )}

      {/* Net MRR Movement */}
      <Card>
        <CardHeader>
          <CardTitle>MRR Movement Analysis</CardTitle>
          <CardDescription>Breakdown of MRR changes in the selected period</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-sm text-green-700 font-medium">New MRR</div>
              <div className="text-2xl font-bold text-green-600">
                +{formatCurrency(data.revenue.newMRR)}
              </div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-sm text-red-700 font-medium">Churned MRR</div>
              <div className="text-2xl font-bold text-red-600">
                -{formatCurrency(data.revenue.churnedMRR)}
              </div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-700 font-medium">Expansion MRR</div>
              <div className="text-2xl font-bold text-blue-600">
                +{formatCurrency(data.revenue.expansionMRR)}
              </div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-sm text-orange-700 font-medium">Contraction MRR</div>
              <div className="text-2xl font-bold text-orange-600">
                -{formatCurrency(data.revenue.contractionMRR)}
              </div>
            </div>
            <div className="text-center p-4 bg-gray-100 rounded-lg">
              <div className="text-sm text-gray-700 font-medium">Net MRR</div>
              <div className={`text-2xl font-bold ${data.revenue.totalNetMRR >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {data.revenue.totalNetMRR >= 0 ? '+' : ''}{formatCurrency(data.revenue.totalNetMRR)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Subscription Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="churn">Churn</TabsTrigger>
          <TabsTrigger value="upgrades">Upgrades</TabsTrigger>
          <TabsTrigger value="cohorts">Cohorts</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Subscription Growth Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Subscription Growth Trend</CardTitle>
                <CardDescription>New subscriptions and revenue over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={data.timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip 
                      formatter={(value: any, name: string) => [
                        name === 'revenue' || name === 'avgAmount' ? formatCurrency(value) : value,
                        name === 'newSubscriptions' ? 'New Subscriptions' :
                        name === 'revenue' ? 'Revenue' :
                        name === 'avgAmount' ? 'Avg Amount' : name
                      ]}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="newSubscriptions" fill="#8884d8" name="New Subscriptions" />
                    <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#82ca9d" name="Revenue" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Billing Cycle Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Billing Cycle Distribution</CardTitle>
                <CardDescription>Revenue by billing frequency</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.overview.billingCycleBreakdown}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ cycle, totalRevenue }: any) => `${cycle}: ${formatCurrency(totalRevenue)}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="totalRevenue"
                    >
                      {data.overview.billingCycleBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Subscription Status Breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {data.overview.statusBreakdown.map((status) => (
              <Card key={status.status}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm capitalize">{status.status.replace('_', ' ')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{status.count}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="plans" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Plan Performance</CardTitle>
              <CardDescription>Performance metrics by subscription plan</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 p-3 text-left">Plan</th>
                      <th className="border border-gray-300 p-3 text-right">Total Subs</th>
                      <th className="border border-gray-300 p-3 text-right">Active</th>
                      <th className="border border-gray-300 p-3 text-right">Churn Rate</th>
                      <th className="border border-gray-300 p-3 text-right">Total Revenue</th>
                      <th className="border border-gray-300 p-3 text-right">Avg Revenue</th>
                      <th className="border border-gray-300 p-3 text-right">Avg Lifetime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.planPerformance.map((plan, index) => (
                      <tr key={plan.plan} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 p-3 font-medium">{plan.plan}</td>
                        <td className="border border-gray-300 p-3 text-right">{plan.totalSubscriptions}</td>
                        <td className="border border-gray-300 p-3 text-right">{plan.activeSubscriptions}</td>
                        <td className="border border-gray-300 p-3 text-right">
                          <Badge variant={getChurnBadge(plan.churnRate)}>
                            {plan.churnRate.toFixed(1)}%
                          </Badge>
                        </td>
                        <td className="border border-gray-300 p-3 text-right">{formatCurrency(plan.totalRevenue)}</td>
                        <td className="border border-gray-300 p-3 text-right">{formatCurrency(plan.avgRevenue)}</td>
                        <td className="border border-gray-300 p-3 text-right">{plan.avgLifetimeDays.toFixed(0)} days</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plan Revenue Distribution</CardTitle>
              <CardDescription>Revenue breakdown by plan</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={data.overview.planDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="plan" />
                  <YAxis />
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="totalRevenue" fill="#8884d8" name="Total Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="churn" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Churn by Plan</CardTitle>
                <CardDescription>Which plans have higher churn rates</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.churnAnalysis.churnByPlan}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="plan" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill="#ff7c7c" name="Churned Customers" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Churn Timing Distribution</CardTitle>
                <CardDescription>When customers typically churn</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.churnAnalysis.churnTimingDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(props: any) => `${props.name || props.segment || props.category || props.cycle || props.period || "Item"}: ${props.value || props.customerCount || props.totalRevenue || props.count || 0}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {data.churnAnalysis.churnTimingDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Total Churned</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600">{data.churnAnalysis.totalChurned}</div>
                <p className="text-sm text-gray-600 mt-1">customers in period</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Churn Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${getChurnColor(data.churnAnalysis.churnRate)}`}>
                  {data.churnAnalysis.churnRate.toFixed(2)}%
                </div>
                <Badge variant={getChurnBadge(data.churnAnalysis.churnRate)} className="mt-2">
                  {data.churnAnalysis.churnRate <= 5 ? 'Excellent' : 
                   data.churnAnalysis.churnRate <= 10 ? 'Good' : 'High'}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Avg Days to Churn</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{data.churnAnalysis.avgDaysToChurn.toFixed(0)}</div>
                <p className="text-sm text-gray-600 mt-1">days average</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="upgrades" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Total Upgrades</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <ArrowUpRight className="h-8 w-8 text-green-600" />
                  <div className="text-3xl font-bold text-green-600">
                    {data.upgradeDowngradePatterns.totalUpgrades}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Total Downgrades</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <ArrowDownRight className="h-8 w-8 text-red-600" />
                  <div className="text-3xl font-bold text-red-600">
                    {data.upgradeDowngradePatterns.totalDowngrades}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Net Upgrades</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${data.upgradeDowngradePatterns.netUpgrades >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.upgradeDowngradePatterns.netUpgrades >= 0 ? '+' : ''}{data.upgradeDowngradePatterns.netUpgrades}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue Impact</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${data.upgradeDowngradePatterns.totalRevenueImpact >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(data.upgradeDowngradePatterns.totalRevenueImpact)}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Upgrade Patterns</CardTitle>
                <CardDescription>Most common upgrade paths</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.upgradeDowngradePatterns.upgradePatterns.slice(0, 10).map((pattern, index) => (
                    <div key={pattern.pattern} className="flex justify-between items-center p-2 bg-green-50 rounded">
                      <span className="text-sm font-medium">{pattern.pattern}</span>
                      <Badge variant="default">{pattern.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Downgrade Patterns</CardTitle>
                <CardDescription>Most common downgrade paths</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.upgradeDowngradePatterns.downgradePatterns.slice(0, 10).map((pattern, index) => (
                    <div key={pattern.pattern} className="flex justify-between items-center p-2 bg-red-50 rounded">
                      <span className="text-sm font-medium">{pattern.pattern}</span>
                      <Badge variant="destructive">{pattern.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="cohorts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cohort Retention Analysis</CardTitle>
              <CardDescription>Subscription retention rates by signup cohort</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 p-2 text-left">Cohort Month</th>
                      <th className="border border-gray-300 p-2 text-right">Size</th>
                      <th className="border border-gray-300 p-2 text-right">1 Month</th>
                      <th className="border border-gray-300 p-2 text-right">3 Months</th>
                      <th className="border border-gray-300 p-2 text-right">6 Months</th>
                      <th className="border border-gray-300 p-2 text-right">12 Months</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cohortRetention.map((cohort, index) => (
                      <tr key={cohort.cohortMonth} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 p-2">
                          {new Date(cohort.cohortMonth).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                        </td>
                        <td className="border border-gray-300 p-2 text-right font-medium">{cohort.cohortSize}</td>
                        <td className="border border-gray-300 p-2 text-right">
                          <div className="text-sm">
                            <div>{cohort.retentionRate1.toFixed(1)}%</div>
                            <div className="text-gray-500">({cohort.retainedMonth1})</div>
                          </div>
                        </td>
                        <td className="border border-gray-300 p-2 text-right">
                          <div className="text-sm">
                            <div>{cohort.retentionRate3.toFixed(1)}%</div>
                            <div className="text-gray-500">({cohort.retainedMonth3})</div>
                          </div>
                        </td>
                        <td className="border border-gray-300 p-2 text-right">
                          <div className="text-sm">
                            <div>{cohort.retentionRate6.toFixed(1)}%</div>
                            <div className="text-gray-500">({cohort.retainedMonth6})</div>
                          </div>
                        </td>
                        <td className="border border-gray-300 p-2 text-right">
                          <div className="text-sm">
                            <div>{cohort.retentionRate12.toFixed(1)}%</div>
                            <div className="text-gray-500">({cohort.retainedMonth12})</div>
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

        <TabsContent value="forecast" className="space-y-6">
          {data.forecasts && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>12-Month Subscription Forecast</CardTitle>
                  <CardDescription>Projected MRR and subscription growth based on current trends</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={data.forecasts.forecasts}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tickFormatter={(value) => `Month ${value}`} />
                      <YAxis />
                      <Tooltip 
                        formatter={(value: any, name: string) => [
                          formatCurrency(value),
                          name === 'projectedMRR' ? 'Projected MRR' : 
                          name === 'projectedARR' ? 'Projected ARR' : 
                          name === 'low' ? 'Low Estimate' : 
                          name === 'high' ? 'High Estimate' : name
                        ]}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="projectedMRR" 
                        stroke="#8884d8" 
                        name="Projected MRR" 
                        strokeWidth={3}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="low" 
                        stroke="#82ca9d" 
                        strokeDasharray="5 5" 
                        name="Low Estimate" 
                       // dataKey="confidenceInterval.low"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="high" 
                        stroke="#ffc658" 
                        strokeDasharray="5 5" 
                        name="High Estimate"
                      //  dataKey="confidenceInterval.high"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>12-Month MRR</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">
                      {formatCurrency(data.forecasts.forecasts[11]?.projectedMRR || 0)}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {((((data.forecasts.forecasts[11]?.projectedMRR || 0) / data.forecasts.currentMRR) - 1) * 100).toFixed(1)}% growth
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>12-Month ARR</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(data.forecasts.forecasts[11]?.projectedARR || 0)}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Annual recurring revenue
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Monthly Growth Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(data.forecasts.monthlyGrowthRate)}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Average monthly MRR growth
                    </p>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}