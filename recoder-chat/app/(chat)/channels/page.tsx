'use client';

import { useState } from 'react';
import { 
  Hash, Plus, Lock, Users, Settings, Search, 
  MessageCircle, Bell, MoreVertical, ChevronDown,
  Star, Pin, Archive, Trash2, Edit3, Shield
} from 'lucide-react';

// Simple button component
const Button = ({ children, className = '', size = 'md', ...props }: {
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  [key: string]: any;
}) => {
  const sizeClasses: Record<string, string> = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };
  
  return (
    <button 
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default function TeamChannelsPage() {
  const [selectedChannel, setSelectedChannel] = useState('general');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const channels = [
    {
      id: 'general',
      name: 'general',
      description: 'Team-wide discussions and announcements',
      type: 'public',
      members: 156,
      unread: 0,
      isPinned: true,
      lastMessage: 'Sarah: Hey team, deploy went smoothly! 🚀',
      lastActivity: '2 minutes ago'
    },
    {
      id: 'development',
      name: 'development',
      description: 'Technical discussions and code reviews',
      type: 'public',
      members: 89,
      unread: 3,
      isPinned: true,
      lastMessage: 'Alex: PR #234 is ready for review',
      lastActivity: '5 minutes ago'
    },
    {
      id: 'design',
      name: 'design',
      description: 'Design feedback and creative collaboration',
      type: 'public',
      members: 42,
      unread: 1,
      isPinned: false,
      lastMessage: 'Maya: New mockups in Figma',
      lastActivity: '1 hour ago'
    },
    {
      id: 'backend-team',
      name: 'backend-team',
      description: 'Backend engineering discussions',
      type: 'private',
      members: 15,
      unread: 0,
      isPinned: false,
      lastMessage: 'Mike: Database migration complete',
      lastActivity: '3 hours ago'
    },
    {
      id: 'leadership',
      name: 'leadership',
      description: 'Leadership team discussions',
      type: 'private',
      members: 8,
      unread: 5,
      isPinned: false,
      lastMessage: 'Emma: Q4 planning meeting notes',
      lastActivity: '30 minutes ago'
    }
  ];

  const channelCategories = [
    {
      name: 'Pinned Channels',
      channels: channels.filter(c => c.isPinned)
    },
    {
      name: 'Public Channels',
      channels: channels.filter(c => c.type === 'public' && !c.isPinned)
    },
    {
      name: 'Private Channels',
      channels: channels.filter(c => c.type === 'private')
    }
  ];

  const recentMessages = [
    {
      id: 1,
      channel: 'general',
      user: 'Sarah Kim',
      avatar: 'SK',
      message: 'Hey team, the new deployment went smoothly! All systems are green 🚀',
      timestamp: '2 minutes ago',
      reactions: [{ emoji: '🎉', count: 5 }, { emoji: '👏', count: 3 }]
    },
    {
      id: 2,
      channel: 'development',
      user: 'Alex Chen',
      avatar: 'AC',
      message: 'PR #234 is ready for review. Added the new authentication flow we discussed.',
      timestamp: '5 minutes ago',
      reactions: [{ emoji: '👀', count: 2 }]
    },
    {
      id: 3,
      channel: 'design',
      user: 'Maya Patel',
      avatar: 'MP',
      message: 'Just uploaded the new mockups to Figma. Love to hear your thoughts!',
      timestamp: '1 hour ago',
      reactions: [{ emoji: '🎨', count: 4 }]
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Team Channels</h1>
              <Button 
                size="sm" 
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search channels..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Channel List */}
          <div className="flex-1 overflow-y-auto p-4">
            {channelCategories.map((category) => (
              <div key={category.name} className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {category.name}
                  </h3>
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </div>
                <div className="space-y-1">
                  {category.channels.map((channel) => (
                    <div
                      key={channel.id}
                      onClick={() => setSelectedChannel(channel.id)}
                      className={`flex items-center p-2 rounded-lg cursor-pointer group transition-colors ${
                        selectedChannel === channel.id
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <div className="flex items-center flex-1 min-w-0">
                        {channel.type === 'private' ? (
                          <Lock className="h-4 w-4 mr-2 flex-shrink-0" />
                        ) : (
                          <Hash className="h-4 w-4 mr-2 flex-shrink-0" />
                        )}
                        <span className="font-medium truncate">{channel.name}</span>
                        {channel.unread > 0 && (
                          <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                            {channel.unread}
                          </span>
                        )}
                      </div>
                      <MoreVertical className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Channel Header */}
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Hash className="h-6 w-6 text-gray-500 dark:text-gray-400 mr-2" />
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {channels.find(c => c.id === selectedChannel)?.name}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {channels.find(c => c.id === selectedChannel)?.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                  <Star className="h-4 w-4 mr-1" />
                  Star
                </Button>
                <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                  <Users className="h-4 w-4 mr-1" />
                  {channels.find(c => c.id === selectedChannel)?.members}
                </Button>
                <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6">
              {recentMessages.map((message) => (
                <div key={message.id} className="group">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium text-sm">
                      {message.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-medium text-gray-900 dark:text-white">{message.user}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">{message.timestamp}</span>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300">{message.message}</p>
                      <div className="flex items-center space-x-2 mt-2">
                        {message.reactions.map((reaction, index) => (
                          <button
                            key={index}
                            className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-1 text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                          >
                            <span>{reaction.emoji}</span>
                            <span className="text-gray-600 dark:text-gray-400">{reaction.count}</span>
                          </button>
                        ))}
                        <button className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Message Input */}
          <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center space-x-3">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder={`Message #${channels.find(c => c.id === selectedChannel)?.name}`}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                <MessageCircle className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Channel Info */}
        <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Channel Details</h3>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">About</h4>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {channels.find(c => c.id === selectedChannel)?.description}
              </p>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                Members ({channels.find(c => c.id === selectedChannel)?.members})
              </h4>
              <div className="space-y-2">
                {['Sarah Kim', 'Alex Chen', 'Maya Patel', 'Mike Johnson'].map((member) => (
                  <div key={member} className="flex items-center space-x-2">
                    <div className="w-6 h-6 bg-gradient-to-br from-green-500 to-blue-600 rounded-full flex items-center justify-center text-white text-xs">
                      {member.split(' ').map(n => n[0]).join('')}
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{member}</span>
                  </div>
                ))}
                <button className="text-blue-600 dark:text-blue-400 text-sm hover:underline">
                  View all members
                </button>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Actions</h4>
              <div className="space-y-2">
                <Button className="w-full justify-start bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                  <Pin className="h-4 w-4 mr-2" />
                  Pin Channel
                </Button>
                <Button className="w-full justify-start bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                  <Bell className="h-4 w-4 mr-2" />
                  Notifications
                </Button>
                <Button className="w-full justify-start bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Channel Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Create New Channel</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Channel Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. marketing-team"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  placeholder="What's this channel about?"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="flex items-center">
                  <input type="checkbox" className="rounded border-gray-300 dark:border-gray-600" />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Make private</span>
                </label>
              </div>
            </div>
            <div className="flex space-x-3 mt-6">
              <Button 
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setShowCreateModal(false)}
              >
                Create Channel
              </Button>
              <Button 
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
