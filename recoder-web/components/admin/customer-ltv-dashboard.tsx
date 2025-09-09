'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Users, AlertTriangle, Target, Zap, RefreshCw, Download, Calendar, Activity } from 'lucide-react';

interface LTVSummary {
  averageLTV: number;
  averageHistoricalLTV: number;
  averageMonthlyRevenue: number;
  averageChurnProbability: number;
  totalCustomersAnalyzed: number;
}

interface LTVDistribution {
  range: string;
  count: number;
  totalRevenue: number;
  percentage: number;
}

interface CohortLTVAnalysis {
  cohortPeriod: string;
  cohortSize: number;
  avgHistoricalLTV: number;
  avgPredictedLTV: number;
  avgMonthlyRevenue: number;
  avgMonthsActive: number;
  avgChurnProbability: number;
  medianLTV: number;
  p25LTV: number;
  p75LTV: number;
}

interface TopCustomer {
  id: string;
  totalRevenue: number;
  predictedLtv: number;
  churnProbability: number;
  monthsActive: number;
  segments: string[];
  user: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    subscriptions: Array<{
      plan: string;
      amount: number;
    }>;
  };
}

interface CustomerSegmentation {
  segment: string;
  customerCount: number;
  avgLTV: number;
  totalRevenue: number;
}

interface ChurnPrediction {
  atRiskCustomers: TopCustomer[];
  churnDistribution: Array<{
    risk: string;
    count: number;
    percentage: number;
  }>;
  totalAtRisk: number;
  potentialRevenueAtRisk: number;
}

interface LTVTrend {
  period: string;
  avgLTV: number;
  customerCount: number;
  avgChurnProbability: number;
}

interface LTVAnalysisData {
  period: string;
  cohortPeriods: number;
  analysis: {
    summary: LTVSummary;
    distribution: LTVDistribution[];
    cohortAnalysis: CohortLTVAnalysis[];
    segmentedAnalysis?: Array<{
      segment: string;
      customerCount: number;
      avgHistoricalLTV: number;
      avgPredictedLTV: number;
      avgMonthlyRevenue: number;
      avgChurnProbability: number;
      totalRevenue: number;
      medianLTV: number;
    }>;
    topCustomers: TopCustomer[];
  };
  segmentation: CustomerSegmentation[];
  churnPrediction: ChurnPrediction | null;
  trends: LTVTrend[];
  lastUpdated: string;
}

export default function CustomerLTVDashboard() {
  const [data, setData] = useState<LTVAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('month');
  const [cohortPeriods, setCohortPeriods] = useState('12');
  const [segmentBy, setSegmentBy] = useState('');
  const [includeChurnPrediction, setIncludeChurnPrediction] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    fetchLTVAnalysis();
  }, [period, cohortPeriods, segmentBy, includeChurnPrediction]);

  const fetchLTVAnalysis = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        period,
        cohortPeriods,
        includeChurnPrediction: includeChurnPrediction.toString(),
      });

      if (segmentBy) params.append('segmentBy', segmentBy);

      const response = await fetch(`/api/admin/customer-analytics/ltv?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch LTV analysis: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('LTV analysis fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const recalculateLTV = async () => {
    try {
      setRecalculating(true);
      
      const response = await fetch('/api/admin/customer-analytics/ltv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userIds: null, // Recalculate for all users
          segmentFilter: null
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('LTV recalculation started:', result.jobId);
        
        // Refetch data after a short delay
        setTimeout(() => {
          fetchLTVAnalysis();
        }, 3000);
      }
    } catch (err) {
      console.error('LTV recalculation error:', err);
    } finally {
      setRecalculating(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatPercentage = (percentage: number) => {
    return `${percentage.toFixed(1)}%`;
  };

  const getRiskBadgeColor = (churnProbability: number) => {
    if (churnProbability <= 0.3) return 'default';
    if (churnProbability <= 0.7) return 'secondary';
    return 'destructive';
  };

  const getRiskLabel = (churnProbability: number) => {
    if (churnProbability <= 0.3) return 'Low Risk';
    if (churnProbability <= 0.7) return 'Medium Risk';
    return 'High Risk';
  };

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#d084d0', '#ffb347'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading customer LTV analysis...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-700">Error Loading LTV Analysis</h3>
          <p className="text-gray-600">{error}</p>
          <Button onClick={fetchLTVAnalysis} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div>No LTV data available</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customer Lifetime Value Analysis</h1>
          <p className="text-gray-600">Advanced customer analytics and churn prediction</p>
          <p className="text-sm text-gray-500 mt-1">Last updated: {new Date(data.lastUpdated).toLocaleString()}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="quarter">Quarter</SelectItem>
              <SelectItem value="year">Year</SelectItem>
            </SelectContent>
          </Select>

          <Select value={cohortPeriods} onValueChange={setCohortPeriods}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">6 Periods</SelectItem>
              <SelectItem value="12">12 Periods</SelectItem>
              <SelectItem value="24">24 Periods</SelectItem>
              <SelectItem value="36">36 Periods</SelectItem>
            </SelectContent>
          </Select>

          <Select value={segmentBy} onValueChange={setSegmentBy}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Segment by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              <SelectItem value="plan">Plan</SelectItem>
              <SelectItem value="acquisition_channel">Channel</SelectItem>
              <SelectItem value="company_size">Company Size</SelectItem>
              <SelectItem value="industry">Industry</SelectItem>
              <SelectItem value="region">Region</SelectItem>
            </SelectContent>
          </Select>

          <Button 
            variant="outline" 
            onClick={recalculateLTV}
            disabled={recalculating}
          >
            {recalculating ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Recalculate
          </Button>

          <Button variant="outline" size="sm" onClick={fetchLTVAnalysis}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Key LTV Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Predicted LTV</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.analysis.summary.averageLTV)}</div>
            <p className="text-xs text-muted-foreground">
              Historical: {formatCurrency(data.analysis.summary.averageHistoricalLTV)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Monthly Revenue</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.analysis.summary.averageMonthlyRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              Per customer monthly contribution
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customers Analyzed</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.analysis.summary.totalCustomersAnalyzed.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              With payment history
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Churn Risk</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercentage(data.analysis.summary.averageChurnProbability * 100)}</div>
            <Badge variant={getRiskBadgeColor(data.analysis.summary.averageChurnProbability)}>
              {getRiskLabel(data.analysis.summary.averageChurnProbability)}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Churn Risk Alert */}
      {data.churnPrediction && data.churnPrediction.totalAtRisk > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">High Churn Risk Alert</AlertTitle>
          <AlertDescription className="text-amber-700">
            {data.churnPrediction.totalAtRisk} customers are at high risk of churning, representing {formatCurrency(data.churnPrediction.potentialRevenueAtRisk)} in potential revenue loss.
          </AlertDescription>
        </Alert>
      )}

      {/* Main LTV Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="distribution">Distribution</TabsTrigger>
          <TabsTrigger value="cohorts">Cohorts</TabsTrigger>
          <TabsTrigger value="segments">Segments</TabsTrigger>
          <TabsTrigger value="churn">Churn Risk</TabsTrigger>
          <TabsTrigger value="top-customers">Top Customers</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LTV Trends */}
            <Card>
              <CardHeader>
                <CardTitle>LTV Trends Over Time</CardTitle>
                <CardDescription>Average LTV and customer count by period</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.trends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip 
                      formatter={(value: any, name: string) => [
                        name === 'avgLTV' ? formatCurrency(value) : value,
                        name === 'avgLTV' ? 'Avg LTV' : name === 'customerCount' ? 'Customers' : 'Churn Risk'
                      ]}
                    />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="avgLTV" stroke="#8884d8" name="Avg LTV" />
                    <Line yAxisId="right" type="monotone" dataKey="customerCount" stroke="#82ca9d" name="Customers" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Customer Segmentation */}
            <Card>
              <CardHeader>
                <CardTitle>Customer Segments</CardTitle>
                <CardDescription>Automatic customer segmentation by behavior</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.segmentation}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ segment, customerCount }) => `${segment}: ${customerCount}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="customerCount"
                    >
                      {data.segmentation.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Segment Revenue Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue by Customer Segment</CardTitle>
              <CardDescription>Total and average revenue per segment</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.segmentation}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="segment" />
                  <YAxis />
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="totalRevenue" fill="#8884d8" name="Total Revenue" />
                  <Bar dataKey="avgLTV" fill="#82ca9d" name="Avg LTV" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="distribution" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>LTV Distribution</CardTitle>
              <CardDescription>Customer distribution across LTV ranges</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={data.analysis.distribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#8884d8" name="Customer Count" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.analysis.distribution.map((bucket, index) => (
              <Card key={bucket.range}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{bucket.range}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{bucket.count}</div>
                  <p className="text-xs text-gray-600">{formatPercentage(bucket.percentage)} of customers</p>
                  <p className="text-xs text-gray-600">{formatCurrency(bucket.totalRevenue)} total</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="cohorts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cohort LTV Analysis</CardTitle>
              <CardDescription>LTV metrics by customer cohort periods</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={data.analysis.cohortAnalysis}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="cohortPeriod" />
                  <YAxis />
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="avgPredictedLTV" stroke="#8884d8" name="Avg Predicted LTV" />
                  <Line type="monotone" dataKey="avgHistoricalLTV" stroke="#82ca9d" name="Avg Historical LTV" />
                  <Line type="monotone" dataKey="medianLTV" stroke="#ffc658" name="Median LTV" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 p-2 text-left">Cohort Period</th>
                  <th className="border border-gray-300 p-2 text-right">Size</th>
                  <th className="border border-gray-300 p-2 text-right">Avg Predicted LTV</th>
                  <th className="border border-gray-300 p-2 text-right">Avg Historical LTV</th>
                  <th className="border border-gray-300 p-2 text-right">Avg Monthly Revenue</th>
                  <th className="border border-gray-300 p-2 text-right">Avg Churn Risk</th>
                </tr>
              </thead>
              <tbody>
                {data.analysis.cohortAnalysis.map((cohort, index) => (
                  <tr key={cohort.cohortPeriod} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border border-gray-300 p-2">
                      {new Date(cohort.cohortPeriod).toLocaleDateString()}
                    </td>
                    <td className="border border-gray-300 p-2 text-right">{cohort.cohortSize}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(cohort.avgPredictedLTV)}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(cohort.avgHistoricalLTV)}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(cohort.avgMonthlyRevenue)}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatPercentage(cohort.avgChurnProbability * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="segments" className="space-y-6">
          {data.analysis.segmentedAnalysis ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Segmented LTV Analysis by {segmentBy}</CardTitle>
                  <CardDescription>LTV metrics broken down by selected segment</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={data.analysis.segmentedAnalysis}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="segment" />
                      <YAxis />
                      <Tooltip formatter={(value: any) => formatCurrency(value)} />
                      <Legend />
                      <Bar dataKey="avgPredictedLTV" fill="#8884d8" name="Avg Predicted LTV" />
                      <Bar dataKey="avgHistoricalLTV" fill="#82ca9d" name="Avg Historical LTV" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 p-2 text-left">Segment</th>
                      <th className="border border-gray-300 p-2 text-right">Customers</th>
                      <th className="border border-gray-300 p-2 text-right">Avg Predicted LTV</th>
                      <th className="border border-gray-300 p-2 text-right">Total Revenue</th>
                      <th className="border border-gray-300 p-2 text-right">Avg Monthly Revenue</th>
                      <th className="border border-gray-300 p-2 text-right">Churn Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.analysis.segmentedAnalysis.map((segment, index) => (
                      <tr key={segment.segment} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 p-2 font-medium">{segment.segment || 'Unknown'}</td>
                        <td className="border border-gray-300 p-2 text-right">{segment.customerCount}</td>
                        <td className="border border-gray-300 p-2 text-right">{formatCurrency(segment.avgPredictedLTV)}</td>
                        <td className="border border-gray-300 p-2 text-right">{formatCurrency(segment.totalRevenue)}</td>
                        <td className="border border-gray-300 p-2 text-right">{formatCurrency(segment.avgMonthlyRevenue)}</td>
                        <td className="border border-gray-300 p-2 text-right">{formatPercentage(segment.avgChurnProbability * 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-8">
                <div className="text-center">
                  <p className="text-gray-600">Select a segment type to see segmented analysis</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="churn" className="space-y-6">
          {data.churnPrediction ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {data.churnPrediction.churnDistribution.map((risk) => {
                  const totalCustomers = data.churnPrediction!.churnDistribution.reduce((sum, r) => sum + r.count, 0);
                  const percentage = totalCustomers > 0 ? (risk.count / totalCustomers) * 100 : 0;
                  
                  return (
                    <Card key={risk.risk}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          {risk.risk} Risk
                          <Badge variant={risk.risk === 'Low' ? 'default' : risk.risk === 'Medium' ? 'secondary' : 'destructive'}>
                            {formatPercentage(percentage)}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">{risk.count}</div>
                        <p className="text-sm text-gray-600">customers</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>High-Risk Customers (Top 20)</CardTitle>
                  <CardDescription>Customers with highest churn probability and LTV impact</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {data.churnPrediction.atRiskCustomers.slice(0, 20).map((customer) => (
                      <div key={customer.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <h4 className="font-semibold">{customer.user.name || customer.user.email}</h4>
                          <div className="flex items-center space-x-4 mt-1">
                            <span className="text-sm text-gray-600">
                              LTV: {formatCurrency(customer.predictedLtv)}
                            </span>
                            <span className="text-sm text-gray-600">
                              Active: {customer.monthsActive}mo
                            </span>
                            <Badge variant={getRiskBadgeColor(customer.churnProbability)}>
                              {formatPercentage(customer.churnProbability * 100)} risk
                            </Badge>
                          </div>
                          {customer.segments.length > 0 && (
                            <div className="flex gap-1 mt-2">
                              {customer.segments.map((segment) => (
                                <Badge key={segment} variant="outline" className="text-xs">
                                  {segment}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-bold">{formatCurrency(customer.totalRevenue)}</div>
                          <div className="text-sm text-gray-600">historical</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8">
                <div className="text-center">
                  <p className="text-gray-600">Churn prediction analysis not available</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="top-customers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top 50 Customers by LTV</CardTitle>
              <CardDescription>Highest value customers and their metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.analysis.topCustomers.slice(0, 50).map((customer, index) => (
                  <div key={customer.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-bold text-blue-600">
                        #{index + 1}
                      </div>
                      <div>
                        <h4 className="font-semibold">{customer.user.name || customer.user.email}</h4>
                        <div className="flex items-center space-x-4 mt-1">
                          <span className="text-sm text-gray-600">
                            Active: {customer.monthsActive}mo
                          </span>
                          {customer.user.subscriptions.length > 0 && (
                            <Badge variant="outline">
                              {customer.user.subscriptions[0].plan}
                            </Badge>
                          )}
                        </div>
                        {customer.segments.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {customer.segments.map((segment) => (
                              <Badge key={segment} variant="outline" className="text-xs">
                                {segment}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="font-bold text-lg">{formatCurrency(customer.predictedLtv)}</div>
                      <div className="text-sm text-gray-600">
                        Historical: {formatCurrency(customer.totalRevenue)}
                      </div>
                      <Badge variant={getRiskBadgeColor(customer.churnProbability)}>
                        {formatPercentage(customer.churnProbability * 100)} risk
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}