'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { 
  Server, Database, Activity, Shield, AlertTriangle, CheckCircle, XCircle, 
  RefreshCw, Cpu, MemoryStick, HardDrive, Network, Clock, TrendingUp, Zap
} from 'lucide-react';

interface SystemOverview {
  status: 'healthy' | 'warning' | 'critical';
  healthScore: number;
  uptime: number;
  totalRequests: number;
  successRate: number;
  activeUsers: number;
  systemLoad: {
    load1m: number;
    load5m: number;
    load15m: number;
  };
  memoryUsage: {
    used: number;
    total: number;
    external: number;
    rss: number;
  };
  cpuCount: number;
  nodeVersion: string;
  platform: string;
}

interface PerformanceMetrics {
  responseTimesByEndpoint: Array<{
    endpoint: string;
    avgResponseTime: number;
    medianResponseTime: number;
    p95ResponseTime: number;
    requestCount: number;
  }>;
  throughputOverTime: Array<{
    hour: string;
    requestsPerHour: number;
    successRate: number;
  }>;
}

interface ErrorMetrics {
  errorsByType: Array<{
    type: string;
    count: number;
  }>;
  errorRateOverTime: Array<{
    hour: string;
    totalRequests: number;
    failedRequests: number;
    errorRate: number;
  }>;
  topErrors: Array<{
    message: string;
    count: number;
  }>;
}

interface DatabaseHealth {
  status: 'healthy' | 'warning' | 'critical';
  responseTime: number | null;
  connectionStatus: string;
  recordCounts: {
    users: number;
    auditLogs: number;
  };
  databaseSize: string;
  tableCount: number;
  activeConnections: number;
}

interface APIHealth {
  endpointHealth: Array<{
    endpoint: string;
    totalRequests: number;
    successRate: number;
    avgDuration: number;
    status: 'healthy' | 'warning' | 'critical';
  }>;
  rateLimitHits: number;
  platformUsage: Array<{
    platform: string;
    requests: number;
  }>;
}

interface ResourceUsage {
  memory: {
    heap: {
      used: number;
      total: number;
      external: number;
      rss: number;
    };
    system: {
      total: number;
      free: number;
      used: number;
      usagePercentage: number;
    };
  };
  cpu: {
    loadAverage: number[];
    cores: number;
  };
  uptime: number;
  platform: {
    type: string;
    release: string;
    arch: string;
    hostname: string;
  };
}

interface UptimeMetrics {
  overallUptime: number;
  slaCompliance: {
    target: number;
    actual: number;
    met: boolean;
  };
  uptimeByHour: Array<{
    hour: string;
    totalRequests: number;
    successfulRequests: number;
    uptimePercentage: number;
  }>;
  downtimeIncidents: number;
}

interface SecurityMetrics {
  failedLogins: number;
  suspiciousIPs: Array<{
    address: string;
    attempts: number;
  }>;
  rateLimitViolations: number;
  securityScore: number;
}

interface SystemHealthData {
  period: string;
  dateRange: { startDate: string; endDate: string };
  systemOverview: SystemOverview;
  performanceMetrics: PerformanceMetrics;
  errorMetrics: ErrorMetrics;
  databaseHealth: DatabaseHealth;
  apiHealth: APIHealth;
  resourceUsage: ResourceUsage;
  uptimeMetrics: UptimeMetrics;
  securityMetrics: SecurityMetrics;
  detailedMetrics?: any;
  lastUpdated: string;
}

export default function SystemHealthDashboard() {
  const [data, setData] = useState<SystemHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('day');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchSystemHealth();
    
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(fetchSystemHealth, refreshInterval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [period, autoRefresh, refreshInterval]);

  const fetchSystemHealth = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        period,
        includeDetailedMetrics: 'true',
      });

      const response = await fetch(`/api/admin/system-health?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch system health: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('System health fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'critical': return <XCircle className="h-5 w-5 text-red-600" />;
      default: return <Activity className="h-5 w-5 text-gray-600" />;
    }
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 95) return 'text-green-600';
    if (score >= 85) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading system health data...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-700">Error Loading System Health</h3>
          <p className="text-gray-600">{error}</p>
          <Button onClick={fetchSystemHealth} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div>No system health data available</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Health Monitor</h1>
          <p className="text-gray-600">Real-time system performance and health monitoring</p>
          <p className="text-sm text-gray-500 mt-1">Last updated: {new Date(data.lastUpdated).toLocaleString()}</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <Select value={period} onValueChange={setPeriod}>
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

          <Button variant="outline" size="sm" onClick={fetchSystemHealth}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* System Status Alert */}
      {data.systemOverview.status !== 'healthy' && (
        <Alert className={`border-l-4 ${
          data.systemOverview.status === 'critical' ? 'border-l-red-500 bg-red-50' : 'border-l-yellow-500 bg-yellow-50'
        }`}>
          {getStatusIcon(data.systemOverview.status)}
          <AlertTitle>System Health Alert</AlertTitle>
          <AlertDescription>
            System status is {data.systemOverview.status}. Health score: {data.systemOverview.healthScore}%
          </AlertDescription>
        </Alert>
      )}

      {/* Key System Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            {getStatusIcon(data.systemOverview.status)}
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${getHealthScoreColor(data.systemOverview.healthScore)}`}>
              {data.systemOverview.healthScore}%
            </div>
            <Progress value={data.systemOverview.healthScore} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              Status: {data.systemOverview.status}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(data.systemOverview.uptime * 3600)}</div>
            <p className="text-xs text-muted-foreground">
              {data.uptimeMetrics.overallUptime.toFixed(2)}% availability
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.systemOverview.successRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {data.systemOverview.totalRequests.toLocaleString()} requests
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.systemOverview.activeUsers}</div>
            <p className="text-xs text-muted-foreground">in last 24 hours</p>
          </CardContent>
        </Card>
      </div>

      {/* Resource Usage Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
            <MemoryStick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.resourceUsage.memory.system.usagePercentage.toFixed(1)}%</div>
            <Progress value={data.resourceUsage.memory.system.usagePercentage} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {formatBytes(data.resourceUsage.memory.system.used * 1024 * 1024)} / {formatBytes(data.resourceUsage.memory.system.total * 1024 * 1024)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CPU Load</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.resourceUsage.cpu.loadAverage[0].toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              {data.resourceUsage.cpu.cores} cores | 5m: {data.resourceUsage.cpu.loadAverage[1].toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database Health</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              {getStatusIcon(data.databaseHealth.status)}
              <span className={`font-bold ${getStatusColor(data.databaseHealth.status)}`}>
                {data.databaseHealth.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.databaseHealth.responseTime ? `${data.databaseHealth.responseTime}ms response` : 'No response time'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Security Score</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getHealthScoreColor(data.securityMetrics.securityScore)}`}>
              {data.securityMetrics.securityScore}%
            </div>
            <p className="text-xs text-muted-foreground">
              {data.securityMetrics.failedLogins} failed logins
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main System Health Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* System Load Over Time */}
            <Card>
              <CardHeader>
                <CardTitle>Request Throughput</CardTitle>
                <CardDescription>Requests per hour and success rate</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={data.performanceMetrics.throughputOverTime}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Area yAxisId="left" type="monotone" dataKey="requestsPerHour" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} name="Requests/Hour" />
                    <Line yAxisId="right" type="monotone" dataKey="successRate" stroke="#82ca9d" name="Success Rate %" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Uptime Tracking */}
            <Card>
              <CardHeader>
                <CardTitle>Uptime Tracking</CardTitle>
                <CardDescription>System availability over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.uptimeMetrics.uptimeByHour}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis domain={[95, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="uptimePercentage" stroke="#8884d8" name="Uptime %" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* SLA Compliance */}
          <Card>
            <CardHeader>
              <CardTitle>SLA Compliance</CardTitle>
              <CardDescription>Service level agreement metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {data.uptimeMetrics.slaCompliance.target}%
                  </div>
                  <p className="text-sm text-gray-600">Target SLA</p>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold ${data.uptimeMetrics.slaCompliance.met ? 'text-green-600' : 'text-red-600'}`}>
                    {data.uptimeMetrics.slaCompliance.actual.toFixed(2)}%
                  </div>
                  <p className="text-sm text-gray-600">Actual Uptime</p>
                </div>
                <div className="text-center">
                  <Badge variant={data.uptimeMetrics.slaCompliance.met ? 'default' : 'destructive'} className="text-lg px-4 py-2">
                    {data.uptimeMetrics.slaCompliance.met ? 'MET' : 'NOT MET'}
                  </Badge>
                  <p className="text-sm text-gray-600 mt-2">
                    {data.uptimeMetrics.downtimeIncidents} incidents
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Response Times by Endpoint</CardTitle>
              <CardDescription>Average, median, and 95th percentile response times</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 p-3 text-left">Endpoint</th>
                      <th className="border border-gray-300 p-3 text-right">Requests</th>
                      <th className="border border-gray-300 p-3 text-right">Avg (ms)</th>
                      <th className="border border-gray-300 p-3 text-right">Median (ms)</th>
                      <th className="border border-gray-300 p-3 text-right">P95 (ms)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.performanceMetrics.responseTimesByEndpoint.slice(0, 15).map((endpoint, index) => (
                      <tr key={endpoint.endpoint} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 p-3 font-medium">
                          {endpoint.endpoint.replace(/_/g, ' ').toUpperCase()}
                        </td>
                        <td className="border border-gray-300 p-3 text-right">{endpoint.requestCount}</td>
                        <td className="border border-gray-300 p-3 text-right">{endpoint.avgResponseTime.toFixed(1)}</td>
                        <td className="border border-gray-300 p-3 text-right">{endpoint.medianResponseTime.toFixed(1)}</td>
                        <td className="border border-gray-300 p-3 text-right">{endpoint.p95ResponseTime.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Error Rate Over Time</CardTitle>
                <CardDescription>Percentage of failed requests by hour</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.errorMetrics.errorRateOverTime}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="errorRate" stroke="#ff7c7c" name="Error Rate %" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Errors by Type</CardTitle>
                <CardDescription>Most common error types</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.errorMetrics.errorsByType.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#ff7c7c" name="Error Count" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top Error Messages</CardTitle>
              <CardDescription>Most frequent error messages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.errorMetrics.topErrors.slice(0, 10).map((error, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                    <div className="flex-1">
                      <p className="font-medium text-red-800">{error.message}</p>
                    </div>
                    <Badge variant="destructive">{error.count} occurrences</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Memory Usage</CardTitle>
                <CardDescription>Heap and system memory consumption</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Heap Memory</span>
                      <span>{data.resourceUsage.memory.heap.used}MB / {data.resourceUsage.memory.heap.total}MB</span>
                    </div>
                    <Progress value={(data.resourceUsage.memory.heap.used / data.resourceUsage.memory.heap.total) * 100} />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>System Memory</span>
                      <span>{formatBytes(data.resourceUsage.memory.system.used * 1024 * 1024)} / {formatBytes(data.resourceUsage.memory.system.total * 1024 * 1024)}</span>
                    </div>
                    <Progress value={data.resourceUsage.memory.system.usagePercentage} />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm">
                      <span>RSS:</span>
                      <span>{data.resourceUsage.memory.heap.rss}MB</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>External:</span>
                      <span>{data.resourceUsage.memory.heap.external}MB</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>CPU & Load</CardTitle>
                <CardDescription>System load averages and CPU information</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold">{data.resourceUsage.cpu.loadAverage[0].toFixed(2)}</div>
                      <div className="text-sm text-gray-600">1 min</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{data.resourceUsage.cpu.loadAverage[1].toFixed(2)}</div>
                      <div className="text-sm text-gray-600">5 min</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{data.resourceUsage.cpu.loadAverage[2].toFixed(2)}</div>
                      <div className="text-sm text-gray-600">15 min</div>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>CPU Cores:</span>
                      <span>{data.resourceUsage.cpu.cores}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Process Uptime:</span>
                      <span>{formatDuration(data.resourceUsage.uptime)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Platform:</span>
                      <span>{data.resourceUsage.platform.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Architecture:</span>
                      <span>{data.resourceUsage.platform.arch}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>System Information</CardTitle>
              <CardDescription>Platform and runtime details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="font-medium">Hostname</div>
                  <div className="text-gray-600">{data.resourceUsage.platform.hostname}</div>
                </div>
                <div>
                  <div className="font-medium">Platform</div>
                  <div className="text-gray-600">{data.systemOverview.platform}</div>
                </div>
                <div>
                  <div className="font-medium">Node Version</div>
                  <div className="text-gray-600">{data.systemOverview.nodeVersion}</div>
                </div>
                <div>
                  <div className="font-medium">OS Release</div>
                  <div className="text-gray-600">{data.resourceUsage.platform.release}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Security Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-4xl font-bold ${getHealthScoreColor(data.securityMetrics.securityScore)}`}>
                  {data.securityMetrics.securityScore}%
                </div>
                <Progress value={data.securityMetrics.securityScore} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Failed Logins</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600">{data.securityMetrics.failedLogins}</div>
                <p className="text-sm text-gray-600 mt-1">in selected period</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Rate Limit Violations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-yellow-600">{data.securityMetrics.rateLimitViolations}</div>
                <p className="text-sm text-gray-600 mt-1">requests blocked</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Suspicious IP Addresses</CardTitle>
              <CardDescription>IPs with multiple failed attempts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.securityMetrics.suspiciousIPs.slice(0, 10).map((ip, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div>
                      <span className="font-mono text-sm">{ip.address}</span>
                    </div>
                    <Badge variant="secondary">{ip.attempts} attempts</Badge>
                  </div>
                ))}
                {data.securityMetrics.suspiciousIPs.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Shield className="h-12 w-12 mx-auto mb-4 text-green-500" />
                    <p>No suspicious IP addresses detected</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="database" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Connection Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  {getStatusIcon(data.databaseHealth.status)}
                  <span className={`font-bold ${getStatusColor(data.databaseHealth.status)}`}>
                    {data.databaseHealth.connectionStatus}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Response Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.databaseHealth.responseTime ? `${data.databaseHealth.responseTime}ms` : 'N/A'}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Database Size</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.databaseHealth.databaseSize}</div>
                <p className="text-sm text-gray-600">{data.databaseHealth.tableCount} tables</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Connections</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.databaseHealth.activeConnections}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Record Counts</CardTitle>
              <CardDescription>Number of records in key tables</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {data.databaseHealth.recordCounts.users.toLocaleString()}
                  </div>
                  <p className="text-sm text-gray-600">Users</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {data.databaseHealth.recordCounts.auditLogs.toLocaleString()}
                  </div>
                  <p className="text-sm text-gray-600">Audit Logs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}