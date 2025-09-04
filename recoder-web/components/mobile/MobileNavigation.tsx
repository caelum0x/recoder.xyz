'use client';

import React, { useState } from 'react';
import {
  Home,
  BarChart3,
  Target,
  Users,
  Settings,
  Plus,
  Bell,
  Search,
  Menu,
  X,
  Zap,
  FileText,
  Calendar,
  DollarSign,
  Activity,
  Sparkles,
  Shield,
  Globe,
  MessageSquare,
  Camera,
  Video,
  Image as ImageIcon,
  TrendingUp,
  Eye,
  Heart,
  Share2,
  Download,
  Upload,
  Filter,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface MobileNavigationProps {
  user?: any;
  notifications?: number;
}

export default function MobileNavigation({ user, notifications = 0 }: MobileNavigationProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null);
  const pathname = usePathname();

  const navigationItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, href: '/platform', color: 'text-blue-600' },
    { id: 'campaigns', label: 'Campaigns', icon: Target, href: '/campaigns', color: 'text-purple-600' },
    { id: 'content', label: 'Content', icon: FileText, href: '/content', color: 'text-green-600' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/analytics', color: 'text-orange-600' },
    { id: 'team', label: 'Team', icon: Users, href: '/team', color: 'text-indigo-600' }
  ];

  const quickActions = [
    { id: 'create_post', label: 'Create Post', icon: Plus, action: 'create_content' },
    { id: 'new_campaign', label: 'New Campaign', icon: Target, action: 'create_campaign' },
    { id: 'schedule_post', label: 'Schedule', icon: Calendar, action: 'schedule_content' },
    { id: 'ai_generate', label: 'AI Generate', icon: Sparkles, action: 'ai_content' },
  ];

  const sidebarSections = [
    {
      title: 'Main',
      items: [
        { label: 'Dashboard', icon: Home, href: '/platform' },
        { label: 'Campaigns', icon: Target, href: '/campaigns' },
        { label: 'Content Library', icon: FileText, href: '/content' },
        { label: 'Analytics', icon: BarChart3, href: '/analytics' },
        { label: 'Social Posts', icon: MessageSquare, href: '/social' },
      ]
    },
    {
      title: 'Tools',
      items: [
        { label: 'Automation', icon: Zap, href: '/automation' },
        { label: 'AI Studio', icon: Sparkles, href: '/ai-studio' },
        { label: 'Scheduler', icon: Calendar, href: '/scheduler' },
        { label: 'Media Library', icon: ImageIcon, href: '/media' },
        { label: 'Performance', icon: TrendingUp, href: '/performance' },
      ]
    },
    {
      title: 'Team',
      items: [
        { label: 'Team Members', icon: Users, href: '/team' },
        { label: 'Collaboration', icon: MessageSquare, href: '/collaboration' },
        { label: 'Tasks', icon: FileText, href: '/tasks' },
        { label: 'Approvals', icon: Shield, href: '/approvals' },
      ]
    },
    {
      title: 'Account',
      items: [
        { label: 'Settings', icon: Settings, href: '/settings' },
        { label: 'Billing', icon: DollarSign, href: '/billing' },
        { label: 'Profile', icon: Users, href: '/profile' },
        { label: 'Security', icon: Shield, href: '/security' },
      ]
    }
  ];

  const isActiveRoute = (href: string) => {
    return pathname === href || (pathname && pathname.startsWith(href + '/'));
  };

  const handleQuickAction = (action: string) => {
    setActiveQuickAction(action);
    // Add your quick action logic here
    setTimeout(() => setActiveQuickAction(null), 2000);
  };

  return (
    <>
      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
        <div className="grid grid-cols-5 h-16">
          {navigationItems.map((item) => {
            const isActive = isActiveRoute(item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex flex-col items-center justify-center space-y-1 ${
                  isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <item.icon className={`h-5 w-5 ${isActive ? item.color : ''}`} />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="flex items-center space-x-1">
            <span className="text-xl font-bold text-blue-600">Recoder</span>
            <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
            <span className="text-lg font-semibold text-gray-900">Platform</span>
          </div>

          <div className="flex items-center space-x-2">
            <button className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg relative">
              <Bell className="h-5 w-5" />
              {notifications > 0 && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                  <span className="text-xs text-white font-medium">
                    {notifications > 9 ? '9+' : notifications}
                  </span>
                </div>
              )}
            </button>
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">
                {user?.name?.charAt(0) || 'U'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setIsSidebarOpen(false)} />
          
          <div className="absolute top-0 left-0 w-80 h-full bg-white shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {user?.name?.charAt(0) || 'U'}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{user?.name || 'User'}</div>
                  <div className="text-sm text-gray-500">{user?.email || 'user@example.com'}</div>
                </div>
              </div>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto h-full pb-20">
              {/* Quick Actions */}
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-2">
                  {quickActions.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleQuickAction(action.action)}
                      className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                        activeQuickAction === action.action
                          ? 'border-blue-500 bg-blue-50 text-blue-600'
                          : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <action.icon className="h-6 w-6 mb-1" />
                      <span className="text-xs font-medium">{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Navigation Sections */}
              {sidebarSections.map((section) => (
                <div key={section.title} className="p-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">{section.title}</h3>
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const isActive = isActiveRoute(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsSidebarOpen(false)}
                          className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-blue-100 text-blue-600 border border-blue-200'
                              : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                          }`}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* System Status */}
              <div className="p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">System Status</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm text-gray-700">All Systems</span>
                    </div>
                    <span className="text-xs text-green-600 font-medium">Operational</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Activity className="h-3 w-3 text-gray-400" />
                      <span className="text-sm text-gray-700">99.9% Uptime</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Action Floating Button */}
      <div className="lg:hidden fixed bottom-20 right-4 z-30">
        <div className="relative">
          <button
            onClick={() => handleQuickAction('floating_menu')}
            className="w-14 h-14 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full shadow-lg flex items-center justify-center"
          >
            {activeQuickAction === 'floating_menu' ? (
              <X className="h-6 w-6 text-white" />
            ) : (
              <Plus className="h-6 w-6 text-white" />
            )}
          </button>

          {/* Floating Action Menu */}
          {activeQuickAction === 'floating_menu' && (
            <div className="absolute bottom-16 right-0 space-y-2">
              {[
                { icon: Camera, label: 'Photo', action: 'camera' },
                { icon: Video, label: 'Video', action: 'video' },
                { icon: FileText, label: 'Text', action: 'text' },
                { icon: Sparkles, label: 'AI', action: 'ai' },
              ].map((item) => (
                <div
                  key={item.action}
                  className="flex items-center space-x-3 bg-white rounded-full shadow-lg px-3 py-2 border"
                >
                  <button
                    onClick={() => handleQuickAction(item.action)}
                    className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                  >
                    <item.icon className="h-5 w-5 text-gray-600" />
                  </button>
                  <span className="text-sm font-medium text-gray-700 pr-2">{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search Overlay (triggered from header) */}
      <div className="lg:hidden">
        {/* Search implementation would go here */}
      </div>

      {/* Notification Panel (triggered from header) */}
      <div className="lg:hidden">
        {/* Notification implementation would go here */}
      </div>
    </>
  );
}