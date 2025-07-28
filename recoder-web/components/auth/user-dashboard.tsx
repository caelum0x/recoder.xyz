'use client';

/**
 * User Dashboard Component for Recoder Web App
 * Shows authentication status, quota usage, and cross-platform connections
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth-context';

interface QuotaDisplayProps {
  used: number;
  total: number;
  resetDate: string;
}

function QuotaDisplay({ used, total, resetDate }: QuotaDisplayProps) {
  const percentage = Math.round((used / total) * 100);
  const remaining = total - used;
  
  const getQuotaColor = () => {
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getProgressColor = () => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">Request Quota</span>
        <span className={`text-sm font-semibold ${getQuotaColor()}`}>
          {used.toLocaleString()}/{total.toLocaleString()}
        </span>
      </div>
      
      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div 
          className={`h-2 rounded-full transition-all duration-300 ${getProgressColor()}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        ></div>
      </div>
      
      <div className="flex justify-between text-xs text-gray-500">
        <span>{remaining.toLocaleString()} remaining</span>
        <span>Resets {new Date(resetDate).toLocaleDateString()}</span>
      </div>
      
      {percentage >= 90 && (
        <div className="mt-2 text-xs text-red-600 font-medium">
          ⚠️ Quota nearly exhausted - consider upgrading
        </div>
      )}
    </div>
  );
}

interface PlatformStatusProps {
  platforms: {
    cli: boolean;
    web: boolean;
    extension: boolean;
    router: boolean;
  };
}

function PlatformStatus({ platforms }: PlatformStatusProps) {
  const platformIcons = {
    cli: '💻',
    web: '🌐',
    extension: '🔌',
    router: '🔄'
  };

  const platformNames = {
    cli: 'CLI',
    web: 'Web App',
    extension: 'VS Code Extension',
    router: 'Router'
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h4 className="text-sm font-medium text-gray-700 mb-3">Connected Platforms</h4>
      <div className="space-y-2">
        {Object.entries(platforms).map(([platform, connected]) => (
          <div key={platform} className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-lg">
                {platformIcons[platform as keyof typeof platformIcons]}
              </span>
              <span className="text-sm text-gray-700">
                {platformNames[platform as keyof typeof platformNames]}
              </span>
            </div>
            <div className={`flex items-center space-x-1 ${connected ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`}></div>
              <span className="text-xs font-medium">
                {connected ? 'Connected' : 'Offline'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UserDashboard() {
  const { user, logout, syncSession } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    // Auto-sync session every 5 minutes
    const interval = setInterval(async () => {
      try {
        await syncSession();
        setLastSync(new Date());
      } catch (error) {
        console.warn('Auto-sync failed:', error);
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [syncSession]);

  const handleSync = async () => {
    setIsLoading(true);
    try {
      await syncSession();
      setLastSync(new Date());
    } catch (error) {
      console.error('Manual sync failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (confirm('Are you sure you want to log out from the web app?')) {
      await logout();
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-md">
      {/* User info header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{user.email}</h3>
          <p className="text-sm text-gray-600 capitalize">{user.plan} Plan</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSync}
            disabled={isLoading}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            title="Sync session"
          >
            <svg 
              className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-red-600 transition-colors"
            title="Logout"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Quota display */}
      <div className="mb-6">
        <QuotaDisplay 
          used={user.quotas.usedRequests}
          total={user.quotas.totalRequests}
          resetDate={user.quotas.resetDate}
        />
      </div>

      {/* Platform connections */}
      <div className="mb-4">
        <PlatformStatus platforms={user.platforms} />
      </div>

      {/* Sync info */}
      {lastSync && (
        <div className="text-xs text-gray-500 text-center">
          Last synced: {lastSync.toLocaleTimeString()}
        </div>
      )}

      {/* Plan upgrade prompt */}
      {user.plan === 'free' && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <span className="text-blue-600">💡</span>
            <div>
              <p className="text-sm text-blue-800 font-medium">Upgrade to Pro</p>
              <p className="text-xs text-blue-600">
                Get more requests and premium features
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserDashboard;