'use client';

import { useState } from 'react';
import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Brain,
  Database,
  Globe,
  Monitor,
  Server,
  Shield,
  TrendingUp,
  Zap
} from 'lucide-react';
import { useEffect } from 'react';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'critical';
  healthScore: number;
  timestamp: string;
  summary: {
    criticalErrors: number;
    recentErrors: number;
    slowPerformance: number;
    errorRate: number;
    slowPerformanceRate: number;
  };
}

export default function MonitoringPage() {
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealthStatus();
    
    // Refresh health status every 30 seconds
    const interval = setInterval(fetchHealthStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchHealthStatus = async () => {
    try {
      const response = await fetch('/api/analytics/health');
      if (response.ok) {
        const data = await response.json();
        setHealthStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch health status:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-50 border-green-200';
      case 'degraded': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <Shield className="h-4 w-4" />;
      case 'degraded': return <AlertCircle className="h-4 w-4" />;
      case 'critical': return <AlertCircle className="h-4 w-4" />;
      default: return <Monitor className="h-4 w-4" />;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">System Monitoring</h1>
            <p className="text-muted-foreground">
              Real-time system health, performance metrics, and error tracking
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Last Day</SelectItem>
                <SelectItem value="week">Last Week</SelectItem>
                <SelectItem value="month">Last Month</SelectItem>
                <SelectItem value="year">Last Year</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              onClick={fetchHealthStatus}
              size="sm"
              variant="outline"
            >
              <Activity className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* System Health Overview */}
        {healthStatus && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className={`border-2 ${getStatusColor(healthStatus.status)}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">System Status</CardTitle>
                {getStatusIcon(healthStatus.status)}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold capitalize">{healthStatus.status}</div>
                <div className="text-xs text-muted-foreground">
                  Health Score: {healthStatus.healthScore}/100
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Critical Errors</CardTitle>
                <AlertCircle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{healthStatus.summary.criticalErrors}</div>
                <div className="text-xs text-muted-foreground">
                  {healthStatus.summary.recentErrors} total errors
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
                <BarChart3 className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{healthStatus.summary.errorRate.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">
                  Last 24 hours
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Slow Requests</CardTitle>
                <TrendingUp className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{healthStatus.summary.slowPerformanceRate.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">
                  >5s response time
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Monitoring Tabs */}
        <Tabs defaultValue="analytics" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="analytics" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center space-x-2">
              <Zap className="h-4 w-4" />
              <span>Performance</span>
            </TabsTrigger>
            <TabsTrigger value="errors" className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4" />
              <span>Errors</span>
            </TabsTrigger>
            <TabsTrigger value="infrastructure" className="flex items-center space-x-2">
              <Server className="h-4 w-4" />
              <span>Infrastructure</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics">
            <AnalyticsDashboard timeRange={timeRange} />
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Performance Overview</CardTitle>
                  <CardDescription>System performance metrics and trends</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Average Response Time</span>
                      <Badge variant="outline">Loading...</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>P95 Response Time</span>
                      <Badge variant="outline">Loading...</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Throughput (req/min)</span>
                      <Badge variant="outline">Loading...</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Resource Utilization</CardTitle>
                  <CardDescription>System resource usage</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>CPU Usage</span>
                      <Badge variant="outline">Loading...</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Memory Usage</span>
                      <Badge variant="outline">Loading...</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Database Connections</span>
                      <Badge variant="outline">Loading...</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="errors" className="space-y-4">
            <div className="grid grid-cols-1 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Errors</CardTitle>
                  <CardDescription>Error tracking and analysis</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">Error tracking data will be displayed here</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="infrastructure" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Globe className="h-5 w-5" />
                    <span>Web Platform</span>
                  </CardTitle>
                  <CardDescription>recoder.xyz status</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-sm">Operational</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Brain className="h-5 w-5" />
                    <span>Chat Platform</span>
                  </CardTitle>
                  <CardDescription>chat.recoder.xyz status</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-sm">Operational</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Database className="h-5 w-5" />
                    <span>Database</span>
                  </CardTitle>
                  <CardDescription>PostgreSQL status</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-sm">Operational</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}