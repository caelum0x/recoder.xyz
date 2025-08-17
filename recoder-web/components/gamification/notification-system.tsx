'use client';

/**
 * Notification System - Real-time Social Engagement Alerts
 * KILLER FEATURE: Keep users engaged with instant feedback and social updates
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Bell,
  Heart,
  MessageCircle,
  Users,
  Star,
  Trophy,
  Zap,
  Gift,
  TrendingUp,
  Code,
  Bot,
  Crown,
  Fire,
  Target,
  CheckCircle,
  X,
  Settings,
  Volume2,
  VolumeX,
  Clock,
  Calendar,
  ArrowRight,
  ExternalLink
} from 'lucide-react';

interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'achievement' | 'challenge' | 'system' | 'trending' | 'mention';
  title: string;
  message: string;
  data: any;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: 'social' | 'achievement' | 'system' | 'engagement';
}

interface NotificationSettings {
  enableSound: boolean;
  enableDesktop: boolean;
  enableEmail: boolean;
  categories: {
    social: boolean;
    achievement: boolean;
    system: boolean;
    engagement: boolean;
  };
}

export default function NotificationSystem() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>({
    enableSound: true,
    enableDesktop: true,
    enableEmail: false,
    categories: {
      social: true,
      achievement: true,
      system: true,
      engagement: true
    }
  });
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadNotifications();
    startRealTimeUpdates();
  }, []);

  useEffect(() => {
    const unread = notifications.filter(n => !n.read).length;
    setUnreadCount(unread);
  }, [notifications]);

  const loadNotifications = async () => {
    // Mock data - replace with actual API
    const mockNotifications: Notification[] = [
      {
        id: '1',
        type: 'achievement',
        title: '🏆 Achievement Unlocked!',
        message: 'You unlocked "Code Streak Master" - 7 days in a row!',
        data: { achievementId: 'streak-7', reward: { credits: 200, badge: 'Streak Master' } },
        timestamp: '2024-01-15T10:30:00Z',
        read: false,
        priority: 'high',
        category: 'achievement'
      },
      {
        id: '2',
        type: 'like',
        title: '❤️ Your project got liked!',
        message: 'DevMaster liked your "AI E-commerce Platform" project',
        data: { userId: 'devmaster', projectId: 'ecom-1', projectTitle: 'AI E-commerce Platform' },
        timestamp: '2024-01-15T09:45:00Z',
        read: false,
        priority: 'normal',
        category: 'social',
        actionUrl: '/projects/ecom-1'
      },
      {
        id: '3',
        type: 'comment',
        title: '💬 New comment on your project',
        message: 'CodeNinja commented: "This is incredible! How did you implement the AI recommendations?"',
        data: { userId: 'codeninja', projectId: 'ecom-1', comment: 'This is incredible!' },
        timestamp: '2024-01-15T09:20:00Z',
        read: false,
        priority: 'normal',
        category: 'social',
        actionUrl: '/projects/ecom-1#comments'
      },
      {
        id: '4',
        type: 'follow',
        title: '👥 New follower!',
        message: 'AIExplorer started following you',
        data: { userId: 'aiexplorer', userAvatar: '/avatars/ae.jpg' },
        timestamp: '2024-01-15T08:15:00Z',
        read: true,
        priority: 'normal',
        category: 'social',
        actionUrl: '/profile/aiexplorer'
      },
      {
        id: '5',
        type: 'trending',
        title: '🔥 Your project is trending!',
        message: 'Your "AI E-commerce Platform" is now #3 on trending projects!',
        data: { projectId: 'ecom-1', rank: 3 },
        timestamp: '2024-01-15T07:30:00Z',
        read: true,
        priority: 'high',
        category: 'engagement',
        actionUrl: '/discover?tab=trending'
      },
      {
        id: '6',
        type: 'challenge',
        title: '🎯 Daily Challenge Complete!',
        message: 'You completed "Build Something Amazing" and earned 25 credits!',
        data: { challengeId: 'daily-build', reward: { credits: 25, xp: 100 } },
        timestamp: '2024-01-15T06:45:00Z',
        read: true,
        priority: 'normal',
        category: 'achievement'
      },
      {
        id: '7',
        type: 'system',
        title: '🚀 New AI Model Available!',
        message: 'Claude Sonnet 4 is now available - try it for free today!',
        data: { modelId: 'claude-sonnet-4', provider: 'anthropic' },
        timestamp: '2024-01-15T06:00:00Z',
        read: true,
        priority: 'normal',
        category: 'system',
        actionUrl: '/discover?tab=models'
      }
    ];
    
    setNotifications(mockNotifications);
  };

  const startRealTimeUpdates = () => {
    // Simulate real-time notifications
    const interval = setInterval(() => {
      if (Math.random() > 0.8) { // 20% chance every 30 seconds
        addNewNotification();
      }
    }, 30000);

    return () => clearInterval(interval);
  };

  const addNewNotification = () => {
    const newNotifications = [
      {
        type: 'like',
        title: '❤️ New like!',
        message: 'Someone liked your latest project',
        category: 'social',
        priority: 'normal'
      },
      {
        type: 'achievement',
        title: '🏆 Achievement progress!',
        message: 'You\'re 80% towards "AI Whisperer" achievement',
        category: 'achievement',
        priority: 'normal'
      },
      {
        type: 'system',
        title: '🔥 Model Battle!',
        message: 'Vote in the epic Claude vs Gemini battle!',
        category: 'engagement',
        priority: 'high'
      }
    ];

    const randomNotif = newNotifications[Math.floor(Math.random() * newNotifications.length)];
    const newNotification: Notification = {
      id: Date.now().toString(),
      type: randomNotif.type as any,
      title: randomNotif.title,
      message: randomNotif.message,
      data: {},
      timestamp: new Date().toISOString(),
      read: false,
      priority: randomNotif.priority as any,
      category: randomNotif.category as any
    };

    setNotifications(prev => [newNotification, ...prev]);
    
    // Play sound if enabled
    if (settings.enableSound) {
      playNotificationSound();
    }

    // Show desktop notification if enabled
    if (settings.enableDesktop) {
      showDesktopNotification(newNotification);
    }
  };

  const playNotificationSound = () => {
    const audio = new Audio('/sounds/notification.mp3');
    audio.play().catch(() => {}); // Ignore errors if sound file doesn't exist
  };

  const showDesktopNotification = (notification: Notification) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.message,
        icon: '/icon.svg'
      });
    }
  };

  const markAsRead = (notificationId: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === notificationId ? { ...n, read: true } : n
    ));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'like': return <Heart className="h-4 w-4 text-red-500" />;
      case 'comment': return <MessageCircle className="h-4 w-4 text-blue-500" />;
      case 'follow': return <Users className="h-4 w-4 text-green-500" />;
      case 'achievement': return <Trophy className="h-4 w-4 text-yellow-500" />;
      case 'challenge': return <Target className="h-4 w-4 text-purple-500" />;
      case 'trending': return <TrendingUp className="h-4 w-4 text-orange-500" />;
      case 'mention': return <Bell className="h-4 w-4 text-blue-500" />;
      case 'system': return <Zap className="h-4 w-4 text-gray-500" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'border-l-red-500';
      case 'high': return 'border-l-orange-500';
      case 'normal': return 'border-l-blue-500';
      case 'low': return 'border-l-gray-500';
      default: return 'border-l-gray-500';
    }
  };

  const filteredNotifications = notifications.filter(notification => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !notification.read;
    return notification.category === filter;
  });

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  return (
    <div className="relative">
      {/* Notification Bell */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowNotifications(!showNotifications)}
        className="relative"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>

      {/* Notification Panel */}
      {showNotifications && (
        <Card className="absolute right-0 top-full mt-2 w-96 max-h-96 overflow-hidden z-50 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSettings(prev => ({ ...prev, enableSound: !prev.enableSound }))}
                >
                  {settings.enableSound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNotifications(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Filters */}
            <div className="flex gap-1 mt-2">
              {['all', 'unread', 'social', 'achievement', 'engagement'].map((filterType) => (
                <Button
                  key={filterType}
                  variant={filter === filterType ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs capitalize"
                  onClick={() => setFilter(filterType)}
                >
                  {filterType}
                </Button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Actions */}
            {unreadCount > 0 && (
              <div className="px-4 pb-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={markAllAsRead}
                  className="w-full"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark all as read
                </Button>
              </div>
            )}

            {/* Notifications List */}
            <div className="max-h-64 overflow-y-auto">
              {filteredNotifications.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No notifications</p>
                </div>
              ) : (
                filteredNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 border-l-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                      getPriorityColor(notification.priority)
                    } ${!notification.read ? 'bg-blue-50' : ''}`}
                    onClick={() => {
                      markAsRead(notification.id);
                      if (notification.actionUrl) {
                        window.open(notification.actionUrl, '_blank');
                      }
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getNotificationIcon(notification.type)}
                          <h4 className="font-medium text-sm">{notification.title}</h4>
                          {!notification.read && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{notification.message}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(notification.timestamp).toLocaleString()}
                          </span>
                          {notification.actionUrl && (
                            <ExternalLink className="h-3 w-3 text-gray-400" />
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notification.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Desktop Permission Request */}
      {'Notification' in window && Notification.permission === 'default' && (
        <div className="fixed bottom-4 right-4 z-50">
          <Card className="w-80">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Bell className="h-8 w-8 text-blue-500" />
                <div className="flex-1">
                  <h4 className="font-medium">Enable Notifications</h4>
                  <p className="text-sm text-gray-600">Get notified when you receive likes, comments, and achievements!</p>
                </div>
                <Button size="sm" onClick={requestNotificationPermission}>
                  Enable
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}