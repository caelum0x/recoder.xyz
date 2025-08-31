'use client';

import React, { useState, useEffect } from 'react';
import { 
  Rocket, Cloud, Globe, Settings, Activity, CheckCircle, 
  AlertCircle, Clock, Zap, Database, Code, Terminal,
  Upload, Download, RefreshCw, Eye, ExternalLink, Copy,
  Shield, Lock, Key, Users, BarChart3, TrendingUp,
  Server, HardDrive, Cpu, MemoryStick, Wifi, Monitor,
  Package, Layers, GitBranch, Play, Pause, Square,
  ArrowRight, Plus, Trash2, Edit, MoreHorizontal
} from 'lucide-react';

export default function DeploymentPage() {
  const [selectedPlatform, setSelectedPlatform] = useState('vercel');
  const [deploymentStatus, setDeploymentStatus] = useState('idle');
  const [buildLogs, setBuildLogs] = useState([]);
  const [environmentVars, setEnvironmentVars] = useState([
    { key: 'NODE_ENV', value: 'production', hidden: false },
    { key: 'DATABASE_URL', value: '***', hidden: true },
    { key: 'API_KEY', value: '***', hidden: true }
  ]);

  const platforms = [
    {
      id: 'vercel',
      name: 'Vercel',
      icon: '▲',
      description: 'Deploy to Vercel with zero configuration',
      features: ['Automatic HTTPS', 'Global CDN', 'Serverless Functions', 'Preview Deployments'],
      pricing: 'Free for hobby projects',
      deployTime: '30s',
      status: 'connected'
    },
    {
      id: 'netlify',
      name: 'Netlify',
      icon: '🌊',
      description: 'Build, deploy, and manage modern web projects',
      features: ['Continuous Deployment', 'Form Handling', 'Split Testing', 'Edge Functions'],
      pricing: 'Free tier available',
      deployTime: '45s',
      status: 'available'
    },
    {
      id: 'railway',
      name: 'Railway',
      icon: '🚂',
      description: 'Deploy full-stack applications with ease',
      features: ['Database Hosting', 'Environment Variables', 'Custom Domains', 'Auto-scaling'],
      pricing: '$5/month after trial',
      deployTime: '2m',
      status: 'available'
    },
    {
      id: 'aws',
      name: 'AWS Amplify',
      icon: '☁️',
      description: 'Deploy on Amazon Web Services infrastructure',
      features: ['Global CDN', 'Auto Scaling', 'Monitoring', 'Custom Build Settings'],
      pricing: 'Pay as you use',
      deployTime: '3m',
      status: 'setup-required'
    },
    {
      id: 'docker',
      name: 'Docker Container',
      icon: '🐳',
      description: 'Containerized deployment for any platform',
      features: ['Portable', 'Scalable', 'Consistent Environment', 'Multi-stage Builds'],
      pricing: 'Depends on hosting',
      deployTime: '1m',
      status: 'available'
    },
    {
      id: 'github',
      name: 'GitHub Pages',
      icon: '🐙',
      description: 'Static site hosting directly from GitHub',
      features: ['Free Hosting', 'Custom Domains', 'HTTPS', 'Jekyll Support'],
      pricing: 'Free',
      deployTime: '1m',
      status: 'available'
    }
  ];

  const deploymentHistory = [
    {
      id: 'dep-001',
      branch: 'main',
      commit: 'feat: add new landing page',
      status: 'success',
      platform: 'vercel',
      deployedAt: '2 minutes ago',
      duration: '28s',
      url: 'https://myapp-abc123.vercel.app'
    },
    {
      id: 'dep-002',
      branch: 'develop',
      commit: 'fix: update API endpoints',
      status: 'success',
      platform: 'vercel',
      deployedAt: '1 hour ago',
      duration: '32s',
      url: 'https://myapp-dev-xyz789.vercel.app'
    },
    {
      id: 'dep-003',
      branch: 'feature/auth',
      commit: 'wip: authentication system',
      status: 'failed',
      platform: 'vercel',
      deployedAt: '3 hours ago',
      duration: '45s',
      url: null
    }
  ];

  const buildSteps = [
    { name: 'Initialize Build', status: 'completed', duration: '2s' },
    { name: 'Install Dependencies', status: 'completed', duration: '15s' },
    { name: 'Run Build Script', status: 'running', duration: '8s' },
    { name: 'Optimize Assets', status: 'pending', duration: null },
    { name: 'Deploy to CDN', status: 'pending', duration: null }
  ];

  const metrics = {
    totalDeployments: 47,
    successRate: 94.7,
    avgBuildTime: '32s',
    lastDeployment: '2 minutes ago',
    activeEnvironments: 3,
    bandwidth: '2.4 GB',
    requests: '15.2K',
    uptime: '99.9%'
  };

  const handleDeploy = () => {
    setDeploymentStatus('deploying');
    // Simulate deployment process
    setTimeout(() => {
      setDeploymentStatus('success');
    }, 3000);
  };

  const handleRollback = (deploymentId) => {
    console.log('Rolling back to deployment:', deploymentId);
  };

  const selectedPlatformData = platforms.find(p => p.id === selectedPlatform);

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-400 mb-2">Deployment Center</h1>
            <p className="text-slate-400">Deploy your applications to any platform with one click</p>
          </div>
          
          <div className="flex items-center space-x-4">
            <button 
              onClick={handleDeploy}
              disabled={deploymentStatus === 'deploying'}
              className={`px-6 py-3 rounded-lg font-medium flex items-center space-x-2 ${
                deploymentStatus === 'deploying' 
                  ? 'bg-yellow-600 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
              }`}
            >
              {deploymentStatus === 'deploying' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Deploying...</span>
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" />
                  <span>Deploy Now</span>
                </>
              )}
            </button>
            
            <button className="px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Platform Selection */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800 rounded-xl p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">Deployment Platforms</h2>
              <div className="space-y-3">
                {platforms.map((platform) => (
                  <div 
                    key={platform.id}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                      selectedPlatform === platform.id 
                        ? 'border-blue-500 bg-blue-500/10' 
                        : 'border-slate-600 hover:border-slate-500'
                    }`}
                    onClick={() => setSelectedPlatform(platform.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl">{platform.icon}</span>
                        <div>
                          <h3 className="font-medium">{platform.name}</h3>
                          <p className="text-xs text-slate-400">{platform.deployTime} deploy</p>
                        </div>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${
                        platform.status === 'connected' ? 'bg-green-400' :
                        platform.status === 'available' ? 'bg-yellow-400' : 'bg-red-400'
                      }`} />
                    </div>
                    <p className="text-sm text-slate-300 mb-2">{platform.description}</p>
                    <div className="text-xs text-slate-400">{platform.pricing}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="bg-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4">Quick Stats</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400">{metrics.totalDeployments}</div>
                  <div className="text-xs text-slate-400">Total Deployments</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">{metrics.successRate}%</div>
                  <div className="text-xs text-slate-400">Success Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-400">{metrics.avgBuildTime}</div>
                  <div className="text-xs text-slate-400">Avg Build Time</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-400">{metrics.uptime}</div>
                  <div className="text-xs text-slate-400">Uptime</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Platform Details & Deployment */}
          <div className="lg:col-span-2">
            {/* Platform Details */}
            <div className="bg-slate-800 rounded-xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <span className="text-3xl">{selectedPlatformData?.icon}</span>
                  <div>
                    <h2 className="text-xl font-bold">{selectedPlatformData?.name}</h2>
                    <p className="text-slate-400">{selectedPlatformData?.description}</p>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                  selectedPlatformData?.status === 'connected' ? 'bg-green-900/50 text-green-400' :
                  selectedPlatformData?.status === 'available' ? 'bg-yellow-900/50 text-yellow-400' :
                  'bg-red-900/50 text-red-400'
                }`}>
                  {selectedPlatformData?.status.replace('-', ' ')}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-2">Features</h4>
                  <ul className="space-y-1">
                    {selectedPlatformData?.features.map((feature, index) => (
                      <li key={index} className="flex items-center text-sm text-slate-300">
                        <CheckCircle className="w-4 h-4 text-green-400 mr-2 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">Configuration</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Deploy Time:</span>
                      <span>{selectedPlatformData?.deployTime}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Pricing:</span>
                      <span>{selectedPlatformData?.pricing}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Auto Deploy:</span>
                      <span className="text-green-400">Enabled</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Build Status */}
            {deploymentStatus === 'deploying' && (
              <div className="bg-slate-800 rounded-xl p-6 mb-6">
                <h3 className="text-lg font-bold mb-4">Build Progress</h3>
                <div className="space-y-3">
                  {buildSteps.map((step, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {step.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-400" />}
                        {step.status === 'running' && <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />}
                        {step.status === 'pending' && <Clock className="w-5 h-5 text-slate-500" />}
                        <span className={
                          step.status === 'completed' ? 'text-white' :
                          step.status === 'running' ? 'text-blue-400' : 'text-slate-500'
                        }>
                          {step.name}
                        </span>
                      </div>
                      {step.duration && (
                        <span className="text-sm text-slate-400">{step.duration}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Environment Variables */}
            <div className="bg-slate-800 rounded-xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Environment Variables</h3>
                <button className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm">
                  <Plus className="w-4 h-4 inline mr-1" />
                  Add Variable
                </button>
              </div>
              
              <div className="space-y-2">
                {environmentVars.map((envVar, index) => (
                  <div key={index} className="flex items-center justify-between bg-slate-700/50 rounded p-3">
                    <div className="flex items-center space-x-4 flex-1">
                      <code className="text-blue-400 font-mono text-sm">{envVar.key}</code>
                      <span className="text-slate-400">=</span>
                      <code className="text-green-400 font-mono text-sm">
                        {envVar.hidden ? '••••••••' : envVar.value}
                      </code>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button className="text-slate-400 hover:text-white">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button className="text-slate-400 hover:text-white">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="text-slate-400 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Deployment History */}
            <div className="bg-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4">Deployment History</h3>
              <div className="space-y-3">
                {deploymentHistory.map((deployment) => (
                  <div key={deployment.id} className="flex items-center justify-between bg-slate-700/50 rounded p-4">
                    <div className="flex items-center space-x-4">
                      <div className={`w-3 h-3 rounded-full ${
                        deployment.status === 'success' ? 'bg-green-400' :
                        deployment.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'
                      }`} />
                      
                      <div>
                        <div className="flex items-center space-x-2">
                          <GitBranch className="w-4 h-4 text-slate-400" />
                          <span className="font-medium">{deployment.branch}</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-sm text-slate-400">{deployment.commit}</span>
                        </div>
                        <div className="flex items-center space-x-4 text-xs text-slate-500 mt-1">
                          <span>{deployment.deployedAt}</span>
                          <span>{deployment.duration}</span>
                          <span>{deployment.platform}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {deployment.url && (
                        <button 
                          onClick={() => window.open(deployment.url, '_blank')}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                        >
                          Visit
                        </button>
                      )}
                      
                      {deployment.status === 'success' && (
                        <button 
                          onClick={() => handleRollback(deployment.id)}
                          className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm"
                        >
                          Rollback
                        </button>
                      )}
                      
                      <button className="text-slate-400 hover:text-white">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
