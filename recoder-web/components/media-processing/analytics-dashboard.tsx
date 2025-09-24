'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Files,
  Clock,
  HardDrive,
  Zap,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  RefreshCw,
  Calendar,
  BarChart3,
  PieChart as PieChartIcon
} from 'lucide-react'
import { toast } from 'sonner'

interface AnalyticsDashboardProps {
  className?: string
}

interface OverviewAnalytics {
  totalFiles: number
  totalJobs: number
  completedJobs: number
  failedJobs: number
  successRate: number
  totalStorage: number
  averageProcessingTime: number
}

interface ProcessingAnalytics {
  dailyStats: Array<{
    date: string
    total_jobs: number
    completed_jobs: number
    failed_jobs: number
    processing_jobs: number
    queued_jobs: number
  }>
  operationsBreakdown: Array<{
    operation: string
    type: string
    count: number
    averageProgress: number
  }>
  processingTimes: Array<{
    operation: string
    type: string
    avg_duration: number
    min_duration: number
    max_duration: number
    job_count: number
  }>
}

interface StorageAnalytics {
  storageByType: Array<{
    format: string
    totalSize: number
    fileCount: number
  }>
  storageGrowth: Array<{
    date: string
    daily_storage: number
    files_count: number
  }>
  largestFiles: Array<{
    id: string
    originalName: string
    format: string
    fileSize: number
    createdAt: string
  }>
}

const CHART_COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8',
  '#82CA9D', '#FFC658', '#8DD1E1', '#D084D0', '#FFBCD9'
]

export function AnalyticsDashboard({ className }: AnalyticsDashboardProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState('30d')
  const [selectedTab, setSelectedTab] = useState('overview')
  const [isLoading, setIsLoading] = useState(false)

  const [overviewData, setOverviewData] = useState<OverviewAnalytics | null>(null)
  const [processingData, setProcessingData] = useState<ProcessingAnalytics | null>(null)
  const [storageData, setStorageData] = useState<StorageAnalytics | null>(null)

  const timeframeOptions = [
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
    { value: '1y', label: 'Last Year' }
  ]

  const fetchAnalytics = async (type: string) => {
    setIsLoading(true)
    try {
      const response = await fetch(
        `/api/media-processing/analytics?timeframe=${selectedTimeframe}&type=${type}`
      )
      
      if (!response.ok) throw new Error('Failed to fetch analytics')
      
      const result = await response.json()
      return result.analytics
    } catch (error) {
      toast.error('Failed to load analytics data')
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const loadOverviewData = async () => {
    try {
      const data = await fetchAnalytics('overview')
      setOverviewData(data.overview)
    } catch (error) {
      console.error('Failed to load overview data:', error)
    }
  }

  const loadProcessingData = async () => {
    try {
      const data = await fetchAnalytics('processing')
      setProcessingData(data)
    } catch (error) {
      console.error('Failed to load processing data:', error)
    }
  }

  const loadStorageData = async () => {
    try {
      const data = await fetchAnalytics('storage')
      setStorageData(data)
    } catch (error) {
      console.error('Failed to load storage data:', error)
    }
  }

  useEffect(() => {
    loadOverviewData()
    if (selectedTab === 'processing') loadProcessingData()
    if (selectedTab === 'storage') loadStorageData()
  }, [selectedTimeframe, selectedTab])

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    if (bytes === 0) return '0 B'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`
  }

  const MetricCard = ({ 
    title, 
    value, 
    icon, 
    trend, 
    trendValue, 
    color = 'blue' 
  }: {
    title: string
    value: string | number
    icon: React.ReactNode
    trend?: 'up' | 'down' | 'neutral'
    trendValue?: string
    color?: string
  }) => (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {trend && trendValue && (
              <div className="flex items-center mt-1">
                {trend === 'up' ? (
                  <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                ) : trend === 'down' ? (
                  <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                ) : (
                  <Activity className="w-4 h-4 text-gray-500 mr-1" />
                )}
                <span className={`text-sm ${
                  trend === 'up' ? 'text-green-500' : 
                  trend === 'down' ? 'text-red-500' : 'text-gray-500'
                }`}>
                  {trendValue}
                </span>
              </div>
            )}
          </div>
          <div className={`p-2 rounded-full bg-${color}-100`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Media Analytics</h1>
          <p className="text-muted-foreground">
            Track your media processing performance and usage
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
            <SelectTrigger className="w-48">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timeframeOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => {
              loadOverviewData()
              if (selectedTab === 'processing') loadProcessingData()
              if (selectedTab === 'storage') loadStorageData()
            }}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Overview Metrics */}
      {overviewData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Files"
            value={overviewData.totalFiles}
            icon={<Files className="w-5 h-5 text-blue-600" />}
            color="blue"
          />
          <MetricCard
            title="Processing Jobs"
            value={overviewData.totalJobs}
            icon={<Zap className="w-5 h-5 text-purple-600" />}
            color="purple"
          />
          <MetricCard
            title="Success Rate"
            value={`${overviewData.successRate}%`}
            icon={<CheckCircle className="w-5 h-5 text-green-600" />}
            color="green"
          />
          <MetricCard
            title="Storage Used"
            value={formatFileSize(overviewData.totalStorage)}
            icon={<HardDrive className="w-5 h-5 text-orange-600" />}
            color="orange"
          />
        </div>
      )}

      {/* Detailed Analytics Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="processing" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Processing
          </TabsTrigger>
          <TabsTrigger value="storage" className="flex items-center gap-2">
            <PieChartIcon className="w-4 h-4" />
            Storage
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Performance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {overviewData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Job Status Overview */}
              <Card>
                <CardHeader>
                  <CardTitle>Job Status Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span>Completed</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{overviewData.completedJobs}</span>
                        <Progress 
                          value={(overviewData.completedJobs / overviewData.totalJobs) * 100} 
                          className="w-24 h-2" 
                        />
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-500" />
                        <span>Failed</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{overviewData.failedJobs}</span>
                        <Progress 
                          value={(overviewData.failedJobs / overviewData.totalJobs) * 100} 
                          className="w-24 h-2" 
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Average Processing Time</span>
                      <span className="font-medium">
                        {formatDuration(overviewData.averageProcessingTime)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Success Rate</span>
                      <Badge 
                        variant={overviewData.successRate >= 90 ? 'default' : 
                                overviewData.successRate >= 70 ? 'secondary' : 'destructive'}
                      >
                        {overviewData.successRate}%
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Storage Efficiency</span>
                      <span className="font-medium">
                        {formatFileSize(overviewData.totalStorage / Math.max(overviewData.totalFiles, 1))} avg/file
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="processing" className="space-y-6">
          {processingData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Daily Processing Stats */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Daily Processing Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={processingData.dailyStats}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Area 
                        type="monotone" 
                        dataKey="completed_jobs" 
                        stackId="1"
                        stroke="#10B981" 
                        fill="#10B981" 
                        name="Completed"
                      />
                      <Area 
                        type="monotone" 
                        dataKey="failed_jobs" 
                        stackId="1"
                        stroke="#EF4444" 
                        fill="#EF4444" 
                        name="Failed"
                      />
                      <Area 
                        type="monotone" 
                        dataKey="processing_jobs" 
                        stackId="1"
                        stroke="#3B82F6" 
                        fill="#3B82F6" 
                        name="Processing"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Operations Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Popular Operations</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="space-y-3">
                      {processingData.operationsBreakdown.map((op, index) => (
                        <div key={`${op.operation}-${op.type}`} className="flex justify-between items-center">
                          <div>
                            <p className="font-medium capitalize">{op.operation}</p>
                            <p className="text-sm text-muted-foreground">{op.type}</p>
                          </div>
                          <Badge variant="secondary">{op.count} jobs</Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Processing Times */}
              <Card>
                <CardHeader>
                  <CardTitle>Processing Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="space-y-3">
                      {processingData.processingTimes.map((time, index) => (
                        <div key={`${time.operation}-${time.type}`} className="space-y-2">
                          <div className="flex justify-between">
                            <span className="font-medium capitalize">{time.operation} ({time.type})</span>
                            <span className="text-sm text-muted-foreground">
                              {time.job_count} jobs
                            </span>
                          </div>
                          <div className="text-sm space-y-1">
                            <div className="flex justify-between">
                              <span>Average:</span>
                              <span>{formatDuration(time.avg_duration)}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                              <span>Range:</span>
                              <span>
                                {formatDuration(time.min_duration)} - {formatDuration(time.max_duration)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="storage" className="space-y-6">
          {storageData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Storage by Format */}
              <Card>
                <CardHeader>
                  <CardTitle>Storage by File Format</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={storageData.storageByType}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="totalSize"
                        label={({ format, totalSize }: any) => 
                          `${format.toUpperCase()}: ${formatFileSize(totalSize)}`
                        }
                      >
                        {storageData.storageByType.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatFileSize(Number(value))} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Storage Growth */}
              <Card>
                <CardHeader>
                  <CardTitle>Storage Growth</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={storageData.storageGrowth}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis tickFormatter={formatFileSize} />
                      <Tooltip formatter={(value) => formatFileSize(Number(value))} />
                      <Line 
                        type="monotone" 
                        dataKey="daily_storage" 
                        stroke="#3B82F6" 
                        strokeWidth={2} 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Largest Files */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Largest Files</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {storageData.largestFiles.map((file, index) => (
                      <div key={file.id} className="flex justify-between items-center p-2 rounded border">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{file.originalName}</p>
                          <p className="text-sm text-muted-foreground">
                            {file.format.toUpperCase()} • {new Date(file.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant="outline">{formatFileSize(file.fileSize)}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Performance Analytics Coming Soon</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Advanced performance metrics including queue wait times, throughput analysis, 
                  and system resource utilization will be available in this section.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}