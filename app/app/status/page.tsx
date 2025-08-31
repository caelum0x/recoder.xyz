import React from 'react';
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
  Database,
  Globe,
  Server,
  Wifi,
  Monitor,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  Calendar,
  Bell,
  ExternalLink,
  RefreshCw
} from 'lucide-react';

export default function StatusPage() {
  const currentStatus = 'operational'; // operational, degraded, outage, maintenance

  const services = [
    {
      name: 'Recoder Web Platform',
      status: 'operational',
      uptime: '99.99%',
      responseTime: '142ms',
      description: 'Web-based development environment',
      lastIncident: null,
      endpoint: 'https://web.recoder.xyz'
    },
    {
      name: 'Recoder Chat',
      status: 'operational', 
      uptime: '99.97%',
      responseTime: '89ms',
      description: 'AI-powered chat platform',
      lastIncident: null,
      endpoint: 'https://chat.recoder.xyz'
    },
    {
      name: 'Production Engine API',
      status: 'operational',
      uptime: '99.95%',
      responseTime: '234ms',
      description: 'AI code generation backend',
      lastIncident: null,
      endpoint: 'https://api.recoder.xyz/production'
    },
    {
      name: 'Authentication Service',
      status: 'operational',
      uptime: '99.98%',
      responseTime: '67ms',
      description: 'User authentication and authorization',
      lastIncident: null,
      endpoint: 'https://auth.recoder.xyz'
    },
    {
      name: 'CLI Backend',
      status: 'operational',
      uptime: '99.96%',
      responseTime: '156ms',
      description: 'Command-line interface backend',
      lastIncident: null,
      endpoint: 'https://api.recoder.xyz/cli'
    },
    {
      name: 'Database Cluster',
      status: 'operational',
      uptime: '99.99%',
      responseTime: '12ms',
      description: 'Primary database infrastructure',
      lastIncident: null,
      endpoint: 'Internal'
    },
    {
      name: 'CDN & Static Assets',
      status: 'operational',
      uptime: '99.98%',
      responseTime: '45ms',
      description: 'Content delivery network',
      lastIncident: null,
      endpoint: 'Global'
    },
    {
      name: 'AI Model Router',
      status: 'degraded',
      uptime: '98.12%',
      responseTime: '1.2s',
      description: 'AI model selection and routing',
      lastIncident: '2024-01-28 14:30 UTC',
      endpoint: 'https://router.recoder.xyz'
    }
  ];

  const recentIncidents = [
    {
      id: 1,
      title: 'Increased response times for AI Model Router',
      description: 'We are experiencing increased response times for the AI Model Router service. Investigation is ongoing.',
      status: 'investigating',
      severity: 'minor',
      startTime: '2024-01-28 14:30 UTC',
      endTime: null,
      affectedServices: ['AI Model Router'],
      updates: [
        {
          time: '2024-01-28 15:45 UTC',
          message: 'We have identified the root cause and are implementing a fix. Response times should improve within the next 30 minutes.'
        },
        {
          time: '2024-01-28 14:45 UTC', 
          message: 'We are investigating reports of increased response times for AI model routing.'
        }
      ]
    },
    {
      id: 2,
      title: 'Scheduled maintenance for Production Engine',
      description: 'Scheduled maintenance to improve performance and reliability.',
      status: 'completed',
      severity: 'maintenance',
      startTime: '2024-01-25 02:00 UTC',
      endTime: '2024-01-25 04:00 UTC',
      affectedServices: ['Production Engine API'],
      updates: [
        {
          time: '2024-01-25 04:00 UTC',
          message: 'Maintenance completed successfully. All services are now fully operational.'
        },
        {
          time: '2024-01-25 02:00 UTC',
          message: 'Scheduled maintenance has begun. Expected completion time: 04:00 UTC.'
        }
      ]
    },
    {
      id: 3,
      title: 'Brief authentication service disruption',
      description: 'Some users experienced login issues due to a configuration change.',
      status: 'resolved',
      severity: 'minor',
      startTime: '2024-01-20 09:15 UTC',
      endTime: '2024-01-20 09:43 UTC',
      affectedServices: ['Authentication Service'],
      updates: [
        {
          time: '2024-01-20 09:43 UTC',
          message: 'Issue resolved. All authentication services are now operating normally.'
        },
        {
          time: '2024-01-20 09:20 UTC',
          message: 'We have identified the issue and are implementing a fix.'
        }
      ]
    }
  ];

  const metrics = [
    {
      name: 'Overall Uptime',
      value: '99.96%',
      period: 'Last 30 days',
      trend: 'up',
      icon: TrendingUp
    },
    {
      name: 'Average Response Time',
      value: '156ms',
      period: 'Last 24 hours',
      trend: 'up',
      icon: Zap
    },
    {
      name: 'Active Incidents',
      value: '1',
      period: 'Current',
      trend: 'stable',
      icon: AlertTriangle
    },
    {
      name: 'Services Online',
      value: '7/8',
      period: 'Current',
      trend: 'down',
      icon: Server
    }
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'outage':
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
      case 'outage':
        return 'bg-red-500';
      case 'maintenance':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'major':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'minor':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'maintenance':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
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
              <Button variant="ghost" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Current Status Banner */}
      <section className="py-8 px-4">
        <div className="container mx-auto max-w-6xl">
          <Card className={`border-0 shadow-lg ${currentStatus === 'operational' ? 'bg-green-50 dark:bg-green-900/20' : currentStatus === 'degraded' ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
            <CardContent className="p-8 text-center">
              <div className="flex items-center justify-center mb-4">
                {getStatusIcon(currentStatus)}
                <span className="ml-2 text-2xl font-bold">
                  {currentStatus === 'operational' ? 'All Systems Operational' : 
                   currentStatus === 'degraded' ? 'Partial System Outage' : 
                   'Major System Outage'}
                </span>
              </div>
              <p className="text-lg text-slate-600 dark:text-slate-300">
                {currentStatus === 'operational' ? 'All systems are running smoothly.' :
                 currentStatus === 'degraded' ? 'Some services are experiencing issues.' :
                 'We are experiencing significant issues.'}
              </p>
              <div className="mt-4 text-sm text-slate-500">
                Last updated: {new Date().toLocaleString()} UTC
              </div>
            </CardContent>
          </Card>
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
                    {metric.trend === 'down' && <ArrowDown className="w-4 h-4 text-red-500" />}
                  </div>
                  <div className="text-2xl font-bold mb-1">{metric.value}</div>
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
            {services.map((service, index) => (
              <Card key={index} className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1">
                      <div className={`w-3 h-3 rounded-full ${getStatusColor(service.status)}`}></div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h3 className="font-semibold">{service.name}</h3>
                          {service.status !== 'operational' && (
                            <Badge variant="secondary" className={getSeverityColor(service.status)}>
                              {service.status}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-500">{service.description}</p>
                        {service.lastIncident && (
                          <p className="text-xs text-red-500 mt-1">
                            Last incident: {service.lastIncident}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-6 text-sm">
                      <div className="text-center">
                        <div className="font-semibold">{service.uptime}</div>
                        <div className="text-slate-500">Uptime</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold">{service.responseTime}</div>
                        <div className="text-slate-500">Response</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold">{service.endpoint}</div>
                        <div className="text-slate-500">Endpoint</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Recent Incidents */}
      <section className="py-8 px-4">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold mb-6">Recent Incidents</h2>
          <div className="space-y-6">
            {recentIncidents.map((incident) => (
              <Card key={incident.id} className="border-0 shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {incident.status === 'resolved' && <CheckCircle className="w-5 h-5 text-green-500" />}
                      {incident.status === 'investigating' && <Activity className="w-5 h-5 text-yellow-500" />}
                      {incident.status === 'completed' && <CheckCircle className="w-5 h-5 text-blue-500" />}
                      <div>
                        <CardTitle className="text-lg">{incident.title}</CardTitle>
                        <div className="flex items-center space-x-4 mt-1">
                          <Badge className={getSeverityColor(incident.severity)}>
                            {incident.severity}
                          </Badge>
                          <span className="text-sm text-slate-500">
                            {incident.startTime} - {incident.endTime || 'Ongoing'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <CardDescription className="text-base">
                    {incident.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <h4 className="font-semibold mb-2">Affected Services:</h4>
                    <div className="flex flex-wrap gap-2">
                      {incident.affectedServices.map((service, idx) => (
                        <Badge key={idx} variant="outline">{service}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-3">Updates:</h4>
                    <div className="space-y-3">
                      {incident.updates.map((update, idx) => (
                        <div key={idx} className="border-l-2 border-blue-500 pl-4 py-2">
                          <div className="text-sm text-slate-500 mb-1">{update.time}</div>
                          <div className="text-sm">{update.message}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Historical Data */}
      <section className="py-8 px-4 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Uptime History</CardTitle>
                <CardDescription>Last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Overall Uptime</span>
                    <span className="font-semibold text-green-600">99.96%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Total Incidents</span>
                    <span className="font-semibold">3</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Average Resolution</span>
                    <span className="font-semibold">23 minutes</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Scheduled Maintenance</span>
                    <span className="font-semibold">1</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
                <CardDescription>Last 24 hours</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Average Response Time</span>
                    <span className="font-semibold">156ms</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Peak Response Time</span>
                    <span className="font-semibold">1.2s</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Requests Served</span>
                    <span className="font-semibold">2.3M</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Error Rate</span>
                    <span className="font-semibold text-green-600">0.01%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
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
