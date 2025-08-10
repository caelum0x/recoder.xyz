'use client';

/**
 * Security Dashboard
 * Admin interface for monitoring and managing router security
 */

// Force dynamic rendering to avoid SSR issues
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Shield, 
  AlertTriangle, 
  Ban, 
  Eye, 
  Settings, 
  Activity,
  Globe,
  Clock,
  TrendingUp,
  Users,
  Zap
} from 'lucide-react';

interface SecurityMetrics {
  totalRequests: number;
  blockedRequests: number;
  suspiciousRequests: number;
  uniqueIPs: number;
  topAttackTypes: Array<{ type: string; count: number }>;
  averageRiskScore: number;
  lastThreatDetected?: Date;
}

interface SecurityEvent {
  id: string;
  timestamp: Date;
  type: 'authentication' | 'authorization' | 'anomaly' | 'abuse' | 'intrusion';
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: {
    ip: string;
    userAgent?: string;
    userId?: string;
    deviceId?: string;
  };
  details: Record<string, any>;
  riskScore: number;
}

interface SecurityConfig {
  enableThreatDetection: boolean;
  enableRateLimiting: boolean;
  enableAnomalyDetection: boolean;
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  maxFailedAttemptsBeforeBan: number;
  banDurationMinutes: number;
  enableGeoBlocking: boolean;
}

export default function SecurityDashboard() {
  const [metrics, setMetrics] = useState<SecurityMetrics | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [config, setConfig] = useState<SecurityConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banIP, setBanIP] = useState('');
  const [banReason, setBanReason] = useState('');

  // Fetch security data
  const fetchSecurityData = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/security');
      if (!response.ok) {
        throw new Error('Failed to fetch security data');
      }
      const data = await response.json();
      setMetrics(data.metrics);
      setEvents(data.recentEvents);
      setConfig(data.config);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh data
  useEffect(() => {
    fetchSecurityData();
    const interval = setInterval(fetchSecurityData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchSecurityData]);

  // Handle IP ban
  const handleBanIP = async () => {
    if (!banIP.trim()) return;
    
    try {
      const response = await fetch('/api/admin/security/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: banIP, reason: banReason })
      });
      
      if (!response.ok) {
        throw new Error('Failed to ban IP');
      }
      
      setBanIP('');
      setBanReason('');
      fetchSecurityData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ban IP');
    }
  };

  // Handle configuration update
  const updateConfig = async (newConfig: Partial<SecurityConfig>) => {
    try {
      const response = await fetch('/api/admin/security/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      
      if (!response.ok) {
        throw new Error('Failed to update configuration');
      }
      
      setConfig(prev => prev ? { ...prev, ...newConfig } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update configuration');
    }
  };

  // Get severity color
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  // Get event type icon
  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case 'intrusion': return <Shield className="h-4 w-4" />;
      case 'anomaly': return <AlertTriangle className="h-4 w-4" />;
      case 'abuse': return <Ban className="h-4 w-4" />;
      case 'authentication': return <Users className="h-4 w-4" />;
      case 'authorization': return <Eye className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Security Dashboard</h1>
          <p className="text-muted-foreground">Monitor and manage router security</p>
        </div>
        <Button onClick={fetchSecurityData} variant="outline">
          <Activity className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalRequests.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Blocked Requests</CardTitle>
              <Ban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{metrics.blockedRequests}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.totalRequests > 0 ? 
                  `${((metrics.blockedRequests / metrics.totalRequests) * 100).toFixed(1)}% of total` : 
                  'No data'
                }
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Risk Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.averageRiskScore.toFixed(1)}</div>
              <p className="text-xs text-muted-foreground">Average across all requests</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unique IPs</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.uniqueIPs}</div>
              {metrics.lastThreatDetected && (
                <p className="text-xs text-muted-foreground">
                  Last threat: {new Date(metrics.lastThreatDetected).toLocaleTimeString()}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="events" className="space-y-4">
        <TabsList>
          <TabsTrigger value="events">Security Events</TabsTrigger>
          <TabsTrigger value="threats">Threat Analysis</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="management">IP Management</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Security Events</CardTitle>
              <CardDescription>Latest security incidents and alerts</CardDescription>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-muted-foreground">No security events recorded</p>
              ) : (
                <div className="space-y-3">
                  {events.map((event) => (
                    <div key={event.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                      <div className="flex-shrink-0">
                        {getEventTypeIcon(event.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Badge variant={getSeverityColor(event.severity)}>
                              {event.severity}
                            </Badge>
                            <Badge variant="outline">{event.type}</Badge>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            Risk: {event.riskScore}
                          </span>
                        </div>
                        <p className="text-sm font-medium mt-1">
                          {event.source.ip} • {event.source.userAgent?.slice(0, 50)}...
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(event.timestamp).toLocaleString()}
                        </p>
                        {event.details.reasons && (
                          <p className="text-xs text-orange-600 mt-1">
                            {Array.isArray(event.details.reasons) ? 
                              event.details.reasons.join(', ') : 
                              event.details.reasons
                            }
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="threats" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Threat Analysis</CardTitle>
              <CardDescription>Attack patterns and threat intelligence</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics?.topAttackTypes && metrics.topAttackTypes.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="font-medium">Top Attack Types</h4>
                  {metrics.topAttackTypes.map((attack, index) => (
                    <div key={attack.type} className="flex items-center justify-between p-2 border rounded">
                      <span className="capitalize">{attack.type}</span>
                      <Badge variant="secondary">{attack.count} incidents</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No threat patterns detected</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          {config && (
            <Card>
              <CardHeader>
                <CardTitle>Security Configuration</CardTitle>
                <CardDescription>Adjust security settings and policies</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="threat-detection">Threat Detection</Label>
                    <Switch
                      id="threat-detection"
                      checked={config.enableThreatDetection}
                      onCheckedChange={(checked) => 
                        updateConfig({ enableThreatDetection: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="rate-limiting">Rate Limiting</Label>
                    <Switch
                      id="rate-limiting"
                      checked={config.enableRateLimiting}
                      onCheckedChange={(checked) => 
                        updateConfig({ enableRateLimiting: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="anomaly-detection">Anomaly Detection</Label>
                    <Switch
                      id="anomaly-detection"
                      checked={config.enableAnomalyDetection}
                      onCheckedChange={(checked) => 
                        updateConfig({ enableAnomalyDetection: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="geo-blocking">Geo Blocking</Label>
                    <Switch
                      id="geo-blocking"
                      checked={config.enableGeoBlocking}
                      onCheckedChange={(checked) => 
                        updateConfig({ enableGeoBlocking: checked })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="requests-per-minute">Max Requests/Minute</Label>
                    <Input
                      id="requests-per-minute"
                      type="number"
                      value={config.maxRequestsPerMinute}
                      onChange={(e) => 
                        updateConfig({ maxRequestsPerMinute: parseInt(e.target.value) })
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="requests-per-hour">Max Requests/Hour</Label>
                    <Input
                      id="requests-per-hour"
                      type="number"
                      value={config.maxRequestsPerHour}
                      onChange={(e) => 
                        updateConfig({ maxRequestsPerHour: parseInt(e.target.value) })
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="failed-attempts">Max Failed Attempts</Label>
                    <Input
                      id="failed-attempts"
                      type="number"
                      value={config.maxFailedAttemptsBeforeBan}
                      onChange={(e) => 
                        updateConfig({ maxFailedAttemptsBeforeBan: parseInt(e.target.value) })
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="ban-duration">Ban Duration (minutes)</Label>
                    <Input
                      id="ban-duration"
                      type="number"
                      value={config.banDurationMinutes}
                      onChange={(e) => 
                        updateConfig({ banDurationMinutes: parseInt(e.target.value) })
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="management" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>IP Management</CardTitle>
              <CardDescription>Manually ban or unban IP addresses</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="ban-ip">IP Address</Label>
                  <Input
                    id="ban-ip"
                    placeholder="192.168.1.1"
                    value={banIP}
                    onChange={(e) => setBanIP(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="ban-reason">Reason</Label>
                  <Input
                    id="ban-reason"
                    placeholder="Manual security ban"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleBanIP} disabled={!banIP.trim()}>
                    <Ban className="h-4 w-4 mr-2" />
                    Ban IP
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}