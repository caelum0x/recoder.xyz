"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink, Rocket, Check, Clock, AlertCircle } from "lucide-react";

// 🚀 ONE-CLICK DEPLOYMENT COMPONENT - CURSOR KILLER FEATURE
// Deploy generated code to multiple platforms with a single click

interface DeploymentPlatform {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  buildTime: string;
  features: string[];
  popular?: boolean;
}

const deploymentPlatforms: DeploymentPlatform[] = [
  {
    id: 'vercel',
    name: 'Vercel',
    icon: '🔗',
    color: 'from-black to-gray-800',
    description: 'Zero-config deployments with global CDN',
    buildTime: '~45s',
    features: ['Instant deployments', 'Global CDN', 'Automatic HTTPS'],
    popular: true
  },
  {
    id: 'netlify', 
    name: 'Netlify',
    icon: '🟢',
    color: 'from-teal-500 to-teal-600',
    description: 'Continuous deployment from Git',
    buildTime: '~38s',
    features: ['Forms handling', 'Split testing', 'Edge functions']
  },
  {
    id: 'railway',
    name: 'Railway',
    icon: '🚆',
    color: 'from-purple-500 to-purple-600', 
    description: 'Deploy anything, anywhere',
    buildTime: '~52s',
    features: ['Database included', 'Auto scaling', 'Simple pricing'],
    popular: true
  },
  {
    id: 'digitalocean',
    name: 'DigitalOcean',
    icon: '🌊',
    color: 'from-blue-500 to-blue-600',
    description: 'Powerful cloud platform',
    buildTime: '~63s',
    features: ['App Platform', 'Managed databases', 'Global presence']
  },
  {
    id: 'heroku',
    name: 'Heroku',
    icon: '🟣',
    color: 'from-purple-600 to-purple-700',
    description: 'Platform as a Service pioneer',
    buildTime: '~78s',
    features: ['Add-ons marketplace', 'Git integration', 'Process types']
  },
  {
    id: 'aws-amplify',
    name: 'AWS Amplify',
    icon: '☁️', 
    color: 'from-orange-500 to-orange-600',
    description: 'Full-stack AWS deployment',
    buildTime: '~89s',
    features: ['AWS integration', 'Backend APIs', 'Authentication']
  }
];

interface DeploymentStatus {
  status: 'idle' | 'deploying' | 'success' | 'error';
  platform?: string;
  url?: string;
  message?: string;
  deploymentId?: string;
}

interface OneClickDeployProps {
  projectCode: string;
  projectName?: string;
  className?: string;
}

export default function OneClickDeploy({ projectCode, projectName = "my-app", className = "" }: OneClickDeployProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('vercel');
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus>({ status: 'idle' });
  const [customProjectName, setCustomProjectName] = useState(projectName);
  const [envVars, setEnvVars] = useState('');
  const [isDeploymentOpen, setIsDeploymentOpen] = useState(false);

  const handleDeploy = async () => {
    setDeploymentStatus({ status: 'deploying', platform: selectedPlatform });
    
    try {
      // Parse environment variables from textarea
      const parsedEnvVars: Record<string, string> = {};
      envVars.split('\\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
          parsedEnvVars[key.trim()] = value.trim();
        }
      });

      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectCode,
          platform: selectedPlatform,
          projectName: customProjectName,
          envVars: parsedEnvVars
        })
      });

      const result = await response.json();

      if (result.success) {
        setDeploymentStatus({
          status: 'success',
          platform: result.platform,
          url: result.deploymentUrl,
          message: result.message,
          deploymentId: result.deploymentId
        });
      } else {
        setDeploymentStatus({
          status: 'error',
          message: result.error || 'Deployment failed'
        });
      }
    } catch (error) {
      setDeploymentStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  };

  const selectedPlatformData = deploymentPlatforms.find(p => p.id === selectedPlatform);

  if (!isDeploymentOpen) {
    return (
      <Button
        onClick={() => setIsDeploymentOpen(true)}
        className={`bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-semibold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 ${className}`}
      >
        <Rocket className="w-5 h-5 mr-2" />
        Deploy to Production
      </Button>
    );
  }

  return (
    <Card className={`w-full max-w-4xl mx-auto shadow-2xl border-2 border-blue-100 ${className}`}>
      <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b border-blue-100">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <Rocket className="w-7 h-7 text-blue-600" />
              One-Click Deployment
              <Badge variant="secondary" className="bg-green-100 text-green-800 font-bold">
                CURSOR KILLER
              </Badge>
            </CardTitle>
            <CardDescription className="text-base text-gray-700 mt-2">
              Deploy your generated application to production in seconds - no configuration required!
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            onClick={() => setIsDeploymentOpen(false)}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-8 space-y-8">
        {/* Project Configuration */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="project-name" className="text-sm font-semibold text-gray-700">
              Project Name
            </Label>
            <Input
              id="project-name"
              value={customProjectName}
              onChange={(e) => setCustomProjectName(e.target.value)}
              placeholder="my-awesome-app"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="env-vars" className="text-sm font-semibold text-gray-700">
              Environment Variables (Optional)
            </Label>
            <Textarea
              id="env-vars"
              value={envVars}
              onChange={(e) => setEnvVars(e.target.value)}
              placeholder="DATABASE_URL=...\\nAPI_KEY=...\\nNEXT_PUBLIC_APP_NAME=My App"
              rows={3}
              className="mt-1 font-mono text-sm"
            />
          </div>
        </div>

        {/* Platform Selection */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Choose Deployment Platform</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {deploymentPlatforms.map((platform) => (
              <div
                key={platform.id}
                className={`relative p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 hover:shadow-lg ${
                  selectedPlatform === platform.id
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedPlatform(platform.id)}
              >
                {platform.popular && (
                  <Badge className="absolute -top-2 -right-2 bg-gradient-to-r from-orange-400 to-pink-400 text-white font-bold text-xs">
                    POPULAR
                  </Badge>
                )}
                
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 bg-gradient-to-r ${platform.color} rounded-lg flex items-center justify-center text-white text-lg font-bold`}>
                    {platform.icon}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{platform.name}</h4>
                    <p className="text-xs text-gray-600">{platform.buildTime}</p>
                  </div>
                </div>
                
                <p className="text-sm text-gray-600 mb-3">{platform.description}</p>
                
                <div className="space-y-1">
                  {platform.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs text-gray-500">
                      <div className="w-1 h-1 bg-blue-400 rounded-full" />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Deployment Status */}
        {deploymentStatus.status !== 'idle' && (
          <div className={`p-6 rounded-xl border-2 ${
            deploymentStatus.status === 'deploying' 
              ? 'border-blue-200 bg-blue-50' 
              : deploymentStatus.status === 'success'
              ? 'border-green-200 bg-green-50'
              : 'border-red-200 bg-red-50'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              {deploymentStatus.status === 'deploying' && (
                <>
                  <Clock className="w-5 h-5 text-blue-600 animate-spin" />
                  <span className="font-semibold text-blue-900">
                    Deploying to {selectedPlatformData?.name}...
                  </span>
                </>
              )}
              {deploymentStatus.status === 'success' && (
                <>
                  <Check className="w-5 h-5 text-green-600" />
                  <span className="font-semibold text-green-900">
                    Deployment Successful!
                  </span>
                </>
              )}
              {deploymentStatus.status === 'error' && (
                <>
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <span className="font-semibold text-red-900">
                    Deployment Failed
                  </span>
                </>
              )}
            </div>
            
            {deploymentStatus.message && (
              <p className="text-sm mb-3">{deploymentStatus.message}</p>
            )}
            
            {deploymentStatus.url && (
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => window.open(deploymentStatus.url, '_blank')}
                  className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Live Site
                </Button>
                <code className="px-3 py-1 bg-gray-100 rounded text-sm font-mono text-gray-700">
                  {deploymentStatus.url}
                </code>
              </div>
            )}
          </div>
        )}

        {/* Deploy Button */}
        {deploymentStatus.status === 'idle' && (
          <Button
            onClick={handleDeploy}
            disabled={!customProjectName.trim()}
            className="w-full py-4 text-lg font-semibold bg-gradient-to-r from-green-500 via-blue-500 to-purple-500 hover:from-green-600 hover:via-blue-600 hover:to-purple-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Rocket className="w-6 h-6 mr-3" />
            Deploy to {selectedPlatformData?.name}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}