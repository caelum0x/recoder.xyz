'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Users, Calendar, Target, AlertTriangle, Download, Refresh, Settings } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { addDays, format } from 'date-fns';

interface RevenueMetrics {
  totalRevenue: number;
  subscriptionRevenue: number;
  oneTimeRevenue: number;
  refunds: number;
  netRevenue: number;
  mrr: number;
  arr: number;
  timeSeries: Array<{
    period: string;
    revenue: number;
    transactions: number;
  }>;
  segments?: Array<{
    segment: string;
    revenue: number;
    count: number;
    avgRevenue: number;
  }>;
}

interface SubscriptionMetrics {
  newSubscriptions: number;
  cancelledSubscriptions: number;
  upgrades: number;
  downgrades: number;
  netGrowth: number;
  churnRate: number;
}

interface CustomerMetrics {
  newCustomers: number;
  payingCustomers: number;
  cac: number;
  arpu: number;
}

interface GrowthMetrics {
  revenueGrowthRate: number;
  currentPeriodRevenue: number;
  previousPeriodRevenue: number;
}

interface AnalyticsData {
  revenue: RevenueMetrics;
  subscriptions: SubscriptionMetrics;
  customers: CustomerMetrics;
  growth: GrowthMetrics;
  cohorts: Array<any>;
  forecast: Array<{
    month: number;
    projectedMRR: number;
    projectedARR: number;
  }>;
}

export default function RevenueAnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('month');
  const [granularity, setGranularity] = useState('day');
  const [segmentBy, setSegmentBy] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: addDays(new Date(), -30),
    to: new Date(),
  });
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchAnalytics();
  }, [period, granularity, segmentBy, dateRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        period,
        granularity,
      });

      if (segmentBy) params.append('segmentBy', segmentBy);
      if (dateRange?.from) params.append('startDate', dateRange.from.toISOString());
      if (dateRange?.to) params.append('endDate', dateRange.to.toISOString());

      const response = await fetch(`/api/admin/revenue/analytics?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch analytics: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result.metrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Analytics fetch error:', err);
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

  const exportData = async (format: 'csv' | 'pdf' | 'excel') => {
    try {
      const response = await fetch('/api/admin/revenue/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          format,
          period,
          dateRange,
          data
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `revenue-analytics-${format}-${new Date().toISOString().split('T')[0]}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading revenue analytics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-700">Error Loading Analytics</h3>
          <p className="text-gray-600">{error}</p>
          <Button onClick={fetchAnalytics} className="mt-4">
            <Refresh className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div>No data available</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Revenue Analytics</h1>
          <p className="text-gray-600">Comprehensive business intelligence and revenue insights</p>
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
              <SelectItem value="hour">Hour</SelectItem>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
            </SelectContent>
          </Select>

          <Select value={segmentBy} onValueChange={setSegmentBy}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Segment by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              <SelectItem value="plan">Plan</SelectItem>
              <SelectItem value="region">Region</SelectItem>
              <SelectItem value="acquisition_channel">Channel</SelectItem>
              <SelectItem value="user_type">User Type</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => exportData('csv')}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportData('pdf')}>
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
            <Button variant="outline" size="sm" onClick={fetchAnalytics}>
              <Refresh className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.revenue.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              {data.growth.revenueGrowthRate >= 0 ? (
                <span className="text-green-600 flex items-center">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  {formatPercentage(data.growth.revenueGrowthRate)}
                </span>
              ) : (
                <span className="text-red-600 flex items-center">
                  <TrendingDown className="h-3 w-3 mr-1" />
                  {formatPercentage(data.growth.revenueGrowthRate)}
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Recurring Revenue</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
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
            <CardTitle className="text-sm font-medium">New Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.customers.newCustomers}</div>
            <p className="text-xs text-muted-foreground">
              CAC: {formatCurrency(data.customers.cac)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Churn Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.subscriptions.churnRate}%</div>
            <p className="text-xs text-muted-foreground">
              ARPU: {formatCurrency(data.customers.arpu)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trend</CardTitle>
                <CardDescription>Revenue over time with transaction count</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.revenue.timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip 
                      labelFormatter={(value) => format(new Date(value), 'MMM dd, yyyy')}
                      formatter={(value: any, name: string) => [
                        name === 'revenue' ? formatCurrency(value) : value,
                        name === 'revenue' ? 'Revenue' : 'Transactions'
                      ]}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="revenue" fill="#8884d8" name="Revenue" />
                    <Line yAxisId="right" type="monotone" dataKey="transactions" stroke="#82ca9d" name="Transactions" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Revenue Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Breakdown</CardTitle>
                <CardDescription>Revenue sources distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Subscription', value: data.revenue.subscriptionRevenue },
                        { name: 'One-time', value: data.revenue.oneTimeRevenue },
                        { name: 'Refunds', value: -data.revenue.refunds },
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${formatCurrency(Math.abs(value))}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {[].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(Math.abs(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Segmented Data */}
          {data.revenue.segments && (
            <Card>
              <CardHeader>
                <CardTitle>Revenue by {segmentBy}</CardTitle>
                <CardDescription>Revenue breakdown by selected segment</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.revenue.segments}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="segment" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#8884d8" name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="revenue" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Net Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {formatCurrency(data.revenue.netRevenue)}
                </div>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Gross Revenue:</span>
                    <span className="text-sm font-medium">{formatCurrency(data.revenue.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Refunds:</span>
                    <span className="text-sm font-medium text-red-600">-{formatCurrency(data.revenue.refunds)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Subscription Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {formatCurrency(data.revenue.subscriptionRevenue)}
                </div>
                <div className="mt-2">
                  <Badge variant="secondary">
                    {((data.revenue.subscriptionRevenue / data.revenue.totalRevenue) * 100).toFixed(1)}% of total
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>One-time Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-purple-600">
                  {formatCurrency(data.revenue.oneTimeRevenue)}
                </div>
                <div className="mt-2">
                  <Badge variant="secondary">
                    {((data.revenue.oneTimeRevenue / data.revenue.totalRevenue) * 100).toFixed(1)}% of total
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Revenue Timeline</CardTitle>
              <CardDescription>Daily revenue breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={data.revenue.timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(value) => format(new Date(value), 'MMM dd, yyyy')}
                    formatter={(value: any) => formatCurrency(value)}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">New Subscriptions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {data.subscriptions.newSubscriptions}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cancelled</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {data.subscriptions.cancelledSubscriptions}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Upgrades</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {data.subscriptions.upgrades}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Downgrades</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {data.subscriptions.downgrades}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Net Growth</CardTitle>
                <CardDescription>New subscriptions minus cancellations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`text-4xl font-bold ${data.subscriptions.netGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.subscriptions.netGrowth >= 0 ? '+' : ''}{data.subscriptions.netGrowth}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Churn Rate</CardTitle>
                <CardDescription>Percentage of customers who cancelled</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`text-4xl font-bold ${data.subscriptions.churnRate <= 5 ? 'text-green-600' : data.subscriptions.churnRate <= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {data.subscriptions.churnRate}%
                </div>
                <div className="mt-2">
                  <Badge variant={data.subscriptions.churnRate <= 5 ? 'default' : data.subscriptions.churnRate <= 10 ? 'secondary' : 'destructive'}>
                    {data.subscriptions.churnRate <= 5 ? 'Excellent' : data.subscriptions.churnRate <= 10 ? 'Good' : 'Needs Attention'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="customers" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Customer Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">New Customers:</span>
                    <span className="text-2xl font-bold text-green-600">{data.customers.newCustomers}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Paying Customers:</span>
                    <span className="text-2xl font-bold text-blue-600">{data.customers.payingCustomers}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Customer Economics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">CAC:</span>
                    <span className="text-2xl font-bold">{formatCurrency(data.customers.cac)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">ARPU:</span>
                    <span className="text-2xl font-bold">{formatCurrency(data.customers.arpu)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>LTV to CAC Ratio</CardTitle>
              <CardDescription>Customer lifetime value versus acquisition cost</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-4xl font-bold text-blue-600">
                  {data.customers.cac > 0 ? (data.customers.arpu * 12 / data.customers.cac).toFixed(1) : 'N/A'}:1
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {data.customers.cac > 0 && (data.customers.arpu * 12 / data.customers.cac) >= 3
                    ? 'Healthy ratio (3:1 or better)'
                    : 'Monitor acquisition costs'
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forecast" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>12-Month Revenue Forecast</CardTitle>
              <CardDescription>Projected MRR and ARR based on current trends</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={data.forecast}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tickFormatter={(value) => `Month ${value}`} />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: any, name: string) => [
                      formatCurrency(value),
                      name === 'projectedMRR' ? 'Projected MRR' : 'Projected ARR'
                    ]}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="projectedMRR" stroke="#8884d8" name="Projected MRR" />
                  <Line type="monotone" dataKey="projectedARR" stroke="#82ca9d" name="Projected ARR" />
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
                  {formatCurrency(data.forecast[11]?.projectedMRR || 0)}
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {((((data.forecast[11]?.projectedMRR || 0) / data.revenue.mrr) - 1) * 100).toFixed(1)}% growth
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>12-Month ARR</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(data.forecast[11]?.projectedARR || 0)}
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {((((data.forecast[11]?.projectedARR || 0) / data.revenue.arr) - 1) * 100).toFixed(1)}% growth
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Growth Trajectory</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  5.0% Monthly
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Projected growth rate
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}