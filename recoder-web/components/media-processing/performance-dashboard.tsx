'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  Activity, TrendingUp, TrendingDown, Zap, 
  AlertTriangle, CheckCircle, XCircle, Clock,
  Cpu, Memory, HardDrive, Network, Database,
  RefreshCw, Settings, Download, Play, Pause
} from 'lucide-react'
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { toast } from 'sonner'

interface PerformanceMetrics {
  system: {
    cpu: { usage: number; cores: number }
    memory: { usage: number; used: number; total: number }
    disk: { usage: number; used: number; total: number }
    network: { bytesIn: number; bytesOut: number }
  }
  processing: {
    queueLength: number
    activeJobs: number
    completedJobs: number
    failedJobs: number
    throughput: number
    errorRate: number
  }
  cache: {
    hits: number
    misses: number
    hitRate: number
    size: number
    maxSize: number
  }
}

interface PerformanceAlert {
  id: string
  timestamp: Date
  severity: 'info' | 'warning' | 'error' | 'critical'
  metric: string
  value: number
  message: string
  resolved: boolean
}

interface AlertThreshold {
  metric: string
  operator: 'gt' | 'lt' | 'eq'
  value: number
  severity: 'info' | 'warning' | 'error' | 'critical'
  message: string
  enabled: boolean
}

export function PerformanceDashboard() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [historicalData, setHistoricalData] = useState<any[]>([])
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([])
  const [thresholds, setThresholds] = useState<AlertThreshold[]>([])
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(10)
  const [loading, setLoading] = useState(false)
  const [healthScore, setHealthScore] = useState(0)

  const fetchCurrentMetrics = useCallback(async () => {
    try {
      const response = await fetch('/api/media-processing/performance?action=current')
      if (!response.ok) throw new Error('Failed to fetch metrics')
      
      const data = await response.json()
      if (data.success) {
        setMetrics(data.data.metrics)
        setHealthScore(data.data.healthScore)
        
        // Update alerts
        if (data.data.activeAlerts) {
          setAlerts(data.data.activeAlerts)
        }
      }
    } catch (error) {
      console.error('Error fetching metrics:', error)
    }
  }, [])

  const fetchHistoricalData = useCallback(async (hours = 24) => {
    try {
      const response = await fetch(`/api/media-processing/performance?action=historical&hours=${hours}`)
      if (!response.ok) throw new Error('Failed to fetch historical data')
      
      const data = await response.json()
      if (data.success) {
        // Transform data for charts
        const systemData = data.data.system.map((item: any, index: number) => ({
          timestamp: new Date(item.timestamp).toLocaleTimeString(),
          cpu: Math.round(item.cpu.usage),
          memory: Math.round(item.memory.usage),
          disk: Math.round(item.disk.usage)
        }))
        setHistoricalData(systemData)
      }
    } catch (error) {
      console.error('Error fetching historical data:', error)
    }
  }, [])

  const fetchThresholds = useCallback(async () => {
    try {
      const response = await fetch('/api/media-processing/performance?action=thresholds')
      if (!response.ok) throw new Error('Failed to fetch thresholds')
      
      const data = await response.json()
      if (data.success) {
        setThresholds(data.data.thresholds)
      }
    } catch (error) {
      console.error('Error fetching thresholds:', error)
    }
  }, [])

  useEffect(() => {
    fetchCurrentMetrics()
    fetchHistoricalData()
    fetchThresholds()
  }, [fetchCurrentMetrics, fetchHistoricalData, fetchThresholds])

  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(() => {
        fetchCurrentMetrics()
      }, refreshInterval * 1000)
      
      return () => clearInterval(interval)
    }
  }, [autoRefresh, refreshInterval, fetchCurrentMetrics])

  const startMonitoring = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/media-processing/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'start_monitoring',
          interval: refreshInterval * 1000
        })
      })
      
      const data = await response.json()
      if (data.success) {
        setIsMonitoring(true)
        toast.success('Performance monitoring started')
      } else {
        throw new Error(data.error || 'Failed to start monitoring')
      }
    } catch (error) {
      toast.error(`Failed to start monitoring: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const stopMonitoring = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/media-processing/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop_monitoring' })
      })
      
      const data = await response.json()
      if (data.success) {
        setIsMonitoring(false)
        toast.success('Performance monitoring stopped')
      } else {
        throw new Error(data.error || 'Failed to stop monitoring')
      }
    } catch (error) {
      toast.error(`Failed to stop monitoring: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const resolveAlert = async (alertId: string) => {
    try {
      const response = await fetch('/api/media-processing/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'resolve_alert',
          alertId 
        })
      })
      
      const data = await response.json()
      if (data.success) {
        setAlerts(prev => prev.map(alert => 
          alert.id === alertId ? { ...alert, resolved: true } : alert
        ))
        toast.success('Alert resolved')
      } else {
        throw new Error(data.error || 'Failed to resolve alert')
      }
    } catch (error) {
      toast.error(`Failed to resolve alert: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const exportMetrics = async () => {
    try {
      const response = await fetch('/api/media-processing/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'export_metrics',
          hours: 24,
          format: 'json'
        })
      })
      
      const data = await response.json()
      if (data.success) {
        // Create downloadable file
        const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `performance-metrics-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        toast.success('Metrics exported successfully')
      } else {
        throw new Error(data.error || 'Failed to export metrics')
      }
    } catch (error) {
      toast.error(`Failed to export metrics: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const getStatusColor = (value: number, thresholds: { warning: number; critical: number }) => {
    if (value >= thresholds.critical) return 'text-red-500'
    if (value >= thresholds.warning) return 'text-yellow-500'
    return 'text-green-500'
  }

  const getStatusBadge = (value: number, thresholds: { warning: number; critical: number }) => {
    if (value >= thresholds.critical) return <Badge variant="destructive">Critical</Badge>
    if (value >= thresholds.warning) return <Badge variant="secondary">Warning</Badge>
    return <Badge variant="default">Healthy</Badge>
  }

  // Chart colors
  const chartColors = {
    cpu: '#3b82f6',
    memory: '#ef4444', 
    disk: '#10b981',
    network: '#f59e0b'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Performance Dashboard</h2>
          <p className="text-muted-foreground">
            Real-time system monitoring and analytics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch 
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label className="text-sm">Auto Refresh</Label>
          </div>
          
          <div className="flex items-center gap-2">
            <Label className="text-sm">Interval (s):</Label>
            <Input
              type="number"
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="w-20"
              min="5"
              max="300"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={isMonitoring ? stopMonitoring : startMonitoring}
            disabled={loading}
          >
            {isMonitoring ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {isMonitoring ? 'Stop' : 'Start'} Monitoring
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={exportMetrics}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchCurrentMetrics}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Health Score */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">System Health Score</h3>
              <div className="text-4xl font-bold">{healthScore}%</div>
              <p className="text-sm text-muted-foreground">
                Overall system performance rating
              </p>
            </div>
            <div className="text-right">
              {getStatusBadge(100 - healthScore, { warning: 20, critical: 40 })}
              <div className="text-sm text-muted-foreground mt-2">
                {isMonitoring ? 'Monitoring Active' : 'Monitoring Inactive'}
              </div>
            </div>
          </div>
          <Progress value={healthScore} className="mt-4 h-3" />
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* System Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Cpu className="w-4 h-4" />
                  CPU Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-2">
                  {metrics?.system?.cpu?.usage ? Math.round(metrics.system.cpu.usage) : '--'}%
                </div>
                <Progress 
                  value={metrics?.system?.cpu?.usage || 0} 
                  className="h-2 mb-2"
                />
                <div className="text-xs text-muted-foreground">
                  {metrics?.system?.cpu?.cores || '--'} cores available
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Memory className="w-4 h-4" />
                  Memory Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-2">
                  {metrics?.system?.memory?.usage ? Math.round(metrics.system.memory.usage) : '--'}%
                </div>
                <Progress 
                  value={metrics?.system?.memory?.usage || 0} 
                  className="h-2 mb-2"
                />
                <div className="text-xs text-muted-foreground">
                  {metrics?.system?.memory?.total ? 
                    `${Math.round(metrics.system.memory.total / (1024**3))} GB total` : 
                    '-- GB total'
                  }
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <HardDrive className="w-4 h-4" />
                  Disk Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-2">
                  {metrics?.system?.disk?.usage ? Math.round(metrics.system.disk.usage) : '--'}%
                </div>
                <Progress 
                  value={metrics?.system?.disk?.usage || 0} 
                  className="h-2 mb-2"
                />
                <div className="text-xs text-muted-foreground">
                  {metrics?.system?.disk?.total ? 
                    `${Math.round(metrics.system.disk.total / (1024**4))} TB total` : 
                    '-- TB total'
                  }
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Network className="w-4 h-4" />
                  Network I/O
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-2">
                  {metrics?.system?.network ? 
                    `${Math.round((metrics.system.network.bytesIn + metrics.system.network.bytesOut) / (1024 * 1024))} MB` : 
                    '-- MB'
                  }
                </div>
                <div className="text-xs text-muted-foreground">
                  In: {metrics?.system?.network ? Math.round(metrics.system.network.bytesIn / (1024 * 1024)) : '--'} MB |
                  Out: {metrics?.system?.network ? Math.round(metrics.system.network.bytesOut / (1024 * 1024)) : '--'} MB
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Processing Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Database className="w-4 h-4" />
                  Processing Queue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-2">
                  {metrics?.processing?.queueLength || 0}
                </div>
                <div className="text-xs text-muted-foreground">
                  Active: {metrics?.processing?.activeJobs || 0} jobs
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  Job Success Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-2">
                  {metrics?.processing ? 
                    Math.round((metrics.processing.completedJobs / 
                      (metrics.processing.completedJobs + metrics.processing.failedJobs)) * 100) || 0 : 0
                  }%
                </div>
                <div className="text-xs text-muted-foreground">
                  Completed: {metrics?.processing?.completedJobs || 0} | 
                  Failed: {metrics?.processing?.failedJobs || 0}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Zap className="w-4 h-4" />
                  Throughput
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-2">
                  {metrics?.processing?.throughput ? Math.round(metrics.processing.throughput) : 0}
                </div>
                <div className="text-xs text-muted-foreground">
                  jobs per hour
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="charts" className="space-y-6">
          {/* System Performance Chart */}
          <Card>
            <CardHeader>
              <CardTitle>System Performance Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={historicalData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="cpu" stroke={chartColors.cpu} name="CPU %" />
                  <Line type="monotone" dataKey="memory" stroke={chartColors.memory} name="Memory %" />
                  <Line type="monotone" dataKey="disk" stroke={chartColors.disk} name="Disk %" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Cache Performance */}
          {metrics?.cache && (
            <Card>
              <CardHeader>
                <CardTitle>Cache Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-500">
                      {Math.round(metrics.cache.hitRate)}%
                    </div>
                    <div className="text-sm text-muted-foreground">Hit Rate</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {Math.round((metrics.cache.size / (1024 * 1024)))} MB
                    </div>
                    <div className="text-sm text-muted-foreground">Cache Size</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {metrics.cache.evictions}
                    </div>
                    <div className="text-sm text-muted-foreground">Evictions</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="alerts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Alerts ({alerts.filter(a => !a.resolved).length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {alerts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No alerts at this time
                  </div>
                ) : (
                  alerts.filter(alert => !alert.resolved).map((alert) => (
                    <Alert 
                      key={alert.id} 
                      variant={alert.severity === 'error' || alert.severity === 'critical' ? 'destructive' : 'default'}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {alert.severity === 'critical' && <XCircle className="w-4 h-4" />}
                          {alert.severity === 'error' && <XCircle className="w-4 h-4" />}
                          {alert.severity === 'warning' && <AlertTriangle className="w-4 h-4" />}
                          {alert.severity === 'info' && <Activity className="w-4 h-4" />}
                          <div>
                            <div className="font-medium">
                              {alert.metric.toUpperCase()} - {alert.severity.toUpperCase()}
                            </div>
                            <AlertDescription className="mt-1">
                              {alert.message}
                              <div className="text-xs mt-1">
                                {new Date(alert.timestamp).toLocaleString()}
                              </div>
                            </AlertDescription>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resolveAlert(alert.id)}
                        >
                          Resolve
                        </Button>
                      </div>
                    </Alert>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Resolved Alerts */}
          <Card>
            <CardHeader>
              <CardTitle>Recently Resolved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {alerts.filter(alert => alert.resolved).slice(0, 5).map((alert) => (
                  <div key={alert.id} className="flex items-center justify-between p-2 bg-muted rounded opacity-70">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm">{alert.message}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(alert.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Alert Thresholds</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {thresholds.map((threshold, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex-1">
                      <div className="font-medium">{threshold.metric}</div>
                      <div className="text-sm text-muted-foreground">
                        {threshold.operator} {threshold.value} → {threshold.severity}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {threshold.message}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={threshold.enabled}
                        onCheckedChange={() => {
                          // Update threshold enabled state
                          console.log('Toggle threshold:', threshold.metric)
                        }}
                      />
                      <Badge variant={threshold.enabled ? 'default' : 'secondary'}>
                        {threshold.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monitoring Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Monitoring Status</Label>
                  <Badge variant={isMonitoring ? 'default' : 'secondary'}>
                    {isMonitoring ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <Label>Collection Interval</Label>
                  <span>{refreshInterval} seconds</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <Label>Auto Refresh Dashboard</Label>
                  <Switch 
                    checked={autoRefresh}
                    onCheckedChange={setAutoRefresh}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}