'use client';

import { useState } from 'react';
import { 
  MessageCircle, Search, Plus, MoreVertical, 
  Phone, Video, Pin, Star, Archive, UserPlus,
  Send, Paperclip, Smile, ImageIcon, Circle
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

export default function DirectMessagesPage() {
  const [selectedConversation, setSelectedConversation] = useState('sarah-kim');
  const [messageText, setMessageText] = useState('');

  const conversations = [
    {
      id: 'sarah-kim',
      name: 'Sarah Kim',
      role: 'Engineering Manager',
      avatar: 'SK',
      status: 'online',
      lastMessage: 'Sounds good! Let\'s sync up tomorrow morning.',
      lastActivity: '5 minutes ago',
      unread: 0,
      isPinned: true
    },
    {
      id: 'alex-chen',
      name: 'Alex Chen',
      role: 'Senior Developer',
      avatar: 'AC',
      status: 'online',
      lastMessage: 'Can you review my PR when you get a chance?',
      lastActivity: '1 hour ago',
      unread: 2,
      isPinned: true
    },
    {
      id: 'maya-patel',
      name: 'Maya Patel',
      role: 'Product Designer',
      avatar: 'MP',
      status: 'away',
      lastMessage: 'Thanks! The new designs look great.',
      lastActivity: '3 hours ago',
      unread: 0,
      isPinned: false
    },
    {
      id: 'mike-johnson',
      name: 'Mike Johnson',
      role: 'DevOps Engineer',
      avatar: 'MJ',
      status: 'offline',
      lastMessage: 'Deployment is complete. All services are running.',
      lastActivity: 'Yesterday',
      unread: 1,
      isPinned: false
    },
    {
      id: 'emma-davis',
      name: 'Emma Davis',
      role: 'Product Manager',
      avatar: 'ED',
      status: 'online',
      lastMessage: 'Let\'s discuss the roadmap updates.',
      lastActivity: '2 days ago',
      unread: 0,
      isPinned: false
    }
  ];

  const messages = [
    {
      id: 1,
      sender: 'sarah-kim',
      content: 'Hey! How\'s the new feature coming along?',
      timestamp: '2:30 PM',
      isOwn: false
    },
    {
      id: 2,
      sender: 'me',
      content: 'Going well! Just finished the authentication flow. Should be ready for review by tomorrow.',
      timestamp: '2:32 PM',
      isOwn: true
    },
    {
      id: 3,
      sender: 'sarah-kim',
      content: 'That\'s awesome! 🎉 Make sure to add tests for the edge cases we discussed.',
      timestamp: '2:33 PM',
      isOwn: false
    },
    {
      id: 4,
      sender: 'me',
      content: 'Absolutely! I\'ve got about 85% test coverage so far. Planning to hit 95% before the PR.',
      timestamp: '2:35 PM',
      isOwn: true
    },
    {
      id: 5,
      sender: 'sarah-kim',
      content: 'Perfect! Also, can we sync up tomorrow morning to discuss the deployment strategy?',
      timestamp: '2:36 PM',
      isOwn: false
    },
    {
      id: 6,
      sender: 'me',
      content: 'Sounds good! Let\'s sync up tomorrow morning.',
      timestamp: '2:37 PM',
      isOwn: true
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      case 'offline': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  const selectedUser = conversations.find(c => c.id === selectedConversation);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Direct Messages</h1>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="space-y-1">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => setSelectedConversation(conversation.id)}
                  className={`flex items-center p-3 rounded-lg cursor-pointer group transition-colors ${
                    selectedConversation === conversation.id
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="relative mr-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium text-sm">
                      {conversation.avatar}
                    </div>
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${getStatusColor(conversation.status)} rounded-full border-2 border-white dark:border-gray-800`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 dark:text-white truncate">
                        {conversation.name}
                      </span>
                      <div className="flex items-center space-x-1">
                        {conversation.isPinned && <Pin className="h-3 w-3 text-gray-400" />}
                        {conversation.unread > 0 && (
                          <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                            {conversation.unread}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      {conversation.lastMessage}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      {conversation.lastActivity}
                    </p>
                  </div>
                  <MoreVertical className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="relative mr-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium">
                    {selectedUser?.avatar}
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${getStatusColor(selectedUser?.status || 'offline')} rounded-full border-2 border-white dark:border-gray-800`} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    {selectedUser?.name}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedUser?.role} • {selectedUser?.status}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                  <Phone className="h-4 w-4" />
                </Button>
                <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                  <Video className="h-4 w-4" />
                </Button>
                <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-xs lg:max-w-md ${message.isOwn ? 'order-1' : 'order-2'}`}>
                  {!message.isOwn && (
                    <div className="flex items-center mb-1">
                      <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs mr-2">
                        {selectedUser?.avatar}
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {selectedUser?.name}
                      </span>
                    </div>
                  )}
                  <div
                    className={`px-4 py-2 rounded-lg ${
                      message.isOwn
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                    }`}
                  >
                    <p className="text-sm">{message.content}</p>
                  </div>
                  <p className={`text-xs text-gray-500 dark:text-gray-400 mt-1 ${message.isOwn ? 'text-right' : 'text-left'}`}>
                    {message.timestamp}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Message Input */}
          <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center space-x-3">
              <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                <Paperclip className="h-4 w-4" />
              </Button>
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder={`Message ${selectedUser?.name}...`}
                  className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && messageText.trim()) {
                      // Handle sending message
                      setMessageText('');
                    }
                  }}
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
                  <Button size="sm" className="bg-transparent hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400">
                    <Smile className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button 
                className={`${
                  messageText.trim() 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                disabled={!messageText.trim()}
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right Sidebar - User Info */}
        <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 p-4">
          <div className="text-center mb-6">
            <div className="relative inline-block mb-4">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-2xl">
                {selectedUser?.avatar}
              </div>
              <div className={`absolute -bottom-1 -right-1 w-6 h-6 ${getStatusColor(selectedUser?.status || 'offline')} rounded-full border-2 border-white dark:border-gray-800`} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{selectedUser?.name}</h3>
            <p className="text-gray-600 dark:text-gray-400">{selectedUser?.role}</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 capitalize">{selectedUser?.status}</p>
          </div>

          <div className="space-y-4">
            <div className="flex space-x-2">
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                <Phone className="h-4 w-4 mr-2" />
                Call
              </Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                <Video className="h-4 w-4 mr-2" />
                Video
              </Button>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Actions</h4>
              <div className="space-y-2">
                <Button className="w-full justify-start bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                  <Pin className="h-4 w-4 mr-2" />
                  Pin Conversation
                </Button>
                <Button className="w-full justify-start bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                  <Star className="h-4 w-4 mr-2" />
                  Add to Favorites
                </Button>
                <Button className="w-full justify-start bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add to Group
                </Button>
                <Button className="w-full justify-start bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                  <Archive className="h-4 w-4 mr-2" />
                  Archive Chat
                </Button>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Shared Files</h4>
              <div className="space-y-2">
                <div className="flex items-center p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <ImageIcon className="h-8 w-8 text-blue-600 mr-3" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      design-mockups.png
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">2 days ago</p>
                  </div>
                </div>
              </div>
              <button className="text-blue-600 dark:text-blue-400 text-sm hover:underline mt-2">
                View all files
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
