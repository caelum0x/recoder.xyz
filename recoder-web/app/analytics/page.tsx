'use client';

// Force dynamic rendering to avoid SSR issues
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Download, Settings, Share2, Calendar } from 'lucide-react';

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [userId, setUserId] = useState<string | undefined>(undefined);

  const handleExport = async (format: 'csv' | 'json' | 'excel') => {
    try {
      const response = await fetch(`/api/analytics/export?format=${format}&timeRange=${timeRange}`);
      
      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${timeRange}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
      // You could add toast notification here
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Analytics Dashboard
          </h1>
          <p className="text-lg text-muted-foreground mt-2">
            Comprehensive insights into usage, performance, and business metrics
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            Live Data
          </Badge>
        </div>
      </div>

      {/* Controls */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Dashboard Controls
          </CardTitle>
          <CardDescription>
            Configure your analytics view and export options
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            {/* Time Range Selector */}
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Last 24 Hours</SelectItem>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                  <SelectItem value="year">Last 12 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Export Options */}
            <div className="flex items-center space-x-2">
              <Download className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Export:</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleExport('json')}
              >
                JSON
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleExport('csv')}
              >
                CSV
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleExport('excel')}
              >
                Excel
              </Button>
            </div>

            {/* Share Button */}
            <Button variant="outline" size="sm" className="ml-auto">
              <Share2 className="h-4 w-4 mr-2" />
              Share Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Dashboard */}
      <AnalyticsDashboard timeRange={timeRange} userId={userId} />

      {/* Quick Stats Cards */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900">Platform Health</CardTitle>
            <CardDescription className="text-blue-700">
              Overall system performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-900">99.9%</div>
            <div className="text-sm text-blue-700">Uptime this {timeRange}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardHeader>
            <CardTitle className="text-green-900">User Satisfaction</CardTitle>
            <CardDescription className="text-green-700">
              Based on user feedback
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-900">4.8/5</div>
            <div className="text-sm text-green-700">Average rating</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardHeader>
            <CardTitle className="text-purple-900">AI Efficiency</CardTitle>
            <CardDescription className="text-purple-700">
              Model performance metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-900">92%</div>
            <div className="text-sm text-purple-700">Success rate</div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="mt-12 text-center text-sm text-muted-foreground">
        <p>
          Analytics data is updated in real-time. 
          <span className="ml-2">
            Last updated: {new Date().toLocaleString()}
          </span>
        </p>
      </div>
    </div>
  );
}