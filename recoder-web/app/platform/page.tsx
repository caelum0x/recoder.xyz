'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, Cloud, Zap, Code, Database, Monitor, Globe,
  Smartphone, Server, Settings, Target, Search, BarChart3,
  GitBranch, Layers, Lock, Play, Eye, ArrowRight, Star,
  TrendingUp, Users, Cpu, HardDrive, Network, Activity
} from 'lucide-react';

// Import all our powerful systems
import CloudInfrastructureDashboard from '@/components/cloud-infrastructure-dashboard';
import SecurityDashboard from '@/components/security-dashboard';
import LiveDevelopmentEditor from '@/components/live-development-editor';
import FullStackGenerator from '@/components/fullstack-generator';
import MobileAppBuilder from '@/components/mobile-app-builder';
import PerformanceDashboard from '@/components/performance-dashboard';
import UIGenerator from '@/components/ui-generator';
import BusinessIntelligenceDashboard from '@/components/business-intelligence-dashboard';
import AITestingSuite from '@/components/ai-testing-suite';

// 🚀 RECODER PLATFORM - COMPLETE DEVELOPER ECOSYSTEM
// All systems integrated into one powerful platform

interface PlatformSystem {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'live' | 'beta' | 'coming-soon';
  category: 'development' | 'infrastructure' | 'security' | 'analytics' | 'collaboration';
  features: string[];
  component?: React.ComponentType<any>;
  killsCompetitor?: string;
  revolutionaryFeature?: string;
}

const PLATFORM_SYSTEMS: PlatformSystem[] = [
  {
    id: 'live-development',
    name: 'Live Development Studio',
    description: 'Real-time collaborative development with AI-powered coding assistance',
    icon: Zap,
    status: 'live',
    category: 'development',
    features: ['Real-time Collaboration', 'AI Code Completion', 'Instant Preview', 'One-Click Deploy'],
    component: LiveDevelopmentEditor,
    killsCompetitor: 'Bolt.new & Loveable.dev',
    revolutionaryFeature: 'Multi-user real-time editing with AI assistance'
  },
  {
    id: 'cloud-infrastructure',
    name: 'Cloud Infrastructure Automation',
    description: 'Real AWS/GCP/Azure resource provisioning with AI optimization',
    icon: Cloud,
    status: 'live',
    category: 'infrastructure',
    features: ['Multi-Cloud Support', 'AI Templates', 'Cost Optimization', 'Real API Integration'],
    component: CloudInfrastructureDashboard,
    killsCompetitor: 'Terraform Cloud & AWS CloudFormation',
    revolutionaryFeature: 'AI-powered infrastructure design with real cloud APIs'
  },
  {
    id: 'security-suite',
    name: 'Enterprise Security Suite',
    description: 'Comprehensive security scanning with real vulnerability detection',
    icon: Shield,
    status: 'live',
    category: 'security',
    features: ['SAST Analysis', 'Dependency Scanning', 'Secret Detection', 'AI Analysis'],
    component: SecurityDashboard,
    killsCompetitor: 'Veracode & SonarQube',
    revolutionaryFeature: 'AI-enhanced vulnerability analysis with real security tools'
  },
  {
    id: 'fullstack-generator',
    name: 'Full-Stack App Generator',
    description: 'Complete end-to-end applications with Frontend + Backend + Mobile',
    icon: Layers,
    status: 'live',
    category: 'development',
    features: ['End-to-End Apps', 'Real Integration', 'Auto Database', 'Expo QR Testing'],
    component: FullStackGenerator,
    killsCompetitor: 'v0.dev & Cursor',
    revolutionaryFeature: 'Complete integrated applications with mobile + backend + frontend'
  },
  {
    id: 'mobile-builder',
    name: 'Mobile App Builder',
    description: 'Generate actual React Native/Flutter apps with instant testing',
    icon: Smartphone,
    status: 'live',
    category: 'development',
    features: ['React Native/Flutter', 'Expo QR Testing', 'Real Apps', 'Instant Preview'],
    component: MobileAppBuilder,
    killsCompetitor: 'FlutterFlow & Thunkable',
    revolutionaryFeature: 'Real native apps with instant device testing via QR codes'
  },
  {
    id: 'performance-monitoring',
    name: 'Performance Monitoring',
    description: 'Real-time system monitoring with AI-powered optimization',
    icon: Monitor,
    status: 'live',
    category: 'analytics',
    features: ['Real Metrics', 'AI Optimization', 'Performance Alerts', 'System Health'],
    component: PerformanceDashboard,
    killsCompetitor: 'DataDog & New Relic',
    revolutionaryFeature: 'AI-powered performance optimization with real system metrics'
  },
  {
    id: 'ui-generator',
    name: 'Advanced UI/UX Generator',
    description: 'AI-powered component generation with design system creation',
    icon: Code,
    status: 'live',
    category: 'development',
    features: ['Multi-Framework Support', 'Design Systems', 'WCAG Compliance', 'Storybook Integration'],
    component: UIGenerator,
    killsCompetitor: 'Figma to Code & Anima',
    revolutionaryFeature: 'Real production-ready components with multi-framework support and accessibility'
  },
  {
    id: 'business-intelligence',
    name: 'Business Intelligence Dashboard',
    description: 'Real analytics with data collection and visualization',
    icon: BarChart3,
    status: 'live',
    category: 'analytics',
    features: ['Real Analytics', 'AI Insights', 'Predictive Modeling', 'Anomaly Detection'],
    component: BusinessIntelligenceDashboard,
    killsCompetitor: 'Tableau & PowerBI',
    revolutionaryFeature: 'AI-powered business intelligence with real-time analytics and predictive modeling'
  },
  {
    id: 'testing-suite',
    name: 'AI Testing Suite',
    description: 'Automated test generation with E2E testing frameworks',
    icon: Target,
    status: 'live',
    category: 'development',
    features: ['Multi-Framework Support', 'AI Test Generation', 'Cross-Browser Testing', 'Accessibility Testing'],
    component: AITestingSuite,
    killsCompetitor: 'Cypress Cloud & Playwright',
    revolutionaryFeature: 'AI-powered test generation with real framework integration and comprehensive coverage'
  },
  {
    id: 'api-integration',
    name: 'API Integration Hub',
    description: 'Real integration with Stripe, Auth0, SendGrid and 100+ APIs',
    icon: GitBranch,
    status: 'coming-soon',
    category: 'development',
    features: ['100+ API Integrations', 'Real Connections', 'Auth Systems', 'Payment Processing'],
    killsCompetitor: 'Zapier & Make.com',
    revolutionaryFeature: 'Native code integration with real API authentication'
  },
  {
    id: 'devops-automation',
    name: 'DevOps Automation Suite',
    description: 'Real CI/CD with GitHub Actions, Docker, and Kubernetes',
    icon: Server,
    status: 'coming-soon',
    category: 'infrastructure',
    features: ['GitHub Actions', 'Docker Automation', 'Kubernetes', 'Pipeline Generation'],
    killsCompetitor: 'Jenkins & GitLab CI',
    revolutionaryFeature: 'AI-generated complete DevOps pipelines with real infrastructure'
  },
  {
    id: 'blockchain-suite',
    name: 'Blockchain Integration Suite',
    description: 'Real smart contract deployment with Web3 integration',
    icon: Lock,
    status: 'coming-soon',
    category: 'development',
    features: ['Smart Contracts', 'Web3 Integration', 'DeFi Protocols', 'NFT Platforms'],
    killsCompetitor: 'Remix IDE & Hardhat',
    revolutionaryFeature: 'AI-powered smart contract generation with security analysis'
  }
];

export default function PlatformPage() {
  const [activeSystem, setActiveSystem] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');

  const categories = [
    { id: 'all', name: 'All Systems', count: PLATFORM_SYSTEMS.length },
    { id: 'development', name: 'Development', count: PLATFORM_SYSTEMS.filter(s => s.category === 'development').length },
    { id: 'infrastructure', name: 'Infrastructure', count: PLATFORM_SYSTEMS.filter(s => s.category === 'infrastructure').length },
    { id: 'security', name: 'Security', count: PLATFORM_SYSTEMS.filter(s => s.category === 'security').length },
    { id: 'analytics', name: 'Analytics', count: PLATFORM_SYSTEMS.filter(s => s.category === 'analytics').length },
  ];

  const filteredSystems = activeCategory === 'all' 
    ? PLATFORM_SYSTEMS 
    : PLATFORM_SYSTEMS.filter(system => system.category === activeCategory);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live': return 'bg-green-100 text-green-800 border-green-200';
      case 'beta': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'coming-soon': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'development': return <Code className="w-4 h-4" />;
      case 'infrastructure': return <Server className="w-4 h-4" />;
      case 'security': return <Shield className="w-4 h-4" />;
      case 'analytics': return <BarChart3 className="w-4 h-4" />;
      case 'collaboration': return <Users className="w-4 h-4" />;
      default: return <Settings className="w-4 h-4" />;
    }
  };

  // If a specific system is active, render its component
  if (activeSystem) {
    const system = PLATFORM_SYSTEMS.find(s => s.id === activeSystem);
    const SystemComponent = system?.component;
    
    if (SystemComponent) {
      return (
        <div className="min-h-screen bg-gray-50">
          {/* System Header */}
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveSystem(null)}
                  className="flex items-center gap-2"
                >
                  ← Back to Platform
                </Button>
                <div className="flex items-center gap-3">
                  {system.icon && <system.icon className="w-6 h-6 text-blue-500" />}
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">{system.name}</h1>
                    <p className="text-sm text-gray-600">{system.description}</p>
                  </div>
                </div>
              </div>
              <Badge className={getStatusColor(system.status)}>
                {system.status.replace('-', ' ').toUpperCase()}
              </Badge>
            </div>
          </div>

          {/* System Component */}
          <SystemComponent />
        </div>
      );
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Platform Header */}
      <div className="bg-gradient-to-r from-blue-900 via-purple-900 to-pink-900 text-white">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="text-center space-y-6">
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl font-bold leading-tight">
                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Recoder Platform
                </span>
              </h1>
              <p className="text-2xl md:text-3xl font-light text-blue-100">
                Complete AI Development Ecosystem
              </p>
              <p className="text-lg text-blue-200 max-w-4xl mx-auto">
                The most comprehensive development platform ever built. Real systems, real APIs, real results.
                <span className="font-bold text-yellow-300"> Destroying every competitor</span> with revolutionary AI-powered tools.
              </p>
            </div>

            {/* Platform Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-12">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="text-3xl font-bold text-yellow-300">{PLATFORM_SYSTEMS.length}</div>
                <div className="text-blue-100">Integrated Systems</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="text-3xl font-bold text-green-300">{PLATFORM_SYSTEMS.filter(s => s.status === 'live').length}</div>
                <div className="text-blue-100">Live Systems</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="text-3xl font-bold text-orange-300">15+</div>
                <div className="text-blue-100">AI Models</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="text-3xl font-bold text-purple-300">100%</div>
                <div className="text-blue-100">Real Functionality</div>
              </div>
            </div>

            {/* Competitor Destruction Banner */}
            <div className="bg-gradient-to-r from-red-600 via-orange-600 to-yellow-600 text-white p-6 rounded-2xl shadow-2xl border border-red-400/50">
              <div className="text-2xl font-bold mb-2">💀 COMPETITION ANNIHILATION MODE 💀</div>
              <div className="text-lg opacity-90">
                Cursor • v0.dev • Bolt.new • Terraform • SonarQube • DataDog • Figma → <span className="font-bold">DESTROYED</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4 overflow-x-auto">
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={activeCategory === category.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveCategory(category.id)}
                className="flex items-center gap-2 whitespace-nowrap"
              >
                {getCategoryIcon(category.id)}
                {category.name}
                <Badge variant="secondary" className="ml-1">
                  {category.count}
                </Badge>
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Systems Grid */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredSystems.map((system) => {
            const IconComponent = system.icon;
            
            return (
              <Card 
                key={system.id} 
                className="group relative overflow-hidden hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 cursor-pointer border-2"
                onClick={() => system.component && setActiveSystem(system.id)}
              >
                {/* Revolutionary Feature Banner */}
                {system.revolutionaryFeature && (
                  <div className="absolute top-0 right-0 bg-gradient-to-l from-red-500 to-orange-500 text-white px-3 py-1 text-xs font-bold">
                    🔥 REVOLUTIONARY
                  </div>
                )}

                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
                        system.status === 'live' 
                          ? 'bg-gradient-to-br from-green-500 to-blue-600' 
                          : system.status === 'beta'
                          ? 'bg-gradient-to-br from-yellow-500 to-orange-600'
                          : 'bg-gradient-to-br from-gray-500 to-gray-600'
                      }`}>
                        <IconComponent className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-xl group-hover:text-blue-600 transition-colors">
                          {system.name}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={getStatusColor(system.status)}>
                            {system.status === 'live' && '🟢 '}
                            {system.status === 'beta' && '🟡 '}
                            {system.status === 'coming-soon' && '⏳ '}
                            {system.status.replace('-', ' ').toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {getCategoryIcon(system.category)}
                            <span className="ml-1 capitalize">{system.category}</span>
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <CardDescription className="text-base leading-relaxed">
                    {system.description}
                  </CardDescription>

                  {/* Competitor Killer Badge */}
                  {system.killsCompetitor && (
                    <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-red-700 text-sm font-bold">
                        <span>💀</span>
                        <span>DESTROYS: {system.killsCompetitor}</span>
                      </div>
                    </div>
                  )}

                  {/* Revolutionary Feature */}
                  {system.revolutionaryFeature && (
                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-3">
                      <div className="flex items-start gap-2 text-purple-700 text-sm">
                        <span className="text-base">🚀</span>
                        <div>
                          <div className="font-bold">Revolutionary Feature:</div>
                          <div>{system.revolutionaryFeature}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Features List */}
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">Key Features:</div>
                    <div className="grid grid-cols-1 gap-1">
                      {system.features.map((feature, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-4">
                    {system.component ? (
                      <Button 
                        className="flex-1 group-hover:bg-blue-600 group-hover:text-white transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveSystem(system.id);
                        }}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Launch System
                      </Button>
                    ) : (
                      <Button variant="outline" className="flex-1" disabled>
                        <Settings className="w-4 h-4 mr-2" />
                        Coming Soon
                      </Button>
                    )}
                    
                    {system.status === 'live' && (
                      <Button variant="outline" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {/* Live System Indicator */}
                  {system.status === 'live' && (
                    <div className="flex items-center justify-center gap-2 pt-2 text-green-600 text-sm font-medium">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span>System Operational</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Platform Advantages */}
        <div className="mt-16 bg-white rounded-3xl p-8 border-2 border-gray-200 shadow-xl">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Why Recoder Platform Destroys All Competitors
            </h2>
            <p className="text-xl text-gray-600">
              Industry-first innovations that competitors cannot replicate
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center p-6 bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl border border-blue-200">
              <div className="text-4xl mb-4">🤖</div>
              <h3 className="font-bold text-gray-900 mb-2">Multi-AI Orchestra</h3>
              <p className="text-sm text-gray-600">15+ AI models with smart routing. Competitors use single models.</p>
            </div>

            <div className="text-center p-6 bg-gradient-to-br from-green-50 to-blue-50 rounded-2xl border border-green-200">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="font-bold text-gray-900 mb-2">Real Functionality</h3>
              <p className="text-sm text-gray-600">Actual APIs, real deployments, working systems. Not mock implementations.</p>
            </div>

            <div className="text-center p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border border-purple-200">
              <div className="text-4xl mb-4">🚀</div>
              <h3 className="font-bold text-gray-900 mb-2">Complete Integration</h3>
              <p className="text-sm text-gray-600">End-to-end workflows from development to production deployment.</p>
            </div>

            <div className="text-center p-6 bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl border border-orange-200">
              <div className="text-4xl mb-4">💀</div>
              <h3 className="font-bold text-gray-900 mb-2">Competition Killer</h3>
              <p className="text-sm text-gray-600">Revolutionary features that make other platforms obsolete.</p>
            </div>
          </div>
        </div>

        {/* Quick Access Links */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/chats" className="group">
            <Card className="h-full hover:shadow-lg transition-all group-hover:-translate-y-1">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">💬</span>
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Chat Platform</h3>
                <p className="text-sm text-gray-600 mb-4">Multi-AI chat with smart routing</p>
                <div className="flex items-center justify-center text-blue-600 group-hover:translate-x-1 transition-transform">
                  <span className="text-sm font-medium">Launch Chat</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/" className="group">
            <Card className="h-full hover:shadow-lg transition-all group-hover:-translate-y-1">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🚀</span>
                </div>
                <h3 className="font-bold text-gray-900 mb-2">App Builder</h3>
                <p className="text-sm text-gray-600 mb-4">Build complete applications from prompts</p>
                <div className="flex items-center justify-center text-green-600 group-hover:translate-x-1 transition-transform">
                  <span className="text-sm font-medium">Start Building</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Card className="h-full bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">⚡</span>
              </div>
              <h3 className="font-bold text-gray-900 mb-2">CLI Tools</h3>
              <p className="text-sm text-gray-600 mb-4">Professional command-line interface</p>
              <div className="bg-gray-900 text-green-400 text-xs font-mono p-2 rounded">
                npm i -g @recoder/cli
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}