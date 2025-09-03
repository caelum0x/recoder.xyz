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
  Layers, Server, Smartphone, Database, Code, Globe, 
  CheckCircle, AlertCircle, Loader2, Eye, Copy, Download,
  Zap, Play, Settings, Link, MonitorSpeaker, Cloud
} from 'lucide-react';

// 🚀 FULL-STACK APP GENERATOR - END-TO-END APPLICATIONS
// Generate complete applications: Frontend + Backend + Mobile + Database

interface FullStackApp {
  success: boolean;
  appId: string;
  components: {
    frontend: GeneratedComponent;
    backend: GeneratedComponent;
    mobile: GeneratedComponent;
    database: GeneratedComponent;
    shared: GeneratedComponent;
  };
  integrationGuide: {
    setupInstructions: string[];
    environmentVariables: Record<string, string>;
    databaseSchema: string;
    apiEndpoints: Array<{
      method: string;
      path: string;
      description: string;
      authentication: boolean;
    }>;
  };
  deploymentInfo: {
    buildTime: number;
    totalFiles: number;
    totalSize: string;
    testable: boolean;
  };
  liveDemo?: {
    frontendUrl: string;
    backendUrl: string;
    mobileQR: string;
    adminPanel: string;
  };
}

interface GeneratedComponent {
  type: 'frontend' | 'backend' | 'mobile' | 'database' | 'shared';
  framework: string;
  files: Array<{
    path: string;
    content: string;
    type: 'main' | 'component' | 'config' | 'style' | 'api' | 'model' | 'schema';
  }>;
  buildInstructions: string[];
  devCommands: string[];
  dependencies: Record<string, string>;
  envVariables: Record<string, string>;
}

interface AppTemplate {
  id: string;
  name: string;
  description: string;
  features: string[];
  stacks: string[];
}

interface Stack {
  id: string;
  name: string;
  description: string;
}

export default function FullStackGenerator() {
  // Form state
  const [appName, setAppName] = useState('');
  const [appType, setAppType] = useState('blog');
  const [description, setDescription] = useState('');
  const [selectedStack, setSelectedStack] = useState({
    frontend: 'nextjs',
    backend: 'nodejs',
    mobile: 'expo',
    database: 'postgresql'
  });
  const [features, setFeatures] = useState<string[]>(['authentication', 'api']);
  const [authentication, setAuthentication] = useState(true);
  const [realTimeFeatures, setRealTimeFeatures] = useState(false);
  const [apiIntegrations, setApiIntegrations] = useState<string[]>([]);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generatedApp, setGeneratedApp] = useState<FullStackApp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeComponent, setActiveComponent] = useState<'frontend' | 'backend' | 'mobile' | 'database' | 'shared'>('frontend');
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  // Templates and stacks
  const [templates, setTemplates] = useState<AppTemplate[]>([]);
  const [stacks, setStacks] = useState<any>({});

  // Load templates and stacks
  useEffect(() => {
    loadTemplatesAndStacks();
  }, []);

  const loadTemplatesAndStacks = async () => {
    try {
      const [templatesResponse, stacksResponse] = await Promise.all([
        fetch('/api/fullstack-generator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get-templates' })
        }),
        fetch('/api/fullstack-generator?info=stacks')
      ]);

      const templatesData = await templatesResponse.json();
      const stacksData = await stacksResponse.json();

      if (templatesData.success) setTemplates(templatesData.templates);
      if (stacksData.success) setStacks(stacksData.stacks);
    } catch (error) {
      console.error('Failed to load templates and stacks:', error);
    }
  };

  // 🚀 GENERATE FULL-STACK APPLICATION
  const generateFullStackApp = async () => {
    if (!appName.trim() || !description.trim()) {
      setError('Please provide app name and description');
      return;
    }

    setGenerating(true);
    setError(null);
    setGeneratedApp(null);

    try {
      console.log('🚀 Generating full-stack application...');
      
      const response = await fetch('/api/fullstack-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-fullstack-app',
          appName,
          appType,
          description,
          stack: selectedStack,
          features,
          authentication,
          realTimeFeatures,
          apiIntegrations,
          deployment: {
            frontend: 'vercel',
            backend: 'railway',
            database: 'supabase'
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate full-stack app');
      }

      console.log('✅ Full-stack app generated:', data);
      setGeneratedApp(data);

    } catch (error) {
      console.error('❌ Full-stack generation failed:', error);
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setGenerating(false);
    }
  };

  // Load template
  const loadTemplate = (template: AppTemplate) => {
    setAppType(template.id);
    setDescription(template.description);
    setFeatures(template.features);
    
    // Auto-select appropriate stack for template
    const suggestedStack = template.stacks[0]?.split('-');
    if (suggestedStack && suggestedStack.length >= 3) {
      setSelectedStack({
        frontend: suggestedStack[0] || 'nextjs',
        backend: suggestedStack[1] || 'nodejs', 
        mobile: 'expo',
        database: suggestedStack[2] || 'postgresql'
      });
    }
  };

  // Copy code to clipboard
  const copyCodeToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  // Helper functions
  const getComponentIcon = (type: string) => {
    switch (type) {
      case 'frontend': return <Globe className="w-4 h-4" />;
      case 'backend': return <Server className="w-4 h-4" />;
      case 'mobile': return <Smartphone className="w-4 h-4" />;
      case 'database': return <Database className="w-4 h-4" />;
      case 'shared': return <Code className="w-4 h-4" />;
      default: return <Code className="w-4 h-4" />;
    }
  };

  const getFileTypeColor = (type: string) => {
    switch (type) {
      case 'main': return 'bg-blue-100 text-blue-800';
      case 'component': return 'bg-green-100 text-green-800';
      case 'config': return 'bg-yellow-100 text-yellow-800';
      case 'api': return 'bg-purple-100 text-purple-800';
      case 'model': return 'bg-red-100 text-red-800';
      case 'schema': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const activeComponentData = generatedApp?.components?.[activeComponent];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold flex items-center justify-center gap-2">
          <Layers className="w-10 h-10 text-blue-500" />
          🚀 Full-Stack App Generator
        </h1>
        <p className="text-xl text-gray-600">
          Generate complete end-to-end applications with Frontend + Backend + Mobile + Database
        </p>
      </div>

      {/* Templates Section */}
      {!generating && !generatedApp && (
        <Card>
          <CardHeader>
            <CardTitle>📋 Quick Start Templates</CardTitle>
            <CardDescription>Choose a template to get started quickly</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => loadTemplate(template)}
                >
                  <h3 className="font-semibold mb-2">{template.name}</h3>
                  <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {template.features.slice(0, 3).map((feature) => (
                      <Badge key={feature} variant="secondary" className="text-xs">
                        {feature}
                      </Badge>
                    ))}
                    {template.features.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{template.features.length - 3}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              App Configuration
            </CardTitle>
            <CardDescription>
              Configure your full-stack application
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="appName">App Name *</Label>
                <Input
                  id="appName"
                  placeholder="My Awesome App"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  disabled={generating}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="appType">App Type</Label>
                <select 
                  value={appType} 
                  onChange={(e) => setAppType(e.target.value)}
                  disabled={generating}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="blog">Blog Platform</option>
                  <option value="ecommerce">E-commerce Store</option>
                  <option value="social">Social Network</option>
                  <option value="saas">SaaS Platform</option>
                  <option value="marketplace">Marketplace</option>
                  <option value="portfolio">Portfolio Site</option>
                  <option value="custom">Custom Application</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe your application features and functionality..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={generating}
                  rows={3}
                />
              </div>
            </div>

            {/* Tech Stack Selection */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Technology Stack</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Frontend</Label>
                  <select 
                    value={selectedStack.frontend} 
                    onChange={(e) => setSelectedStack(prev => ({ ...prev, frontend: e.target.value }))}
                    disabled={generating}
                    className="w-full p-2 border border-gray-300 rounded-md text-sm"
                  >
                    {stacks.frontend?.map((stack: Stack) => (
                      <option key={stack.id} value={stack.id}>{stack.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Backend</Label>
                  <select 
                    value={selectedStack.backend} 
                    onChange={(e) => setSelectedStack(prev => ({ ...prev, backend: e.target.value }))}
                    disabled={generating}
                    className="w-full p-2 border border-gray-300 rounded-md text-sm"
                  >
                    {stacks.backend?.map((stack: Stack) => (
                      <option key={stack.id} value={stack.id}>{stack.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Mobile</Label>
                  <select 
                    value={selectedStack.mobile} 
                    onChange={(e) => setSelectedStack(prev => ({ ...prev, mobile: e.target.value }))}
                    disabled={generating}
                    className="w-full p-2 border border-gray-300 rounded-md text-sm"
                  >
                    {stacks.mobile?.map((stack: Stack) => (
                      <option key={stack.id} value={stack.id}>{stack.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Database</Label>
                  <select 
                    value={selectedStack.database} 
                    onChange={(e) => setSelectedStack(prev => ({ ...prev, database: e.target.value }))}
                    disabled={generating}
                    className="w-full p-2 border border-gray-300 rounded-md text-sm"
                  >
                    {stacks.database?.map((stack: Stack) => (
                      <option key={stack.id} value={stack.id}>{stack.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="space-y-2">
              <Label>Features</Label>
              <div className="grid grid-cols-2 gap-2">
                {['authentication', 'api', 'real-time', 'payments', 'admin-panel', 'analytics', 'search', 'notifications'].map((feature) => (
                  <div key={feature} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={feature}
                      checked={features.includes(feature)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFeatures([...features, feature]);
                        } else {
                          setFeatures(features.filter(f => f !== feature));
                        }
                      }}
                      disabled={generating}
                      className="rounded"
                    />
                    <Label htmlFor={feature} className="text-sm capitalize">
                      {feature.replace('-', ' ')}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Advanced Options */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Advanced Options</h4>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="authentication"
                  checked={authentication}
                  onChange={(e) => setAuthentication(e.target.checked)}
                  disabled={generating}
                  className="rounded"
                />
                <Label htmlFor="authentication" className="text-sm">
                  Include Authentication System
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="realTime"
                  checked={realTimeFeatures}
                  onChange={(e) => setRealTimeFeatures(e.target.checked)}
                  disabled={generating}
                  className="rounded"
                />
                <Label htmlFor="realTime" className="text-sm">
                  Real-time Features (WebSocket)
                </Label>
              </div>
            </div>

            {/* Generate Button */}
            <Button 
              onClick={generateFullStackApp} 
              disabled={generating || !appName.trim() || !description.trim()}
              className="w-full"
              size="lg"
            >
              {generating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Generating Full-Stack App...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" />
                  Generate Complete App
                </>
              )}
            </Button>

            {/* Error Display */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-red-700">{error}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Generated Application
            </CardTitle>
            <CardDescription>
              {generatedApp ? 
                `Full-stack ${appType} app with ${Object.keys(generatedApp.components).length} components` : 
                'Your generated app will appear here'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!generatedApp && !generating && (
              <div className="text-center py-12 space-y-4">
                <Layers className="w-16 h-16 mx-auto text-gray-300" />
                <p className="text-gray-500">Configure your app and click "Generate" to start</p>
              </div>
            )}

            {generating && (
              <div className="text-center py-12 space-y-4">
                <Loader2 className="w-16 h-16 mx-auto animate-spin text-blue-500" />
                <p className="text-blue-600">Generating your full-stack application...</p>
                <p className="text-sm text-gray-500">This may take 2-3 minutes</p>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>⚡ Creating frontend with {selectedStack.frontend}</p>
                  <p>🔧 Building backend with {selectedStack.backend}</p>
                  <p>📱 Developing mobile app with {selectedStack.mobile}</p>
                  <p>🗄️ Setting up {selectedStack.database} database</p>
                  <p>🔗 Integrating all components...</p>
                </div>
              </div>
            )}

            {generatedApp && (
              <div className="space-y-6">
                {/* App Overview */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Build Time</p>
                    <p className="text-sm text-gray-600">{(generatedApp.deploymentInfo.buildTime / 1000).toFixed(1)}s</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Total Files</p>
                    <p className="text-sm text-gray-600">{generatedApp.deploymentInfo.totalFiles}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Total Size</p>
                    <p className="text-sm text-gray-600">{generatedApp.deploymentInfo.totalSize}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Components</p>
                    <p className="text-sm text-gray-600">{Object.keys(generatedApp.components).length}</p>
                  </div>
                </div>

                {/* Live Demo Links */}
                {generatedApp.liveDemo && (
                  <Card className="bg-gradient-to-br from-green-50 to-blue-50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Cloud className="w-4 h-4" />
                        🌐 Live Demo
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid grid-cols-1 gap-2">
                        <a href={generatedApp.liveDemo.frontendUrl} target="_blank" className="text-blue-600 hover:underline text-sm">
                          🌐 Frontend App →
                        </a>
                        <a href={generatedApp.liveDemo.backendUrl} target="_blank" className="text-blue-600 hover:underline text-sm">
                          🔧 API Docs →
                        </a>
                        <a href={generatedApp.liveDemo.adminPanel} target="_blank" className="text-blue-600 hover:underline text-sm">
                          ⚙️ Admin Panel →
                        </a>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Component Tabs */}
                <Tabs value={activeComponent} onValueChange={(value: any) => setActiveComponent(value)} className="w-full">
                  <TabsList className="grid grid-cols-5 w-full">
                    {Object.entries(generatedApp.components).map(([key, component]) => (
                      <TabsTrigger key={key} value={key as any} className="flex items-center gap-1 text-xs">
                        {getComponentIcon(component.type)}
                        {key}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  
                  {Object.entries(generatedApp.components).map(([key, component]) => (
                    <TabsContent key={key} value={key as any} className="space-y-4">
                      {/* Component Info */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getComponentIcon(component.type)}
                          <span className="font-medium">{component.framework}</span>
                          <Badge variant="secondary">{component.type}</Badge>
                        </div>
                        <div className="text-sm text-gray-500">
                          {component.files.length} files
                        </div>
                      </div>

                      {/* Files */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Generated Files</Label>
                        <div className="space-y-1">
                          {component.files.map((file, idx) => (
                            <div 
                              key={idx}
                              className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                                activeFileIndex === idx && activeComponent === key ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                              }`}
                              onClick={() => setActiveFileIndex(idx)}
                            >
                              <div className="flex items-center gap-2">
                                <Code className="w-4 h-4" />
                                <span className="text-sm font-mono">{file.path}</span>
                                <Badge variant="outline" className={`text-xs ${getFileTypeColor(file.type)}`}>
                                  {file.type}
                                </Badge>
                              </div>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyCodeToClipboard(file.content);
                                }}
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Code Preview */}
                      {component.files[activeFileIndex] && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-mono text-sm">{component.files[activeFileIndex].path}</h4>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => copyCodeToClipboard(component.files[activeFileIndex].content)}
                            >
                              <Copy className="w-3 h-3 mr-1" />
                              Copy
                            </Button>
                          </div>
                          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto max-h-64">
                            <pre className="text-xs">
                              <code>{component.files[activeFileIndex].content}</code>
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Build Instructions */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Build Instructions</Label>
                        <div className="bg-gray-900 text-green-400 p-3 rounded-lg text-xs font-mono space-y-1">
                          {component.buildInstructions.map((instruction, idx) => (
                            <div key={idx}>$ {instruction}</div>
                          ))}
                        </div>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>

                {/* Integration Guide */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Link className="w-4 h-4" />
                      Integration Guide
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Setup Instructions</Label>
                      <ol className="text-sm text-gray-600 space-y-1">
                        {generatedApp.integrationGuide.setupInstructions.map((instruction, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="bg-blue-100 text-blue-800 text-xs rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            {instruction}
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* API Endpoints */}
                    {generatedApp.integrationGuide.apiEndpoints.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">API Endpoints</Label>
                        <div className="space-y-1">
                          {generatedApp.integrationGuide.apiEndpoints.slice(0, 5).map((endpoint, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">{endpoint.method}</Badge>
                                <code>{endpoint.path}</code>
                              </div>
                              <div className="flex items-center gap-1">
                                {endpoint.authentication && (
                                  <Badge variant="secondary" className="text-xs">Auth</Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Success Status */}
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-green-700">
                    Full-stack application generated successfully! All components are integrated and ready for deployment.
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}