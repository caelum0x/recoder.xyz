'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Download, X, Smartphone, Monitor, Zap, Shield, 
  Globe, Wifi, WifiOff, CheckCircle, Star
} from 'lucide-react';
import { toast } from 'sonner';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PWAInstallPromptProps {
  onInstalled?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export default function PWAInstallPrompt({ 
  onInstalled, 
  onDismiss, 
  className 
}: PWAInstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if device is iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Check if app is already running in standalone mode
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(standalone);

    // Check if app is already installed
    if (standalone) {
      setIsInstalled(true);
      return;
    }

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      setIsInstallable(true);
      
      // Show prompt after a delay to avoid being intrusive
      setTimeout(() => {
        setShowPrompt(true);
      }, 10000); // 10 seconds delay
    };

    // Listen for successful app install
    const handleAppInstalled = () => {
      console.log('PWA was installed');
      setIsInstalled(true);
      setShowPrompt(false);
      setIsInstallable(false);
      toast.success('App installed successfully!');
      onInstalled?.();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Service worker registration
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration);
          
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New content is available
                  toast.info('New app version available!', {
                    action: {
                      label: 'Update',
                      onClick: () => {
                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                        window.location.reload();
                      }
                    }
                  });
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [onInstalled]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    setIsLoading(true);
    
    try {
      // Show the install prompt
      await deferredPrompt.prompt();
      
      // Wait for user choice
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
        toast.success('Installing app...');
      } else {
        console.log('User dismissed the install prompt');
        toast.info('Install cancelled');
      }
      
      // Clean up
      setDeferredPrompt(null);
      setIsInstallable(false);
      setShowPrompt(false);
      
    } catch (error) {
      console.error('Install prompt failed:', error);
      toast.error('Install failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    onDismiss?.();
    
    // Don't show again for this session
    sessionStorage.setItem('pwa-prompt-dismissed', 'true');
  };

  // Don't show if already installed or dismissed
  if (isInstalled || isStandalone || 
      sessionStorage.getItem('pwa-prompt-dismissed') === 'true') {
    return null;
  }

  // Don't show if not installable and not iOS
  if (!isInstallable && !isIOS) {
    return null;
  }

  // Don't show prompt if explicitly hidden
  if (!showPrompt) {
    return null;
  }

  return (
    <Card className={`fixed bottom-4 right-4 w-80 shadow-lg border-2 border-blue-200 z-50 ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Download className="w-4 h-4 text-white" />
            </div>
            <CardTitle className="text-lg">Install App</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          Get the full Recoder.xyz experience
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1 text-green-600">
            <WifiOff className="w-3 h-3" />
            <span>Offline access</span>
          </div>
          <div className="flex items-center gap-1 text-blue-600">
            <Zap className="w-3 h-3" />
            <span>Faster loading</span>
          </div>
          <div className="flex items-center gap-1 text-purple-600">
            <Shield className="w-3 h-3" />
            <span>Secure & private</span>
          </div>
          <div className="flex items-center gap-1 text-orange-600">
            <Star className="w-3 h-3" />
            <span>Native feel</span>
          </div>
        </div>

        {isIOS ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              To install on iOS:
            </p>
            <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
              <li>Tap the share button in Safari</li>
              <li>Scroll down and tap "Add to Home Screen"</li>
              <li>Tap "Add" in the top right corner</li>
            </ol>
            <Button
              onClick={handleDismiss}
              className="w-full"
              size="sm"
            >
              Got it!
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              onClick={handleInstallClick}
              disabled={isLoading || !deferredPrompt}
              className="flex-1"
              size="sm"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Install App
            </Button>
            <Button
              onClick={handleDismiss}
              variant="outline"
              size="sm"
            >
              Later
            </Button>
          </div>
        )}
        
        <div className="flex items-center justify-center gap-1 text-xs text-gray-400">
          <CheckCircle className="w-3 h-3" />
          <span>Free & secure</span>
        </div>
      </CardContent>
    </Card>
  );
}