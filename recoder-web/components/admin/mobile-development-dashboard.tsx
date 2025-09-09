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
  Smartphone, 
  Tablet, 
  Monitor, 
  Play, 
  Download, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Code, 
  Package,
  Zap,
  Camera,
  MapPin,
  CreditCard,
  Bell,
  Fingerprint,
  Palette,
  Settings,
  Plus,
  Edit,
  Trash2,
  Eye,
  Layers,
  Box
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

interface MobileApp {
  id: string;
  name: string;
  description?: string;
  framework: string;
  platforms: string[];
  template: string;
  features: any;
  styling: any;
  status: string;
  createdAt: string;
  builds?: MobileAppBuild[];
  _count?: { builds: number };
}

interface MobileAppBuild {
  id: string;
  platform: string;
  buildType: string;
  status: 'building' | 'success' | 'failed' | 'cancelled';
  results?: any;
  createdAt: string;
  completedAt?: string;
}

interface CreateAppForm {
  name: string;
  description: string;
  projectId: string;
  framework: string;
  platforms: string[];
  template: string;
  features: {
    authentication: boolean;
    pushNotifications: boolean;
    camera: boolean;
    geolocation: boolean;
    biometrics: boolean;
    payments: boolean;
    analytics: boolean;
    offline: boolean;
    darkMode: boolean;
    internationalization: boolean;
    socialLogin: boolean;
    fileSystem: boolean;
    bluetooth: boolean;
    nfc: boolean;
    ar: boolean;
  };
  styling: {
    theme: string;
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
    darkModeEnabled: boolean;
  };
  buildConfiguration: {
    bundleId: string;
    version: string;
    buildNumber: number;
    minSdkVersion: number;
    targetSdkVersion: number;
    iosDeploymentTarget: string;
  };
}

export default function MobileDevelopmentDashboard() {
  const { toast } = useToast();
  
  const [mobileApps, setMobileApps] = useState<MobileApp[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateApp, setShowCreateApp] = useState(false);
  const [selectedApp, setSelectedApp] = useState<MobileApp | null>(null);

  const [createForm, setCreateForm] = useState<CreateAppForm>({
    name: '',
    description: '',
    projectId: '',
    framework: 'react-native',
    platforms: ['android'],
    template: 'blank',
    features: {
      authentication: false,
      pushNotifications: false,
      camera: false,
      geolocation: false,
      biometrics: false,
      payments: false,
      analytics: false,
      offline: false,
      darkMode: true,
      internationalization: false,
      socialLogin: false,
      fileSystem: false,
      bluetooth: false,
      nfc: false,
      ar: false
    },
    styling: {
      theme: 'default',
      primaryColor: '#007AFF',
      secondaryColor: '#FF6B35',
      fontFamily: 'System',
      darkModeEnabled: true
    },
    buildConfiguration: {
      bundleId: 'com.example.app',
      version: '1.0.0',
      buildNumber: 1,
      minSdkVersion: 21,
      targetSdkVersion: 34,
      iosDeploymentTarget: '12.0'
    }
  });

  useEffect(() => {
    loadMobileApps();
    loadTemplates();
    loadFrameworks();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadMobileApps();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadMobileApps = async () => {
    try {
      const response = await fetch('/api/mobile-platform/generators');
      if (response.ok) {
        const data = await response.json();
        setMobileApps(data.apps || []);
      }
    } catch (error) {
      console.error('Failed to load mobile apps:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await fetch('/api/mobile-platform/generators?type=templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const loadFrameworks = async () => {
    try {
      const response = await fetch('/api/mobile-platform/generators?type=frameworks');
      if (response.ok) {
        const data = await response.json();
        setFrameworks(data.frameworks || []);
      }
    } catch (error) {
      console.error('Failed to load frameworks:', error);
    }
  };

  const createMobileApp = async () => {
    try {
      const response = await fetch('/api/mobile-platform/generators', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create_app',
          ...createForm
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Mobile app created",
          description: `${createForm.name} has been generated successfully`,
        });
        setShowCreateApp(false);
        loadMobileApps();
        resetCreateForm();
      } else {
        const error = await response.json();
        toast({
          title: "Creation failed",
          description: error.error || "Failed to create mobile app",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Creation failed",
        description: "Failed to create mobile app",
        variant: "destructive",
      });
    }
  };

  const buildMobileApp = async (appId: string, platform: string, buildType: string) => {
    try {
      const response = await fetch('/api/mobile-platform/generators', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'build_app',
          appId,
          platform,
          buildType
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Build started",
          description: `${platform} build is now in progress`,
        });
        loadMobileApps();
      } else {
        const error = await response.json();
        toast({
          title: "Build failed",
          description: error.error || "Failed to start build",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Build failed",
        description: "Failed to start build",
        variant: "destructive",
      });
    }
  };

  const resetCreateForm = () => {
    setCreateForm({
      name: '',
      description: '',
      projectId: '',
      framework: 'react-native',
      platforms: ['android'],
      template: 'blank',
      features: {
        authentication: false,
        pushNotifications: false,
        camera: false,
        geolocation: false,
        biometrics: false,
        payments: false,
        analytics: false,
        offline: false,
        darkMode: true,
        internationalization: false,
        socialLogin: false,
        fileSystem: false,
        bluetooth: false,
        nfc: false,
        ar: false
      },
      styling: {
        theme: 'default',
        primaryColor: '#007AFF',
        secondaryColor: '#FF6B35',
        fontFamily: 'System',
        darkModeEnabled: true
      },
      buildConfiguration: {
        bundleId: 'com.example.app',
        version: '1.0.0',
        buildNumber: 1,
        minSdkVersion: 21,
        targetSdkVersion: 34,
        iosDeploymentTarget: '12.0'
      }
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'generated': return 'text-green-600';
      case 'success': return 'text-green-600';
      case 'building': return 'text-blue-600';
      case 'failed': return 'text-red-600';
      case 'initializing': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'generated': return <CheckCircle className="h-4 w-4" />;
      case 'success': return <CheckCircle className="h-4 w-4" />;
      case 'building': return <Clock className="h-4 w-4" />;
      case 'failed': return <XCircle className="h-4 w-4" />;
      case 'initializing': return <Clock className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'ios': return <Smartphone className="h-4 w-4 text-gray-600" />;
      case 'android': return <Smartphone className="h-4 w-4 text-green-600" />;
      case 'web': return <Monitor className="h-4 w-4 text-blue-600" />;
      default: return <Tablet className="h-4 w-4" />;
    }
  };

  const getFrameworkColor = (framework: string) => {
    switch (framework) {
      case 'react-native': return 'text-blue-600';
      case 'flutter': return 'text-blue-400';
      case 'expo': return 'text-purple-600';
      case 'ionic': return 'text-blue-500';
      default: return 'text-gray-600';
    }
  };

  const mockAnalytics = [
    { date: '2024-01-01', builds: 5, success: 4, failed: 1 },
    { date: '2024-01-02', builds: 8, success: 7, failed: 1 },
    { date: '2024-01-03', builds: 6, success: 5, failed: 1 },
    { date: '2024-01-04', builds: 10, success: 9, failed: 1 },
    { date: '2024-01-05', builds: 7, success: 6, failed: 1 },
    { date: '2024-01-06', builds: 12, success: 11, failed: 1 },
    { date: '2024-01-07', builds: 9, success: 8, failed: 1 }
  ];

  const frameworkDistribution = [
    { name: 'React Native', value: 45, color: '#61DAFB' },
    { name: 'Flutter', value: 30, color: '#02569B' },
    { name: 'Expo', value: 15, color: '#000020' },
    { name: 'Ionic', value: 10, color: '#3880FF' }
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
          <h2 className="text-2xl font-bold">Mobile Development Platform</h2>
          <p className="text-muted-foreground">
            Create, build, and deploy native mobile applications with multiple frameworks
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => loadMobileApps()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateApp(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Mobile App
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="apps">Mobile Apps</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="builds">Build History</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Apps</p>
                  <p className="text-2xl font-bold">{mobileApps.length}</p>
                </div>
                <Smartphone className="h-8 w-8 text-blue-600" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Successful Builds</p>
                  <p className="text-2xl font-bold text-green-600">47</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Build Success Rate</p>
                  <p className="text-2xl font-bold text-green-600">94%</p>
                </div>
                <Zap className="h-8 w-8 text-green-600" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg Build Time</p>
                  <p className="text-2xl font-bold">3.2m</p>
                </div>
                <Clock className="h-8 w-8 text-blue-600" />
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Build Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={mockAnalytics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="builds" stroke="#8884d8" name="Total Builds" />
                    <Line type="monotone" dataKey="success" stroke="#82ca9d" name="Successful" />
                    <Line type="monotone" dataKey="failed" stroke="#ff7c7c" name="Failed" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Framework Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={frameworkDistribution}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {frameworkDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-4">
                  {frameworkDistribution.map((item) => (
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

          {/* Recent Apps */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Mobile Apps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mobileApps.slice(0, 5).map((app) => (
                  <div key={app.id} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-3">
                      <Code className={`h-4 w-4 ${getFrameworkColor(app.framework)}`} />
                      <div>
                        <p className="font-medium">{app.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {app.framework} • {app.platforms.join(', ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center gap-1 ${getStatusColor(app.status)}`}>
                        {getStatusIcon(app.status)}
                        <span className="text-sm">{app.status}</span>
                      </div>
                      <Badge variant="outline">
                        {app._count?.builds || 0} builds
                      </Badge>
                      <div className="flex gap-1">
                        {app.platforms.map((platform) => (
                          <div key={platform} title={platform}>
                            {getPlatformIcon(platform)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mobile Apps Tab */}
        <TabsContent value="apps" className="space-y-4">
          <div className="grid gap-4">
            {mobileApps.map((app) => (
              <Card key={app.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {app.name}
                        <Badge variant="outline" className={getFrameworkColor(app.framework)}>
                          {app.framework}
                        </Badge>
                        <Badge variant="secondary">{app.template}</Badge>
                      </CardTitle>
                      <CardDescription>{app.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => buildMobileApp(app.id, 'android', 'debug')}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Build Android
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => buildMobileApp(app.id, 'ios', 'debug')}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Build iOS
                      </Button>
                      <Button size="sm" variant="outline">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* App Info */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                    <div>
                      <p className="font-medium">Status</p>
                      <p className={getStatusColor(app.status)}>{app.status}</p>
                    </div>
                    <div>
                      <p className="font-medium">Platforms</p>
                      <p className="text-muted-foreground">{app.platforms.join(', ')}</p>
                    </div>
                    <div>
                      <p className="font-medium">Version</p>
                      <p className="text-muted-foreground">1.0.0</p>
                    </div>
                    <div>
                      <p className="font-medium">Builds</p>
                      <p className="text-muted-foreground">{app._count?.builds || 0}</p>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="mb-4">
                    <h4 className="font-medium mb-2">Features</h4>
                    <div className="flex flex-wrap gap-2">
                      {app.features?.authentication && (
                        <Badge variant="outline" className="text-xs">
                          <Package className="h-3 w-3 mr-1" />
                          Authentication
                        </Badge>
                      )}
                      {app.features?.camera && (
                        <Badge variant="outline" className="text-xs">
                          <Camera className="h-3 w-3 mr-1" />
                          Camera
                        </Badge>
                      )}
                      {app.features?.geolocation && (
                        <Badge variant="outline" className="text-xs">
                          <MapPin className="h-3 w-3 mr-1" />
                          Location
                        </Badge>
                      )}
                      {app.features?.payments && (
                        <Badge variant="outline" className="text-xs">
                          <CreditCard className="h-3 w-3 mr-1" />
                          Payments
                        </Badge>
                      )}
                      {app.features?.pushNotifications && (
                        <Badge variant="outline" className="text-xs">
                          <Bell className="h-3 w-3 mr-1" />
                          Push Notifications
                        </Badge>
                      )}
                      {app.features?.biometrics && (
                        <Badge variant="outline" className="text-xs">
                          <Fingerprint className="h-3 w-3 mr-1" />
                          Biometrics
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Recent Builds */}
                  {app.builds && app.builds.length > 0 && (
                    <div className="border-t pt-3">
                      <h4 className="font-medium mb-2">Recent Builds</h4>
                      <div className="space-y-2">
                        {app.builds.slice(0, 3).map((build) => (
                          <div key={build.id} className="flex items-center justify-between text-sm p-2 border rounded">
                            <div className="flex items-center gap-2">
                              {getPlatformIcon(build.platform)}
                              <span className="font-medium">{build.platform}</span>
                              <Badge variant="secondary" className="text-xs">{build.buildType}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className={`flex items-center gap-1 ${getStatusColor(build.status)}`}>
                                {getStatusIcon(build.status)}
                                <span>{build.status}</span>
                              </div>
                              {build.status === 'success' && (
                                <Button size="sm" variant="outline" className="h-6">
                                  <Download className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {templates.map((template) => (
              <Card key={template.id} className="cursor-pointer hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5" />
                    {template.name}
                  </CardTitle>
                  <CardDescription>{template.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {template.features.map((feature: string) => (
                      <Badge key={feature} variant="secondary" className="text-xs">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                  <Button className="w-full" size="sm">
                    Use Template
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Other tabs would be implemented similarly */}
        <TabsContent value="builds">
          <Card>
            <CardHeader>
              <CardTitle>Build History</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Build history and management would be displayed here</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <Card>
            <CardHeader>
              <CardTitle>Mobile Development Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Detailed analytics and performance metrics would be displayed here</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Mobile Platform Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Platform configuration and preferences would be managed here</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Mobile App Modal */}
      {showCreateApp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
            <CardHeader>
              <CardTitle>Create Mobile Application</CardTitle>
              <CardDescription>
                Generate a new mobile app with your preferred framework and features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Basic Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="appName">App Name</Label>
                  <Input
                    id="appName"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="My Awesome App"
                  />
                </div>
                <div>
                  <Label htmlFor="framework">Framework</Label>
                  <Select
                    value={createForm.framework}
                    onValueChange={(value) => setCreateForm({ ...createForm, framework: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="react-native">React Native</SelectItem>
                      <SelectItem value="flutter">Flutter</SelectItem>
                      <SelectItem value="expo">Expo</SelectItem>
                      <SelectItem value="ionic">Ionic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Describe your mobile application"
                />
              </div>

              {/* Template Selection */}
              <div>
                <Label>Template</Label>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {templates.slice(0, 6).map((template) => (
                    <Card 
                      key={template.id} 
                      className={`cursor-pointer border-2 ${createForm.template === template.id ? 'border-blue-500' : 'border-gray-200'}`}
                      onClick={() => setCreateForm({ ...createForm, template: template.id })}
                    >
                      <CardContent className="p-3">
                        <h4 className="font-medium text-sm">{template.name}</h4>
                        <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Platform Selection */}
              <div>
                <Label>Target Platforms</Label>
                <div className="flex gap-4 mt-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="android"
                      checked={createForm.platforms.includes('android')}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setCreateForm({
                            ...createForm,
                            platforms: [...createForm.platforms, 'android']
                          });
                        } else {
                          setCreateForm({
                            ...createForm,
                            platforms: createForm.platforms.filter(p => p !== 'android')
                          });
                        }
                      }}
                    />
                    <Label htmlFor="android">Android</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="ios"
                      checked={createForm.platforms.includes('ios')}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setCreateForm({
                            ...createForm,
                            platforms: [...createForm.platforms, 'ios']
                          });
                        } else {
                          setCreateForm({
                            ...createForm,
                            platforms: createForm.platforms.filter(p => p !== 'ios')
                          });
                        }
                      }}
                    />
                    <Label htmlFor="ios">iOS</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="web"
                      checked={createForm.platforms.includes('web')}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setCreateForm({
                            ...createForm,
                            platforms: [...createForm.platforms, 'web']
                          });
                        } else {
                          setCreateForm({
                            ...createForm,
                            platforms: createForm.platforms.filter(p => p !== 'web')
                          });
                        }
                      }}
                    />
                    <Label htmlFor="web">Web</Label>
                  </div>
                </div>
              </div>

              {/* Features */}
              <div>
                <Label>Features</Label>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="authentication"
                      checked={createForm.features.authentication}
                      onCheckedChange={(checked) => setCreateForm({
                        ...createForm,
                        features: { ...createForm.features, authentication: checked }
                      })}
                    />
                    <Label htmlFor="authentication" className="text-sm">Authentication</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="camera"
                      checked={createForm.features.camera}
                      onCheckedChange={(checked) => setCreateForm({
                        ...createForm,
                        features: { ...createForm.features, camera: checked }
                      })}
                    />
                    <Label htmlFor="camera" className="text-sm">Camera</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="geolocation"
                      checked={createForm.features.geolocation}
                      onCheckedChange={(checked) => setCreateForm({
                        ...createForm,
                        features: { ...createForm.features, geolocation: checked }
                      })}
                    />
                    <Label htmlFor="geolocation" className="text-sm">Geolocation</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="pushNotifications"
                      checked={createForm.features.pushNotifications}
                      onCheckedChange={(checked) => setCreateForm({
                        ...createForm,
                        features: { ...createForm.features, pushNotifications: checked }
                      })}
                    />
                    <Label htmlFor="pushNotifications" className="text-sm">Push Notifications</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="payments"
                      checked={createForm.features.payments}
                      onCheckedChange={(checked) => setCreateForm({
                        ...createForm,
                        features: { ...createForm.features, payments: checked }
                      })}
                    />
                    <Label htmlFor="payments" className="text-sm">Payments</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="biometrics"
                      checked={createForm.features.biometrics}
                      onCheckedChange={(checked) => setCreateForm({
                        ...createForm,
                        features: { ...createForm.features, biometrics: checked }
                      })}
                    />
                    <Label htmlFor="biometrics" className="text-sm">Biometrics</Label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateApp(false)}>
                  Cancel
                </Button>
                <Button onClick={createMobileApp}>
                  Create Mobile App
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}