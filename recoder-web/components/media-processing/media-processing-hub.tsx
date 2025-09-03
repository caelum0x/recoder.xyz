'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Video, Upload, Scissors, Settings, BarChart3, 
  Activity, Cloud, Zap, Database, MonitorSpeaker,
  Play, Pause, RefreshCw, TrendingUp, FileVideo,
  Workflow, Shield, Clock, Users
} from 'lucide-react'

// Import all our media processing components
import { MediaStudio } from './media-studio'
import { VideoTimelineEditor } from './video-timeline-editor'
import { AnalyticsDashboard } from './analytics-dashboard'
import { JobProgressTracker } from './job-progress-tracker'
import { PerformanceDashboard } from './performance-dashboard'
import { SystemHealthMonitor } from './system-health-monitor'

interface SystemStatus {
  overall: 'healthy' | 'warning' | 'critical'
  services: {
    upload: boolean
    processing: boolean
    storage: boolean
    analytics: boolean
  }
  metrics: {
    activeJobs: number
    queueLength: number
    completedToday: number
    errorRate: number
    storageUsed: number
    processingSpeed: number
  }
}

interface QuickStats {
  totalFiles: number
  totalProcessingTime: string
  storageUsed: string
  successRate: number
  activeUsers: number
  systemUptime: string
}

export function MediaProcessingHub() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null)
  const [selectedTab, setSelectedTab] = useState('overview')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSystemStatus()
    fetchQuickStats()
    
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchSystemStatus()
      fetchQuickStats()
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  const fetchSystemStatus = async () => {
    try {
      const response = await fetch('/api/system/health')
      if (response.ok) {
        const data = await response.json()
        
        // Transform health data to our format
        setSystemStatus({
          overall: data.health?.overall || 'healthy',
          services: {
            upload: data.health?.services?.storage?.status === 'online',
            processing: data.health?.services?.processing?.status === 'online',
            storage: data.health?.services?.storage?.status === 'online',
            analytics: data.health?.services?.api?.status === 'online'
          },
          metrics: {
            activeJobs: data.health?.processing?.activeJobs || 0,
            queueLength: data.health?.processing?.queueLength || 0,
            completedToday: data.health?.processing?.completedJobs || 0,
            errorRate: data.health?.processing?.errorRate || 0,
            storageUsed: Math.round((data.health?.metrics?.disk || 0) * 1024 * 1024 * 1024), // Convert to bytes
            processingSpeed: data.health?.processing?.throughput || 0
          }
        })
      }
    } catch (error) {
      console.error('Failed to fetch system status:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchQuickStats = async () => {
    try {
      // Mock data - in production, fetch from analytics API
      setQuickStats({
        totalFiles: 1247 + Math.floor(Math.random() * 100),
        totalProcessingTime: '2,847 hours',
        storageUsed: '1.2 TB',
        successRate: 97.3 + Math.random() * 2,
        activeUsers: 12 + Math.floor(Math.random() * 8),
        systemUptime: formatUptime(process.uptime?.() || 86400)
      })
    } catch (error) {
      console.error('Failed to fetch quick stats:', error)
    }
  }

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-500'
      case 'warning': return 'text-yellow-500'
      case 'critical': return 'text-red-500'
      default: return 'text-gray-500'
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy': return <Badge className="bg-green-500">Healthy</Badge>
      case 'warning': return <Badge variant="secondary">Warning</Badge>
      case 'critical': return <Badge variant="destructive">Critical</Badge>
      default: return <Badge variant="outline">Unknown</Badge>
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span>Loading Media Processing Hub...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">Media Processing Hub</h1>
          <p className="text-muted-foreground text-lg">
            Unified control center for all media processing operations
          </p>
        </div>
        <div className="flex items-center gap-3">
          {systemStatus && getStatusBadge(systemStatus.overall)}
          <Button variant="outline" onClick={fetchSystemStatus}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileVideo className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium">Files</span>
            </div>
            <div className="text-2xl font-bold">
              {quickStats?.totalFiles.toLocaleString() || '--'}
            </div>
            <div className="text-xs text-muted-foreground">Total processed</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-green-500" />
              <span className="text-sm font-medium">Processing Time</span>
            </div>
            <div className="text-2xl font-bold">
              {quickStats?.totalProcessingTime || '--'}
            </div>
            <div className="text-xs text-muted-foreground">Cumulative</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-medium">Storage</span>
            </div>
            <div className="text-2xl font-bold">
              {quickStats?.storageUsed || '--'}
            </div>
            <div className="text-xs text-muted-foreground">Total used</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-medium">Success Rate</span>
            </div>
            <div className="text-2xl font-bold">
              {quickStats?.successRate.toFixed(1) || '--'}%
            </div>
            <div className="text-xs text-muted-foreground">Last 30 days</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-medium">Active Users</span>
            </div>
            <div className="text-2xl font-bold">
              {quickStats?.activeUsers || '--'}
            </div>
            <div className="text-xs text-muted-foreground">Currently online</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-red-500" />
              <span className="text-sm font-medium">Uptime</span>
            </div>
            <div className="text-2xl font-bold">
              {quickStats?.systemUptime || '--'}
            </div>
            <div className="text-xs text-muted-foreground">System uptime</div>
          </CardContent>
        </Card>
      </div>

      {/* System Status Overview */}
      {systemStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MonitorSpeaker className="w-5 h-5" />
              System Status Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Service Status */}
              <div>
                <h4 className="font-semibold mb-3">Services</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Upload Service</span>
                    <Badge variant={systemStatus.services.upload ? 'default' : 'destructive'}>
                      {systemStatus.services.upload ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Processing Engine</span>
                    <Badge variant={systemStatus.services.processing ? 'default' : 'destructive'}>
                      {systemStatus.services.processing ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Cloud Storage</span>
                    <Badge variant={systemStatus.services.storage ? 'default' : 'destructive'}>
                      {systemStatus.services.storage ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Analytics</span>
                    <Badge variant={systemStatus.services.analytics ? 'default' : 'destructive'}>
                      {systemStatus.services.analytics ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Processing Metrics */}
              <div>
                <h4 className="font-semibold mb-3">Processing</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Active Jobs</span>
                    <span className="font-medium">{systemStatus.metrics.activeJobs}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Queue Length</span>
                    <span className="font-medium">{systemStatus.metrics.queueLength}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Completed Today</span>
                    <span className="font-medium">{systemStatus.metrics.completedToday}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Error Rate</span>
                    <span className={`font-medium ${systemStatus.metrics.errorRate > 5 ? 'text-red-500' : 'text-green-500'}`}>
                      {systemStatus.metrics.errorRate.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Performance */}
              <div>
                <h4 className="font-semibold mb-3">Performance</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Processing Speed</span>
                    <span className="font-medium">{systemStatus.metrics.processingSpeed}/hr</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Storage Usage</span>
                    <span className="font-medium">
                      {(systemStatus.metrics.storageUsed / (1024**3)).toFixed(1)} GB
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <h4 className="font-semibold mb-3">Quick Actions</h4>
                <div className="space-y-2">
                  <Button size="sm" className="w-full justify-start">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Media
                  </Button>
                  <Button size="sm" variant="outline" className="w-full justify-start">
                    <Scissors className="w-4 h-4 mr-2" />
                    Video Editor
                  </Button>
                  <Button size="sm" variant="outline" className="w-full justify-start">
                    <BarChart3 className="w-4 h-4 mr-2" />
                    View Analytics
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Interface */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Video className="w-4 h-4" />
            Studio
          </TabsTrigger>
          <TabsTrigger value="editor" className="flex items-center gap-2">
            <Scissors className="w-4 h-4" />
            Editor
          </TabsTrigger>
          <TabsTrigger value="jobs" className="flex items-center gap-2">
            <Workflow className="w-4 h-4" />
            Jobs
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="health" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Health
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <MediaStudio />
        </TabsContent>

        <TabsContent value="editor" className="mt-6">
          <VideoTimelineEditor />
        </TabsContent>

        <TabsContent value="jobs" className="mt-6">
          <JobProgressTracker />
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <AnalyticsDashboard />
        </TabsContent>

        <TabsContent value="performance" className="mt-6">
          <PerformanceDashboard />
        </TabsContent>

        <TabsContent value="health" className="mt-6">
          <SystemHealthMonitor />
        </TabsContent>
      </Tabs>
    </div>
  )
}