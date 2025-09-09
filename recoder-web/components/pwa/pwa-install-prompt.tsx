'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Download, 
  Smartphone, 
  Monitor, 
  Zap, 
  Wifi, 
  WifiOff, 
  X,
  Check,
  Star,
  Clock,
  Shield,
  Sparkles
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PWAInstallPromptProps {
  className?: string;
}

export default function PWAInstallPrompt({ className = '' }: PWAInstallPromptProps) {
  const { toast } = useToast();
  
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [showPrompt, setShowPrompt] = useState(false);
  const [platform, setPlatform] = useState<string>('');
  const [installStats, setInstallStats] = useState({
    cacheSize: '0 MB',
    offlineFeatures: 0,
    lastUpdate: null as Date | null
  });

  useEffect(() => {
    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('mobile') || userAgent.includes('android')) {
      setPlatform('mobile');
    } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
      setPlatform('ios');
    } else {
      setPlatform('desktop');
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
      
      // Show prompt after a delay if not dismissed before
      setTimeout(() => {
        if (!isInstalled && !localStorage.getItem('pwa-install-dismissed')) {
          setShowPrompt(true);
        }
      }, 10000); // Show after 10 seconds
    };

    // Listen for app installation
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setIsInstallable(false);
      
      toast({
        title: "App installed successfully!",
        description: "Recoder.xyz is now available on your device",
      });

      // Track installation
      trackInstallation();
    };

    // Listen for online/offline status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Get install stats
    getInstallStats();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isInstalled, toast]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      
      if (choiceResult.outcome === 'accepted') {
        toast({
          title: "Installing app...",
          description: "Recoder.xyz is being installed on your device",
        });
      } else {
        toast({
          title: "Installation cancelled",
          description: "You can install the app later from the browser menu",
        });
      }
      
      setDeferredPrompt(null);
      setShowPrompt(false);
      
    } catch (error) {
      console.error('Installation error:', error);
      toast({
        title: "Installation failed",
        description: "Please try installing from your browser menu",
        variant: "destructive",
      });
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    
    // Show again in 7 days
    setTimeout(() => {
      localStorage.removeItem('pwa-install-dismissed');
    }, 7 * 24 * 60 * 60 * 1000);
  };

  const trackInstallation = async () => {
    try {
      await fetch('/api/analytics/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event: 'pwa_installed',
          platform,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent
        }),
      });
    } catch (error) {
      console.error('Failed to track installation:', error);
    }
  };

  const getInstallStats = async () => {
    try {
      // Get cache size
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const cacheSizeMB = Math.round((estimate.usage || 0) / 1024 / 1024);
        setInstallStats(prev => ({
          ...prev,
          cacheSize: `${cacheSizeMB} MB`,
          offlineFeatures: 8, // Number of features that work offline
          lastUpdate: new Date()
        }));
      }
    } catch (error) {
      console.error('Failed to get install stats:', error);
    }
  };

  const getPlatformInstructions = () => {
    switch (platform) {
      case 'ios':
        return 'Tap the Share button in Safari, then "Add to Home Screen"';
      case 'mobile':
        return 'Tap "Add to Home Screen" from your browser menu';
      case 'desktop':
      default:
        return 'Click the install icon in your browser address bar';
    }
  };

  const getPlatformIcon = () => {
    switch (platform) {
      case 'ios':
      case 'mobile':
        return <Smartphone className="h-6 w-6" />;
      case 'desktop':
      default:
        return <Monitor className="h-6 w-6" />;
    }
  };

  if (isInstalled) {
    return (
      <Card className={`border-green-200 bg-green-50 ${className}`}>
        <CardContent className="flex items-center gap-3 p-4">
          <Check className="h-5 w-5 text-green-600" />
          <div className="flex-1">
            <p className="font-medium text-green-900">App Installed</p>
            <p className="text-sm text-green-700">
              Recoder.xyz is ready to use offline
            </p>
          </div>
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            {installStats.cacheSize}
          </Badge>
        </CardContent>
      </Card>
    );
  }

  if (!showPrompt && !isInstallable) {
    return null;
  }

  return (
    <Card className={`border-blue-200 bg-blue-50 ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getPlatformIcon()}
            <div>
              <CardTitle className="text-lg text-blue-900">
                Install Recoder.xyz
              </CardTitle>
              <CardDescription className="text-blue-700">
                Get the full experience with offline access
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Features Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Zap className="h-4 w-4 text-yellow-600" />
            <span>Faster loading</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <WifiOff className="h-4 w-4 text-green-600" />
            <span>Works offline</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-blue-600" />
            <span>Secure & private</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-purple-600" />
            <span>Native experience</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {installStats.offlineFeatures} offline features
          </div>
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3" />
            90% faster startup
          </div>
          <div className="flex items-center gap-1">
            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnline ? 'Online' : 'Offline'}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {isInstallable && deferredPrompt ? (
            <Button onClick={handleInstallClick} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              Install App
            </Button>
          ) : (
            <div className="flex-1 p-2 text-center text-sm text-muted-foreground border rounded">
              {getPlatformInstructions()}
            </div>
          )}
          <Button variant="outline" onClick={handleDismiss}>
            Later
          </Button>
        </div>

        {/* Additional Info */}
        <div className="text-xs text-muted-foreground">
          <p>• No app store required • Automatic updates • Uninstall anytime</p>
        </div>
      </CardContent>
    </Card>
  );
}