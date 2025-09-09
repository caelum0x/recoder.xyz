'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Smartphone, Globe, Wifi, WifiOff, Download, Bell, 
  Settings, Code, Play, Zap, Monitor, Camera, MapPin,
  Shield, Cpu, MemoryStick, Database, CloudDownload,
  CheckCircle, XCircle, AlertTriangle, Info, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface PWAConfig {
  name: string;
  shortName: string;
  description: string;
  themeColor: string;
  backgroundColor: string;
  display: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  orientation: 'any' | 'natural' | 'landscape' | 'portrait';
  startUrl: string;
  scope: string;
  icons: PWAIcon[];
  serviceWorker: ServiceWorkerConfig;
  features: PWAFeatures;
  caching: CachingStrategy;
  offline: OfflineConfig;
  notifications: NotificationConfig;
}

interface PWAIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: 'any' | 'maskable' | 'monochrome';
}

interface ServiceWorkerConfig {
  enabled: boolean;
  fileName: string;
  workboxVersion: string;
  runtimeCaching: RuntimeCacheRule[];
  precachePatterns: string[];
  skipWaiting: boolean;
  clientsClaim: boolean;
}

interface RuntimeCacheRule {
  urlPattern: string;
  handler: 'CacheFirst' | 'NetworkFirst' | 'StaleWhileRevalidate' | 'NetworkOnly' | 'CacheOnly';
  options: {
    cacheName?: string;
    expiration?: {
      maxEntries?: number;
      maxAgeSeconds?: number;
    };
    cacheKeyWillBeUsed?: boolean;
    networkTimeoutSeconds?: number;
  };
}

interface PWAFeatures {
  installPrompt: boolean;
  offlineSupport: boolean;
  backgroundSync: boolean;
  pushNotifications: boolean;
  fileSystemAccess: boolean;
  cameraAccess: boolean;
  geolocation: boolean;
  webShare: boolean;
  deviceVibration: boolean;
  screenWakeLock: boolean;
}

interface CachingStrategy {
  strategy: 'cache-first' | 'network-first' | 'stale-while-revalidate';
  maxCacheSize: number;
  maxAge: number;
  excludePatterns: string[];
  includePatterns: string[];
}

interface OfflineConfig {
  enabled: boolean;
  fallbackPage: string;
  offlineAssets: string[];
  indexedDBEnabled: boolean;
  conflictResolution: 'client-wins' | 'server-wins' | 'manual';
}

interface NotificationConfig {
  enabled: boolean;
  vapidKeys: {
    publicKey: string;
    privateKey: string;
  };
  subscriberEndpoint: string;
  defaultIcon: string;
  defaultBadge: string;
}

interface PWABuilderProps {
  className?: string;
  onConfigChange?: (config: PWAConfig) => void;
  onGenerate?: (config: PWAConfig) => void;
}

export function PWABuilder({ className = '', onConfigChange, onGenerate }: PWABuilderProps) {
  const [config, setConfig] = useState<PWAConfig>({
    name: 'My Progressive Web App',
    shortName: 'MyPWA',
    description: 'A modern Progressive Web App built with advanced features',
    themeColor: '#000000',
    backgroundColor: '#ffffff',
    display: 'standalone',
    orientation: 'any',
    startUrl: '/',
    scope: '/',
    icons: [],
    serviceWorker: {
      enabled: true,
      fileName: 'sw.js',
      workboxVersion: '7.0.0',
      runtimeCaching: [],
      precachePatterns: ['/', '/manifest.json', '/static/**/*'],
      skipWaiting: true,
      clientsClaim: true
    },
    features: {
      installPrompt: true,
      offlineSupport: true,
      backgroundSync: true,
      pushNotifications: false,
      fileSystemAccess: false,
      cameraAccess: false,
      geolocation: false,
      webShare: true,
      deviceVibration: false,
      screenWakeLock: false
    },
    caching: {
      strategy: 'stale-while-revalidate',
      maxCacheSize: 50,
      maxAge: 86400,
      excludePatterns: ['/api/admin/**', '/api/auth/**'],
      includePatterns: ['/api/**', '/static/**', '/_next/**']
    },
    offline: {
      enabled: true,
      fallbackPage: '/offline',
      offlineAssets: [],
      indexedDBEnabled: true,
      conflictResolution: 'client-wins'
    },
    notifications: {
      enabled: false,
      vapidKeys: {
        publicKey: '',
        privateKey: ''
      },
      subscriberEndpoint: '/api/notifications/subscribe',
      defaultIcon: '/icons/notification-icon.png',
      defaultBadge: '/icons/notification-badge.png'
    }
  });

  const [activeTab, setActiveTab] = useState('basic');
  const [isGenerating, setIsGenerating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [pwaScore, setPwaScore] = useState(0);

  // Calculate PWA score based on configuration
  useEffect(() => {
    let score = 0;
    
    // Basic requirements (40 points)
    if (config.name && config.shortName) score += 10;
    if (config.icons.length > 0) score += 10;
    if (config.serviceWorker.enabled) score += 20;
    
    // Features (40 points)
    if (config.features.offlineSupport) score += 15;
    if (config.features.installPrompt) score += 10;
    if (config.features.backgroundSync) score += 10;
    if (config.features.pushNotifications) score += 5;
    
    // Advanced features (20 points)
    if (config.offline.indexedDBEnabled) score += 5;
    if (config.caching.strategy !== 'cache-first') score += 5;
    if (config.features.webShare) score += 5;
    if (config.serviceWorker.runtimeCaching.length > 0) score += 5;
    
    setPwaScore(score);
  }, [config]);

  // Validate configuration
  useEffect(() => {
    const errors: string[] = [];
    
    if (!config.name.trim()) errors.push('App name is required');
    if (!config.shortName.trim()) errors.push('Short name is required');
    if (config.shortName.length > 12) errors.push('Short name should be 12 characters or less');
    if (!config.startUrl) errors.push('Start URL is required');
    if (config.icons.length === 0) errors.push('At least one icon is required');
    if (config.features.pushNotifications && !config.notifications.vapidKeys.publicKey) {
      errors.push('VAPID keys required for push notifications');
    }
    
    setValidationErrors(errors);
  }, [config]);

  const updateConfig = useCallback((updates: Partial<PWAConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onConfigChange?.(newConfig);
  }, [config, onConfigChange]);

  const updateFeatures = useCallback((feature: keyof PWAFeatures, enabled: boolean) => {
    updateConfig({
      features: {
        ...config.features,
        [feature]: enabled
      }
    });
  }, [config.features, updateConfig]);

  const addIcon = useCallback(() => {
    const newIcon: PWAIcon = {
      src: '/icons/icon-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any'
    };
    
    updateConfig({
      icons: [...config.icons, newIcon]
    });
  }, [config.icons, updateConfig]);

  const removeIcon = useCallback((index: number) => {
    const newIcons = config.icons.filter((_, i) => i !== index);
    updateConfig({ icons: newIcons });
  }, [config.icons, updateConfig]);

  const addCacheRule = useCallback(() => {
    const newRule: RuntimeCacheRule = {
      urlPattern: '/api/**',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 3600
        },
        networkTimeoutSeconds: 5
      }
    };
    
    updateConfig({
      serviceWorker: {
        ...config.serviceWorker,
        runtimeCaching: [...config.serviceWorker.runtimeCaching, newRule]
      }
    });
  }, [config.serviceWorker, updateConfig]);

  const generateVAPIDKeys = useCallback(async () => {
    try {
      const response = await fetch('/api/pwa-generator/vapid-keys', {
        method: 'POST'
      });
      
      const { publicKey, privateKey } = await response.json();
      
      updateConfig({
        notifications: {
          ...config.notifications,
          vapidKeys: { publicKey, privateKey }
        }
      });
      
      toast.success('VAPID keys generated successfully');
    } catch (error) {
      toast.error('Failed to generate VAPID keys');
    }
  }, [config.notifications, updateConfig]);

  const generatePWA = useCallback(async () => {
    if (validationErrors.length > 0) {
      toast.error('Please fix validation errors before generating');
      return;
    }
    
    setIsGenerating(true);
    
    try {
      const response = await fetch('/api/pwa-generator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Generation failed');
      }
      
      // Check if response is a ZIP file
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/zip')) {
        // Handle ZIP download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${config.shortName.toLowerCase()}-pwa.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        toast.success('PWA generated successfully!', {
          description: 'Your PWA files have been downloaded'
        });
      } else {
        // Handle JSON response (success message)
        const result = await response.json();
        toast.success('PWA generated successfully!', {
          description: result.message || 'PWA files generated'
        });
      }
      
      onGenerate?.(config);
    } catch (error) {
      console.error('PWA generation error:', error);
      toast.error(`Failed to generate PWA: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  }, [config, validationErrors, onGenerate]);

  const previewManifest = useCallback(async () => {
    try {
      const manifestResponse = await fetch('/api/pwa/manifest', {
        method: 'GET'
      });
      
      if (!manifestResponse.ok) throw new Error('Failed to fetch manifest');
      
      const manifest = await manifestResponse.json();
      
      // Show manifest in a modal or new tab
      const manifestWindow = window.open('', '_blank');
      if (manifestWindow) {
        manifestWindow.document.write(`
          <html>
            <head>
              <title>Generated PWA Manifest - ${config.name}</title>
              <style>
                body { font-family: monospace; padding: 20px; background: #1e1e1e; color: #fff; }
                pre { background: #2d2d2d; padding: 20px; border-radius: 8px; overflow: auto; }
                h1 { color: #58a6ff; }
              </style>
            </head>
            <body>
              <h1>PWA Manifest Preview</h1>
              <p>Generated manifest.json for <strong>${config.name}</strong></p>
              <pre>${JSON.stringify(manifest, null, 2)}</pre>
            </body>
          </html>
        `);
        manifestWindow.document.close();
      }
      
      toast.success('Manifest preview opened in new tab');
    } catch (error) {
      console.error('Manifest preview error:', error);
      toast.error('Failed to preview manifest');
    }
  }, [config]);

  const testServiceWorker = useCallback(async () => {
    try {
      const response = await fetch(`/api/pwa/service-worker?strategy=${config.caching.strategy}&offlinePages=essential`);
      
      if (!response.ok) throw new Error('Failed to fetch service worker');
      
      const serviceWorkerCode = await response.text();
      
      // Show service worker in a modal or new tab
      const swWindow = window.open('', '_blank');
      if (swWindow) {
        swWindow.document.write(`
          <html>
            <head>
              <title>Generated Service Worker - ${config.name}</title>
              <style>
                body { font-family: monospace; padding: 20px; background: #1e1e1e; color: #fff; }
                pre { background: #2d2d2d; padding: 20px; border-radius: 8px; overflow: auto; font-size: 12px; }
                h1 { color: #58a6ff; }
              </style>
            </head>
            <body>
              <h1>Service Worker Preview</h1>
              <p>Generated service worker for <strong>${config.name}</strong></p>
              <pre>${serviceWorkerCode}</pre>
            </body>
          </html>
        `);
        swWindow.document.close();
      }
      
      toast.success('Service worker preview opened');
    } catch (error) {
      console.error('Service worker preview error:', error);
      toast.error('Failed to preview service worker');
    }
  }, [config]);

  const testBackgroundSync = useCallback(async () => {
    try {
      const response = await fetch('/api/pwa/background-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register_sync',
          data: {
            operation: 'test_sync',
            payload: { message: 'Test background sync from PWA Builder' },
            priority: 'normal',
            userId: 'current_user' // TODO: Replace with actual user ID from session
          }
        })
      });
      
      if (!response.ok) throw new Error('Background sync test failed');
      
      const result = await response.json();
      toast.success('Background sync test successful', {
        description: `Sync ID: ${result.syncId || 'N/A'}`
      });
    } catch (error) {
      console.error('Background sync test error:', error);
      toast.error('Background sync test failed');
    }
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };



  return (
    <div className={`pwa-builder space-y-6 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500">
                <Smartphone className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold">Progressive Web App Builder</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Create professional PWAs with advanced features and industry-standard service workers
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-medium">PWA Score</div>
                <div className={`text-2xl font-bold ${getScoreColor(pwaScore)}`}>
                  {pwaScore}/100
                </div>
              </div>
              <Progress value={pwaScore} className="w-20" />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              <div className="font-medium">Please fix the following issues:</div>
              {validationErrors.map((error, index) => (
                <div key={index} className="text-sm">• {error}</div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Configuration Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="icons">Icons</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="caching">Caching</TabsTrigger>
          <TabsTrigger value="offline">Offline</TabsTrigger>
          <TabsTrigger value="notifications">Push</TabsTrigger>
        </TabsList>

        {/* Basic Configuration */}
        <TabsContent value="basic" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Basic Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">App Name *</Label>
                  <Input
                    id="name"
                    value={config.name}
                    onChange={(e) => updateConfig({ name: e.target.value })}
                    placeholder="My Progressive Web App"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shortName">Short Name * (≤12 chars)</Label>
                  <Input
                    id="shortName"
                    value={config.shortName}
                    onChange={(e) => updateConfig({ shortName: e.target.value })}
                    placeholder="MyPWA"
                    maxLength={12}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={config.description}
                  onChange={(e) => updateConfig({ description: e.target.value })}
                  placeholder="A modern Progressive Web App with advanced features"
                  rows={3}
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="themeColor">Theme Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="themeColor"
                      type="color"
                      value={config.themeColor}
                      onChange={(e) => updateConfig({ themeColor: e.target.value })}
                      className="w-16 h-10"
                    />
                    <Input
                      value={config.themeColor}
                      onChange={(e) => updateConfig({ themeColor: e.target.value })}
                      placeholder="#000000"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="backgroundColor">Background Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="backgroundColor"
                      type="color"
                      value={config.backgroundColor}
                      onChange={(e) => updateConfig({ backgroundColor: e.target.value })}
                      className="w-16 h-10"
                    />
                    <Input
                      value={config.backgroundColor}
                      onChange={(e) => updateConfig({ backgroundColor: e.target.value })}
                      placeholder="#ffffff"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="display">Display Mode</Label>
                  <Select value={config.display} onValueChange={(value: any) => updateConfig({ display: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standalone">Standalone</SelectItem>
                      <SelectItem value="fullscreen">Fullscreen</SelectItem>
                      <SelectItem value="minimal-ui">Minimal UI</SelectItem>
                      <SelectItem value="browser">Browser</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startUrl">Start URL</Label>
                  <Input
                    id="startUrl"
                    value={config.startUrl}
                    onChange={(e) => updateConfig({ startUrl: e.target.value })}
                    placeholder="/"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scope">Scope</Label>
                  <Input
                    id="scope"
                    value={config.scope}
                    onChange={(e) => updateConfig({ scope: e.target.value })}
                    placeholder="/"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orientation">Orientation</Label>
                  <Select value={config.orientation} onValueChange={(value: any) => updateConfig({ orientation: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="natural">Natural</SelectItem>
                      <SelectItem value="landscape">Landscape</SelectItem>
                      <SelectItem value="portrait">Portrait</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Icons Configuration */}
        <TabsContent value="icons" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Monitor className="h-5 w-5" />
                  App Icons
                </CardTitle>
                <Button onClick={addIcon} size="sm">
                  Add Icon
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {config.icons.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Monitor className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No icons configured</p>
                  <p className="text-sm">Add at least one icon for your PWA</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {config.icons.map((icon, index) => (
                    <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                      <div className="flex-1 grid grid-cols-4 gap-4">
                        <Input
                          value={icon.src}
                          onChange={(e) => {
                            const newIcons = [...config.icons];
                            newIcons[index].src = e.target.value;
                            updateConfig({ icons: newIcons });
                          }}
                          placeholder="/icons/icon-192x192.png"
                        />
                        <Input
                          value={icon.sizes}
                          onChange={(e) => {
                            const newIcons = [...config.icons];
                            newIcons[index].sizes = e.target.value;
                            updateConfig({ icons: newIcons });
                          }}
                          placeholder="192x192"
                        />
                        <Input
                          value={icon.type}
                          onChange={(e) => {
                            const newIcons = [...config.icons];
                            newIcons[index].type = e.target.value;
                            updateConfig({ icons: newIcons });
                          }}
                          placeholder="image/png"
                        />
                        <Select
                          value={icon.purpose || 'any'}
                          onValueChange={(value) => {
                            const newIcons = [...config.icons];
                            newIcons[index].purpose = value as 'any' | 'maskable' | 'monochrome';
                            updateConfig({ icons: newIcons });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any</SelectItem>
                            <SelectItem value="maskable">Maskable</SelectItem>
                            <SelectItem value="monochrome">Monochrome</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        onClick={() => removeIcon(index)}
                        variant="destructive"
                        size="sm"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Features Configuration */}
        <TabsContent value="features" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                PWA Features
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="installPrompt">Install Prompt</Label>
                      <p className="text-sm text-muted-foreground">Show app installation banner</p>
                    </div>
                    <Switch
                      id="installPrompt"
                      checked={config.features.installPrompt}
                      onCheckedChange={(checked) => updateFeatures('installPrompt', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="offlineSupport">Offline Support</Label>
                      <p className="text-sm text-muted-foreground">Enable offline functionality</p>
                    </div>
                    <Switch
                      id="offlineSupport"
                      checked={config.features.offlineSupport}
                      onCheckedChange={(checked) => updateFeatures('offlineSupport', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="backgroundSync">Background Sync</Label>
                      <p className="text-sm text-muted-foreground">Sync data when online</p>
                    </div>
                    <Switch
                      id="backgroundSync"
                      checked={config.features.backgroundSync}
                      onCheckedChange={(checked) => updateFeatures('backgroundSync', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="webShare">Web Share API</Label>
                      <p className="text-sm text-muted-foreground">Native sharing capabilities</p>
                    </div>
                    <Switch
                      id="webShare"
                      checked={config.features.webShare}
                      onCheckedChange={(checked) => updateFeatures('webShare', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="pushNotifications">Push Notifications</Label>
                      <p className="text-sm text-muted-foreground">Send push notifications</p>
                    </div>
                    <Switch
                      id="pushNotifications"
                      checked={config.features.pushNotifications}
                      onCheckedChange={(checked) => updateFeatures('pushNotifications', checked)}
                    />
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="fileSystemAccess">File System Access</Label>
                      <p className="text-sm text-muted-foreground">Read/write local files</p>
                    </div>
                    <Switch
                      id="fileSystemAccess"
                      checked={config.features.fileSystemAccess}
                      onCheckedChange={(checked) => updateFeatures('fileSystemAccess', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="cameraAccess">Camera Access</Label>
                      <p className="text-sm text-muted-foreground">Access device camera</p>
                    </div>
                    <Switch
                      id="cameraAccess"
                      checked={config.features.cameraAccess}
                      onCheckedChange={(checked) => updateFeatures('cameraAccess', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="geolocation">Geolocation</Label>
                      <p className="text-sm text-muted-foreground">Access user location</p>
                    </div>
                    <Switch
                      id="geolocation"
                      checked={config.features.geolocation}
                      onCheckedChange={(checked) => updateFeatures('geolocation', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="deviceVibration">Device Vibration</Label>
                      <p className="text-sm text-muted-foreground">Vibrate device for alerts</p>
                    </div>
                    <Switch
                      id="deviceVibration"
                      checked={config.features.deviceVibration}
                      onCheckedChange={(checked) => updateFeatures('deviceVibration', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="screenWakeLock">Screen Wake Lock</Label>
                      <p className="text-sm text-muted-foreground">Prevent screen from sleeping</p>
                    </div>
                    <Switch
                      id="screenWakeLock"
                      checked={config.features.screenWakeLock}
                      onCheckedChange={(checked) => updateFeatures('screenWakeLock', checked)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Caching Configuration */}
        <TabsContent value="caching" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Caching Strategy
                </CardTitle>
                <Button onClick={addCacheRule} size="sm">
                  Add Cache Rule
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="strategy">Strategy</Label>
                  <Select
                    value={config.caching.strategy}
                    onValueChange={(value: any) => updateConfig({
                      caching: { ...config.caching, strategy: value }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cache-first">Cache First</SelectItem>
                      <SelectItem value="network-first">Network First</SelectItem>
                      <SelectItem value="stale-while-revalidate">Stale While Revalidate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxCacheSize">Max Cache Size (MB)</Label>
                  <Input
                    id="maxCacheSize"
                    type="number"
                    value={config.caching.maxCacheSize}
                    onChange={(e) => updateConfig({
                      caching: { ...config.caching, maxCacheSize: parseInt(e.target.value) }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxAge">Max Age (seconds)</Label>
                  <Input
                    id="maxAge"
                    type="number"
                    value={config.caching.maxAge}
                    onChange={(e) => updateConfig({
                      caching: { ...config.caching, maxAge: parseInt(e.target.value) }
                    })}
                  />
                </div>
              </div>
              
              {config.serviceWorker.runtimeCaching.length > 0 && (
                <div className="space-y-4">
                  <h4 className="font-medium">Runtime Cache Rules</h4>
                  {config.serviceWorker.runtimeCaching.map((rule, index) => (
                    <div key={index} className="p-4 border rounded-lg space-y-3">
                      <div className="grid grid-cols-3 gap-4">
                        <Input
                          value={rule.urlPattern}
                          onChange={(e) => {
                            const newRules = [...config.serviceWorker.runtimeCaching];
                            newRules[index].urlPattern = e.target.value;
                            updateConfig({
                              serviceWorker: {
                                ...config.serviceWorker,
                                runtimeCaching: newRules
                              }
                            });
                          }}
                          placeholder="URL Pattern"
                        />
                        <Select
                          value={rule.handler}
                          onValueChange={(value: any) => {
                            const newRules = [...config.serviceWorker.runtimeCaching];
                            newRules[index].handler = value;
                            updateConfig({
                              serviceWorker: {
                                ...config.serviceWorker,
                                runtimeCaching: newRules
                              }
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CacheFirst">Cache First</SelectItem>
                            <SelectItem value="NetworkFirst">Network First</SelectItem>
                            <SelectItem value="StaleWhileRevalidate">Stale While Revalidate</SelectItem>
                            <SelectItem value="NetworkOnly">Network Only</SelectItem>
                            <SelectItem value="CacheOnly">Cache Only</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={rule.options.cacheName || ''}
                          onChange={(e) => {
                            const newRules = [...config.serviceWorker.runtimeCaching];
                            newRules[index].options.cacheName = e.target.value;
                            updateConfig({
                              serviceWorker: {
                                ...config.serviceWorker,
                                runtimeCaching: newRules
                              }
                            });
                          }}
                          placeholder="Cache Name"
                        />
                      </div>
                      <div className="flex gap-4">
                        <Input
                          type="number"
                          value={rule.options.expiration?.maxEntries || ''}
                          onChange={(e) => {
                            const newRules = [...config.serviceWorker.runtimeCaching];
                            if (!newRules[index].options.expiration) {
                              newRules[index].options.expiration = {};
                            }
                            newRules[index].options.expiration!.maxEntries = parseInt(e.target.value);
                            updateConfig({
                              serviceWorker: {
                                ...config.serviceWorker,
                                runtimeCaching: newRules
                              }
                            });
                          }}
                          placeholder="Max Entries"
                        />
                        <Input
                          type="number"
                          value={rule.options.expiration?.maxAgeSeconds || ''}
                          onChange={(e) => {
                            const newRules = [...config.serviceWorker.runtimeCaching];
                            if (!newRules[index].options.expiration) {
                              newRules[index].options.expiration = {};
                            }
                            newRules[index].options.expiration!.maxAgeSeconds = parseInt(e.target.value);
                            updateConfig({
                              serviceWorker: {
                                ...config.serviceWorker,
                                runtimeCaching: newRules
                              }
                            });
                          }}
                          placeholder="Max Age (seconds)"
                        />
                        <Button
                          onClick={() => {
                            const newRules = config.serviceWorker.runtimeCaching.filter((_, i) => i !== index);
                            updateConfig({
                              serviceWorker: {
                                ...config.serviceWorker,
                                runtimeCaching: newRules
                              }
                            });
                          }}
                          variant="destructive"
                          size="sm"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Offline Configuration */}
        <TabsContent value="offline" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <WifiOff className="h-5 w-5" />
                Offline Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="offlineEnabled">Enable Offline Support</Label>
                    <p className="text-sm text-muted-foreground">Allow app to work without internet</p>
                  </div>
                  <Switch
                    id="offlineEnabled"
                    checked={config.offline.enabled}
                    onCheckedChange={(checked) => updateConfig({
                      offline: { ...config.offline, enabled: checked }
                    })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="indexedDBEnabled">IndexedDB Storage</Label>
                    <p className="text-sm text-muted-foreground">Use IndexedDB for offline data</p>
                  </div>
                  <Switch
                    id="indexedDBEnabled"
                    checked={config.offline.indexedDBEnabled}
                    onCheckedChange={(checked) => updateConfig({
                      offline: { ...config.offline, indexedDBEnabled: checked }
                    })}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fallbackPage">Offline Fallback Page</Label>
                  <Input
                    id="fallbackPage"
                    value={config.offline.fallbackPage}
                    onChange={(e) => updateConfig({
                      offline: { ...config.offline, fallbackPage: e.target.value }
                    })}
                    placeholder="/offline"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="conflictResolution">Conflict Resolution</Label>
                  <Select
                    value={config.offline.conflictResolution}
                    onValueChange={(value: any) => updateConfig({
                      offline: { ...config.offline, conflictResolution: value }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client-wins">Client Wins</SelectItem>
                      <SelectItem value="server-wins">Server Wins</SelectItem>
                      <SelectItem value="manual">Manual Resolution</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Configuration */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Push Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="notificationsEnabled">Enable Push Notifications</Label>
                    <p className="text-sm text-muted-foreground">Send notifications to users</p>
                  </div>
                  <Switch
                    id="notificationsEnabled"
                    checked={config.notifications.enabled}
                    onCheckedChange={(checked) => updateConfig({
                      notifications: { ...config.notifications, enabled: checked }
                    })}
                  />
                </div>
                
                {config.notifications.enabled && (
                  <>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>VAPID Keys</Label>
                        <Button onClick={generateVAPIDKeys} variant="outline" size="sm">
                          Generate Keys
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="publicKey">Public Key</Label>
                          <Input
                            id="publicKey"
                            value={config.notifications.vapidKeys.publicKey}
                            onChange={(e) => updateConfig({
                              notifications: {
                                ...config.notifications,
                                vapidKeys: {
                                  ...config.notifications.vapidKeys,
                                  publicKey: e.target.value
                                }
                              }
                            })}
                            placeholder="VAPID Public Key"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="privateKey">Private Key</Label>
                          <Input
                            id="privateKey"
                            type="password"
                            value={config.notifications.vapidKeys.privateKey}
                            onChange={(e) => updateConfig({
                              notifications: {
                                ...config.notifications,
                                vapidKeys: {
                                  ...config.notifications.vapidKeys,
                                  privateKey: e.target.value
                                }
                              }
                            })}
                            placeholder="VAPID Private Key"
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="subscriberEndpoint">Subscriber Endpoint</Label>
                        <Input
                          id="subscriberEndpoint"
                          value={config.notifications.subscriberEndpoint}
                          onChange={(e) => updateConfig({
                            notifications: { ...config.notifications, subscriberEndpoint: e.target.value }
                          })}
                          placeholder="/api/notifications/subscribe"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="defaultIcon">Default Icon</Label>
                        <Input
                          id="defaultIcon"
                          value={config.notifications.defaultIcon}
                          onChange={(e) => updateConfig({
                            notifications: { ...config.notifications, defaultIcon: e.target.value }
                          })}
                          placeholder="/icons/notification-icon.png"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* PWA Score Breakdown */}
      {pwaScore > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              PWA Score Breakdown ({pwaScore}/100)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium">Basic Requirements (40pts)</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center justify-between">
                      <span>App Name & Short Name</span>
                      <Badge variant={config.name && config.shortName ? "default" : "secondary"}>
                        {config.name && config.shortName ? "✓ 10pts" : "✗ 0pts"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>App Icons</span>
                      <Badge variant={config.icons.length > 0 ? "default" : "secondary"}>
                        {config.icons.length > 0 ? "✓ 10pts" : "✗ 0pts"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Service Worker</span>
                      <Badge variant={config.serviceWorker.enabled ? "default" : "secondary"}>
                        {config.serviceWorker.enabled ? "✓ 20pts" : "✗ 0pts"}
                      </Badge>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium">Core Features (40pts)</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center justify-between">
                      <span>Offline Support</span>
                      <Badge variant={config.features.offlineSupport ? "default" : "secondary"}>
                        {config.features.offlineSupport ? "✓ 15pts" : "✗ 0pts"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Install Prompt</span>
                      <Badge variant={config.features.installPrompt ? "default" : "secondary"}>
                        {config.features.installPrompt ? "✓ 10pts" : "✗ 0pts"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Background Sync</span>
                      <Badge variant={config.features.backgroundSync ? "default" : "secondary"}>
                        {config.features.backgroundSync ? "✓ 10pts" : "✗ 0pts"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Push Notifications</span>
                      <Badge variant={config.features.pushNotifications ? "default" : "secondary"}>
                        {config.features.pushNotifications ? "✓ 5pts" : "✗ 0pts"}
                      </Badge>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium">Advanced Features (20pts)</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center justify-between">
                      <span>IndexedDB Storage</span>
                      <Badge variant={config.offline.indexedDBEnabled ? "default" : "secondary"}>
                        {config.offline.indexedDBEnabled ? "✓ 5pts" : "✗ 0pts"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Smart Caching</span>
                      <Badge variant={config.caching.strategy !== 'cache-first' ? "default" : "secondary"}>
                        {config.caching.strategy !== 'cache-first' ? "✓ 5pts" : "✗ 0pts"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Web Share API</span>
                      <Badge variant={config.features.webShare ? "default" : "secondary"}>
                        {config.features.webShare ? "✓ 5pts" : "✗ 0pts"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Runtime Caching</span>
                      <Badge variant={config.serviceWorker.runtimeCaching.length > 0 ? "default" : "secondary"}>
                        {config.serviceWorker.runtimeCaching.length > 0 ? "✓ 5pts" : "✗ 0pts"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span className="font-medium">PWA Compliance Level:</span>
                  <Badge variant={pwaScore >= 80 ? "default" : pwaScore >= 60 ? "secondary" : "destructive"}>
                    {pwaScore >= 80 ? "🏆 Excellent PWA" : pwaScore >= 60 ? "⚡ Good PWA" : "🔧 Needs Improvement"}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Developer Tools */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Developer Tools
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={previewManifest}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Globe className="h-4 w-4" />
              Preview Manifest
            </Button>
            
            <Button
              onClick={testServiceWorker}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              Preview Service Worker
            </Button>
            
            {config.features.backgroundSync && (
              <Button
                onClick={testBackgroundSync}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Wifi className="h-4 w-4" />
                Test Background Sync
              </Button>
            )}
            
            {config.features.pushNotifications && config.notifications.vapidKeys.publicKey && (
              <Button
                onClick={() => toast.info('Push notification test coming soon')}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Bell className="h-4 w-4" />
                Test Push Notifications
              </Button>
            )}
            
            <Button
              onClick={() => window.open('https://web.dev/pwa-checklist/', '_blank')}
              variant="outline"
              className="flex items-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              PWA Checklist
            </Button>
            
            <Button
              onClick={() => window.open('https://developer.chrome.com/docs/lighthouse/pwa/', '_blank')}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Zap className="h-4 w-4" />
              Lighthouse PWA
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Generate Button */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Ready to Generate PWA</h3>
              <p className="text-sm text-muted-foreground">
                Generate production-ready PWA files with service worker and manifest
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={generatePWA}
                disabled={isGenerating || validationErrors.length > 0}
                size="lg"
                className="px-8"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <CloudDownload className="h-4 w-4 mr-2" />
                    Generate PWA
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
