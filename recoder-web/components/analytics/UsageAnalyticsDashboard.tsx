// Enterprise Usage Analytics Dashboard
// Comprehensive billing and monitoring insights

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import { 
  TrendingUp, 
  DollarSign, 
  Users, 
  Zap, 
  Clock, 
  Download,
  Filter,
  Calendar,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

interface UsageMetrics {
  totalTokens: number;
  totalRequests: number;
  totalCost: number;
  activeUsers: number;
  averageSessionDuration: number;
  topAiProvider: string;
  costPerToken: number;
  requestsPerUser: number;
}

interface TimeSeriesData {
  date: string;
  tokens: number;
  requests: number;
  cost: number;
  users: number;
}

interface ProviderUsage {
  provider: string;
  tokens: number;
  requests: number;
  cost: number;
  percentage: number;
}

interface UserUsage {
  userId: string;
  userName: string;
  email: string;
  tokens: number;
  requests: number;
  cost: number;
  plan: string;
  lastActive: string;
}

interface CostBreakdown {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00', '#ff00ff'];

const UsageAnalyticsDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [providerUsage, setProviderUsage] = useState<ProviderUsage[]>([]);
  const [userUsage, setUserUsage] = useState<UserUsage[]>([]);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');
  const [selectedMetric, setSelectedMetric] = useState('tokens');

  useEffect(() => {
    fetchAnalyticsData();
  }, [timeRange]);

  const fetchAnalyticsData = async () => {
    setLoading(true);
    try {
      const [metricsRes, timeSeriesRes, providersRes, usersRes, costsRes] = await Promise.all([
        fetch(`/api/analytics/metrics?range=${timeRange}`),
        fetch(`/api/analytics/timeseries?range=${timeRange}`),
        fetch(`/api/analytics/providers?range=${timeRange}`),
        fetch(`/api/analytics/users?range=${timeRange}`),
        fetch(`/api/analytics/costs?range=${timeRange}`)
      ]);

      const metricsData = await metricsRes.json();
      const timeSeriesDataRes = await timeSeriesRes.json();
      const providersData = await providersRes.json();
      const usersData = await usersRes.json();
      const costsData = await costsRes.json();

      if (metricsData.success) setMetrics(metricsData.data);
      if (timeSeriesDataRes.success) setTimeSeriesData(timeSeriesDataRes.data);
      if (providersData.success) setProviderUsage(providersData.data);
      if (usersData.success) setUserUsage(usersData.data);
      if (costsData.success) setCostBreakdown(costsData.data);

    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast.error('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const exportData = async (format: 'csv' | 'json') => {
    try {
      const response = await fetch(`/api/analytics/export?format=${format}&range=${timeRange}`);
      const blob = await response.blob();
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recoder-analytics-${timeRange}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success(`Analytics exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error('Failed to export analytics data');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-32 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">Usage Analytics</h1>
          <p className="text-gray-600">Enterprise billing and monitoring insights</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24 Hours</SelectItem>
              <SelectItem value="7d">7 Days</SelectItem>
              <SelectItem value="30d">30 Days</SelectItem>
              <SelectItem value="90d">90 Days</SelectItem>
              <SelectItem value="1y">1 Year</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" onClick={() => exportData('csv')}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          
          <Button variant="outline" onClick={() => exportData('json')}>
            <Download className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Cost</p>
                  <p className="text-2xl font-bold">{formatCurrency(metrics.totalCost)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-green-500" />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                ${metrics.costPerToken.toFixed(4)} per token
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">AI Tokens</p>
                  <p className="text-2xl font-bold">{formatNumber(metrics.totalTokens)}</p>
                </div>
                <Zap className="h-8 w-8 text-blue-500" />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {formatNumber(metrics.totalRequests)} requests
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Users</p>
                  <p className="text-2xl font-bold">{metrics.activeUsers}</p>
                </div>
                <Users className="h-8 w-8 text-purple-500" />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {metrics.requestsPerUser.toFixed(1)} req/user avg
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Top Provider</p>
                  <p className="text-2xl font-bold">{metrics.topAiProvider}</p>
                </div>
                <Activity className="h-8 w-8 text-orange-500" />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {metrics.averageSessionDuration.toFixed(1)} min avg session
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      <Tabs defaultValue="trends" className="space-y-6">
        <TabsList>
          <TabsTrigger value="trends">Usage Trends</TabsTrigger>
          <TabsTrigger value="providers">AI Providers</TabsTrigger>
          <TabsTrigger value="users">User Analytics</TabsTrigger>
          <TabsTrigger value="costs">Cost Analysis</TabsTrigger>
        </TabsList>

        {/* Usage Trends */}
        <TabsContent value="trends" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5" />
                  <span>Usage Over Time</span>
                </CardTitle>
                <CardDescription>Tokens and requests by day</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="tokens" 
                      stackId="1"
                      stroke="#8884d8" 
                      fill="#8884d8" 
                      fillOpacity={0.6}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="requests" 
                      stackId="2"
                      stroke="#82ca9d" 
                      fill="#82ca9d" 
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <DollarSign className="h-5 w-5" />
                  <span>Cost Trends</span>
                </CardTitle>
                <CardDescription>Daily spending and user activity</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="cost" 
                      stroke="#ff7300" 
                      strokeWidth={2}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="users" 
                      stroke="#00ff00" 
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* AI Providers */}
        <TabsContent value="providers" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <PieChartIcon className="h-5 w-5" />
                  <span>Provider Usage Distribution</span>
                </CardTitle>
                <CardDescription>Token usage by AI provider</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={providerUsage}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ provider, percentage }) => `${provider}: ${percentage}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="tokens"
                    >
                      {providerUsage.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Provider Performance</CardTitle>
                <CardDescription>Cost and usage comparison</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {providerUsage.map((provider, index) => (
                    <div key={provider.provider} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div 
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        ></div>
                        <div>
                          <p className="font-medium">{provider.provider}</p>
                          <p className="text-sm text-gray-600">
                            {formatNumber(provider.tokens)} tokens • {formatNumber(provider.requests)} requests
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(provider.cost)}</p>
                        <p className="text-sm text-gray-600">{provider.percentage}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* User Analytics */}
        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>Top Users by Usage</span>
              </CardTitle>
              <CardDescription>Most active users and their consumption</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {userUsage.slice(0, 10).map((user, index) => (
                  <div key={user.userId} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded-full">
                        <span className="text-sm font-medium">{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium">{user.userName}</p>
                        <p className="text-sm text-gray-600">{user.email}</p>
                      </div>
                      <Badge variant="outline">{user.plan}</Badge>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(user.cost)}</p>
                      <p className="text-sm text-gray-600">
                        {formatNumber(user.tokens)} tokens • {formatNumber(user.requests)} requests
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cost Analysis */}
        <TabsContent value="costs" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5" />
                  <span>Cost Breakdown</span>
                </CardTitle>
                <CardDescription>Spending by category</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={costBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="amount" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost Optimization</CardTitle>
                <CardDescription>Recommendations to reduce spending</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start space-x-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-800">High Claude Usage</p>
                    <p className="text-sm text-yellow-700">
                      Consider routing simple queries to Groq to reduce costs by ~70%
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-800">Usage Growth</p>
                    <p className="text-sm text-blue-700">
                      Usage increased 23% this month. Consider enterprise plan for better rates.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <Users className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-800">Efficient Users</p>
                    <p className="text-sm text-green-700">
                      85% of users are within plan limits. Great usage discipline!
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UsageAnalyticsDashboard;