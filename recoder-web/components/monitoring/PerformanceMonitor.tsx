"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Activity, 
  Cpu, 
  MemoryStick, 
  HardDrive, 
  Wifi, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Zap,
  Database,
  Brain,
  Rocket
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PerformanceMetrics {
  system: {
    cpu: { usage: number; cores: number; loadAverage: number[] };
    memory: { used: number; total: number; percentage: number };
    uptime: { system: number; process: number };
  };
  application: {
    performance: {
      responseTime: number;
      requestsPerSecond: number;
      errorRate: number;
      activeConnections: number;
    };
    features: {
      aiGenerations: { totalRequests: number; successRate: number; avgResponseTime: number };
      deployments: { totalDeployments: number; successRate: number; avgBuildTime: number };
      collaborationSessions: { activeSessions: number; totalUsers: number };
    };
  };
  database: {
    connections: { active: number; total: number };
    queries: { perSecond: number; avgDuration: number };
  };
}

interface PerformanceMonitorProps {
  projectId?: string;
  className?: string;
}

export default function PerformanceMonitor({ projectId, className = "" }: PerformanceMonitorProps) {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000); // 5 seconds

  // Load current metrics
  const loadMetrics = async () => {
    try {
      const response = await fetch('/api/performance/metrics');
      const data = await response.json();
      
      if (data.success) {
        setMetrics(data.metrics);
      }
    } catch (error) {
      console.error('Failed to load performance metrics:', error);
    }
  };

  // Load historical data
  const loadHistoricalData = async (timeRange = '24h') => {
    try {
      const response = await fetch('/api/performance/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeRange, metricType: 'all' })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setHistoricalData(data.data);
      }
    } catch (error) {
      console.error('Failed to load historical data:', error);
    }
  };

  // Initial load
  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      await Promise.all([
        loadMetrics(),
        loadHistoricalData()
      ]);
      setLoading(false);
    };

    initialize();
  }, []);

  // Auto-refresh metrics
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(loadMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const getStatusColor = (percentage: number) => {
    if (percentage > 90) return 'text-red-500';
    if (percentage > 70) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getStatusIcon = (percentage: number) => {
    if (percentage > 90) return <AlertTriangle className="w-4 h-4 text-red-500" />;
    if (percentage > 70) return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    return <CheckCircle className="w-4 h-4 text-green-500" />;
  };

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span>Loading performance metrics...</span>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className={`text-center p-8 ${className}`}>
        <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
        <p>Failed to load performance metrics</p>
        <Button onClick={loadMetrics} className="mt-2">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Performance Monitor
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Disable' : 'Enable'} Auto-refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadMetrics}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="application">Application</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">CPU Usage</p>
                    <p className={`text-2xl font-bold ${getStatusColor(metrics.system.cpu.usage)}`}>
                      {metrics.system.cpu.usage.toFixed(1)}%
                    </p>
                  </div>
                  <Cpu className={`w-8 h-8 ${getStatusColor(metrics.system.cpu.usage)}`} />
                </div>
                <Progress value={metrics.system.cpu.usage} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Memory</p>
                    <p className={`text-2xl font-bold ${getStatusColor(metrics.system.memory.percentage)}`}>
                      {metrics.system.memory.percentage.toFixed(1)}%
                    </p>
                  </div>
                  <MemoryStick className={`w-8 h-8 ${getStatusColor(metrics.system.memory.percentage)}`} />
                </div>
                <Progress value={metrics.system.memory.percentage} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Response Time</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {metrics.application.performance.responseTime}ms
                    </p>
                  </div>
                  <Zap className="w-8 h-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Active Users</p>
                    <p className="text-2xl font-bold text-green-600">
                      {metrics.application.features.collaborationSessions.activeSessions}
                    </p>
                  </div>
                  <Activity className="w-8 h-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Historical Chart */}
          {historicalData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Performance Trends (24h)</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer>
                    <LineChart data={historicalData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="timestamp" 
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip 
                        labelFormatter={(value) => new Date(value).toLocaleString()}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="cpu" 
                        stroke="#8884d8" 
                        strokeWidth={2}
                        name="CPU %"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="memory" 
                        stroke="#82ca9d" 
                        strokeWidth={2}
                        name="Memory %"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="responseTime" 
                        stroke="#ffc658" 
                        strokeWidth={2}
                        name="Response Time (ms)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Cpu className="w-4 h-4" />
                  CPU Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Cores:</span>
                  <span className="font-medium">{metrics.system.cpu.cores}</span>
                </div>
                <div className="flex justify-between">
                  <span>Usage:</span>
                  <span className={`font-medium ${getStatusColor(metrics.system.cpu.usage)}`}>
                    {metrics.system.cpu.usage.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Load Average:</span>
                  <span className="font-medium">
                    {metrics.system.cpu.loadAverage.map(l => l.toFixed(2)).join(', ')}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <MemoryStick className="w-4 h-4" />
                  Memory Usage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Used:</span>
                  <span className="font-medium">{formatBytes(metrics.system.memory.used)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total:</span>
                  <span className="font-medium">{formatBytes(metrics.system.memory.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Usage:</span>
                  <span className={`font-medium ${getStatusColor(metrics.system.memory.percentage)}`}>
                    {metrics.system.memory.percentage.toFixed(1)}%
                  </span>
                </div>
                <Progress value={metrics.system.memory.percentage} className="mt-2" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4" />
                System Uptime
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="text-sm text-gray-600">System</p>
                  <p className="text-lg font-bold text-blue-600">
                    {formatUptime(metrics.system.uptime.system)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Process</p>
                  <p className="text-lg font-bold text-green-600">
                    {formatUptime(metrics.system.uptime.process)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="application" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4" />
                  AI Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Requests:</span>
                  <span className="font-medium">{metrics.application.features.aiGenerations.totalRequests}</span>
                </div>
                <div className="flex justify-between">
                  <span>Success Rate:</span>
                  <span className="font-medium text-green-600">
                    {metrics.application.features.aiGenerations.successRate.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Response:</span>
                  <span className="font-medium">
                    {metrics.application.features.aiGenerations.avgResponseTime}ms
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Rocket className="w-4 h-4" />
                  Deployments
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Total:</span>
                  <span className="font-medium">{metrics.application.features.deployments.totalDeployments}</span>
                </div>
                <div className="flex justify-between">
                  <span>Success Rate:</span>
                  <span className="font-medium text-green-600">
                    {metrics.application.features.deployments.successRate.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Build:</span>
                  <span className="font-medium">
                    {metrics.application.features.deployments.avgBuildTime}s
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Database
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Connections:</span>
                  <span className="font-medium">
                    {metrics.database.connections.active}/{metrics.database.connections.total}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Queries/sec:</span>
                  <span className="font-medium">{metrics.database.queries.perSecond}</span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Duration:</span>
                  <span className="font-medium">{metrics.database.queries.avgDuration}ms</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
