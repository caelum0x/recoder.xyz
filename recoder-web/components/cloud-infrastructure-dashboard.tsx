'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Cloud, Server, Database, HardDrive, Shield, Monitor,
  Settings, Play, Trash2, RefreshCw, Eye, Copy, Download,
  CheckCircle, AlertCircle, Loader2, DollarSign, Globe,
  Cpu, MemoryStick, Network, Activity, Clock, Users
} from 'lucide-react';

// ☁️ CLOUD INFRASTRUCTURE DASHBOARD - REAL MULTI-CLOUD PROVISIONING
// Provision actual AWS/GCP/Azure resources with real API calls

interface CloudResource {
  id: string;
  name: string;
  type: 'compute' | 'database' | 'storage' | 'network' | 'security' | 'monitoring';
  provider: 'aws' | 'gcp' | 'azure';
  status: 'creating' | 'running' | 'stopped' | 'terminated' | 'error';
  config: any;
  endpoints: {
    public?: string;
    private?: string;
    admin?: string;
  };
  credentials: {
    username?: string;
    password?: string;
    apiKey?: string;
    connectionString?: string;
  };
  monitoring: {
    cpu: number;
    memory: number;
    disk: number;
    network: number;
  };
  cost: {
    hourly: number;
    monthly: number;
    currency: string;
  };
}

interface InfrastructureStack {
  id: string;
  name: string;
  provider: 'aws' | 'gcp' | 'azure';
  region: string;
  resources: CloudResource[];
  status: 'creating' | 'ready' | 'updating' | 'deleting' | 'error';
  template: any;
  outputs: Record<string, string>;
  totalCost: {
    hourly: number;
    monthly: number;
    currency: string;
  };
  createdAt: string;
  lastUpdated: string;
}

interface CloudProvider {
  name: string;
  regions: string[];
  services: string[];
  configured: boolean;
}

interface ProviderInfo {
  aws: CloudProvider;
  gcp: CloudProvider;
  azure: CloudProvider;
}

interface InfraTemplate {
  id: string;
  name: string;
  description: string;
  resources: string[];
  estimatedCost: {
    monthly: number;
    currency: string;
  };
}

export default function CloudInfrastructureDashboard() {
  // State management
  const [activeTab, setActiveTab] = useState('create');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Infrastructure state
  const [stacks, setStacks] = useState<InfrastructureStack[]>([]);
  const [currentStack, setCurrentStack] = useState<InfrastructureStack | null>(null);
  const [providers, setProviders] = useState<ProviderInfo | null>(null);
  const [templates, setTemplates] = useState<InfraTemplate[]>([]);

  // Creation form state
  const [stackForm, setStackForm] = useState({
    name: '',
    provider: 'aws' as 'aws' | 'gcp' | 'azure',
    region: 'us-east-1',
    template: 'web-app',
    resources: [
      { type: 'compute' as const, config: { instanceType: 't3.micro' } },
      { type: 'database' as const, config: { instanceClass: 'db.t3.micro', engine: 'postgres' } },
      { type: 'storage' as const, config: { size: '20GB' } }
    ],
    budget: {
      monthly: 100,
      currency: 'USD'
    }
  });

  // Load initial data
  useEffect(() => {
    loadProviders();
    loadTemplates();
  }, []);

  // Auto-refresh stacks every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (stacks.length > 0) {
        refreshStacks();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [stacks]);

  // Load providers and their status
  const loadProviders = async () => {
    try {
      const response = await fetch('/api/cloud-infrastructure?info=providers');
      const data = await response.json();
      
      if (data.success) {
        setProviders(data.providers);
        
        // Set default region based on configured provider
        const configuredProvider = Object.entries(data.providers).find(([_, provider]) => 
          (provider as CloudProvider).configured
        );
        
        if (configuredProvider) {
          const [providerKey, providerData] = configuredProvider;
          setStackForm(prev => ({
            ...prev,
            provider: providerKey as 'aws' | 'gcp' | 'azure',
            region: (providerData as CloudProvider).regions[0]
          }));
        }
      }
    } catch (error) {
      console.error('Failed to load providers:', error);
    }
  };

  // Load infrastructure templates
  const loadTemplates = async () => {
    try {
      const response = await fetch('/api/cloud-infrastructure?info=templates');
      const data = await response.json();
      
      if (data.success) {
        setTemplates(data.templates);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  // Refresh all stacks
  const refreshStacks = async () => {
    for (const stack of stacks) {
      try {
        const response = await fetch('/api/cloud-infrastructure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'get-status',
            stackId: stack.id
          })
        });

        const data = await response.json();
        
        if (data.success && data.stack) {
          setStacks(prev => prev.map(s => 
            s.id === stack.id ? data.stack : s
          ));
        }
      } catch (error) {
        console.error(`Failed to refresh stack ${stack.id}:`, error);
      }
    }
  };

  // 🚀 CREATE INFRASTRUCTURE STACK
  const createInfrastructureStack = async () => {
    if (!stackForm.name.trim()) {
      setError('Please provide a stack name');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      console.log('☁️ Creating infrastructure stack...');
      
      const response = await fetch('/api/cloud-infrastructure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-stack',
          ...stackForm
        })
      });

      if (!response.ok) {
        throw new Error(`Stack creation failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to create infrastructure stack');
      }

      console.log('✅ Infrastructure stack created:', data.stack);
      setStacks(prev => [...prev, data.stack]);
      setCurrentStack(data.stack);
      setActiveTab('manage');
      setSuccess(`${stackForm.provider.toUpperCase()} infrastructure stack created successfully!`);

      // Reset form
      setStackForm(prev => ({
        ...prev,
        name: '',
        resources: [
          { type: 'compute', config: { instanceType: 't3.micro' } },
          { type: 'database', config: { instanceClass: 'db.t3.micro', engine: 'postgres' } },
          { type: 'storage', config: { size: '20GB' } }
        ]
      }));

    } catch (error) {
      console.error('❌ Infrastructure stack creation failed:', error);
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  // 🗑️ DELETE INFRASTRUCTURE STACK
  const deleteStack = async (stackId: string) => {
    if (!confirm('Are you sure you want to delete this infrastructure stack? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/cloud-infrastructure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete-stack',
          stackId
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setStacks(prev => prev.filter(s => s.id !== stackId));
        if (currentStack?.id === stackId) {
          setCurrentStack(null);
        }
        setSuccess('Infrastructure stack deleted successfully');
      } else {
        setError(data.message || 'Failed to delete stack');
      }

    } catch (error) {
      console.error('Failed to delete stack:', error);
      setError('Failed to delete stack: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Load template configuration
  const loadTemplate = (template: InfraTemplate) => {
    setStackForm(prev => ({
      ...prev,
      template: template.id,
      budget: template.estimatedCost,
      resources: template.resources.map(type => ({
        type: type as any,
        config: getDefaultConfig(type)
      }))
    }));
  };

  // Get default configuration for resource type
  const getDefaultConfig = (resourceType: string) => {
    switch (resourceType) {
      case 'compute':
        return { instanceType: 't3.micro' };
      case 'database':
        return { instanceClass: 'db.t3.micro', engine: 'postgres' };
      case 'storage':
        return { size: '20GB' };
      case 'network':
        return { cidr: '10.0.0.0/16' };
      default:
        return {};
    }
  };

  // Helper functions
  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'aws':
        return '🔶';
      case 'gcp':
        return '🌐';
      case 'azure':
        return '⚡';
      default:
        return '☁️';
    }
  };

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'compute':
        return <Server className="w-4 h-4" />;
      case 'database':
        return <Database className="w-4 h-4" />;
      case 'storage':
        return <HardDrive className="w-4 h-4" />;
      case 'network':
        return <Network className="w-4 h-4" />;
      case 'security':
        return <Shield className="w-4 h-4" />;
      case 'monitoring':
        return <Monitor className="w-4 h-4" />;
      default:
        return <Settings className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
      case 'ready':
        return 'bg-green-100 text-green-800';
      case 'creating':
      case 'updating':
        return 'bg-yellow-100 text-yellow-800';
      case 'error':
      case 'terminated':
        return 'bg-red-100 text-red-800';
      case 'stopped':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold flex items-center justify-center gap-3">
          <Cloud className="w-12 h-12 text-blue-500" />
          <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            Cloud Infrastructure Automation
          </span>
        </h1>
        <p className="text-xl text-gray-600">
          ☁️ Real AWS, GCP & Azure Resource Provisioning
        </p>
        <div className="flex items-center justify-center gap-4 mt-4">
          <Badge className="bg-orange-100 text-orange-800">🔶 AWS EC2/RDS/S3</Badge>
          <Badge className="bg-blue-100 text-blue-800">🌐 GCP Compute/Storage</Badge>
          <Badge className="bg-purple-100 text-purple-800">⚡ Azure VMs/SQL</Badge>
          <Badge className="bg-green-100 text-green-800">🤖 AI Templates</Badge>
        </div>
      </div>

      {/* Provider Status */}
      {providers && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Cloud Provider Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(providers).map(([key, provider]) => (
                <div
                  key={key}
                  className={`p-4 rounded-lg border-2 ${
                    provider.configured ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getProviderIcon(key)}</span>
                      <span className="font-medium">{provider.name}</span>
                    </div>
                    <Badge className={provider.configured ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                      {provider.configured ? 'Configured' : 'Not Configured'}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-gray-600">
                      Regions: {provider.regions.length}
                    </div>
                    <div className="text-sm text-gray-600">
                      Services: {provider.services.join(', ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="create">Create Stack</TabsTrigger>
          <TabsTrigger value="manage">Manage Stacks</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
        </TabsList>

        {/* CREATE STACK TAB */}
        <TabsContent value="create" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Configuration Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="w-5 h-5" />
                  Infrastructure Configuration
                </CardTitle>
                <CardDescription>
                  Configure your cloud infrastructure stack
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Basic Configuration */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="stackName">Stack Name *</Label>
                    <Input
                      id="stackName"
                      placeholder="my-awesome-infrastructure"
                      value={stackForm.name}
                      onChange={(e) => setStackForm(prev => ({ ...prev, name: e.target.value }))}
                      disabled={loading}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="provider">Cloud Provider</Label>
                      <select
                        id="provider"
                        value={stackForm.provider}
                        onChange={(e) => {
                          const provider = e.target.value as 'aws' | 'gcp' | 'azure';
                          setStackForm(prev => ({
                            ...prev,
                            provider,
                            region: providers?.[provider]?.regions[0] || 'us-east-1'
                          }));
                        }}
                        disabled={loading}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      >
                        {providers && Object.entries(providers)
                          .filter(([_, provider]) => provider.configured)
                          .map(([key, provider]) => (
                            <option key={key} value={key}>
                              {getProviderIcon(key)} {provider.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="region">Region</Label>
                      <select
                        id="region"
                        value={stackForm.region}
                        onChange={(e) => setStackForm(prev => ({ ...prev, region: e.target.value }))}
                        disabled={loading}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      >
                        {providers?.[stackForm.provider]?.regions.map((region) => (
                          <option key={region} value={region}>
                            {region}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Template Selection */}
                <div className="space-y-4">
                  <h4 className="font-medium">Infrastructure Template</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          stackForm.template === template.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => loadTemplate(template)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-medium">{template.name}</h5>
                          <Badge variant="outline">
                            {formatCurrency(template.estimatedCost.monthly)}/mo
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{template.description}</p>
                        <div className="flex flex-wrap gap-1">
                          {template.resources.map((resource) => (
                            <Badge key={resource} variant="secondary" className="text-xs">
                              {resource}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Budget Configuration */}
                <div className="space-y-4">
                  <h4 className="font-medium">Budget Limits</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="monthlyBudget">Monthly Budget</Label>
                      <div className="flex">
                        <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                          $
                        </span>
                        <Input
                          id="monthlyBudget"
                          type="number"
                          placeholder="100"
                          value={stackForm.budget.monthly}
                          onChange={(e) => setStackForm(prev => ({
                            ...prev,
                            budget: { ...prev.budget, monthly: parseInt(e.target.value) || 0 }
                          }))}
                          disabled={loading}
                          className="rounded-l-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="currency">Currency</Label>
                      <select
                        id="currency"
                        value={stackForm.budget.currency}
                        onChange={(e) => setStackForm(prev => ({
                          ...prev,
                          budget: { ...prev.budget, currency: e.target.value }
                        }))}
                        disabled={loading}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      >
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Create Button */}
                <Button 
                  onClick={createInfrastructureStack}
                  disabled={loading || !stackForm.name.trim() || !providers?.[stackForm.provider]?.configured}
                  className="w-full"
                  size="lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Creating Infrastructure...
                    </>
                  ) : (
                    <>
                      <Cloud className="w-5 h-5 mr-2" />
                      Create {stackForm.provider.toUpperCase()} Infrastructure
                    </>
                  )}
                </Button>

                {/* Status Messages */}
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <span className="text-red-700">{error}</span>
                  </div>
                )}

                {success && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-green-700">{success}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Resource Configuration Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Resource Configuration Preview
                </CardTitle>
                <CardDescription>
                  Preview of resources to be created
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {stackForm.resources.map((resource, index) => (
                    <div key={index} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getResourceIcon(resource.type)}
                          <span className="font-medium capitalize">{resource.type}</span>
                        </div>
                        <Badge variant="outline">{stackForm.provider.toUpperCase()}</Badge>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        {Object.entries(resource.config).map(([key, value]) => (
                          <div key={key}>
                            <strong>{key}:</strong> {String(value)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Estimated Monthly Cost:</span>
                    <Badge className="bg-green-100 text-green-800">
                      {formatCurrency(stackForm.budget.monthly, stackForm.budget.currency)}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* MANAGE STACKS TAB */}
        <TabsContent value="manage" className="space-y-6">
          {stacks.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Cloud className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Infrastructure Stacks</h3>
                <p className="text-gray-500 mb-4">Create your first cloud infrastructure stack to get started.</p>
                <Button onClick={() => setActiveTab('create')}>
                  <Cloud className="w-4 h-4 mr-2" />
                  Create Stack
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {stacks.map((stack) => (
                <Card key={stack.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{getProviderIcon(stack.provider)}</span>
                        <div>
                          <CardTitle>{stack.name}</CardTitle>
                          <CardDescription>
                            {stack.provider.toUpperCase()} • {stack.region} • {stack.resources.length} resources
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getStatusColor(stack.status)}>
                          {stack.status}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCurrentStack(stack)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteStack(stack.id)}
                          disabled={loading}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <Label className="text-xs text-gray-500">Total Cost</Label>
                        <div className="font-medium">
                          {formatCurrency(stack.totalCost.monthly)}/mo
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Created</Label>
                        <div className="font-medium">
                          {new Date(stack.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Last Updated</Label>
                        <div className="font-medium">
                          {new Date(stack.lastUpdated).toLocaleDateString()}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Resources</Label>
                        <div className="flex items-center gap-1">
                          {Array.from(new Set(stack.resources.map(r => r.type))).map((type) => (
                            <div key={type} title={type}>
                              {getResourceIcon(type)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* RESOURCES TAB */}
        <TabsContent value="resources" className="space-y-6">
          {currentStack ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-2xl">{getProviderIcon(currentStack.provider)}</span>
                    {currentStack.name} Resources
                  </CardTitle>
                  <CardDescription>
                    {currentStack.resources.length} resources in {currentStack.region}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4">
                    {currentStack.resources.map((resource) => (
                      <Card key={resource.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              {getResourceIcon(resource.type)}
                              <span className="font-medium">{resource.name}</span>
                              <Badge variant="outline">{resource.type}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={getStatusColor(resource.status)}>
                                {resource.status}
                              </Badge>
                              <span className="text-sm text-gray-500">
                                {formatCurrency(resource.cost.monthly)}/mo
                              </span>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <Label className="text-xs text-gray-500">Endpoints</Label>
                              <div className="space-y-1">
                                {resource.endpoints.public && (
                                  <div className="flex items-center gap-2">
                                    <Globe className="w-3 h-3" />
                                    <a 
                                      href={resource.endpoints.public} 
                                      target="_blank" 
                                      className="text-blue-600 hover:underline text-sm"
                                    >
                                      Public
                                    </a>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => copyToClipboard(resource.endpoints.public || '')}
                                    >
                                      <Copy className="w-3 h-3" />
                                    </Button>
                                  </div>
                                )}
                                {resource.endpoints.private && (
                                  <div className="flex items-center gap-2">
                                    <Network className="w-3 h-3" />
                                    <span className="text-sm font-mono">{resource.endpoints.private}</span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => copyToClipboard(resource.endpoints.private || '')}
                                    >
                                      <Copy className="w-3 h-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div>
                              <Label className="text-xs text-gray-500">Credentials</Label>
                              <div className="space-y-1">
                                {resource.credentials.username && (
                                  <div className="text-sm">
                                    <strong>User:</strong> {resource.credentials.username}
                                  </div>
                                )}
                                {resource.credentials.connectionString && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-mono truncate">
                                      {resource.credentials.connectionString.substring(0, 40)}...
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => copyToClipboard(resource.credentials.connectionString || '')}
                                    >
                                      <Copy className="w-3 h-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div>
                              <Label className="text-xs text-gray-500">Configuration</Label>
                              <div className="space-y-1">
                                {Object.entries(resource.config).slice(0, 3).map(([key, value]) => (
                                  <div key={key} className="text-sm">
                                    <strong>{key}:</strong> {String(value)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Server className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Stack Selected</h3>
                <p className="text-gray-500 mb-4">Select a stack from the Manage tab to view its resources.</p>
                <Button onClick={() => setActiveTab('manage')}>
                  <Eye className="w-4 h-4 mr-2" />
                  View Stacks
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* MONITORING TAB */}
        <TabsContent value="monitoring" className="space-y-6">
          {currentStack ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-green-500" />
                      <div>
                        <div className="text-sm text-gray-500">Monthly Cost</div>
                        <div className="text-lg font-bold">
                          {formatCurrency(currentStack.totalCost.monthly)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Server className="w-5 h-5 text-blue-500" />
                      <div>
                        <div className="text-sm text-gray-500">Resources</div>
                        <div className="text-lg font-bold">{currentStack.resources.length}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-green-500" />
                      <div>
                        <div className="text-sm text-gray-500">Running</div>
                        <div className="text-lg font-bold">
                          {currentStack.resources.filter(r => r.status === 'running').length}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-purple-500" />
                      <div>
                        <div className="text-sm text-gray-500">Uptime</div>
                        <div className="text-lg font-bold">
                          {Math.floor((Date.now() - new Date(currentStack.createdAt).getTime()) / (1000 * 60 * 60 * 24))}d
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Resource Monitoring */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Monitor className="w-5 h-5" />
                    Resource Monitoring
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {currentStack.resources.map((resource) => (
                      <div key={resource.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {getResourceIcon(resource.type)}
                            <span className="font-medium">{resource.name}</span>
                          </div>
                          <Badge className={getStatusColor(resource.status)}>
                            {resource.status}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-4">
                          <div className="text-center">
                            <div className="text-sm text-gray-500">CPU</div>
                            <div className="text-lg font-bold">{resource.monitoring.cpu}%</div>
                            <Cpu className="w-4 h-4 mx-auto mt-1" />
                          </div>
                          <div className="text-center">
                            <div className="text-sm text-gray-500">Memory</div>
                            <div className="text-lg font-bold">{resource.monitoring.memory}%</div>
                            <MemoryStick className="w-4 h-4 mx-auto mt-1" />
                          </div>
                          <div className="text-center">
                            <div className="text-sm text-gray-500">Disk</div>
                            <div className="text-lg font-bold">{resource.monitoring.disk}%</div>
                            <HardDrive className="w-4 h-4 mx-auto mt-1" />
                          </div>
                          <div className="text-center">
                            <div className="text-sm text-gray-500">Network</div>
                            <div className="text-lg font-bold">{resource.monitoring.network}%</div>
                            <Network className="w-4 h-4 mx-auto mt-1" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Monitor className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Monitoring Data</h3>
                <p className="text-gray-500 mb-4">Select a stack to view monitoring metrics.</p>
                <Button onClick={() => setActiveTab('manage')}>
                  <Eye className="w-4 h-4 mr-2" />
                  Select Stack
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}