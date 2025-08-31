/**
 * Cross-Platform Navigation Component
 * Provides seamless navigation between Recoder.xyz platforms
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { useUnifiedAuth, PlatformNavigation } from '@/lib/unified-auth';
import { 
  Home, MessageSquare, Code, User, Settings, LogOut, 
  ExternalLink, Zap, Crown, Bell, Search
} from 'lucide-react';

interface PlatformNavigationProps {
  currentPlatform: 'main' | 'chat' | 'web';
  className?: string;
}

export function CrossPlatformNavigation({ currentPlatform, className = '' }: PlatformNavigationProps) {
  const { user, isAuthenticated, signOut } = useUnifiedAuth();

  const platforms = [
    {
      id: 'main' as const,
      name: 'Recoder.xyz',
      description: 'Main Platform',
      icon: Home,
      url: PlatformNavigation.getMainUrl(),
      active: currentPlatform === 'main'
    },
    {
      id: 'chat' as const, 
      name: 'Chat',
      description: 'Team Communication',
      icon: MessageSquare,
      url: PlatformNavigation.getChatUrl(),
      active: currentPlatform === 'chat'
    },
    {
      id: 'web' as const,
      name: 'Web Builder', 
      description: 'Code & Deploy',
      icon: Code,
      url: PlatformNavigation.getWebUrl(),
      active: currentPlatform === 'web'
    }
  ];

  return (
    <div className={`bg-slate-900 border-b border-slate-700 ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Platform Links */}
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-2">
              <Zap className="w-6 h-6 text-blue-400" />
              <span className="text-xl font-bold text-white">Recoder</span>
            </div>
            
            <nav className="hidden md:flex items-center space-x-1">
              {platforms.map((platform) => {
                const Icon = platform.icon;
                return (
                  <Link
                    key={platform.id}
                    href={platform.url}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                      platform.active
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                    target={platform.active ? '_self' : '_blank'}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{platform.name}</span>
                    {!platform.active && <ExternalLink className="w-3 h-3 opacity-60" />}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* User Section */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <button className="text-slate-300 hover:text-white">
                  <Search className="w-5 h-5" />
                </button>
                
                <button className="text-slate-300 hover:text-white relative">
                  <Bell className="w-5 h-5" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                </button>

                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <div className="hidden md:block">
                      <div className="text-sm font-medium text-white">{user?.name || user?.email}</div>
                      <div className="text-xs text-slate-400 capitalize">{user?.type} Plan</div>
                    </div>
                  </div>
                  
                  <div className="hidden md:flex items-center space-x-1">
                    <button className="text-slate-300 hover:text-white p-1">
                      <Settings className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={signOut}
                      className="text-slate-300 hover:text-white p-1"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-3">
                <Link
                  href={PlatformNavigation.getChatUrl('/login')}
                  className="text-slate-300 hover:text-white text-sm font-medium"
                >
                  Sign In
                </Link>
                <Link
                  href={PlatformNavigation.getChatUrl('/register')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden border-t border-slate-700">
        <div className="px-4 py-3">
          <nav className="flex items-center space-x-1">
            {platforms.map((platform) => {
              const Icon = platform.icon;
              return (
                <Link
                  key={platform.id}
                  href={platform.url}
                  className={`flex flex-col items-center space-y-1 px-3 py-2 rounded-lg transition-all duration-200 ${
                    platform.active
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                  target={platform.active ? '_self' : '_blank'}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs font-medium">{platform.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}

/**
 * Platform Status Indicator
 */
export function PlatformStatus() {
  const platforms = [
    { name: 'Main', status: 'online', url: PlatformNavigation.getMainUrl() },
    { name: 'Chat', status: 'online', url: PlatformNavigation.getChatUrl() },
    { name: 'Web', status: 'online', url: PlatformNavigation.getWebUrl() },
  ];

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-slate-300 mb-3">Platform Status</h3>
      <div className="space-y-2">
        {platforms.map((platform) => (
          <div key={platform.name} className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                platform.status === 'online' ? 'bg-green-400' : 'bg-red-400'
              }`} />
              <span className="text-sm text-slate-300">{platform.name}</span>
            </div>
            <Link 
              href={platform.url}
              className="text-xs text-blue-400 hover:text-blue-300"
              target="_blank"
            >
              Visit →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Quick Platform Switcher
 */
export function PlatformSwitcher() {
  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-slate-300 mb-3">Quick Switch</h3>
      <div className="grid grid-cols-3 gap-2">
        <button 
          onClick={() => PlatformNavigation.goToMain()}
          className="flex flex-col items-center space-y-1 p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
        >
          <Home className="w-5 h-5 text-blue-400" />
          <span className="text-xs text-slate-300">Main</span>
        </button>
        
        <button 
          onClick={() => PlatformNavigation.goToChat()}
          className="flex flex-col items-center space-y-1 p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
        >
          <MessageSquare className="w-5 h-5 text-green-400" />
          <span className="text-xs text-slate-300">Chat</span>
        </button>
        
        <button 
          onClick={() => PlatformNavigation.goToWeb()}
          className="flex flex-col items-center space-y-1 p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
        >
          <Code className="w-5 h-5 text-purple-400" />
          <span className="text-xs text-slate-300">Web</span>
        </button>
      </div>
    </div>
  );
}

export default CrossPlatformNavigation;
