'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Zap,
  Globe,
  Server,
  ArrowUp,
  TrendingUp,
  Bell,
  ExternalLink,
  RefreshCw
} from 'lucide-react';

interface ServiceHealth {
  id: string;
  name: string;
  status: 'operational' | 'degraded' | 'down';
  responseTime: number | null;
  lastChecked: string;
  version?: string;
  details?: Record<string, unknown>;
}

interface HealthData {
  services: ServiceHealth[];
  overall: 'operational' | 'degraded' | 'down';
  cachedAt: string;
}

export default function StatusPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/ecosystem-health');
      if (res.ok) {
        const data: HealthData = await res.json();
        setHealth(data);
        setLastRefresh(new Date());
      }
    } catch {
      // Keep previous data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const currentStatus = health?.overall ?? 'operational';

  const operationalCount = health?.services.filter(s => s.status === 'operational').length ?? 0;
  const totalCount = health?.services.length ?? 0;

  const avgResponseTime = health
    ? Math.round(
        health.services
          .filter(s => s.responseTime !== null)
          .reduce((sum, s) => sum + (s.responseTime ?? 0), 0) /
        (health.services.filter(s => s.responseTime !== null).length || 1)
      )
    : 0;

  const metrics = [
    {
      name: 'Services Online',
      value: health ? `${operationalCount}/${totalCount}` : '--',
      period: 'Current',
      trend: operationalCount === totalCount ? 'up' : 'down',
      icon: Server
    },
    {
      name: 'Average Response Time',
      value: health ? `${avgResponseTime}ms` : '--',
      period: 'Latest check',
      trend: avgResponseTime < 500 ? 'up' : 'down',
      icon: Zap
    },
    {
      name: 'Active Incidents',
      value: health ? `${totalCount - operationalCount}` : '--',
      period: 'Current',
      trend: operationalCount === totalCount ? 'up' : 'stable',
      icon: AlertTriangle
    },
    {
      name: 'Overall Status',
      value: health ? (currentStatus === 'operational' ? 'Healthy' : currentStatus === 'degraded' ? 'Degraded' : 'Outage') : '--',
      period: 'Current',
      trend: currentStatus === 'operational' ? 'up' : 'down',
      icon: TrendingUp
    }
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'down':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'maintenance':
        return <Clock className="w-5 h-5 text-blue-500" />;
      default:
        return <CheckCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational':
        return 'bg-green-500';
      case 'degraded':
        return 'bg-yellow-500';
      case 'down':
        return 'bg-red-500';
      case 'maintenance':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm dark:bg-slate-900/80">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-blue-500 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">
                Recoder Status
              </span>
            </Link>
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm">
                <Bell className="w-4 h-4 mr-2" />
                Subscribe to Updates
              </Button>
              <Button variant="ghost" size="sm" onClick={fetchHealth} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Current Status Banner */}
      <section className="py-8 px-4">
        <div className="container mx-auto max-w-6xl">
          {loading && !health ? (
            <Card className="border-0 shadow-lg bg-slate-50 dark:bg-slate-800/50">
              <CardContent className="p-8 text-center">
                <div className="flex items-center justify-center mb-4">
                  <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
                  <span className="ml-2 text-2xl font-bold text-slate-400">
                    Checking services...
                  </span>
                </div>
                <p className="text-lg text-slate-400">Running health checks across the ecosystem</p>
              </CardContent>
            </Card>
          ) : (
            <Card className={`border-0 shadow-lg ${currentStatus === 'operational' ? 'bg-green-50 dark:bg-green-900/20' : currentStatus === 'degraded' ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
              <CardContent className="p-8 text-center">
                <div className="flex items-center justify-center mb-4">
                  {getStatusIcon(currentStatus)}
                  <span className="ml-2 text-2xl font-bold">
                    {currentStatus === 'operational' ? 'All Systems Operational' :
                     currentStatus === 'degraded' ? 'Partial System Degradation' :
                     'Service Disruption Detected'}
                  </span>
                </div>
                <p className="text-lg text-slate-600 dark:text-slate-300">
                  {currentStatus === 'operational' ? 'All systems are running smoothly.' :
                   currentStatus === 'degraded' ? 'Some services are experiencing issues.' :
                   'One or more services are currently unreachable.'}
                </p>
                <div className="mt-4 text-sm text-slate-500">
                  Last checked: {lastRefresh ? lastRefresh.toLocaleString() : '--'}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Metrics Overview */}
      <section className="py-8 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {metrics.map((metric, index) => (
              <Card key={index} className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <metric.icon className="w-5 h-5 text-slate-500" />
                    {metric.trend === 'up' && <ArrowUp className="w-4 h-4 text-green-500" />}
                  </div>
                  {loading && !health ? (
                    <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-1" />
                  ) : (
                    <div className="text-2xl font-bold mb-1">{metric.value}</div>
                  )}
                  <div className="text-sm text-slate-500">{metric.name}</div>
                  <div className="text-xs text-slate-400 mt-1">{metric.period}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Service Status */}
      <section className="py-8 px-4">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold mb-6">Service Status</h2>
          <div className="space-y-4">
            {loading && !health ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-3 h-3 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-5 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                        <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              health?.services.map((service) => (
                <Card key={service.id} className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4 flex-1">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(service.status)}`}></div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <h3 className="font-semibold">{service.name}</h3>
                            {service.version && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono text-slate-500">
                                v{service.version}
                              </Badge>
                            )}
                            {service.status !== 'operational' && (
                              <Badge variant="secondary" className={
                                service.status === 'down'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                              }>
                                {service.status}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-6 text-sm">
                        <div className="text-center">
                          <div className="font-semibold">
                            {service.responseTime !== null ? `${service.responseTime}ms` : '--'}
                          </div>
                          <div className="text-slate-500">Response</div>
                        </div>
                        <div className="text-center">
                          <div className="font-semibold capitalize">{service.status}</div>
                          <div className="text-slate-500">Status</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Recent Incidents */}
      <section className="py-8 px-4">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold mb-6">Recent Incidents</h2>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <CardTitle className="text-lg mb-2">No Recent Incidents</CardTitle>
              <CardDescription>
                All services have been running without disruption. Historical incident tracking is coming soon.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Subscribe to Updates */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <Card className="border-0 shadow-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white">
            <CardContent className="p-12">
              <h2 className="text-3xl font-bold mb-4">Stay Updated</h2>
              <p className="text-lg opacity-90 mb-8">
                Get notified about incidents, maintenance, and service updates via email, SMS, or webhook.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="secondary" size="lg">
                  <Bell className="w-4 h-4 mr-2" />
                  Subscribe to Updates
                </Button>
                <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-blue-600">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Status API
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
