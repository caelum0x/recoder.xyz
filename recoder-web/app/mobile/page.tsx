'use client';

/**
 * Mobile App Builder Page - AI-Powered Mobile Development
 * KILLER FEATURE: Generate complete mobile apps from natural language descriptions
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  Smartphone, 
  Code2, 
  Rocket, 
  TrendingUp, 
  Users, 
  Zap, 
  Search,
  Clock,
  CheckCircle,
  AlertCircle,
  Star,
  Plus,
  Eye,
  Settings,
  BarChart3,
  FileText,
  Sparkles,
  ArrowRight,
  Activity,
  Layers,
  Box,
  Terminal,
  Play,
  Download,
  Upload,
  Copy,
  ExternalLink,
  Calendar,
  Target,
  Lightbulb,
  Wrench,
  Palette,
  Layout,
  Database,
  Shield,
  Bell,
  Camera,
  MapPin,
  CreditCard,
  MessageSquare,
  Share2,
  Globe,
  Cpu,
  Monitor
} from 'lucide-react';

interface MobileApp {
  id: string;
  name: string;
  description: string;
  category: 'social' | 'ecommerce' | 'productivity' | 'games' | 'finance' | 'health' | 'education' | 'entertainment';
  platform: 'ios' | 'android' | 'cross-platform';
  status: 'concept' | 'design' | 'development' | 'testing' | 'published';
  features: string[];
  technology: string[];
  progress: number;
  createdAt: string;
  updatedAt: string;
  designUrl?: string;
  testflightUrl?: string;
  playstoreUrl?: string;
  appstoreUrl?: string;
  aiGenerated: boolean;
  downloads: number;
  rating: number;
  monetization: 'free' | 'paid' | 'freemium' | 'subscription';
  targetAudience: string;
  estimatedRevenue: number;
}

interface AppTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  features: string[];
  technology: string[];
  estimatedTime: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  preview: string;
}

export default function MobilePage() {
  const [apps, setApps] = useState<MobileApp[]>([]);
  const [templates, setTemplates] = useState<AppTemplate[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState<MobileApp | null>(null);
  const [buildInProgress, setBuildInProgress] = useState<string | null>(null);

  useEffect(() => {
    loadApps();
    loadTemplates();
    loadAnalytics();
  }, []);

  const loadApps = async () => {
    try {
      const response = await fetch('/api/mobile/apps');
      const data = await response.json();
      if (data.success) {
        setApps(data.apps || []);
      }
    } catch (error) {
      console.error('Failed to load mobile apps:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await fetch('/api/mobile/templates');
      const data = await response.json();
      if (data.success) {
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Failed to load app templates:', error);
    }
  };

  const loadAnalytics = async () => {
    try {
      const response = await fetch('/api/mobile/analytics');
      const data = await response.json();
      if (data.success) {
        setAnalytics(data.analytics);
      }
    } catch (error) {
      console.error('Failed to load mobile analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateApp = async (appData: any) => {
    try {
      setBuildInProgress(appData.name);
      const response = await fetch('/api/mobile/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(appData),
      });

      const data = await response.json();
      if (data.success) {
        setApps([data.app, ...apps]);
        setShowCreateModal(false);
      }
    } catch (error) {
      console.error('Failed to generate app:', error);
    } finally {
      setBuildInProgress(null);
    }
  };

  const buildApp = async (appId: string) => {
    try {
      setBuildInProgress(appId);
      const response = await fetch(`/api/mobile/apps/${appId}/build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json();
      if (data.success) {
        // Update app status
        setApps(apps.map(app => 
          app.id === appId 
            ? { ...app, status: 'testing' as const, testflightUrl: data.testflightUrl }
            : app
        ));
      }
    } catch (error) {
      console.error('Failed to build app:', error);
    } finally {
      setBuildInProgress(null);
    }
  };

  const publishApp = async (appId: string, platform: 'ios' | 'android') => {
    try {
      const response = await fetch(`/api/mobile/apps/${appId}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ platform })
      });

      const data = await response.json();
      if (data.success) {
        // Update app with store URLs
        setApps(apps.map(app => 
          app.id === appId 
            ? { 
                ...app, 
                status: 'published' as const,
                ...(platform === 'ios' && { appstoreUrl: data.storeUrl }),
                ...(platform === 'android' && { playstoreUrl: data.storeUrl })
              }
            : app
        ));
      }
    } catch (error) {
      console.error('Failed to publish app:', error);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'social': return <MessageSquare className="h-4 w-4" />;
      case 'ecommerce': return <CreditCard className="h-4 w-4" />;
      case 'productivity': return <CheckCircle className="h-4 w-4" />;
      case 'games': return <Target className="h-4 w-4" />;
      case 'finance': return <BarChart3 className="h-4 w-4" />;
      case 'health': return <Activity className="h-4 w-4" />;
      case 'education': return <FileText className="h-4 w-4" />;
      case 'entertainment': return <Play className="h-4 w-4" />;
      default: return <Smartphone className="h-4 w-4" />;
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'ios': return <Smartphone className="h-4 w-4" />;
      case 'android': return <Smartphone className="h-4 w-4" />;
      case 'cross-platform': return <Layers className="h-4 w-4" />;
      default: return <Smartphone className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'concept': return 'bg-blue-100 text-blue-800';
      case 'design': return 'bg-purple-100 text-purple-800';
      case 'development': return 'bg-yellow-100 text-yellow-800';
      case 'testing': return 'bg-orange-100 text-orange-800';
      case 'published': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredApps = apps.filter(app => {
    const matchesSearch = !searchQuery || 
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.features.some(feature => feature.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'all' || app.category === selectedCategory;
    const matchesPlatform = selectedPlatform === 'all' || app.platform === selectedPlatform;
    
    return matchesSearch && matchesCategory && matchesPlatform;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            📱 Mobile App Builder
          </h1>
          <p className="text-xl text-gray-600 mb-4">
            Generate complete mobile apps from natural language descriptions
          </p>
          <div className="flex items-center justify-center gap-4 mb-6">
            <Badge variant="secondary" className="text-lg px-4 py-2">
              🏆 KILLER FEATURE
            </Badge>
            <Badge variant="destructive" className="text-lg px-4 py-2">
              AI Mobile App Generation!
            </Badge>
          </div>
          <div className="flex items-center justify-center gap-2 text-green-600">
            <Sparkles className="h-5 w-5" />
            <span className="font-medium">AI App Generation Active</span>
          </div>
        </div>

        {/* Analytics Overview */}
        {analytics && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Mobile Development Analytics
              </CardTitle>
              <CardDescription>AI-powered mobile app development insights and performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{analytics.totalApps || 0}</div>
                  <div className="text-sm text-gray-600">Total Apps</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{analytics.publishedApps || 0}</div>
                  <div className="text-sm text-gray-600">Published Apps</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{analytics.totalDownloads || '0'}</div>
                  <div className="text-sm text-gray-600">Total Downloads</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{analytics.avgRating || '4.8'}/5</div>
                  <div className="text-sm text-gray-600">Avg Rating</div>
                </div>
              </div>
              
              <Separator className="my-6" />
              
              <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">🚀 Mobile Development Advantage</h4>
                <p className="text-gray-700 mb-3">AI-powered mobile app generation with cross-platform support and automated publishing</p>
                <div className="flex flex-wrap gap-2">
                  {['AI App Generation', 'Cross-Platform Support', 'One-Click Publishing', 'Revenue Analytics'].map((feature, index) => (
                    <Badge key={index} variant="secondary">{feature}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setShowCreateModal(true)}>
            <CardContent className="p-6 text-center">
              <Sparkles className="h-12 w-12 text-purple-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">AI App Generator</h3>
              <p className="text-sm text-gray-600 mb-4">Describe your app idea and let AI generate the complete mobile application</p>
              <Button className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Generate New App
              </Button>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardContent className="p-6 text-center">
              <Layout className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">App Templates</h3>
              <p className="text-sm text-gray-600 mb-4">Start with pre-built templates for common app types and customize them</p>
              <Button variant="outline" className="w-full">
                <Eye className="h-4 w-4 mr-2" />
                Browse Templates
              </Button>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardContent className="p-6 text-center">
              <Terminal className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Code Export</h3>
              <p className="text-sm text-gray-600 mb-4">Export generated app code to your preferred development environment</p>
              <Button variant="outline" className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Export Code
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex gap-2">
            <Input
              placeholder="Search apps..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
            <Button variant="outline" size="lg">
              <Search className="h-4 w-4" />
            </Button>
          </div>
          
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="social">Social</SelectItem>
              <SelectItem value="ecommerce">E-commerce</SelectItem>
              <SelectItem value="productivity">Productivity</SelectItem>
              <SelectItem value="games">Games</SelectItem>
              <SelectItem value="finance">Finance</SelectItem>
              <SelectItem value="health">Health</SelectItem>
              <SelectItem value="education">Education</SelectItem>
              <SelectItem value="entertainment">Entertainment</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              <SelectItem value="ios">iOS</SelectItem>
              <SelectItem value="android">Android</SelectItem>
              <SelectItem value="cross-platform">Cross-Platform</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Popular Templates */}
        {templates.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layout className="h-5 w-5" />
                Popular App Templates
              </CardTitle>
              <CardDescription>Get started quickly with proven app templates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {templates.slice(0, 3).map((template) => (
                  <div key={template.id} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{template.name}</h4>
                      <Badge variant="outline" className="text-xs">{template.difficulty}</Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {template.features.slice(0, 3).map((feature, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{template.estimatedTime}</span>
                      <Button size="sm" variant="outline">Use Template</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Apps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            Array.from({length: 6}).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded mb-4"></div>
                  <div className="h-8 bg-gray-200 rounded"></div>
                </CardContent>
              </Card>
            ))
          ) : filteredApps.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <div className="text-gray-400 mb-4">
                <Smartphone className="h-12 w-12 mx-auto mb-4" />
                <p className="text-lg">No mobile apps found</p>
                <p>Create your first app to get started!</p>
              </div>
              <Button onClick={() => setShowCreateModal(true)} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Create First App
              </Button>
            </div>
          ) : (
            filteredApps.map((app) => (
              <Card key={app.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setSelectedApp(app)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {getCategoryIcon(app.category)}
                      {app.name}
                      {app.aiGenerated && (
                        <Badge variant="secondary" className="text-xs">
                          <Sparkles className="h-3 w-3 mr-1" />
                          AI
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star 
                          key={i} 
                          className={`h-3 w-3 ${i < app.rating ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} 
                        />
                      ))}
                    </div>
                  </div>
                  <CardDescription className="text-sm line-clamp-2">{app.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Status:</span>
                      <Badge className={getStatusColor(app.status)}>
                        <span className="capitalize">{app.status}</span>
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Platform:</span>
                      <div className="flex items-center gap-1">
                        {getPlatformIcon(app.platform)}
                        <span className="text-sm capitalize">{app.platform}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Downloads:</span>
                      <span className="text-sm font-medium">{app.downloads.toLocaleString()}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Progress:</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-purple-600 h-2 rounded-full" 
                            style={{ width: `${app.progress}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">{app.progress}%</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-1 mt-2">
                      {app.features.slice(0, 3).map((feature, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                      {app.features.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{app.features.length - 3} more
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-3">
                      <Calendar className="h-3 w-3" />
                      Updated {new Date(app.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/mobile/${app.id}`;
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                    {app.status === 'development' && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          buildApp(app.id);
                        }}
                        disabled={buildInProgress === app.id}
                      >
                        {buildInProgress === app.id ? (
                          <div className="animate-spin h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    {(app.appstoreUrl || app.playstoreUrl) && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(app.appstoreUrl || app.playstoreUrl, '_blank');
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Features Showcase */}
        <Card className="mt-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Why Recoder's Mobile Builder Dominates
            </CardTitle>
            <CardDescription>Revolutionary features that transform mobile app development</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <Sparkles className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <h4 className="font-semibold text-gray-900">AI Code Generation</h4>
                <p className="text-sm text-gray-600 mt-1">Generate complete React Native apps from descriptions</p>
              </div>
              
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <Layers className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <h4 className="font-semibold text-gray-900">Cross-Platform</h4>
                <p className="text-sm text-gray-600 mt-1">Single codebase for iOS and Android deployment</p>
              </div>
              
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <Rocket className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                <h4 className="font-semibold text-gray-900">One-Click Publishing</h4>
                <p className="text-sm text-gray-600 mt-1">Deploy to App Store and Google Play automatically</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}