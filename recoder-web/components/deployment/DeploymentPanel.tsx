'use client';

import React, { useState, useEffect } from 'react';
import { 
  Rocket, Globe, Server, Cloud, Settings, 
  Play, Square, RefreshCw, ExternalLink, Copy,
  CheckCircle, XCircle, Clock, AlertTriangle,
  Monitor, Smartphone, Tablet, Eye, Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useDeployment } from '@/hooks/use-deployment';

interface DeploymentPanelProps {
  projectId: string;
  onDeploymentStart?: () => void;
  onDeploymentComplete?: (url: string) => void;
}

interface DeploymentTarget {
  id: string;
  name: string;
  provider: 'vercel' | 'netlify' | 'aws' | 'railway' | 'render' | 'custom';
  icon: React.ReactNode;
  status: 'connected' | 'disconnected' | 'error';
  lastDeployed?: string;
  url?: string;
}

const deploymentTargets: DeploymentTarget[] = [
  {
    id: 'vercel',
    name: 'Vercel',
    provider: 'vercel',
    icon: <Globe className="w-4 h-4" />,
    status: 'connected',
    lastDeployed: '2 hours ago',
    url: 'https://my-project.vercel.app'
  },
  {
    id: 'netlify',
    name: 'Netlify',
    provider: 'netlify',
    icon: <Cloud className="w-4 h-4" />,
    status: 'connected',
    lastDeployed: '1 day ago',
    url: 'https://my-project.netlify.app'
  },
  {
    id: 'railway',
    name: 'Railway',
    provider: 'railway',
    icon: <Server className="w-4 h-4" />,
    status: 'disconnected'
  }
];

export default function DeploymentPanel({ projectId, onDeploymentStart, onDeploymentComplete }: DeploymentPanelProps) {
  const [selectedTarget, setSelectedTarget] = useState<string>('vercel');
  const [deploymentSettings, setDeploymentSettings] = useState({
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
    installCommand: 'npm install',
    environmentVariables: '',
    nodeVersion: '18.x'
  });
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentProgress, setDeploymentProgress] = useState(0);
  const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);
  const [deploymentStatus, setDeploymentStatus] = useState<'idle' | 'building' | 'deploying' | 'success' | 'error'>('idle');

  const { 
    deploymentStatus: hookDeploymentStatus, 
    startDeployment, 
    resetDeployment, 
    getDeploymentUrl, 
    isDeploying: hookIsDeploying,
    isDeployed,
    hasFailed
  } = useDeployment(projectId);

  // Handle deployment process
  const handleDeploy = async () => {
    if (isDeploying) return;

    setIsDeploying(true);
    setDeploymentProgress(0);
    setDeploymentLogs([]);
    setDeploymentStatus('building');
    onDeploymentStart?.();

    try {
      // Simulate deployment progress
      const progressSteps = [
        { message: 'Preparing deployment...', progress: 10 },
        { message: 'Installing dependencies...', progress: 30 },
        { message: 'Building project...', progress: 60 },
        { message: 'Deploying to ' + selectedTarget + '...', progress: 80 },
        { message: 'Finalizing deployment...', progress: 95 },
        { message: 'Deployment complete!', progress: 100 }
      ];

      for (const step of progressSteps) {
        setDeploymentLogs(prev => [...prev, step.message]);
        setDeploymentProgress(step.progress);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Call actual deployment API
      await startDeployment(selectedTarget, deploymentSettings);

      // Check if deployment was successful
      if (isDeployed) {
        setDeploymentStatus('success');
        const deploymentUrl = getDeploymentUrl(selectedTarget);
        onDeploymentComplete?.(deploymentUrl);
      } else if (hasFailed) {
        throw new Error('Deployment failed');
      }

    } catch (error) {
      console.error('Deployment error:', error);
      setDeploymentStatus('error');
      setDeploymentLogs(prev => [...prev, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`]);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleCancelDeployment = async () => {
    try {
      resetDeployment();
      setIsDeploying(false);
      setDeploymentStatus('idle');
      setDeploymentLogs(prev => [...prev, 'Deployment cancelled']);
    } catch (error) {
      console.error('Failed to cancel deployment:', error);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  const openPreview = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Rocket className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold">Deployment</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <Tabs defaultValue="deploy" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="deploy">Deploy</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="deploy" className="space-y-4">
            {/* Deployment Targets */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Deployment Target</CardTitle>
                <CardDescription>Choose where to deploy your project</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {deploymentTargets.map((target) => (
                    <div
                      key={target.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedTarget === target.id 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedTarget(target.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {target.icon}
                          <div>
                            <p className="font-medium">{target.name}</p>
                            {target.lastDeployed && (
                              <p className="text-xs text-gray-500">Last deployed {target.lastDeployed}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={target.status === 'connected' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {target.status}
                          </Badge>
                          {target.url && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                openPreview(target.url!);
                              }}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Deployment Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Deploy Project</CardTitle>
                <CardDescription>Deploy your current project to {selectedTarget}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {deploymentStatus !== 'idle' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {deploymentStatus === 'building' && 'Building...'}
                          {deploymentStatus === 'deploying' && 'Deploying...'}
                          {deploymentStatus === 'success' && 'Deployed Successfully!'}
                          {deploymentStatus === 'error' && 'Deployment Failed'}
                        </span>
                        <span className="text-sm text-gray-500">{deploymentProgress}%</span>
                      </div>
                      <Progress value={deploymentProgress} className="w-full" />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={handleDeploy}
                      disabled={isDeploying}
                      className="flex-1"
                    >
                      {isDeploying ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Deploying...
                        </>
                      ) : (
                        <>
                          <Rocket className="w-4 h-4 mr-2" />
                          Deploy Now
                        </>
                      )}
                    </Button>
                    {isDeploying && (
                      <Button
                        variant="outline"
                        onClick={handleCancelDeployment}
                      >
                        <Square className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Deployment Logs */}
            {deploymentLogs.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Deployment Logs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-900 text-gray-100 p-3 rounded-lg font-mono text-xs max-h-48 overflow-y-auto">
                    {deploymentLogs.map((log, index) => (
                      <div key={index} className="mb-1">
                        <span className="text-gray-400">[{new Date().toLocaleTimeString()}]</span> {log}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Build Settings</CardTitle>
                <CardDescription>Configure how your project is built and deployed</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="buildCommand">Build Command</Label>
                  <Input
                    id="buildCommand"
                    value={deploymentSettings.buildCommand}
                    onChange={(e) => setDeploymentSettings(prev => ({
                      ...prev,
                      buildCommand: e.target.value
                    }))}
                    placeholder="npm run build"
                  />
                </div>
                <div>
                  <Label htmlFor="outputDir">Output Directory</Label>
                  <Input
                    id="outputDir"
                    value={deploymentSettings.outputDirectory}
                    onChange={(e) => setDeploymentSettings(prev => ({
                      ...prev,
                      outputDirectory: e.target.value
                    }))}
                    placeholder="dist"
                  />
                </div>
                <div>
                  <Label htmlFor="installCommand">Install Command</Label>
                  <Input
                    id="installCommand"
                    value={deploymentSettings.installCommand}
                    onChange={(e) => setDeploymentSettings(prev => ({
                      ...prev,
                      installCommand: e.target.value
                    }))}
                    placeholder="npm install"
                  />
                </div>
                <div>
                  <Label htmlFor="nodeVersion">Node.js Version</Label>
                  <Select 
                    value={deploymentSettings.nodeVersion}
                    onValueChange={(value) => setDeploymentSettings(prev => ({
                      ...prev,
                      nodeVersion: value
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="16.x">Node.js 16.x</SelectItem>
                      <SelectItem value="18.x">Node.js 18.x</SelectItem>
                      <SelectItem value="20.x">Node.js 20.x</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="envVars">Environment Variables</Label>
                  <Textarea
                    id="envVars"
                    value={deploymentSettings.environmentVariables}
                    onChange={(e) => setDeploymentSettings(prev => ({
                      ...prev,
                      environmentVariables: e.target.value
                    }))}
                    placeholder="KEY=value&#10;ANOTHER_KEY=another_value"
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Deployment History</CardTitle>
                <CardDescription>View your recent deployments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { id: '1', status: 'success', target: 'Vercel', time: '2 hours ago', url: 'https://my-project.vercel.app' },
                    { id: '2', status: 'success', target: 'Netlify', time: '1 day ago', url: 'https://my-project.netlify.app' },
                    { id: '3', status: 'error', target: 'Railway', time: '2 days ago', error: 'Build failed' }
                  ].map((deployment) => (
                    <div key={deployment.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {deployment.status === 'success' ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <div>
                          <p className="font-medium text-sm">{deployment.target}</p>
                          <p className="text-xs text-gray-500">{deployment.time}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {deployment.url && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyUrl(deployment.url!)}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openPreview(deployment.url!)}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
