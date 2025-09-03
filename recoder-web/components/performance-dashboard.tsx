'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Activity, Cpu, HardDrive, Wifi, DollarSign, AlertTriangle, 
  CheckCircle, TrendingUp, TrendingDown, Minus, Zap, Brain,
  Server, MemoryStick, Network, Database, RefreshCw
} from 'lucide-react';

// 🚀 REAL PERFORMANCE DASHBOARD - COMPREHENSIVE SYSTEM MONITORING
// Live visualization of actual system metrics with AI-powered insights

interface SystemMetrics {
  timestamp: string;
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
    temperature?: number;
  };
  memory: {
    used: number;
    total: number;
    free: number;
    percentage: number;
    heap: {
      used: number;
      total: number;
      limit: number;
    };
  };
  network: {
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
    connections: number;
  };
  disk: {
    used: number;
    total: number;
    free: number;
    percentage: number;
    readOps: number;
    writeOps: number;
  };
  ai: {
    totalRequests: number;
    totalCost: number;
    avgResponseTime: number;
    errorRate: number;
    providersUsed: string[];
    topModels: Array<{ model: string; requests: number; cost: number }>;
  };
  application: {
    uptime: number;
    version: string;
    environment: string;
    activeUsers: number;
    totalRequests: number;
    errorCount: number;
    avgResponseTime: number;
  };
}

interface PerformanceAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  metric: string;
  threshold: number;
  currentValue: number;
  message: string;
  timestamp: string;
  resolved: boolean;
  actions: string[];
}

interface OptimizationRecommendation {
  id: string;
  category: 'performance' | 'cost' | 'reliability' | 'security';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  implementation: string[];
  estimatedSavings?: {
    cost?: number;
    time?: number;
    resources?: number;
  };
  aiConfidence: number;
}

interface TrendData {
  timeRange: string;
  dataPoints: number;
  trends: {
    cpu: { trend: 'up' | 'down' | 'stable'; current: number };
    memory: { trend: 'up' | 'down' | 'stable'; current: number };
    aiCost: { trend: 'up' | 'down' | 'stable'; current: number };
    responseTime: { trend: 'up' | 'down' | 'stable'; current: number };
  };
  historicalData: Array<{
    timestamp: string;
    cpu: number;
    memory: number;
    aiCost: number;
    responseTime: number;
  }>;
}

export default function RealPerformanceDashboard() {
  // State management
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([]);
  const [recommendations, setRecommendations] = useState<OptimizationRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval] = useState(30000); // 30 seconds

  // 📊 REAL METRICS COLLECTION
  const collectMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('🔄 Collecting real-time performance metrics...');
      
      // Collect current metrics
      const metricsResponse = await fetch('/api/performance-monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'collect-metrics' })
      });

      if (!metricsResponse.ok) {
        throw new Error(`Metrics collection failed: ${metricsResponse.statusText}`);
      }

      const metricsData = await metricsResponse.json();
      if (!metricsData.success) {
        throw new Error(metricsData.error || 'Failed to collect metrics');
      }

      setMetrics(metricsData.metrics);
      console.log('✅ Metrics collected:', metricsData.metrics);

      // Get performance trends
      const trendsResponse = await fetch('/api/performance-monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-performance-trends', timeRange: 'hour' })
      });

      if (trendsResponse.ok) {
        const trendsData = await trendsResponse.json();
        if (trendsData.success && trendsData.trends) {
          setTrends(trendsData.trends);
        }
      }

      // Get active alerts
      const alertsResponse = await fetch('/api/performance-monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-alerts' })
      });

      if (alertsResponse.ok) {
        const alertsData = await alertsResponse.json();
        if (alertsData.success) {
          setAlerts(alertsData.alerts || []);
        }
      }

      // Get AI optimization recommendations
      const recsResponse = await fetch('/api/performance-monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-optimization-recommendations' })
      });

      if (recsResponse.ok) {
        const recsData = await recsResponse.json();
        if (recsData.success) {
          setRecommendations(recsData.recommendations || []);
        }
      }

    } catch (error) {
      console.error('❌ Failed to collect performance metrics:', error);
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh functionality
  useEffect(() => {
    collectMetrics(); // Initial load

    if (autoRefresh) {
      const interval = setInterval(collectMetrics, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, collectMetrics]);

  // 🚨 RESOLVE ALERT
  const resolveAlert = async (alertId: string) => {
    try {
      const response = await fetch('/api/performance-monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve-alert', alertId })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAlerts(prev => prev.filter(alert => alert.id !== alertId));
        }
      }
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  };

  // Helper functions
  const formatBytes = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-4 h-4 text-red-500" />;
      case 'down': return <TrendingDown className="w-4 h-4 text-green-500" />;
      case 'stable': return <Minus className="w-4 h-4 text-gray-500" />;
    }
  };

  const getHealthColor = (value: number, thresholds: { warning: number; critical: number }) => {
    if (value >= thresholds.critical) return 'text-red-600 bg-red-50';
    if (value >= thresholds.warning) return 'text-orange-600 bg-orange-50';
    return 'text-green-600 bg-green-50';
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'critical': return 'destructive';
      case 'warning': return 'secondary';
      case 'info': return 'outline';
      default: return 'outline';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  if (error) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Performance Dashboard Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={collectMetrics}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">⚡ Real Performance Dashboard</h1>
          <p className="text-gray-600">Live system monitoring with AI-powered insights</p>
        </div>
        <div className="flex items-center gap-4">
          <Button 
            variant={autoRefresh ? "default" : "outline"}
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto Refresh
          </Button>
          <Button onClick={collectMetrics} disabled={loading}>
            {loading ? 'Collecting...' : 'Refresh Now'}
          </Button>
        </div>
      </div>

      {!metrics && loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p>Collecting real-time performance metrics...</p>
          </CardContent>
        </Card>
      )}

      {metrics && (
        <>
          {/* System Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* CPU Usage */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.cpu.usage.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">
                  {metrics.cpu.cores} cores • {metrics.cpu.temperature?.toFixed(1)}°C
                  {trends && getTrendIcon(trends.trends.cpu.trend)}
                </p>
                <div className={`text-xs px-2 py-1 rounded mt-2 ${getHealthColor(metrics.cpu.usage, { warning: 70, critical: 85 })}`}>
                  {metrics.cpu.usage < 70 ? 'Healthy' : metrics.cpu.usage < 85 ? 'Warning' : 'Critical'}
                </div>
              </CardContent>
            </Card>

            {/* Memory Usage */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
                <MemoryStick className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.memory.percentage}%</div>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
                  {trends && getTrendIcon(trends.trends.memory.trend)}
                </p>
                <div className={`text-xs px-2 py-1 rounded mt-2 ${getHealthColor(metrics.memory.percentage, { warning: 75, critical: 85 })}`}>
                  {metrics.memory.percentage < 75 ? 'Healthy' : metrics.memory.percentage < 85 ? 'Warning' : 'Critical'}
                </div>
              </CardContent>
            </Card>

            {/* AI Costs */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">AI Costs</CardTitle>
                <Brain className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${metrics.ai.totalCost.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">
                  /hour • {metrics.ai.totalRequests} requests
                  {trends && getTrendIcon(trends.trends.aiCost.trend)}
                </p>
                <div className={`text-xs px-2 py-1 rounded mt-2 ${getHealthColor(metrics.ai.totalCost, { warning: 5, critical: 10 })}`}>
                  {metrics.ai.totalCost < 5 ? 'Optimal' : metrics.ai.totalCost < 10 ? 'High' : 'Critical'}
                </div>
              </CardContent>
            </Card>

            {/* System Uptime */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">System Health</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatUptime(metrics.application.uptime)}</div>
                <p className="text-xs text-muted-foreground">
                  {metrics.application.activeUsers} users • {metrics.application.environment}
                </p>
                <div className="text-xs px-2 py-1 rounded mt-2 bg-green-50 text-green-600">
                  <CheckCircle className="w-3 h-3 inline mr-1" />
                  Online
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          {trends && trends.historicalData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* CPU & Memory Trends */}
              <Card>
                <CardHeader>
                  <CardTitle>System Performance Trends</CardTitle>
                  <CardDescription>CPU and Memory usage over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={trends.historicalData.slice(-20)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="timestamp" 
                        tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                      />
                      <YAxis />
                      <Tooltip 
                        labelFormatter={(value) => new Date(value as string).toLocaleString()}
                        formatter={(value: any, name) => [
                          `${value.toFixed(1)}%`, 
                          name === 'cpu' ? 'CPU' : 'Memory'
                        ]}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="cpu" 
                        stroke="#8884d8" 
                        strokeWidth={2}
                        name="CPU Usage"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="memory" 
                        stroke="#82ca9d" 
                        strokeWidth={2}
                        name="Memory Usage"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* AI Costs & Response Time */}
              <Card>
                <CardHeader>
                  <CardTitle>AI Performance Metrics</CardTitle>
                  <CardDescription>Cost and response time trends</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={trends.historicalData.slice(-20)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="timestamp" 
                        tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                      />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip 
                        labelFormatter={(value) => new Date(value as string).toLocaleString()}
                        formatter={(value: any, name) => [
                          name === 'aiCost' ? `$${value.toFixed(3)}` : `${value.toFixed(0)}ms`,
                          name === 'aiCost' ? 'Cost' : 'Response Time'
                        ]}
                      />
                      <Legend />
                      <Area 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="aiCost" 
                        stackId="1"
                        stroke="#ff7300" 
                        fill="#ff7300"
                        fillOpacity={0.6}
                        name="AI Cost"
                      />
                      <Area 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="responseTime" 
                        stackId="2"
                        stroke="#00ff88" 
                        fill="#00ff88"
                        fillOpacity={0.6}
                        name="Response Time"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* AI Models Usage */}
          {metrics.ai.topModels.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>AI Models Performance</CardTitle>
                <CardDescription>Usage and cost breakdown by model</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={metrics.ai.topModels}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="model" 
                      angle={-45}
                      textAnchor="end"
                      height={100}
                    />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip 
                      formatter={(value: any, name) => [
                        name === 'requests' ? `${value} requests` : `$${value.toFixed(4)}`,
                        name === 'requests' ? 'Requests' : 'Cost'
                      ]}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="requests" fill="#8884d8" name="Requests" />
                    <Bar yAxisId="right" dataKey="cost" fill="#82ca9d" name="Cost" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Active Alerts */}
          {alerts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  Active Performance Alerts ({alerts.length})
                </CardTitle>
                <CardDescription>System issues requiring attention</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {alerts.map((alert) => (
                  <div key={alert.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <Badge variant={getAlertColor(alert.type) as any}>
                          {alert.type.toUpperCase()}
                        </Badge>
                        <h4 className="font-semibold mt-1">{alert.message}</h4>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => resolveAlert(alert.id)}
                      >
                        Resolve
                      </Button>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      {alert.metric}: {alert.currentValue} (threshold: {alert.threshold})
                    </p>
                    <div className="text-xs">
                      <strong>Recommended Actions:</strong>
                      <ul className="list-disc list-inside mt-1">
                        {alert.actions.map((action, idx) => (
                          <li key={idx}>{action}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* AI Optimization Recommendations */}
          {recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-blue-500" />
                  AI-Powered Optimization Recommendations ({recommendations.length})
                </CardTitle>
                <CardDescription>Smart suggestions to improve performance and reduce costs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {recommendations.map((rec) => (
                  <div key={rec.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={getPriorityColor(rec.priority) as any}>
                          {rec.priority.toUpperCase()}
                        </Badge>
                        <Badge variant="outline">{rec.category}</Badge>
                        <span className="text-sm text-gray-500">
                          {(rec.aiConfidence * 100).toFixed(0)}% confidence
                        </span>
                      </div>
                      {rec.estimatedSavings && (
                        <div className="text-right">
                          {rec.estimatedSavings.cost && (
                            <div className="text-sm font-medium text-green-600">
                              Save ${rec.estimatedSavings.cost.toFixed(2)}
                            </div>
                          )}
                          {rec.estimatedSavings.time && (
                            <div className="text-xs text-gray-500">
                              {rec.estimatedSavings.time}% faster
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <h4 className="font-semibold mb-1">{rec.title}</h4>
                    <p className="text-sm text-gray-600 mb-2">{rec.description}</p>
                    <p className="text-sm font-medium mb-2">Expected Impact: {rec.impact}</p>
                    <div className="text-xs">
                      <strong>Implementation Steps:</strong>
                      <ol className="list-decimal list-inside mt-1">
                        {rec.implementation.map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* System Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Network Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="w-5 h-5" />
                  Network Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Bytes Received:</span>
                  <span className="font-mono">{formatBytes(metrics.network.bytesReceived)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bytes Sent:</span>
                  <span className="font-mono">{formatBytes(metrics.network.bytesSent)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Active Connections:</span>
                  <span className="font-mono">{metrics.network.connections}</span>
                </div>
                <div className="flex justify-between">
                  <span>Packets Received:</span>
                  <span className="font-mono">{metrics.network.packetsReceived.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>

            {/* Disk Usage */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5" />
                  Storage & I/O
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Used Space:</span>
                  <span className="font-mono">{formatBytes(metrics.disk.used)} ({metrics.disk.percentage}%)</span>
                </div>
                <div className="flex justify-between">
                  <span>Free Space:</span>
                  <span className="font-mono">{formatBytes(metrics.disk.free)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Read Operations:</span>
                  <span className="font-mono">{metrics.disk.readOps.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Write Operations:</span>
                  <span className="font-mono">{metrics.disk.writeOps.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}