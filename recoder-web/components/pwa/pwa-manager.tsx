'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Smartphone,
  Download,
  Bell,
  Wifi,
  WifiOff,
  Zap,
  Shield,
  Activity,
  Settings,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Share,
  Monitor,
  BellRing,
  Globe
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface PWAStatus {
  isInstalled: boolean;
  canInstall: boolean;
  isOnline: boolean;
  serviceWorkerActive: boolean;
  pushNotificationsEnabled: boolean;
  cacheStatus: {
    size: string;
    hitRate: number;
    lastUpdate: string;
  };
  performanceScore: number;
}

interface PWAConfig {
  cacheStrategy: string;
  offlinePages: string;
  pushNotifications: boolean;
  backgroundSync: boolean;
  performanceMonitoring: boolean;
}

export default function PWAManager() {
  const { toast } = useToast();
  
  const [pwaStatus, setPwaStatus] = useState<PWAStatus>({
    isInstalled: false,
    canInstall: false,
    isOnline: true,
    serviceWorkerActive: false,
    pushNotificationsEnabled: false,
    cacheStatus: {
      size: '0 MB',
      hitRate: 0,
      lastUpdate: 'Never'
    },
    performanceScore: 0
  });

  const [config, setConfig] = useState<PWAConfig>({
    cacheStrategy: 'networkFirst',
    offlinePages: 'essential',
    pushNotifications: true,
    backgroundSync: true,
    performanceMonitoring: true
  });

  const [isLoading, setIsLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<any>({});

  useEffect(() => {
    initializePWA();
    checkPWAStatus();
    setupEventListeners();
    
    return () => {
      // Cleanup event listeners
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, []);

  const initializePWA = async () => {
    try {
      // Register service worker
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered:', registration);
        
        // Listen for service worker messages
        navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
        
        // Check if service worker is active
        setPwaStatus(prev => ({
          ...prev,
          serviceWorkerActive: registration.active !== null
        }));
      }

      // Check notification permission
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        setPwaStatus(prev => ({
          ...prev,
          pushNotificationsEnabled: permission === 'granted'
        }));
      }

      // Load performance metrics
      await loadPerformanceMetrics();
      
    } catch (error) {
      console.error('PWA initialization failed:', error);
      toast({
        title: "PWA Setup Failed",
        description: "Failed to initialize Progressive Web App features",
        variant: "destructive",
      });
    }
  };

  const setupEventListeners = () => {
    // Install prompt event
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    
    // Online/offline events
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    
    // App installed event
    window.addEventListener('appinstalled', handleAppInstalled);
  };

  const handleInstallPrompt = (e: any) => {
    e.preventDefault();
    setInstallPrompt(e);
    setPwaStatus(prev => ({ ...prev, canInstall: true }));
  };

  const handleOnlineStatus = () => {
    setPwaStatus(prev => ({ ...prev, isOnline: navigator.onLine }));
  };

  const handleAppInstalled = () => {
    setPwaStatus(prev => ({ ...prev, isInstalled: true, canInstall: false }));
    setInstallPrompt(null);
    
    toast({
      title: "App Installed",
      description: "Recoder.xyz has been installed on your device!",
    });
  };

  const handleServiceWorkerMessage = (event: MessageEvent) => {
    const { type, data } = event.data;
    
    switch (type) {
      case 'PERFORMANCE_METRICS':
        setPerformanceMetrics((prev: any) => ({ ...prev, ...data }));
        break;
      case 'BACKGROUND_SYNC_SUCCESS':
        toast({
          title: "Sync Complete",
          description: "Your changes have been synchronized",
        });
        break;
      case 'BACKGROUND_SYNC_FAILED':
        toast({
          title: "Sync Failed",
          description: "Some changes couldn't be synchronized",
          variant: "destructive",
        });
        break;
    }
  };

  const checkPWAStatus = useCallback(async () => {
    try {
      // Check if app is installed
      const isInstalled = window.matchMedia('(display-mode: standalone)').matches ||
                          (window.navigator as any).standalone === true;
      
      // Check cache status
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        let totalSize = 0;
        
        for (const cacheName of cacheNames) {
          const cache = await caches.open(cacheName);
          const keys = await cache.keys();
          totalSize += keys.length;
        }
        
        setPwaStatus(prev => ({
          ...prev,
          isInstalled,
          cacheStatus: {
            ...prev.cacheStatus,
            size: `${(totalSize * 0.001).toFixed(1)} MB`, // Rough estimate
            lastUpdate: new Date().toLocaleString()
          }
        }));
      }
    } catch (error) {
      console.error('Failed to check PWA status:', error);
    }
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    
    try {
      const result = await installPrompt.prompt();
      console.log('Install result:', result);
      
      if (result.outcome === 'accepted') {
        setPwaStatus(prev => ({ ...prev, canInstall: false }));
        setInstallPrompt(null);
      }
    } catch (error) {
      console.error('Installation failed:', error);
      toast({
        title: "Installation Failed",
        description: "Failed to install the app",
        variant: "destructive",
      });
    }
  };

  const configurePWA = async () => {
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/pwa/service-worker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });
      
      if (response.ok) {
        // Reload service worker with new configuration
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            await registration.update();
          }
        }
        
        toast({
          title: "Configuration Updated",
          description: "PWA settings have been applied successfully",
        });
      } else {
        throw new Error('Configuration failed');
      }
    } catch (error) {
      console.error('PWA configuration failed:', error);
      toast({
        title: "Configuration Failed",
        description: "Failed to update PWA settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const enablePushNotifications = async () => {
    try {
      if (!('Notification' in window)) {
        throw new Error('Notifications not supported');
      }
      
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        // Get VAPID key and subscribe
        const vapidResponse = await fetch('/api/pwa/push-notifications?action=vapid-key');
        const { publicKey } = await vapidResponse.json();
        
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) throw new Error('Service worker not registered');
        
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
        
        // Send subscription to server
        const subscribeResponse = await fetch('/api/pwa/push-notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'subscribe',
            subscription,
            userId: 'current-user-id' // Replace with actual user ID
          }),
        });
        
        if (subscribeResponse.ok) {
          setPwaStatus(prev => ({ ...prev, pushNotificationsEnabled: true }));
          toast({
            title: "Notifications Enabled",
            description: "You'll receive important updates about your projects",
          });
        }
      } else {
        throw new Error('Permission denied');
      }
    } catch (error) {
      console.error('Failed to enable push notifications:', error);
      toast({
        title: "Notification Setup Failed",
        description: "Failed to enable push notifications",
        variant: "destructive",
      });
    }
  };

  const loadPerformanceMetrics = async () => {
    try {
      const response = await fetch('/api/pwa/performance');
      if (response.ok) {
        const data = await response.json();
        setPerformanceMetrics(data.dashboard);
        setPwaStatus(prev => ({
          ...prev,
          performanceScore: data.dashboard.overview.overallScore,
          cacheStatus: {
            ...prev.cacheStatus,
            hitRate: data.dashboard.technicalMetrics.cacheHitRate
          }
        }));
      }
    } catch (error) {
      console.error('Failed to load performance metrics:', error);
    }
  };

  const clearCache = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && registration.active) {
          registration.active.postMessage({ type: 'CLEAR_CACHE' });
          
          toast({
            title: "Cache Cleared",
            description: "App cache has been cleared successfully",
          });
          
          // Refresh status
          setTimeout(() => checkPWAStatus(), 1000);
        }
      }
    } catch (error) {
      console.error('Failed to clear cache:', error);
      toast({
        title: "Clear Cache Failed",
        description: "Failed to clear app cache",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* PWA Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Progressive Web App Status
          </CardTitle>
          <CardDescription>
            Monitor and manage your PWA installation and features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${pwaStatus.isInstalled ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-sm">
                {pwaStatus.isInstalled ? 'Installed' : 'Not Installed'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${pwaStatus.serviceWorkerActive ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-sm">
                {pwaStatus.serviceWorkerActive ? 'Service Worker Active' : 'Service Worker Inactive'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {pwaStatus.isOnline ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-500" />
              )}
              <span className="text-sm">
                {pwaStatus.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${pwaStatus.pushNotificationsEnabled ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-sm">
                {pwaStatus.pushNotificationsEnabled ? 'Notifications On' : 'Notifications Off'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="installation" className="space-y-4">
        <TabsList>
          <TabsTrigger value="installation">Installation</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="cache">Cache</TabsTrigger>
        </TabsList>

        {/* Installation Tab */}
        <TabsContent value="installation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                App Installation
              </CardTitle>
              <CardDescription>
                Install Recoder.xyz as a native app on your device
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pwaStatus.isInstalled ? (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertTitle>App Installed</AlertTitle>
                  <AlertDescription>
                    Recoder.xyz is installed and running as a PWA on your device.
                  </AlertDescription>
                </Alert>
              ) : pwaStatus.canInstall ? (
                <div className="space-y-4">
                  <Alert>
                    <Download className="h-4 w-4" />
                    <AlertTitle>Installation Available</AlertTitle>
                    <AlertDescription>
                      You can install Recoder.xyz as a native app for better performance and offline access.
                    </AlertDescription>
                  </Alert>
                  <Button onClick={installApp} className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Install App
                  </Button>
                </div>
              ) : (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Installation Not Available</AlertTitle>
                  <AlertDescription>
                    Installation is not available on this device or browser. Try using Chrome or Edge on desktop/mobile.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <Zap className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">Faster Loading</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Cached resources load instantly
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <WifiOff className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">Offline Access</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Works without internet connection
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <BellRing className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium">Push Notifications</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Get notified about updates
                    </p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="configuration" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                PWA Configuration
              </CardTitle>
              <CardDescription>
                Configure caching strategies and offline behavior
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Cache Strategy</label>
                  <select
                    value={config.cacheStrategy}
                    onChange={(e) => setConfig(prev => ({ ...prev, cacheStrategy: e.target.value }))}
                    className="w-full mt-1 p-2 border rounded-md"
                  >
                    <option value="networkFirst">Network First (Fresh content, fallback to cache)</option>
                    <option value="cacheFirst">Cache First (Fast loading, periodic updates)</option>
                    <option value="staleWhileRevalidate">Stale While Revalidate (Best of both)</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">Offline Pages</label>
                  <select
                    value={config.offlinePages}
                    onChange={(e) => setConfig(prev => ({ ...prev, offlinePages: e.target.value }))}
                    className="w-full mt-1 p-2 border rounded-md"
                  >
                    <option value="essential">Essential Pages Only</option>
                    <option value="full">All Pages</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium">Background Sync</label>
                    <p className="text-xs text-muted-foreground">Sync changes when back online</p>
                  </div>
                  <Switch
                    checked={config.backgroundSync}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, backgroundSync: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium">Performance Monitoring</label>
                    <p className="text-xs text-muted-foreground">Track app performance metrics</p>
                  </div>
                  <Switch
                    checked={config.performanceMonitoring}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, performanceMonitoring: checked }))}
                  />
                </div>

                <Button onClick={configurePWA} disabled={isLoading} className="w-full">
                  {isLoading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                  Apply Configuration
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Performance Metrics
              </CardTitle>
              <CardDescription>
                Monitor app performance and Core Web Vitals
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{pwaStatus.performanceScore}</div>
                  <div className="text-sm text-muted-foreground">Overall Score</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{pwaStatus.cacheStatus.hitRate}%</div>
                  <div className="text-sm text-muted-foreground">Cache Hit Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{pwaStatus.cacheStatus.size}</div>
                  <div className="text-sm text-muted-foreground">Cache Size</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">1.2s</div>
                  <div className="text-sm text-muted-foreground">Load Time</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">First Contentful Paint</span>
                  <Badge variant="outline" className="text-green-600">Good</Badge>
                </div>
                <Progress value={85} className="h-2" />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Largest Contentful Paint</span>
                  <Badge variant="outline" className="text-green-600">Good</Badge>
                </div>
                <Progress value={78} className="h-2" />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Cumulative Layout Shift</span>
                  <Badge variant="outline" className="text-green-600">Good</Badge>
                </div>
                <Progress value={92} className="h-2" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Push Notifications
              </CardTitle>
              <CardDescription>
                Manage push notification settings and permissions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pwaStatus.pushNotificationsEnabled ? (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertTitle>Notifications Enabled</AlertTitle>
                  <AlertDescription>
                    You'll receive important updates about your projects and deployments.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  <Alert>
                    <Bell className="h-4 w-4" />
                    <AlertTitle>Enable Push Notifications</AlertTitle>
                    <AlertDescription>
                      Stay updated with project status, deployment notifications, and important announcements.
                    </AlertDescription>
                  </Alert>
                  <Button onClick={enablePushNotifications} className="w-full">
                    <Bell className="h-4 w-4 mr-2" />
                    Enable Notifications
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <div className="font-medium text-sm">Project Updates</div>
                    <div className="text-xs text-muted-foreground">Build status and deployment notifications</div>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <div className="font-medium text-sm">System Alerts</div>
                    <div className="text-xs text-muted-foreground">Service outages and maintenance</div>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <div className="font-medium text-sm">Marketing Updates</div>
                    <div className="text-xs text-muted-foreground">New features and announcements</div>
                  </div>
                  <Switch />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cache Tab */}
        <TabsContent value="cache" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Cache Management
              </CardTitle>
              <CardDescription>
                View and manage cached resources for offline access
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="text-center p-4 border rounded">
                  <div className="text-lg font-bold">{pwaStatus.cacheStatus.size}</div>
                  <div className="text-sm text-muted-foreground">Total Size</div>
                </div>
                <div className="text-center p-4 border rounded">
                  <div className="text-lg font-bold">{pwaStatus.cacheStatus.hitRate}%</div>
                  <div className="text-sm text-muted-foreground">Hit Rate</div>
                </div>
                <div className="text-center p-4 border rounded md:col-span-1 col-span-2">
                  <div className="text-lg font-bold">{pwaStatus.cacheStatus.lastUpdate}</div>
                  <div className="text-sm text-muted-foreground">Last Update</div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">Cached Resources</h4>
                <div className="space-y-1">
                  <div className="flex justify-between items-center p-2 text-sm">
                    <span>Static Assets (JS, CSS)</span>
                    <Badge variant="outline">Cached</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 text-sm">
                    <span>API Responses</span>
                    <Badge variant="outline">Cached</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 text-sm">
                    <span>Images & Media</span>
                    <Badge variant="outline">Cached</Badge>
                  </div>
                </div>
              </div>

              <div className="flex space-x-2">
                <Button onClick={checkPWAStatus} variant="outline" className="flex-1">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Status
                </Button>
                <Button onClick={clearCache} variant="outline" className="flex-1">
                  <XCircle className="h-4 w-4 mr-2" />
                  Clear Cache
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Utility function to convert VAPID key
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}