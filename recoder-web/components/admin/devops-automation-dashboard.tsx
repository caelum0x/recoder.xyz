'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Server, 
  GitBranch, 
  Rocket, 
  Settings, 
  Play, 
  Pause, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Cloud,
  Dock,
  Database,
  Shield,
  Monitor,
  Zap,
  Globe,
  Code,
  FileText,
  Download,
  Plus,
  Edit,
  Trash2,
  Eye
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

interface Deployment {
  id: string;
  name: string;
  description?: string;
  platform: string;
  environment: string;
  status: string;
  configuration: any;
  infrastructure: any;
  createdAt: string;
  executions?: DeploymentExecution[];
  _count?: { executions: number };
}

interface Pipeline {
  id: string;
  name: string;
  projectId: string;
  stages: any[];
  triggers: any;
  status: string;
  createdAt: string;
  runs?: PipelineRun[];
  _count?: { runs: number };
}

interface DeploymentExecution {
  id: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  version: string;
  results?: any;
  createdAt: string;
  completedAt?: string;
}

interface PipelineRun {
  id: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  triggeredBy: string;
  createdAt: string;
  completedAt?: string;
}

export default function DevOpsAutomationDashboard() {
  const { toast } = useToast();
  
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDeployment, setShowCreateDeployment] = useState(false);
  const [showCreatePipeline, setShowCreatePipeline] = useState(false);

  const [deploymentForm, setDeploymentForm] = useState({
    name: '',
    description: '',
    projectId: '',
    platform: 'aws',
    environment: 'development',
    configuration: {
      region: 'us-west-2',
      instanceType: 't3.micro',
      autoScale: false,
      minInstances: 1,
      maxInstances: 10,
      buildCommand: 'npm run build',
      startCommand: 'npm start',
      environmentVars: {},
      domains: [],
      ssl: true,
      monitoring: true,
      logging: true,
      backup: false,
      cicd: true
    },
    infrastructure: {
      containerized: true,
      orchestrator: 'docker',
      database: {
        type: 'postgresql',
        managed: true,
        backups: true
      },
      storage: {
        type: 's3',
        size: '100GB'
      },
      networking: {
        vpc: true,
        loadBalancer: false,
        cdn: false
      }
    }
  });

  const [pipelineForm, setPipelineForm] = useState({
    name: '',
    projectId: '',
    stages: [
      {
        name: 'Build',
        type: 'build',
        commands: ['npm install', 'npm run build'],
        condition: 'always',
        timeout: 600,
        retries: 0
      }
    ],
    triggers: {
      push: true,
      pullRequest: true,
      schedule: '',
      manual: true
    },
    notifications: {
      slack: '',
      email: [],
      webhook: ''
    }
  });

  useEffect(() => {
    loadDevOpsData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadDevOpsData();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadDevOpsData = async () => {
    try {
      const [deploymentsRes, pipelinesRes] = await Promise.all([
        fetch('/api/devops/automation?type=deployments'),
        fetch('/api/devops/automation?type=pipelines')
      ]);

      if (deploymentsRes.ok) {
        const deploymentsData = await deploymentsRes.json();
        setDeployments(deploymentsData.deployments || []);
      }

      if (pipelinesRes.ok) {
        const pipelinesData = await pipelinesRes.json();
        setPipelines(pipelinesData.pipelines || []);
      }
    } catch (error) {
      console.error('Failed to load DevOps data:', error);
    } finally {
      setLoading(false);
    }
  };

  const createDeployment = async () => {
    try {
      const response = await fetch('/api/devops/automation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create_deployment',
          ...deploymentForm
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Deployment created",
          description: `${deploymentForm.name} has been configured successfully`,
        });
        setShowCreateDeployment(false);
        loadDevOpsData();
        resetDeploymentForm();
      } else {
        const error = await response.json();
        toast({
          title: "Creation failed",
          description: error.error || "Failed to create deployment",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Creation failed",
        description: "Failed to create deployment",
        variant: "destructive",
      });
    }
  };

  const createPipeline = async () => {
    try {
      const response = await fetch('/api/devops/automation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create_pipeline',
          ...pipelineForm
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Pipeline created",
          description: `${pipelineForm.name} has been configured successfully`,
        });
        setShowCreatePipeline(false);
        loadDevOpsData();
        resetPipelineForm();
      } else {
        const error = await response.json();
        toast({
          title: "Creation failed",
          description: error.error || "Failed to create pipeline",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Creation failed",
        description: "Failed to create pipeline",
        variant: "destructive",
      });
    }
  };

  const deployApplication = async (deploymentId: string) => {
    try {
      const response = await fetch('/api/devops/automation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'deploy',
          deploymentId,
          version: '1.0.0'
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Deployment started",
          description: "Application deployment is now in progress",
        });
        loadDevOpsData();
      } else {
        const error = await response.json();
        toast({
          title: "Deployment failed",
          description: error.error || "Failed to start deployment",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Deployment failed",
        description: "Failed to start deployment",
        variant: "destructive",
      });
    }
  };

  const resetDeploymentForm = () => {
    setDeploymentForm({
      name: '',
      description: '',
      projectId: '',
      platform: 'aws',
      environment: 'development',
      configuration: {
        region: 'us-west-2',
        instanceType: 't3.micro',
        autoScale: false,
        minInstances: 1,
        maxInstances: 10,
        buildCommand: 'npm run build',
        startCommand: 'npm start',
        environmentVars: {},
        domains: [],
        ssl: true,
        monitoring: true,
        logging: true,
        backup: false,
        cicd: true
      },
      infrastructure: {
        containerized: true,
        orchestrator: 'docker',
        database: {
          type: 'postgresql',
          managed: true,
          backups: true
        },
        storage: {
          type: 's3',
          size: '100GB'
        },
        networking: {
          vpc: true,
          loadBalancer: false,
          cdn: false
        }
      }
    });
  };

  const resetPipelineForm = () => {
    setPipelineForm({
      name: '',
      projectId: '',
      stages: [
        {
          name: 'Build',
          type: 'build',
          commands: ['npm install', 'npm run build'],
          condition: 'always',
          timeout: 600,
          retries: 0
        }
      ],
      triggers: {
        push: true,
        pullRequest: true,
        schedule: '',
        manual: true
      },
      notifications: {
        slack: '',
        email: [],
        webhook: ''
      }
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-600';
      case 'active': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'running': return 'text-blue-600';
      case 'pending': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4" />;
      case 'active': return <CheckCircle className="h-4 w-4" />;
      case 'failed': return <XCircle className="h-4 w-4" />;
      case 'running': return <Clock className="h-4 w-4" />;
      case 'pending': return <Clock className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'aws': return <Cloud className="h-4 w-4 text-orange-500" />;
      case 'gcp': return <Cloud className="h-4 w-4 text-blue-500" />;
      case 'azure': return <Cloud className="h-4 w-4 text-blue-600" />;
      case 'docker': return <Dock className="h-4 w-4 text-blue-400" />;
      case 'vercel': return <Zap className="h-4 w-4 text-black" />;
      case 'netlify': return <Globe className="h-4 w-4 text-teal-500" />;
      default: return <Server className="h-4 w-4" />;
    }
  };

  // Mock data for charts
  const deploymentTrends = [
    { date: '2024-01-01', successful: 15, failed: 2 },
    { date: '2024-01-02', successful: 18, failed: 1 },
    { date: '2024-01-03', successful: 12, failed: 3 },
    { date: '2024-01-04', successful: 20, failed: 1 },
    { date: '2024-01-05', successful: 16, failed: 2 },
    { date: '2024-01-06', successful: 22, failed: 0 },
    { date: '2024-01-07', successful: 19, failed: 1 }
  ];

  const platformDistribution = [
    { name: 'AWS', value: 45, color: '#FF9900' },
    { name: 'GCP', value: 25, color: '#4285F4' },
    { name: 'Azure', value: 20, color: '#0078D4' },
    { name: 'Docker', value: 10, color: '#2496ED' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">DevOps Automation</h2>
          <p className="text-muted-foreground">
            Infrastructure automation, CI/CD pipelines, and deployment management
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => loadDevOpsData()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateDeployment(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Deployment
          </Button>
          <Button variant="outline" onClick={() => setShowCreatePipeline(true)}>
            <GitBranch className="h-4 w-4 mr-2" />
            New Pipeline
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="deployments">Deployments</TabsTrigger>
          <TabsTrigger value="pipelines">CI/CD Pipelines</TabsTrigger>
          <TabsTrigger value="infrastructure">Infrastructure</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Deployments</p>
                  <p className="text-2xl font-bold">{deployments.length}</p>
                </div>
                <Rocket className="h-8 w-8 text-blue-600" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Pipelines</p>
                  <p className="text-2xl font-bold text-green-600">{pipelines.length}</p>
                </div>
                <GitBranch className="h-8 w-8 text-green-600" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold text-green-600">96%</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg Deploy Time</p>
                  <p className="text-2xl font-bold">4.2m</p>
                </div>
                <Clock className="h-8 w-8 text-blue-600" />
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Deployment Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={deploymentTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="successful" stroke="#10b981" name="Successful" />
                    <Line type="monotone" dataKey="failed" stroke="#ef4444" name="Failed" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Platform Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={platformDistribution}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {platformDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-4">
                  {platformDistribution.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm">{item.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Deployments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {deployments.slice(0, 5).map((deployment) => (
                    <div key={deployment.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-3">
                        {getPlatformIcon(deployment.platform)}
                        <div>
                          <p className="font-medium">{deployment.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {deployment.platform} • {deployment.environment}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1 ${getStatusColor(deployment.status)}`}>
                          {getStatusIcon(deployment.status)}
                          <span className="text-sm">{deployment.status}</span>
                        </div>
                        <Badge variant="outline">
                          {deployment._count?.executions || 0} runs
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Pipelines</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pipelines.slice(0, 5).map((pipeline) => (
                    <div key={pipeline.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-3">
                        <GitBranch className="h-4 w-4 text-blue-600" />
                        <div>
                          <p className="font-medium">{pipeline.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {pipeline.stages.length} stages
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1 ${getStatusColor(pipeline.status)}`}>
                          {getStatusIcon(pipeline.status)}
                          <span className="text-sm">{pipeline.status}</span>
                        </div>
                        <Badge variant="outline">
                          {pipeline._count?.runs || 0} runs
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Deployments Tab */}
        <TabsContent value="deployments" className="space-y-4">
          <div className="grid gap-4">
            {deployments.map((deployment) => (
              <Card key={deployment.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      {getPlatformIcon(deployment.platform)}
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {deployment.name}
                          <Badge variant="outline">{deployment.platform}</Badge>
                          <Badge 
                            variant={deployment.environment === 'production' ? 'default' : 'secondary'}
                          >
                            {deployment.environment}
                          </Badge>
                        </CardTitle>
                        <CardDescription>{deployment.description}</CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => deployApplication(deployment.id)}
                      >
                        <Rocket className="h-4 w-4 mr-2" />
                        Deploy
                      </Button>
                      <Button size="sm" variant="outline">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="font-medium">Status</p>
                      <p className={getStatusColor(deployment.status)}>{deployment.status}</p>
                    </div>
                    <div>
                      <p className="font-medium">Region</p>
                      <p className="text-muted-foreground">
                        {deployment.configuration?.region || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">Auto Scale</p>
                      <p className="text-muted-foreground">
                        {deployment.configuration?.autoScale ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">Executions</p>
                      <p className="text-muted-foreground">
                        {deployment._count?.executions || 0}
                      </p>
                    </div>
                  </div>

                  {/* Infrastructure Overview */}
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <h4 className="font-medium mb-2">Infrastructure</h4>
                    <div className="flex flex-wrap gap-2">
                      {deployment.infrastructure?.containerized && (
                        <Badge variant="outline" className="text-xs">
                          <Dock className="h-3 w-3 mr-1" />
                          Containerized
                        </Badge>
                      )}
                      {deployment.infrastructure?.database?.type && (
                        <Badge variant="outline" className="text-xs">
                          <Database className="h-3 w-3 mr-1" />
                          {deployment.infrastructure.database.type}
                        </Badge>
                      )}
                      {deployment.configuration?.monitoring && (
                        <Badge variant="outline" className="text-xs">
                          <Monitor className="h-3 w-3 mr-1" />
                          Monitoring
                        </Badge>
                      )}
                      {deployment.configuration?.ssl && (
                        <Badge variant="outline" className="text-xs">
                          <Shield className="h-3 w-3 mr-1" />
                          SSL
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Other tabs would be implemented similarly */}
        <TabsContent value="pipelines">
          <Card>
            <CardHeader>
              <CardTitle>CI/CD Pipelines</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {pipelines.map((pipeline) => (
                  <div key={pipeline.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium">{pipeline.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {pipeline.stages.length} stages • {pipeline.status}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm">
                          <Play className="h-4 w-4 mr-2" />
                          Run
                        </Button>
                        <Button size="sm" variant="outline">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pipeline.stages.map((stage, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {stage.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="infrastructure">
          <Card>
            <CardHeader>
              <CardTitle>Infrastructure Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Infrastructure management and monitoring would be displayed here</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitoring">
          <Card>
            <CardHeader>
              <CardTitle>System Monitoring</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Real-time monitoring and alerts would be displayed here</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>DevOps Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Global DevOps settings and preferences would be configured here</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Deployment Modal */}
      {showCreateDeployment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
            <CardHeader>
              <CardTitle>Create Deployment Configuration</CardTitle>
              <CardDescription>
                Set up automated deployment with infrastructure as code
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Basic Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="deployName">Deployment Name</Label>
                  <Input
                    id="deployName"
                    value={deploymentForm.name}
                    onChange={(e) => setDeploymentForm({ ...deploymentForm, name: e.target.value })}
                    placeholder="my-awesome-app"
                  />
                </div>
                <div>
                  <Label htmlFor="platform">Platform</Label>
                  <Select
                    value={deploymentForm.platform}
                    onValueChange={(value) => setDeploymentForm({ ...deploymentForm, platform: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aws">Amazon Web Services</SelectItem>
                      <SelectItem value="gcp">Google Cloud Platform</SelectItem>
                      <SelectItem value="azure">Microsoft Azure</SelectItem>
                      <SelectItem value="vercel">Vercel</SelectItem>
                      <SelectItem value="netlify">Netlify</SelectItem>
                      <SelectItem value="digitalocean">DigitalOcean</SelectItem>
                      <SelectItem value="docker">Docker</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="deployDescription">Description</Label>
                <Textarea
                  id="deployDescription"
                  value={deploymentForm.description}
                  onChange={(e) => setDeploymentForm({ ...deploymentForm, description: e.target.value })}
                  placeholder="Describe this deployment configuration"
                />
              </div>

              {/* Configuration */}
              <div className="space-y-4">
                <h3 className="font-medium">Configuration</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="environment">Environment</Label>
                    <Select
                      value={deploymentForm.environment}
                      onValueChange={(value) => setDeploymentForm({ ...deploymentForm, environment: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="development">Development</SelectItem>
                        <SelectItem value="staging">Staging</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="region">Region</Label>
                    <Input
                      id="region"
                      value={deploymentForm.configuration.region}
                      onChange={(e) => setDeploymentForm({
                        ...deploymentForm,
                        configuration: { ...deploymentForm.configuration, region: e.target.value }
                      })}
                      placeholder="us-west-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="instanceType">Instance Type</Label>
                    <Input
                      id="instanceType"
                      value={deploymentForm.configuration.instanceType}
                      onChange={(e) => setDeploymentForm({
                        ...deploymentForm,
                        configuration: { ...deploymentForm.configuration, instanceType: e.target.value }
                      })}
                      placeholder="t3.micro"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="autoScale"
                    checked={deploymentForm.configuration.autoScale}
                    onCheckedChange={(checked) => setDeploymentForm({
                      ...deploymentForm,
                      configuration: { ...deploymentForm.configuration, autoScale: checked }
                    })}
                  />
                  <Label htmlFor="autoScale">Enable auto-scaling</Label>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateDeployment(false)}>
                  Cancel
                </Button>
                <Button onClick={createDeployment}>
                  Create Deployment
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}