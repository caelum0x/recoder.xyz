/**
 * Session Sync Demonstration Component
 * Shows real-time session synchronization status across platforms
 */

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  AlertCircle,
  Users,
  Globe,
  MessageSquare,
  Terminal,
  Wifi,
  WifiOff
} from 'lucide-react';
import { clientSessionSync, SessionData } from '@/lib/session-sync';

interface PlatformStatus {
  name: string;
  icon: React.ElementType;
  url: string;
  synced: boolean;
  lastSync?: number;
}

export default function SessionSyncDemo() {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([
    { name: 'Recoder Web', icon: Globe, url: '/platform/web', synced: false },
    { name: 'Recoder Chat', icon: MessageSquare, url: '/platform/chat', synced: false },
    { name: 'CLI Access', icon: Terminal, url: '/cli', synced: false }
  ]);
  const [syncStatus, setSyncStatus] = useState<'checking' | 'synced' | 'not-synced'>('checking');

  useEffect(() => {
    checkSyncStatus();
    // Check sync status every 30 seconds
    const interval = setInterval(checkSyncStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkSyncStatus = async () => {
    try {
      const status = await clientSessionSync.checkSyncStatus();
      
      if (status.synced && status.sessionData) {
        setSessionData(status.sessionData);
        setSyncStatus('synced');
        
        // Update platform sync status
        setPlatforms(prev => prev.map(platform => ({
          ...platform,
          synced: true,
          lastSync: Date.now()
        })));
      } else {
        setSyncStatus('not-synced');
        setSessionData(null);
      }
    } catch (error) {
      console.error('Failed to check sync status:', error);
      setSyncStatus('not-synced');
    }
  };

  const triggerSync = async () => {
    if (!sessionData) return;
    
    setSyncStatus('checking');
    const success = await clientSessionSync.triggerSync(sessionData);
    
    if (success) {
      setSyncStatus('synced');
      await checkSyncStatus();
    } else {
      setSyncStatus('not-synced');
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-blue-100">
            {syncStatus === 'synced' ? (
              <Wifi className="w-5 h-5 text-blue-600" />
            ) : (
              <WifiOff className="w-5 h-5 text-gray-500" />
            )}
          </div>
          <div>
            <CardTitle className="text-lg">Cross-Platform Session Sync</CardTitle>
            <CardDescription>
              Real-time authentication synchronization across all Recoder platforms
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Sync Status */}
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              {syncStatus === 'synced' ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : syncStatus === 'checking' ? (
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <AlertCircle className="w-5 h-5 text-orange-500" />
              )}
              <span className="font-medium">
                {syncStatus === 'synced' ? 'Session Synchronized' : 
                 syncStatus === 'checking' ? 'Checking...' : 'Not Synchronized'}
              </span>
            </div>
          </div>
          <Badge variant={syncStatus === 'synced' ? 'default' : 'secondary'}>
            {syncStatus === 'synced' ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        {/* Session Info */}
        {sessionData && (
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-blue-900">Session Details</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">User:</span>
                <div className="font-medium">{sessionData.name}</div>
              </div>
              <div>
                <span className="text-gray-600">Plan:</span>
                <div className="font-medium capitalize">{sessionData.plan}</div>
              </div>
              <div>
                <span className="text-gray-600">Domains:</span>
                <div className="font-medium">{sessionData.domains.length}</div>
              </div>
              <div>
                <span className="text-gray-600">Expires:</span>
                <div className="font-medium">
                  {new Date(sessionData.expiresAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Platform Status */}
        <div>
          <h4 className="font-medium mb-3">Platform Synchronization</h4>
          <div className="space-y-3">
            {platforms.map((platform, index) => {
              const Icon = platform.icon;
              return (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="font-medium">{platform.name}</div>
                      <div className="text-xs text-gray-500">
                        {platform.lastSync && `Last sync: ${new Date(platform.lastSync).toLocaleTimeString()}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {platform.synced ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-gray-400" />
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(platform.url, '_blank')}
                    >
                      Access
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-2">
          <Button onClick={checkSyncStatus} variant="outline" className="flex-1">
            Refresh Status
          </Button>
          {sessionData && (
            <Button onClick={triggerSync} className="flex-1">
              Sync Platforms
            </Button>
          )}
        </div>

        {/* Info */}
        <div className="text-xs text-gray-500 p-3 bg-gray-50 rounded-lg">
          <strong>How it works:</strong> When you sign in on any Recoder platform, your session is automatically 
          synchronized across all platforms. This allows seamless switching between web, chat, CLI, and other tools 
          without re-authentication.
        </div>
      </CardContent>
    </Card>
  );
}