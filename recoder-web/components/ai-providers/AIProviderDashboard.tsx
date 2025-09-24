// AI Provider Management Dashboard
// Advanced AI provider orchestration with intelligent routing

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Activity, 
  Zap, 
  Brain, 
  Eye, 
  Code, 
  Image, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Clock,
  DollarSign,
  TrendingUp,
  Settings,
  RefreshCw,
  Lightbulb,
  BarChart3,
  Shield,
  Globe
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { toast } from 'sonner';

interface AIProvider {
  id: string;
  name: string;
  type: string;
  status: {
    isHealthy: boolean;
    responseTime: number;
    uptime: number;
    errorRate: number;
  };
  models: Array<{
    id: string;
    name: string;
    description: string;
    capabilities: string[];
    latencyTier: 'fast' | 'medium' | 'slow';
    qualityTier: 'basic' | 'good' | 'excellent';
    contextLength: number;
    pricing: {
      inputPrice: number;
      outputPrice: number;
    };
  }>;
  features: {
    streaming: boolean;
    functionCalling: boolean;
    imageAnalysis: boolean;
    codeGeneration: boolean;
    multimodal: boolean;
    reasoning: boolean;
  };
  pricing: {
    currency: string;
    costMultiplier: number;
    freeCredits?: number;
  };
}

interface RoutingRecommendation {
  scenario: string;
  provider: string;
  model: string;
  reasoning: string;
}

interface SystemStatus {
  status: string;
  providers: {
    total: number;
    healthy: number;
    degraded: number;
  };
  performance: {
    averageResponseTime: number;
    overallUptime: number;
    totalRequests: number;
    failoverRate: number;
  };
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00', '#ff00ff'];

const AIProviderDashboard: React.FC = () => {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [recommendations, setRecommendations] = useState<RoutingRecommendation[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(null);
  const [routingDialogOpen, setRoutingDialogOpen] = useState(false);
  const [routingRequest, setRoutingRequest] = useState({
    taskType: 'code-generation',
    prompt: '',
    complexity: 'medium',
    urgency: 'medium',
    maxLatency: 10000,
    qualityRequired: 'good'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [providersRes, statusRes, recommendationsRes, analyticsRes] = await Promise.all([
        fetch('/api/ai-providers'),
        fetch('/api/ai-providers/status'),
        fetch('/api/ai-providers/recommendations'),
        fetch('/api/ai-providers/analytics')
      ]);

      const [providersData, statusData, recommendationsData, analyticsData] = await Promise.all([
        providersRes.json(),
        statusRes.json(),
        recommendationsRes.json(),
        analyticsRes.json()
      ]);

      if (providersData.success) setProviders(providersData.providers);
      if (statusData.success) setSystemStatus(statusData.systemStatus);
      if (recommendationsData.success) setRecommendations(recommendationsData.recommendations);
      if (analyticsData.success) setAnalytics(analyticsData.analytics);

    } catch (error) {
      console.error('Error fetching AI provider data:', error);
      toast.error('Failed to load AI provider data');
    } finally {
      setLoading(false);
    }
  };

  const handleProviderHealthCheck = async (providerId: string) => {
    try {
      const response = await fetch(`/api/ai-providers/${providerId}/health-check`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        toast.success(`Health check triggered for ${providerId}`);
        fetchData(); // Refresh data
      } else {
        toast.error('Failed to trigger health check');
      }
    } catch (error) {
      toast.error('Failed to trigger health check');
    }
  };

  const handleRouteRequest = async () => {
    try {
      const response = await fetch('/api/ai-providers/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...routingRequest,
          context: {
            complexity: routingRequest.complexity,
            urgency: routingRequest.urgency
          },
          constraints: {
            maxLatency: routingRequest.maxLatency,
            qualityRequired: routingRequest.qualityRequired
          }
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(`Request routed to ${data.routing.providerId} (${data.routing.modelId})`);
        setRoutingDialogOpen(false);
      } else {
        toast.error(data.error || 'Failed to route request');
      }
    } catch (error) {
      toast.error('Failed to route request');
    }
  };

  const getStatusIcon = (isHealthy: boolean) => {
    return isHealthy ? (
      <CheckCircle className="h-4 w-4 text-green-500" />
    ) : (
      <XCircle className="h-4 w-4 text-red-500" />
    );
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      operational: { variant: 'default', color: 'bg-green-100 text-green-800', label: 'Operational' },
      degraded: { variant: 'secondary', color: 'bg-yellow-100 text-yellow-800', label: 'Degraded' },
      partial_outage: { variant: 'destructive', color: 'bg-orange-100 text-orange-800', label: 'Partial Outage' },
      major_outage: { variant: 'destructive', color: 'bg-red-100 text-red-800', label: 'Major Outage' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.degraded;
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const getCapabilityIcon = (capability: string) => {
    const icons = {
      'text-generation': <Brain className="h-4 w-4" />,
      'code-generation': <Code className="h-4 w-4" />,
      'image-analysis': <Image className="h-4 w-4" />,
      'function-calling': <Zap className="h-4 w-4" />,
      'reasoning': <Lightbulb className="h-4 w-4" />,
      'multimodal': <Globe className="h-4 w-4" />
    };
    return icons[capability as keyof typeof icons] || <Activity className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-32 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-3xl font-bold flex items-center space-x-2">
            <Brain className="h-8 w-8 text-blue-500" />
            <span>AI Provider Management</span>
          </h1>
          <p className="text-gray-600 mt-1">
            Monitor and manage AI providers with intelligent routing
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <Button onClick={fetchData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          
          <Dialog open={routingDialogOpen} onOpenChange={setRoutingDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Zap className="h-4 w-4 mr-2" />
                Test Routing
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Test AI Provider Routing</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                <div>
                  <Label>Task Type</Label>
                  <Select value={routingRequest.taskType} onValueChange={(value) => 
                    setRoutingRequest(prev => ({ ...prev, taskType: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="code-generation">Code Generation</SelectItem>
                      <SelectItem value="text-generation">Text Generation</SelectItem>
                      <SelectItem value="image-analysis">Image Analysis</SelectItem>
                      <SelectItem value="reasoning">Reasoning</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Test Prompt</Label>
                  <Textarea
                    placeholder="Enter a test prompt..."
                    value={routingRequest.prompt}
                    onChange={(e) => setRoutingRequest(prev => ({ ...prev, prompt: e.target.value }))}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Complexity</Label>
                    <Select value={routingRequest.complexity} onValueChange={(value) => 
                      setRoutingRequest(prev => ({ ...prev, complexity: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple">Simple</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="complex">Complex</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>Urgency</Label>
                    <Select value={routingRequest.urgency} onValueChange={(value) => 
                      setRoutingRequest(prev => ({ ...prev, urgency: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <Button onClick={handleRouteRequest} className="w-full">
                  Route Request
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* System Status */}
      {systemStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <span>System Status</span>
              {getStatusBadge(systemStatus.status)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{systemStatus.providers.healthy}</div>
                <div className="text-sm text-gray-600">Healthy Providers</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{systemStatus.performance.averageResponseTime.toFixed(0)}ms</div>
                <div className="text-sm text-gray-600">Avg Response Time</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{systemStatus.performance.overallUptime.toFixed(1)}%</div>
                <div className="text-sm text-gray-600">Overall Uptime</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{systemStatus.performance.totalRequests.toLocaleString()}</div>
                <div className="text-sm text-gray-600">Total Requests</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Tabs defaultValue="providers" className="space-y-6">
        <TabsList>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          <TabsTrigger value="routing">Routing</TabsTrigger>
        </TabsList>

        {/* Providers Tab */}
        <TabsContent value="providers" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {providers.map((provider) => (
              <Card key={provider.id} className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setSelectedProvider(provider)}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center space-x-2">
                      {getStatusIcon(provider.status.isHealthy)}
                      <span>{provider.name}</span>
                    </CardTitle>
                    <Badge variant="outline">{provider.type}</Badge>
                  </div>
                  <CardDescription>{provider.models.length} models available</CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* Status Metrics */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="font-medium">Response Time</div>
                      <div className="flex items-center space-x-1">
                        <Clock className="h-3 w-3 text-gray-400" />
                        <span>{provider.status.responseTime}ms</span>
                      </div>
                    </div>
                    <div>
                      <div className="font-medium">Uptime</div>
                      <div className="flex items-center space-x-1">
                        <TrendingUp className="h-3 w-3 text-green-500" />
                        <span>{provider.status.uptime.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Error Rate */}
                  <div>
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span>Error Rate</span>
                      <span>{provider.status.errorRate.toFixed(1)}%</span>
                    </div>
                    <Progress 
                      value={provider.status.errorRate} 
                      className={`h-2 ${provider.status.errorRate > 5 ? 'bg-red-100' : 'bg-green-100'}`}
                    />
                  </div>

                  {/* Capabilities */}
                  <div>
                    <div className="font-medium text-sm mb-2">Top Capabilities</div>
                    <div className="flex flex-wrap gap-1">
                      {provider.models[0]?.capabilities.slice(0, 3).map((capability) => (
                        <Badge key={capability} variant="secondary" className="text-xs flex items-center space-x-1">
                          {getCapabilityIcon(capability)}
                          <span>{capability.replace('-', ' ')}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Cost Multiplier</span>
                    <span className="font-medium">{provider.pricing.costMultiplier}x</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          {analytics && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Provider Distribution</CardTitle>
                  <CardDescription>Request distribution across providers</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={Object.entries(analytics.routing.providerDistribution).map(([provider, count]) => ({
                          name: provider,
                          value: count
                        }))}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={(props: any) => `${props.name || props.segment || props.category || props.cycle || props.period || "Item"}: ${props.value || props.customerCount || props.totalRevenue || props.count || 0}`}
                      >
                        {Object.entries(analytics.routing.providerDistribution).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Performance Metrics</CardTitle>
                  <CardDescription>Provider health and performance</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analytics.providerHealth.map((provider: any) => (
                      <div key={provider.id} className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center space-x-3">
                          {getStatusIcon(provider.isHealthy)}
                          <span className="font-medium">{provider.name}</span>
                        </div>
                        <div className="text-right text-sm">
                          <div>{provider.responseTime}ms</div>
                          <div className="text-gray-600">{provider.uptime.toFixed(1)}% uptime</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recommendations.map((rec, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Lightbulb className="h-5 w-5 text-yellow-500" />
                    <span>{rec.scenario}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <span className="font-medium">Recommended Provider: </span>
                      <Badge>{rec.provider}</Badge>
                    </div>
                    <div>
                      <span className="font-medium">Model: </span>
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">{rec.model}</code>
                    </div>
                    <div>
                      <span className="font-medium">Reasoning: </span>
                      <p className="text-sm text-gray-600 mt-1">{rec.reasoning}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Routing Tab */}
        <TabsContent value="routing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Intelligent Routing System</CardTitle>
              <CardDescription>
                Advanced AI request routing with automatic failover and load balancing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <Shield className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <h3 className="font-medium">Automatic Failover</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Seamlessly switch to backup providers when primary fails
                  </p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <BarChart3 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <h3 className="font-medium">Load Balancing</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Distribute requests optimally across healthy providers
                  </p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <Brain className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                  <h3 className="font-medium">Smart Selection</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Choose best provider based on task complexity and requirements
                  </p>
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-medium mb-4">Routing Logic</h4>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xs">1</div>
                    <div>
                      <strong>Task Analysis:</strong> Analyze request type, complexity, and constraints
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold text-xs">2</div>
                    <div>
                      <strong>Provider Matching:</strong> Find providers with required capabilities and health status
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold text-xs">3</div>
                    <div>
                      <strong>Optimization:</strong> Select best provider based on cost, latency, and quality requirements
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold text-xs">4</div>
                    <div>
                      <strong>Execution:</strong> Route request with automatic failover if needed
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AIProviderDashboard;