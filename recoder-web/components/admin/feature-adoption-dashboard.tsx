'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Input } from '@/components/ui/input';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, FunnelChart, Funnel, LabelList } from 'recharts';
import { TrendingUp, TrendingDown, Users, Zap, AlertTriangle, RefreshCw, Filter, Star, Award, Target, Activity, Eye, Clock, ArrowRight } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { addDays, format } from 'date-fns';

interface FeatureAdoptionOverview {
  totalFeatures: number;
  totalActiveUsers: number;
  newAdopters: number;
  newFeatureAdoptions: number;
  avgFeaturesPerUser: number;
  featureAdoptionRates: Array<{
    feature: string;
    uniqueUsers: number;
    totalUsage: number;
    adoptionRate: number;
  }>;
}

interface FeatureFunnel {
  stage: string;
  users: number;
  conversionRate: number;
  dropOffRate: number;
  actions: string[];
}

interface AdoptionTimeline {
  period: string;
  featuresAdopted: number;
  newAdopters: number;
  totalUsage: number;
}

interface LifecycleAnalysis {
  feature: string;
  totalAdopters: number;
  totalUsage: number;
  daysUsed: number;
  ageDays: number;
  usageSpanDays: number;
  lifecycleStage: string;
  avgDailyUsage: number;
}

interface UserJourney {
  commonSequences: Array<{
    firstAction: string;
    secondAction: string;
    count: number;
    rank: number;
  }>;
  timeToAdopt: Array<{
    feature: string;
    avgDaysToAdopt: number;
    medianDaysToAdopt: number;
    adoptersCount: number;
  }>;
}

interface StickinessMetrics {
  stickiness: Array<{
    feature: string;
    monthlyUsers: number;
    avgDailyUsers: number;
    stickinessRatio: number;
  }>;
  retention: Array<{
    feature: string;
    totalUsers: number;
    returningUsers: number;
    regularUsers: number;
    powerUsers: number;
    returnRate: number;
  }>;
}

interface CohortAdoption {
  cohortMonth: string;
  feature: string;
  adopters: number;
  cohortSize: number;
  adoptionRate: number;
}

interface FeatureCorrelation {
  featureA: string;
  featureB: string;
  usersBoth: number;
  usersA: number;
  usersB: number;
  correlationStrength: number;
}

interface AbandonmentAnalysis {
  feature: string;
  totalUsers: number;
  abandonedUsers30d: number;
  abandonedUsers60d: number;
  abandonedUsers90d: number;
  avgUsageBeforeAbandon: number;
  abandonmentRate30d: number;
  abandonmentRate60d: number;
  abandonmentRate90d: number;
}

interface DetailedMetrics {
  featureChampions: Array<{
    userId: string;
    name: string;
    email: string;
    feature: string;
    usageCount: number;
    firstUsed: string;
    lastUsed: string;
  }>;
  underperformingFeatures: Array<{
    feature: string;
    uniqueUsers: number;
    totalUsage: number;
    successRate: number;
    recentUsage: number;
  }>;
}

interface FeatureAdoptionData {
  period: string;
  dateRange: { startDate: string; endDate: string };
  overview: FeatureAdoptionOverview;
  featureFunnel: FeatureFunnel[];
  adoptionTimeline: AdoptionTimeline[];
  lifecycleAnalysis: LifecycleAnalysis[];
  userJourney: UserJourney;
  stickinessMetrics: StickinessMetrics;
  cohortAdoption: CohortAdoption[];
  featureCorrelation: FeatureCorrelation[];
  abandonmentAnalysis: AbandonmentAnalysis[];
  segmentedAnalysis?: Array<{
    segment: string;
    feature: string;
    uniqueAdopters: number;
    totalUsage: number;
    successRate: number;
  }>;
  detailedMetrics: DetailedMetrics | null;
  lastUpdated: string;
}

export default function FeatureAdoptionDashboard() {
  const [data, setData] = useState<FeatureAdoptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('month');
  const [granularity, setGranularity] = useState('day');
  const [segmentBy, setSegmentBy] = useState('');
  const [featureFilter, setFeatureFilter] = useState('');
  const [includeDetailedMetrics, setIncludeDetailedMetrics] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: addDays(new Date(), -30),
    to: new Date(),
  });
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchFeatureAdoptionData();
  }, [period, granularity, segmentBy, includeDetailedMetrics, dateRange]);

  const fetchFeatureAdoptionData = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        period,
        granularity,
        includeDetailedMetrics: includeDetailedMetrics.toString(),
      });

      if (segmentBy) params.append('segmentBy', segmentBy);
      if (featureFilter) params.append('featureFilter', featureFilter);
      if (dateRange?.from) params.append('startDate', dateRange.from.toISOString());
      if (dateRange?.to) params.append('endDate', dateRange.to.toISOString());

      const response = await fetch(`/api/admin/feature-adoption?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch feature adoption data: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Feature adoption fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatPercentage = (percentage: number) => {
    return `${percentage.toFixed(1)}%`;
  };

  const getLifecycleColor = (stage: string) => {
    switch (stage) {
      case 'Active': return 'text-green-600';
      case 'Declining': return 'text-yellow-600';
      case 'Dormant': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getLifecycleBadge = (stage: string) => {
    switch (stage) {
      case 'Active': return 'default';
      case 'Declining': return 'secondary';
      case 'Dormant': return 'destructive';
      default: return 'outline';
    }
  };

  const formatFeatureName = (feature: string) => {
    return feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#d084d0', '#ffb347'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading feature adoption data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-700">Error Loading Feature Adoption Data</h3>
          <p className="text-gray-600">{error}</p>
          <Button onClick={fetchFeatureAdoptionData} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div>No feature adoption data available</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Feature Adoption Analytics</h1>
          <p className="text-gray-600">Comprehensive feature usage and adoption insights</p>
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
              <SelectItem value="user_type">User Type</SelectItem>
              <SelectItem value="plan">Plan</SelectItem>
              <SelectItem value="acquisition_channel">Channel</SelectItem>
              <SelectItem value="company_size">Company Size</SelectItem>
              <SelectItem value="region">Region</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Filter feature..."
            value={featureFilter}
            onChange={(e) => setFeatureFilter(e.target.value)}
            className="w-40"
          />

          <Button variant="outline" size="sm" onClick={fetchFeatureAdoptionData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Key Adoption Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Features</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overview.totalFeatures}</div>
            <p className="text-xs text-muted-foreground">
              {data.overview.avgFeaturesPerUser.toFixed(1)} per user avg
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overview.totalActiveUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              using features
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Adopters</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overview.newAdopters.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {data.overview.newFeatureAdoptions} new adoptions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Feature Adoption</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.overview.featureAdoptionRates[0] ? formatPercentage(data.overview.featureAdoptionRates[0].adoptionRate) : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.overview.featureAdoptionRates[0] ? formatFeatureName(data.overview.featureAdoptionRates[0].feature) : 'No data'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Underperforming Features Alert */}
      {data.detailedMetrics && data.detailedMetrics.underperformingFeatures.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">Feature Performance Alert</AlertTitle>
          <AlertDescription className="text-amber-700">
            {data.detailedMetrics.underperformingFeatures.length} features are underperforming with low adoption rates or success rates.
            Consider optimization or user education.
          </AlertDescription>
        </Alert>
      )}

      {/* Feature Adoption Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Adoption Funnel</CardTitle>
          <CardDescription>User journey through key feature adoption stages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.featureFunnel.map((stage, index) => {
              const prevStage = index > 0 ? data.featureFunnel[index - 1] : null;
              const width = prevStage ? (stage.users / prevStage.users) * 100 : 100;
              
              return (
                <div key={stage.stage} className="flex items-center space-x-4">
                  <div className="w-32 text-sm font-medium">{stage.stage}</div>
                  <div className="flex-1 relative">
                    <div className="w-full h-8 bg-gray-200 rounded">
                      <div 
                        className="h-8 bg-blue-500 rounded flex items-center justify-between px-3 text-white text-sm font-medium"
                        style={{ width: `${width}%` }}
                      >
                        <span>{stage.users.toLocaleString()}</span>
                        <span>{formatPercentage(stage.conversionRate)}</span>
                      </div>
                    </div>
                  </div>
                  {stage.dropOffRate > 0 && (
                    <div className="text-sm text-red-600">
                      -{formatPercentage(stage.dropOffRate)} drop-off
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Main Feature Adoption Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
          <TabsTrigger value="stickiness">Stickiness</TabsTrigger>
          <TabsTrigger value="journey">Journey</TabsTrigger>
          <TabsTrigger value="correlation">Correlation</TabsTrigger>
          <TabsTrigger value="abandonment">Abandonment</TabsTrigger>
          <TabsTrigger value="champions">Champions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Feature Adoption Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Adoption Timeline</CardTitle>
                <CardDescription>Feature adoption trends over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={data.adoptionTimeline}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="newAdopters" fill="#8884d8" name="New Adopters" />
                    <Line yAxisId="right" type="monotone" dataKey="featuresAdopted" stroke="#82ca9d" name="Features Adopted" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Top Features by Adoption Rate */}
            <Card>
              <CardHeader>
                <CardTitle>Top Features by Adoption Rate</CardTitle>
                <CardDescription>Most adopted features in your platform</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.overview.featureAdoptionRates.slice(0, 10).map((feature, index) => (
                    <div key={feature.feature} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-blue-600">
                          {index + 1}
                        </div>
                        <span className="font-medium">{formatFeatureName(feature.feature)}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{formatPercentage(feature.adoptionRate)}</div>
                        <div className="text-sm text-gray-600">{feature.uniqueUsers} users</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Segmented Analysis */}
          {data.segmentedAnalysis && (
            <Card>
              <CardHeader>
                <CardTitle>Segmented Feature Analysis</CardTitle>
                <CardDescription>Feature adoption by {segmentBy}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={data.segmentedAnalysis}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="segment" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="uniqueAdopters" fill="#8884d8" name="Unique Adopters" />
                    <Bar dataKey="totalUsage" fill="#82ca9d" name="Total Usage" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="lifecycle" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Feature Lifecycle Analysis</CardTitle>
              <CardDescription>Feature maturity and usage patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 p-3 text-left">Feature</th>
                      <th className="border border-gray-300 p-3 text-right">Adopters</th>
                      <th className="border border-gray-300 p-3 text-right">Total Usage</th>
                      <th className="border border-gray-300 p-3 text-right">Days Used</th>
                      <th className="border border-gray-300 p-3 text-right">Age (Days)</th>
                      <th className="border border-gray-300 p-3 text-right">Daily Avg</th>
                      <th className="border border-gray-300 p-3 text-center">Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lifecycleAnalysis.slice(0, 20).map((feature, index) => (
                      <tr key={feature.feature} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 p-3 font-medium">
                          {formatFeatureName(feature.feature)}
                        </td>
                        <td className="border border-gray-300 p-3 text-right">{feature.totalAdopters}</td>
                        <td className="border border-gray-300 p-3 text-right">{feature.totalUsage}</td>
                        <td className="border border-gray-300 p-3 text-right">{feature.daysUsed}</td>
                        <td className="border border-gray-300 p-3 text-right">{Math.round(feature.ageDays)}</td>
                        <td className="border border-gray-300 p-3 text-right">{feature.avgDailyUsage.toFixed(1)}</td>
                        <td className="border border-gray-300 p-3 text-center">
                          <Badge variant={getLifecycleBadge(feature.lifecycleStage)}>
                            {feature.lifecycleStage}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {['Active', 'Declining', 'Dormant'].map((stage) => {
              const count = data.lifecycleAnalysis.filter(f => f.lifecycleStage === stage).length;
              return (
                <Card key={stage}>
                  <CardHeader>
                    <CardTitle className={getLifecycleColor(stage)}>{stage} Features</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{count}</div>
                    <p className="text-sm text-gray-600 mt-1">
                      {formatPercentage((count / data.lifecycleAnalysis.length) * 100)} of total
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="stickiness" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Feature Stickiness (DAU/MAU)</CardTitle>
                <CardDescription>How often users return to features</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.stickinessMetrics.stickiness.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="feature" tickFormatter={formatFeatureName} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="stickinessRatio" fill="#8884d8" name="Stickiness %" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Feature Retention Rates</CardTitle>
                <CardDescription>Users who return to use features</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.stickinessMetrics.retention.slice(0, 10).map((feature) => (
                    <div key={feature.feature} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">{formatFeatureName(feature.feature)}</span>
                        <Badge variant="default">{formatPercentage(feature.returnRate)} return rate</Badge>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        <div>
                          <div className="text-gray-600">Total</div>
                          <div className="font-medium">{feature.totalUsers}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Return</div>
                          <div className="font-medium">{feature.returningUsers}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Regular</div>
                          <div className="font-medium">{feature.regularUsers}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Power</div>
                          <div className="font-medium">{feature.powerUsers}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="journey" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Common Feature Sequences</CardTitle>
                <CardDescription>How users navigate between features</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.userJourney.commonSequences.slice(0, 15).map((sequence) => (
                    <div key={`${sequence.firstAction}-${sequence.secondAction}`} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium">{formatFeatureName(sequence.firstAction)}</span>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium">{formatFeatureName(sequence.secondAction)}</span>
                      </div>
                      <Badge variant="secondary">{sequence.count} users</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Time to Feature Adoption</CardTitle>
                <CardDescription>How long users take to adopt features</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.userJourney.timeToAdopt.slice(0, 15).map((feature) => (
                    <div key={feature.feature} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium">{formatFeatureName(feature.feature)}</span>
                        <Badge variant="outline">{feature.adoptersCount} adopters</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Average: </span>
                          <span className="font-medium">{feature.avgDaysToAdopt.toFixed(1)} days</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Median: </span>
                          <span className="font-medium">{feature.medianDaysToAdopt.toFixed(1)} days</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="correlation" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Feature Correlation Analysis</CardTitle>
              <CardDescription>Features commonly used together</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.featureCorrelation.slice(0, 20).map((correlation, index) => (
                  <div key={`${correlation.featureA}-${correlation.featureB}`} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center text-xs font-bold text-purple-600">
                          {index + 1}
                        </div>
                        <span className="font-medium">{formatFeatureName(correlation.featureA)}</span>
                        <span className="text-gray-500">+</span>
                        <span className="font-medium">{formatFeatureName(correlation.featureB)}</span>
                      </div>
                      <Badge variant="default">
                        {formatPercentage(correlation.correlationStrength)} correlation
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                      <div>Users Both: {correlation.usersBoth}</div>
                      <div>Users A: {correlation.usersA}</div>
                      <div>Users B: {correlation.usersB}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="abandonment" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Feature Abandonment Analysis</CardTitle>
              <CardDescription>Features users stop using over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 p-3 text-left">Feature</th>
                      <th className="border border-gray-300 p-3 text-right">Total Users</th>
                      <th className="border border-gray-300 p-3 text-right">30d Abandonment</th>
                      <th className="border border-gray-300 p-3 text-right">60d Abandonment</th>
                      <th className="border border-gray-300 p-3 text-right">90d Abandonment</th>
                      <th className="border border-gray-300 p-3 text-right">Avg Usage Before</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.abandonmentAnalysis.slice(0, 20).map((feature, index) => (
                      <tr key={feature.feature} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 p-3 font-medium">
                          {formatFeatureName(feature.feature)}
                        </td>
                        <td className="border border-gray-300 p-3 text-right">{feature.totalUsers}</td>
                        <td className="border border-gray-300 p-3 text-right">
                          <div>{formatPercentage(feature.abandonmentRate30d)}</div>
                          <div className="text-xs text-gray-500">({feature.abandonedUsers30d})</div>
                        </td>
                        <td className="border border-gray-300 p-3 text-right">
                          <div>{formatPercentage(feature.abandonmentRate60d)}</div>
                          <div className="text-xs text-gray-500">({feature.abandonedUsers60d})</div>
                        </td>
                        <td className="border border-gray-300 p-3 text-right">
                          <div>{formatPercentage(feature.abandonmentRate90d)}</div>
                          <div className="text-xs text-gray-500">({feature.abandonedUsers90d})</div>
                        </td>
                        <td className="border border-gray-300 p-3 text-right">
                          {feature.avgUsageBeforeAbandon.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="champions" className="space-y-6">
          {data.detailedMetrics && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Feature Champions</CardTitle>
                  <CardDescription>Power users who drive feature adoption (Top 10% users)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {data.detailedMetrics.featureChampions.slice(0, 25).map((champion, index) => (
                      <div key={`${champion.userId}-${champion.feature}`} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-4">
                          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-sm font-bold text-green-600">
                            <Award className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="font-semibold">{champion.name || champion.email}</h4>
                            <div className="text-sm text-gray-600">
                              Feature: {formatFeatureName(champion.feature)}
                            </div>
                            <div className="text-xs text-gray-500">
                              Active: {format(new Date(champion.firstUsed), 'MMM yyyy')} - {format(new Date(champion.lastUsed), 'MMM yyyy')}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">{champion.usageCount}</div>
                          <div className="text-sm text-gray-600">uses</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Underperforming Features</CardTitle>
                  <CardDescription>Features that need attention or optimization</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {data.detailedMetrics.underperformingFeatures.slice(0, 15).map((feature) => (
                      <div key={feature.feature} className="flex items-center justify-between p-4 border rounded-lg bg-red-50">
                        <div>
                          <h4 className="font-semibold">{formatFeatureName(feature.feature)}</h4>
                          <div className="flex items-center space-x-4 mt-1">
                            <span className="text-sm text-gray-600">
                              Users: {feature.uniqueUsers}
                            </span>
                            <span className="text-sm text-gray-600">
                              Usage: {feature.totalUsage}
                            </span>
                            <span className="text-sm text-gray-600">
                              Recent: {feature.recentUsage}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant="destructive">
                            {formatPercentage(feature.successRate)} success
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