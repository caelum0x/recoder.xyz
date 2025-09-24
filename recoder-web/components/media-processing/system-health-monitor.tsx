'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Activity, CheckCircle, XCircle, AlertTriangle, 
  Server, Database, Cloud, Zap, RefreshCw,
  Cpu, MemoryStick, HardDrive, Network, Timer
} from 'lucide-react'
import { toast } from 'sonner'

interface SystemHealth {
  overall: 'healthy' | 'warning' | 'critical'
  score: number
  services: {
    api: ServiceStatus
    database: ServiceStatus
    storage: ServiceStatus
    processing: ServiceStatus
    cdn: ServiceStatus
  }
  metrics: {
    cpu: number
    memory: number
    disk: number
    network: number
    uptime: number
  }
  alerts: SystemAlert[]
  lastCheck: Date
}

interface ServiceStatus {
  status: 'online' | 'degraded' | 'offline'
  responseTime: number
  uptime: number
  lastCheck: Date
  version?: string
  endpoint?: string
}

interface SystemAlert {
  id: string
  level: 'info' | 'warning' | 'error' | 'critical'
  service: string
  message: string
  timestamp: Date
  resolved: boolean
}

export function SystemHealthMonitor() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null)

  useEffect(() => {
    fetchSystemHealth()

    if (autoRefresh) {
      const interval = setInterval(fetchSystemHealth, 30000) // Every 30 seconds
      setRefreshInterval(interval)
      return () => clearInterval(interval)
    } else if (refreshInterval) {
      clearInterval(refreshInterval)
    }
    return undefined;
  }, [autoRefresh])

  const fetchSystemHealth = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/system/health')
      
      if (!response.ok) throw new Error('Failed to fetch health status')
      
      const data = await response.json()
      setHealth(data.health)
      
      // Show critical alerts as toasts
      if (data.health.alerts) {
        data.health.alerts
          .filter((alert: SystemAlert) => alert.level === 'critical' && !alert.resolved)
          .forEach((alert: SystemAlert) => {
            toast.error(`Critical Alert: ${alert.message}`)
          })
      }
    } catch (error) {
      console.error('Failed to fetch system health:', error)
      toast.error('Failed to fetch system health status')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'online':
        return 'text-green-500'
      case 'warning':
      case 'degraded':
        return 'text-yellow-500'
      case 'critical':
      case 'offline':
        return 'text-red-500'
      default:
        return 'text-gray-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'online':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'warning':
      case 'degraded':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />
      case 'critical':
      case 'offline':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Activity className="w-4 h-4 text-gray-500" />
    }
  }

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  if (loading && !health) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center p-8">
          <RefreshCw className="w-8 h-8 animate-spin mr-2" />
          <span>Loading system health...</span>
        </div>
      </div>
    )
  }

  // Mock data if no real health data available
  const mockHealth: SystemHealth = {
    overall: 'healthy',
    score: 98,
    services: {
      api: { status: 'online', responseTime: 145, uptime: 99.9, lastCheck: new Date(), version: '2.1.0' },
      database: { status: 'online', responseTime: 23, uptime: 99.8, lastCheck: new Date() },
      storage: { status: 'online', responseTime: 67, uptime: 99.9, lastCheck: new Date() },
      processing: { status: 'degraded', responseTime: 234, uptime: 98.5, lastCheck: new Date() },
      cdn: { status: 'online', responseTime: 89, uptime: 99.7, lastCheck: new Date() }
    },
    metrics: {
      cpu: 67,
      memory: 74,
      disk: 43,
      network: 23,
      uptime: 2157600 // 25 days
    },
    alerts: [
      {
        id: '1',
        level: 'warning',
        service: 'processing',
        message: 'Processing queue length is above normal threshold (15 jobs)',
        timestamp: new Date(Date.now() - 300000),
        resolved: false
      },
      {
        id: '2',
        level: 'info',
        service: 'storage',
        message: 'Storage optimization completed, freed 2.3GB',
        timestamp: new Date(Date.now() - 3600000),
        resolved: true
      }
    ],
    lastCheck: new Date()
  }

  const displayHealth = health || mockHealth

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">System Health Monitor</h2>
          <p className="text-muted-foreground">
            Real-time monitoring of all system components
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? 'bg-primary/10' : ''}
          >
            <Activity className="w-4 h-4 mr-2" />
            Auto Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSystemHealth}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overall Health Score */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {getStatusIcon(displayHealth.overall)}
                <h3 className="text-lg font-semibold">System Health Score</h3>
              </div>
              <div className="text-3xl font-bold">{displayHealth.score}%</div>
              <p className="text-sm text-muted-foreground">
                Last updated: {displayHealth.lastCheck.toLocaleTimeString()}
              </p>
            </div>
            <div className="text-right">
              <Badge 
                variant={
                  displayHealth.overall === 'healthy' ? 'default' :
                  displayHealth.overall === 'warning' ? 'secondary' : 'destructive'
                }
                className="mb-2"
              >
                {displayHealth.overall.toUpperCase()}
              </Badge>
              <div className="text-sm text-muted-foreground">
                Uptime: {formatUptime(displayHealth.metrics.uptime)}
              </div>
            </div>
          </div>
          <Progress value={displayHealth.score} className="mt-4 h-2" />
        </CardContent>
      </Card>

      {/* Service Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Server className="w-4 h-4" />
              API Service
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              {getStatusIcon(displayHealth.services.api.status)}
              <span className="text-sm font-medium">
                {displayHealth.services.api.responseTime}ms
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Uptime: {displayHealth.services.api.uptime}%
            </div>
            {displayHealth.services.api.version && (
              <div className="text-xs text-muted-foreground">
                v{displayHealth.services.api.version}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Database className="w-4 h-4" />
              Database
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              {getStatusIcon(displayHealth.services.database.status)}
              <span className="text-sm font-medium">
                {displayHealth.services.database.responseTime}ms
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Uptime: {displayHealth.services.database.uptime}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Cloud className="w-4 h-4" />
              Cloud Storage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              {getStatusIcon(displayHealth.services.storage.status)}
              <span className="text-sm font-medium">
                {displayHealth.services.storage.responseTime}ms
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Uptime: {displayHealth.services.storage.uptime}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4" />
              Processing Engine
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              {getStatusIcon(displayHealth.services.processing.status)}
              <span className="text-sm font-medium">
                {displayHealth.services.processing.responseTime}ms
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Uptime: {displayHealth.services.processing.uptime}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Network className="w-4 h-4" />
              CDN
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              {getStatusIcon(displayHealth.services.cdn.status)}
              <span className="text-sm font-medium">
                {displayHealth.services.cdn.responseTime}ms
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Uptime: {displayHealth.services.cdn.uptime}%
            </div>
          </CardContent>
        </Card>
      </div>

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
            <div className="text-2xl font-bold mb-2">{displayHealth.metrics.cpu}%</div>
            <Progress value={displayHealth.metrics.cpu} className="h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MemoryStick className="w-4 h-4" />
              Memory Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">{displayHealth.metrics.memory}%</div>
            <Progress value={displayHealth.metrics.memory} className="h-2" />
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
            <div className="text-2xl font-bold mb-2">{displayHealth.metrics.disk}%</div>
            <Progress value={displayHealth.metrics.disk} className="h-2" />
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
            <div className="text-2xl font-bold mb-2">{displayHealth.metrics.network}%</div>
            <Progress value={displayHealth.metrics.network} className="h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Recent Alerts */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {displayHealth.alerts.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                No recent alerts
              </div>
            ) : (
              displayHealth.alerts.slice(0, 5).map((alert) => (
                <Alert 
                  key={alert.id} 
                  variant={alert.level === 'error' || alert.level === 'critical' ? 'destructive' : 'default'}
                  className={alert.resolved ? 'opacity-60' : ''}
                >
                  <div className="flex items-center gap-2">
                    {alert.level === 'critical' && <XCircle className="w-4 h-4" />}
                    {alert.level === 'error' && <XCircle className="w-4 h-4" />}
                    {alert.level === 'warning' && <AlertTriangle className="w-4 h-4" />}
                    {alert.level === 'info' && <Activity className="w-4 h-4" />}
                    <span className="font-medium">{alert.service.toUpperCase()}</span>
                    {alert.resolved && <Badge variant="outline" className="text-xs">Resolved</Badge>}
                  </div>
                  <AlertDescription className="mt-2">
                    {alert.message}
                    <div className="text-xs text-muted-foreground mt-1">
                      {alert.timestamp.toLocaleString()}
                    </div>
                  </AlertDescription>
                </Alert>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}