'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { 
  DollarSign, Users, Activity, Target, TrendingUp, TrendingDown, AlertTriangle, 
  RefreshCw, Download, Settings, Eye, Shield, Database, Server, Zap, 
  Calendar, Clock, Award, CreditCard, UserCheck, Bell, BarChart3
} from 'lucide-react';

// Import our analytics components
import RevenueAnalyticsDashboard from '@/components/admin/revenue-analytics-dashboard';
import CustomerLTVDashboard from '@/components/admin/customer-ltv-dashboard';
import SubscriptionMetricsDashboard from '@/components/admin/subscription-metrics-dashboard';
import UserEngagementDashboard from '@/components/admin/user-engagement-dashboard';
import FeatureAdoptionDashboard from '@/components/admin/feature-adoption-dashboard';

interface DashboardOverview {
  revenue: {
    totalRevenue: number;
    mrr: number;
    arr: number;
    growth: number;
  };
  customers: {
    totalCustomers: number;
    activeCustomers: number;
    newCustomers: number;
    churnRate: number;
    avgLTV: number;
  };
  subscriptions: {
    totalSubscriptions: number;
    activeSubscriptions: number;
    newSubscriptions: number;
    cancelledSubscriptions: number;
    netGrowth: number;
  };
  engagement: {
    dailyActiveUsers: number;
    monthlyActiveUsers: number;
    avgSessionDuration: number;
    featureAdoptionRate: number;
  };
  system: {
    totalUsers: number;
    totalProjects: number;
    apiRequests: number;
    systemHealth: number;
  };
}

interface RecentActivity {
  id: string;
  type: string;
  user: string;
  action: string;
  timestamp: string;
  metadata?: any;
}

interface SystemAlert {
  id: string;
  type: 'warning' | 'error' | 'info';
  title: string;
  message: string;
  timestamp: string;
  resolved: boolean;
}

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(fetchDashboardData, refreshInterval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, refreshInterval]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all dashboard data in parallel
      const [overviewRes, activityRes, alertsRes] = await Promise.all([
        fetch('/api/admin/dashboard/overview'),
        fetch('/api/admin/dashboard/recent-activity'),
        fetch('/api/admin/dashboard/alerts')
      ]);

      if (!overviewRes.ok) throw new Error('Failed to fetch overview data');
      if (!activityRes.ok) throw new Error('Failed to fetch activity data');
      if (!alertsRes.ok) throw new Error('Failed to fetch alerts data');

      const [overviewData, activityData, alertsData] = await Promise.all([
        overviewRes.json(),
        activityRes.json(),
        alertsRes.json()
      ]);

      setOverview(overviewData);
      setRecentActivity(activityData.activities || []);
      setSystemAlerts(alertsData.alerts || []);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Dashboard fetch error:', err);
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
    return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(1)}%`;
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 1) return `${Math.round(seconds)}s`;
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'error': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <Bell className="h-4 w-4 text-blue-500" />;
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'user_created': return <UserCheck className="h-4 w-4 text-green-500" />;
      case 'payment': return <CreditCard className="h-4 w-4 text-blue-500" />;
      case 'subscription': return <Target className="h-4 w-4 text-purple-500" />;
      default: return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading admin dashboard...</span>
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-700">Error Loading Dashboard</h3>
          <p className="text-gray-600">{error}</p>
          <Button onClick={fetchDashboardData} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-gray-600">Comprehensive business intelligence and system overview</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <Select value={refreshInterval.toString()} onValueChange={(value) => setRefreshInterval(parseInt(value))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10000">10s</SelectItem>
              <SelectItem value="30000">30s</SelectItem>
              <SelectItem value="60000">1m</SelectItem>
              <SelectItem value="300000">5m</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh && loading ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto' : 'Manual'}
          </Button>

          <Button variant="outline" size="sm" onClick={fetchDashboardData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* System Alerts */}
      {systemAlerts.length > 0 && (
        <div className="space-y-2">
          {systemAlerts.filter(alert => !alert.resolved).slice(0, 3).map((alert) => (
            <Alert key={alert.id} className={`border-l-4 ${
              alert.type === 'error' ? 'border-l-red-500 bg-red-50' : 
              alert.type === 'warning' ? 'border-l-yellow-500 bg-yellow-50' : 
              'border-l-blue-500 bg-blue-50'
            }`}>
              {getAlertIcon(alert.type)}
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>
                {alert.message}
                <span className="text-xs text-gray-500 ml-2">
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </span>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Main Dashboard Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {overview && (
            <>
              {/* Key Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Revenue Metrics */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Monthly Recurring Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(overview.revenue.mrr)}</div>
                    <p className="text-xs text-muted-foreground">
                      {overview.revenue.growth >= 0 ? (
                        <span className="text-green-600 flex items-center">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          {formatPercentage(overview.revenue.growth)}
                        </span>
                      ) : (
                        <span className="text-red-600 flex items-center">
                          <TrendingDown className="h-3 w-3 mr-1" />
                          {formatPercentage(overview.revenue.growth)}
                        </span>
                      )}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overview.customers.activeCustomers.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">
                      +{overview.customers.newCustomers} new this period
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overview.subscriptions.activeSubscriptions.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">
                      {overview.subscriptions.netGrowth >= 0 ? '+' : ''}{overview.subscriptions.netGrowth} net growth
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Daily Active Users</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overview.engagement.dailyActiveUsers.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">
                      Avg session: {formatDuration(overview.engagement.avgSessionDuration)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Secondary Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Average LTV</CardTitle>
                    <Target className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(overview.customers.avgLTV)}</div>
                    <p className="text-xs text-muted-foreground">Customer lifetime value</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Churn Rate</CardTitle>
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${
                      overview.customers.churnRate <= 5 ? 'text-green-600' : 
                      overview.customers.churnRate <= 10 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {overview.customers.churnRate.toFixed(1)}%
                    </div>
                    <Badge variant={
                      overview.customers.churnRate <= 5 ? 'default' : 
                      overview.customers.churnRate <= 10 ? 'secondary' : 'destructive'
                    }>
                      {overview.customers.churnRate <= 5 ? 'Excellent' : 
                       overview.customers.churnRate <= 10 ? 'Good' : 'High'}
                    </Badge>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Monthly Active Users</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overview.engagement.monthlyActiveUsers.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">
                      {((overview.engagement.dailyActiveUsers / overview.engagement.monthlyActiveUsers) * 100).toFixed(1)}% DAU/MAU
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Feature Adoption</CardTitle>
                    <Zap className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overview.engagement.featureAdoptionRate.toFixed(1)}%</div>
                    <p className="text-xs text-muted-foreground">Average adoption rate</p>
                  </CardContent>
                </Card>
              </div>

              {/* System Overview */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Server className="h-5 w-5" />
                      <span>System Health</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Overall Health</span>
                        <Badge variant={overview.system.systemHealth >= 95 ? 'default' : 
                                       overview.system.systemHealth >= 90 ? 'secondary' : 'destructive'}>
                          {overview.system.systemHealth.toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Total Users</span>
                        <span className="font-medium">{overview.system.totalUsers.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Total Projects</span>
                        <span className="font-medium">{overview.system.totalProjects.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">API Requests</span>
                        <span className="font-medium">{overview.system.apiRequests.toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Activity className="h-5 w-5" />
                      <span>Recent Activity</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {recentActivity.slice(0, 5).map((activity) => (
                        <div key={activity.id} className="flex items-center space-x-3">
                          {getActivityIcon(activity.type)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{activity.action}</p>
                            <p className="text-xs text-gray-500 truncate">{activity.user}</p>
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(activity.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Bell className="h-5 w-5" />
                      <span>System Alerts</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {systemAlerts.slice(0, 5).map((alert) => (
                        <div key={alert.id} className="flex items-start space-x-3">
                          {getAlertIcon(alert.type)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{alert.title}</p>
                            <p className="text-xs text-gray-500 truncate">{alert.message}</p>
                            <p className="text-xs text-gray-400">
                              {new Date(alert.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                          {alert.resolved && (
                            <Badge variant="outline" className="text-xs">Resolved</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="revenue" className="space-y-6">
          <RevenueAnalyticsDashboard />
        </TabsContent>

        <TabsContent value="customers" className="space-y-6">
          <CustomerLTVDashboard />
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-6">
          <SubscriptionMetricsDashboard />
        </TabsContent>

        <TabsContent value="engagement" className="space-y-6">
          <UserEngagementDashboard />
        </TabsContent>

        <TabsContent value="features" className="space-y-6">
          <FeatureAdoptionDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}