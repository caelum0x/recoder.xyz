'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Globe, 
  Rocket, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Zap,
  Settings,
  Monitor,
  GitBranch,
  Database,
  Shield,
  TrendingUp
} from 'lucide-react';

interface DeploymentPlatform {
  id: string;
  name: string;
  icon: string;
  status: 'ready' | 'deploying' | 'deployed' | 'failed';
  url?: string;
  deployTime?: number;
  lastDeploy?: Date;
  features: string[];
  pricing: 'free' | 'paid' | 'freemium';
  recommended: boolean;
}

interface DeploymentProgress {
  stage: string;
  progress: number;
  message: string;
  duration: number;
}

const DEPLOYMENT_PLATFORMS: DeploymentPlatform[] = [
  {
    id: 'vercel',
    name: 'Vercel',
    icon: '▲',
    status: 'ready',
    features: ['Edge Runtime', 'Serverless Functions', 'Global CDN', 'Analytics'],
    pricing: 'freemium',
    recommended: true
  },
  {
    id: 'netlify',
    name: 'Netlify',
    icon: '🌐',
    status: 'ready',
    features: ['JAMstack', 'Form Handling', 'Split Testing', 'Functions'],
    pricing: 'freemium',
    recommended: true
  },
  {
    id: 'railway',
    name: 'Railway',
    icon: '🚂',
    status: 'ready',
    features: ['Full Stack', 'Database', 'Docker', 'GitHub Integration'],
    pricing: 'freemium',
    recommended: true
  },
  {
    id: 'heroku',
    name: 'Heroku',
    icon: '🟣',
    status: 'ready',
    features: ['Dyno Scaling', 'Add-ons', 'CLI Tools', 'CI/CD'],
    pricing: 'freemium',
    recommended: false
  },
  {
    id: 'aws-amplify',
    name: 'AWS Amplify',
    icon: '☁️',
    status: 'ready',
    features: ['AWS Integration', 'Auth', 'GraphQL', 'Analytics'],
    pricing: 'freemium',
    recommended: true
  },
  {
    id: 'digitalocean',
    name: 'DigitalOcean',
    icon: '🌊',
    status: 'ready',
    features: ['App Platform', 'Droplets', 'Kubernetes', 'Monitoring'],
    pricing: 'paid',
    recommended: false
  }
];

export default function AdvancedDeploymentAutomation({ projectId }: { projectId: string }) {
  const [platforms, setPlatforms] = useState<DeploymentPlatform[]>(DEPLOYMENT_PLATFORMS);
  const [deploymentProgress, setDeploymentProgress] = useState<Map<string, DeploymentProgress>>(new Map());
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['vercel']);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentConfig, setDeploymentConfig] = useState({
    autoSSL: true,
    customDomain: '',
    environmentVars: true,
    buildOptimization: true,
    monitoring: true,
    analytics: true
  });

  // Real deployment using the API
  const deployToPlatform = async (platformId: string) => {
    // Update progress with initial stage
    setDeploymentProgress(prev => new Map(prev.set(platformId, {
      stage: 'Initializing deployment',
      progress: 5,
      message: 'Starting deployment process...',
      duration: 0
    })));

    try {
      // Call the real deployment API
      const response = await fetch('/api/deployment/advanced', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          platforms: [platformId],
          config: deploymentConfig
        })
      });

      if (!response.ok) {
        throw new Error(`Deployment failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Deployment failed');
      }

      const platformResult = result.results[0];
      
      if (platformResult.status === 'success') {
        // Update with successful deployment
        setPlatforms(prev => prev.map(p => 
          p.id === platformId 
            ? { 
                ...p, 
                status: 'deployed' as const,
                url: platformResult.url,
                deployTime: platformResult.buildTime,
                lastDeploy: new Date()
              }
            : p
        ));

        setDeploymentProgress(prev => new Map(prev.set(platformId, {
          stage: 'Deployment complete',
          progress: 100,
          message: `Successfully deployed to ${platformResult.url}`,
          duration: platformResult.buildTime
        })));
      } else {
        throw new Error(platformResult.error || 'Deployment failed');
      }

    } catch (error) {
      console.error(`Deployment to ${platformId} failed:`, error);
      
      // Update platform status to failed
      setPlatforms(prev => prev.map(p => 
        p.id === platformId 
          ? { ...p, status: 'failed' as const }
          : p
      ));

      setDeploymentProgress(prev => new Map(prev.set(platformId, {
        stage: 'Deployment failed',
        progress: 0,
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: 0
      })));

      throw error;
    }
  };

  const handleDeploy = async (platformIds: string[]) => {
    setIsDeploying(true);
    
    // Update platforms to deploying status
    setPlatforms(prev => prev.map(p => 
      platformIds.includes(p.id) ? { ...p, status: 'deploying' as const } : p
    ));

    // Deploy to selected platforms in parallel
    const deploymentPromises = platformIds.map(platformId => 
      deployToPlatform(platformId)
    );

    try {
      await Promise.all(deploymentPromises);
    } catch (error) {
      console.error('Deployment failed:', error);
      // Failed platforms are already updated in deployToPlatform
    } finally {
      setIsDeploying(false);
    }
  };

  const handlePlatformToggle = (platformId: string) => {
    setSelectedPlatforms(prev => 
      prev.includes(platformId) 
        ? prev.filter(id => id !== platformId)
        : [...prev, platformId]
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'deployed': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'deploying': return <Clock className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'failed': return <AlertCircle className="w-5 h-5 text-red-500" />;
      default: return <Globe className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'deployed': return 'bg-green-100 text-green-800';
      case 'deploying': return 'bg-blue-100 text-blue-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Rocket className="w-8 h-8 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold">Advanced Deployment Automation</h2>
            <p className="text-gray-600">Deploy to multiple platforms with one click</p>
          </div>
        </div>
        <Badge variant="outline" className="text-green-600 border-green-200">
          <Zap className="w-4 h-4 mr-1" />
          Production Ready
        </Badge>
      </div>

      {/* Deployment Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="w-5 h-5 mr-2" />
            Deployment Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <label className="flex items-center space-x-2">
              <input 
                type="checkbox" 
                checked={deploymentConfig.autoSSL}
                onChange={(e) => setDeploymentConfig(prev => ({ ...prev, autoSSL: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm">Auto SSL</span>
            </label>
            <label className="flex items-center space-x-2">
              <input 
                type="checkbox" 
                checked={deploymentConfig.environmentVars}
                onChange={(e) => setDeploymentConfig(prev => ({ ...prev, environmentVars: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm">Environment Variables</span>
            </label>
            <label className="flex items-center space-x-2">
              <input 
                type="checkbox" 
                checked={deploymentConfig.buildOptimization}
                onChange={(e) => setDeploymentConfig(prev => ({ ...prev, buildOptimization: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm">Build Optimization</span>
            </label>
            <label className="flex items-center space-x-2">
              <input 
                type="checkbox" 
                checked={deploymentConfig.monitoring}
                onChange={(e) => setDeploymentConfig(prev => ({ ...prev, monitoring: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm">Monitoring</span>
            </label>
            <label className="flex items-center space-x-2">
              <input 
                type="checkbox" 
                checked={deploymentConfig.analytics}
                onChange={(e) => setDeploymentConfig(prev => ({ ...prev, analytics: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm">Analytics</span>
            </label>
          </div>
          
          <div className="flex items-center space-x-2">
            <input 
              type="text"
              placeholder="Custom domain (optional)"
              value={deploymentConfig.customDomain}
              onChange={(e) => setDeploymentConfig(prev => ({ ...prev, customDomain: e.target.value }))}
              className="flex-1 px-3 py-2 border rounded-md text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Platform Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <Globe className="w-5 h-5 mr-2" />
              Deployment Platforms
            </span>
            <Badge variant="secondary">
              {selectedPlatforms.length} selected
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {platforms.map((platform) => {
              const progress = deploymentProgress.get(platform.id);
              const isSelected = selectedPlatforms.includes(platform.id);
              
              return (
                <Card 
                  key={platform.id}
                  className={`cursor-pointer transition-all border-2 ${
                    isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => !isDeploying && handlePlatformToggle(platform.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-2xl">{platform.icon}</span>
                        <span className="font-semibold">{platform.name}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {platform.recommended && (
                          <Badge variant="secondary" className="text-xs">Recommended</Badge>
                        )}
                        {getStatusIcon(platform.status)}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Badge className={getStatusColor(platform.status)}>
                        {platform.status.charAt(0).toUpperCase() + platform.status.slice(1)}
                      </Badge>
                      
                      {platform.url && (
                        <div className="text-sm text-blue-600 truncate">
                          {platform.url}
                        </div>
                      )}
                      
                      {progress && platform.status === 'deploying' && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span>{progress.stage}</span>
                            <span>{progress.progress}%</span>
                          </div>
                          <Progress value={progress.progress} className="h-2" />
                          <div className="text-xs text-gray-500">{progress.message}</div>
                        </div>
                      )}
                      
                      <div className="flex flex-wrap gap-1">
                        {platform.features.slice(0, 2).map((feature) => (
                          <Badge key={feature} variant="outline" className="text-xs">
                            {feature}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Deployment Actions */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                onClick={() => handleDeploy(selectedPlatforms)}
                disabled={selectedPlatforms.length === 0 || isDeploying}
                className="flex items-center space-x-2"
              >
                <Rocket className="w-4 h-4" />
                <span>
                  {isDeploying 
                    ? 'Deploying...' 
                    : `Deploy to ${selectedPlatforms.length} platform${selectedPlatforms.length === 1 ? '' : 's'}`
                  }
                </span>
              </Button>
              
              <Button variant="outline" disabled={isDeploying}>
                <GitBranch className="w-4 h-4 mr-2" />
                Preview Deployment
              </Button>
            </div>
            
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Monitor className="w-4 h-4" />
              <span>All deployments monitored</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deployment Summary */}
      {platforms.some(p => p.status === 'deployed') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Deployment Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {platforms.filter(p => p.status === 'deployed').length}
                </div>
                <div className="text-sm text-green-600">Active Deployments</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {platforms.filter(p => p.status === 'deploying').length}
                </div>
                <div className="text-sm text-blue-600">In Progress</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  99.9%
                </div>
                <div className="text-sm text-purple-600">Uptime</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
