'use client';

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, TrendingUp, Clock, FileText, 
  Users, Activity, Zap, Target, Calendar,
  ArrowUp, ArrowDown, Minus, Download,
  RefreshCw, Filter, MoreHorizontal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';

interface AnalyticsPanelProps {
  projectId: string;
}

interface CodeMetrics {
  linesOfCode: number;
  filesCount: number;
  functionsCount: number;
  classesCount: number;
  testCoverage: number;
  complexity: number;
}

interface ActivityMetrics {
  commitsToday: number;
  commitsThisWeek: number;
  commitsThisMonth: number;
  activeHours: number;
  collaborators: number;
  lastActivity: string;
}

interface PerformanceMetrics {
  buildTime: number;
  bundleSize: number;
  dependencies: number;
  vulnerabilities: number;
  lighthouse: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  };
}

interface TimeMetrics {
  todayTime: number;
  weekTime: number;
  monthTime: number;
  averageSession: number;
  productiveHours: string[];
}

export default function AnalyticsPanel({ projectId }: AnalyticsPanelProps) {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | '90d'>('7d');
  const [isLoading, setIsLoading] = useState(false);
  
  // Mock data - in production, this would come from APIs
  const [codeMetrics] = useState<CodeMetrics>({
    linesOfCode: 12540,
    filesCount: 156,
    functionsCount: 247,
    classesCount: 43,
    testCoverage: 78,
    complexity: 6.2
  });

  const [activityMetrics] = useState<ActivityMetrics>({
    commitsToday: 8,
    commitsThisWeek: 42,
    commitsThisMonth: 156,
    activeHours: 28.5,
    collaborators: 3,
    lastActivity: '12 minutes ago'
  });

  const [performanceMetrics] = useState<PerformanceMetrics>({
    buildTime: 2.4,
    bundleSize: 1.2,
    dependencies: 247,
    vulnerabilities: 2,
    lighthouse: {
      performance: 94,
      accessibility: 98,
      bestPractices: 91,
      seo: 89
    }
  });

  const [timeMetrics] = useState<TimeMetrics>({
    todayTime: 4.2,
    weekTime: 28.5,
    monthTime: 124.8,
    averageSession: 2.1,
    productiveHours: ['09:00', '10:00', '14:00', '15:00', '16:00']
  });

  const refreshData = async () => {
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // In production, fetch real analytics data
      // const response = await fetch(`/api/projects/${projectId}/analytics?range=${timeRange}`);
      // const data = await response.json();
      
    } catch (error) {
      console.error('Failed to refresh analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getTrendIcon = (change: number) => {
    if (change > 0) return <ArrowUp className="w-3 h-3 text-green-600" />;
    if (change < 0) return <ArrowDown className="w-3 h-3 text-red-600" />;
    return <Minus className="w-3 h-3 text-gray-400" />;
  };

  const getTrendColor = (change: number) => {
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-gray-400';
  };

  const formatTime = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const formatSize = (mb: number) => {
    if (mb < 1) return `${Math.round(mb * 1000)}KB`;
    return `${mb.toFixed(1)}MB`;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold">Analytics</h3>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24h</SelectItem>
              <SelectItem value="7d">7d</SelectItem>
              <SelectItem value="30d">30d</SelectItem>
              <SelectItem value="90d">90d</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={refreshData}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
            <TabsTrigger value="time">Time</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="p-4 space-y-4">
            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Lines of Code</p>
                      <p className="text-2xl font-bold">{codeMetrics.linesOfCode.toLocaleString()}</p>
                    </div>
                    <FileText className="w-8 h-8 text-blue-600" />
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    {getTrendIcon(12.5)}
                    <span className={`text-xs ${getTrendColor(12.5)}`}>+12.5%</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Active Time</p>
                      <p className="text-2xl font-bold">{formatTime(timeMetrics.weekTime)}</p>
                    </div>
                    <Clock className="w-8 h-8 text-green-600" />
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    {getTrendIcon(8.3)}
                    <span className={`text-xs ${getTrendColor(8.3)}`}>+8.3%</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Commits</p>
                      <p className="text-2xl font-bold">{activityMetrics.commitsThisWeek}</p>
                    </div>
                    <Activity className="w-8 h-8 text-purple-600" />
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    {getTrendIcon(-5.2)}
                    <span className={`text-xs ${getTrendColor(-5.2)}`}>-5.2%</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Test Coverage</p>
                      <p className="text-2xl font-bold">{codeMetrics.testCoverage}%</p>
                    </div>
                    <Target className="w-8 h-8 text-orange-600" />
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    {getTrendIcon(3.1)}
                    <span className={`text-xs ${getTrendColor(3.1)}`}>+3.1%</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Activity Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recent Activity</CardTitle>
                <CardDescription>Project activity for the past {timeRange}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Commits today</span>
                    <Badge variant="secondary">{activityMetrics.commitsToday}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Active collaborators</span>
                    <Badge variant="secondary">{activityMetrics.collaborators}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Files modified</span>
                    <Badge variant="secondary">23</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Last activity</span>
                    <span className="text-sm text-gray-500">{activityMetrics.lastActivity}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="code" className="p-4 space-y-4">
            {/* Code Metrics */}
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Code Quality</CardTitle>
                  <CardDescription>Analysis of your codebase</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm">Test Coverage</span>
                        <span className="text-sm font-medium">{codeMetrics.testCoverage}%</span>
                      </div>
                      <Progress value={codeMetrics.testCoverage} className="h-2" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm">Code Complexity</span>
                        <span className="text-sm font-medium">{codeMetrics.complexity}/10</span>
                      </div>
                      <Progress value={codeMetrics.complexity * 10} className="h-2" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Files</p>
                      <p className="text-xl font-bold">{codeMetrics.filesCount}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Functions</p>
                      <p className="text-xl font-bold">{codeMetrics.functionsCount}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Classes</p>
                      <p className="text-xl font-bold">{codeMetrics.classesCount}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Dependencies</p>
                      <p className="text-xl font-bold">{performanceMetrics.dependencies}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">File Types</CardTitle>
                  <CardDescription>Distribution of file types in your project</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { type: 'TypeScript', count: 89, percentage: 57 },
                      { type: 'JavaScript', count: 34, percentage: 22 },
                      { type: 'CSS/SCSS', count: 18, percentage: 12 },
                      { type: 'JSON', count: 12, percentage: 8 },
                      { type: 'Other', count: 3, percentage: 1 }
                    ].map((item) => (
                      <div key={item.type} className="flex items-center gap-3">
                        <div className="w-24 text-sm">{item.type}</div>
                        <div className="flex-1">
                          <Progress value={item.percentage} className="h-2" />
                        </div>
                        <div className="w-12 text-sm text-right">{item.count}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="time" className="p-4 space-y-4">
            {/* Time Tracking */}
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Time Spent</CardTitle>
                  <CardDescription>Development time breakdown</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Today</p>
                      <p className="text-2xl font-bold">{formatTime(timeMetrics.todayTime)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">This Week</p>
                      <p className="text-2xl font-bold">{formatTime(timeMetrics.weekTime)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">This Month</p>
                      <p className="text-2xl font-bold">{formatTime(timeMetrics.monthTime)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Avg Session</p>
                      <p className="text-2xl font-bold">{formatTime(timeMetrics.averageSession)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Productive Hours</CardTitle>
                  <CardDescription>Your most productive times</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 gap-2">
                    {timeMetrics.productiveHours.map((hour) => (
                      <Badge key={hour} variant="secondary" className="text-center">
                        {hour}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Based on your coding activity patterns
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="p-4 space-y-4">
            {/* Performance Metrics */}
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Build Performance</CardTitle>
                  <CardDescription>Project build and bundle metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Build Time</p>
                      <p className="text-2xl font-bold">{performanceMetrics.buildTime}s</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Bundle Size</p>
                      <p className="text-2xl font-bold">{formatSize(performanceMetrics.bundleSize)}</p>
                    </div>
                  </div>
                  {performanceMetrics.vulnerabilities > 0 && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-yellow-600" />
                        <span className="text-sm font-medium text-yellow-800">
                          {performanceMetrics.vulnerabilities} security vulnerabilities found
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Lighthouse Scores</CardTitle>
                  <CardDescription>Web performance metrics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(performanceMetrics.lighthouse).map(([metric, score]) => (
                    <div key={metric}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm capitalize">{metric.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span className="text-sm font-medium">{score}</span>
                      </div>
                      <Progress value={score} className="h-2" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
