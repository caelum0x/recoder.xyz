'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, MessageCircle, Video, Phone, Share2, Eye, Edit,
  UserPlus, UserMinus, Crown, Shield, Clock, Activity,
  GitBranch, GitCommit, GitMerge, Code, FileText, Folder,
  Bell, Settings, MoreHorizontal, Search, Filter,
  CheckCircle, AlertCircle, XCircle, Calendar, Star,
  Link, Download, Upload, Copy, Zap, Sparkles,
  Monitor, MousePointer, Volume2, VolumeX
} from 'lucide-react';

// Define the TeamMember interface
interface TeamMember {
  id: number;
  name: string;
  email: string;
  avatar: string;
  role: string;
  status: string;
  lastSeen: string;
  permissions: string[];
  currentFile: string | null;
  cursorPosition: { line: number; column: number; } | null;
  cursorColor: string;
  isTyping: boolean;
}

export default function CollaborationPage() {
  const [activeTab, setActiveTab] = useState('team');
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [isVoiceChatActive, setIsVoiceChatActive] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const teamMembers: TeamMember[] = [
    {
      id: 1,
      name: 'Alex Johnson',
      email: 'alex@company.com',
      avatar: '👨‍💻',
      role: 'owner',
      status: 'online',
      lastSeen: 'now',
      permissions: ['read', 'write', 'admin'],
      currentFile: 'src/components/Header.tsx',
      cursorPosition: { line: 45, column: 12 },
      cursorColor: '#3B82F6',
      isTyping: false
    },
    {
      id: 2,
      name: 'Sarah Chen',
      email: 'sarah@company.com',
      avatar: '👩‍💻',
      role: 'admin',
      status: 'online',
      lastSeen: 'now',
      permissions: ['read', 'write', 'admin'],
      currentFile: 'src/pages/Dashboard.tsx',
      cursorPosition: { line: 78, column: 25 },
      cursorColor: '#10B981',
      isTyping: true
    },
    {
      id: 3,
      name: 'Mike Wilson',
      email: 'mike@company.com',
      avatar: '👨‍🎨',
      role: 'editor',
      status: 'away',
      lastSeen: '5 minutes ago',
      permissions: ['read', 'write'],
      currentFile: null,
      cursorPosition: null,
      cursorColor: '#F59E0B',
      isTyping: false
    },
    {
      id: 4,
      name: 'Emily Davis',
      email: 'emily@company.com',
      avatar: '👩‍🔬',
      role: 'viewer',
      status: 'offline',
      lastSeen: '2 hours ago',
      permissions: ['read'],
      currentFile: null,
      cursorPosition: null,
      cursorColor: '#8B5CF6',
      isTyping: false
    }
  ];

  const recentActivity = [
    {
      id: 1,
      user: 'Sarah Chen',
      action: 'edited',
      target: 'Dashboard.tsx',
      time: '2 minutes ago',
      type: 'edit',
      details: 'Added responsive breakpoints'
    },
    {
      id: 2,
      user: 'Alex Johnson',
      action: 'commented on',
      target: 'Header.tsx',
      time: '5 minutes ago',
      type: 'comment',
      details: 'Looks good! Ship it 🚀'
    },
    {
      id: 3,
      user: 'Mike Wilson',
      action: 'created',
      target: 'Button.tsx',
      time: '10 minutes ago',
      type: 'create',
      details: 'New reusable button component'
    },
    {
      id: 4,
      user: 'Emily Davis',
      action: 'reviewed',
      target: 'PR #23',
      time: '15 minutes ago',
      type: 'review',
      details: 'Approved with suggestions'
    }
  ];

  const activeUsers = teamMembers.filter(member => member.status === 'online');
  const currentProject = {
    name: 'E-commerce Platform',
    activeCollaborators: activeUsers.length,
    totalMembers: teamMembers.length,
    isLive: true
  };

  const chatMessages = [
    {
      id: 1,
      user: 'Alex Johnson',
      message: 'Hey team! The new dashboard component is ready for review',
      time: '14:32',
      type: 'message'
    },
    {
      id: 2,
      user: 'Sarah Chen',
      message: 'Looking great! I added some responsive styles',
      time: '14:35',
      type: 'message'
    },
    {
      id: 3,
      user: 'System',
      message: 'Mike Wilson joined the project',
      time: '14:40',
      type: 'system'
    },
    {
      id: 4,
      user: 'Mike Wilson',
      message: 'Thanks for the invite! Working on the button components now',
      time: '14:42',
      type: 'message'
    }
  ];

  const permissions = [
    { id: 'read', name: 'View', description: 'Can view files and project' },
    { id: 'write', name: 'Edit', description: 'Can edit files and make changes' },
    { id: 'admin', name: 'Admin', description: 'Can manage project settings and members' }
  ];

  const getRoleIcon = (role) => {
    switch (role) {
      case 'owner': return <Crown className="w-4 h-4 text-yellow-400" />;
      case 'admin': return <Shield className="w-4 h-4 text-blue-400" />;
      case 'editor': return <Edit className="w-4 h-4 text-green-400" />;
      default: return <Eye className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-green-400';
      case 'away': return 'bg-yellow-400';
      case 'busy': return 'bg-red-400';
      default: return 'bg-gray-400';
    }
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case 'edit': return <Edit className="w-4 h-4 text-blue-400" />;
      case 'comment': return <MessageCircle className="w-4 h-4 text-green-400" />;
      case 'create': return <FileText className="w-4 h-4 text-purple-400" />;
      case 'review': return <CheckCircle className="w-4 h-4 text-yellow-400" />;
      default: return <Activity className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="h-screen bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-blue-400">Collaboration Hub</h1>
            <div className="flex items-center space-x-2 text-sm text-slate-400">
              <span>{currentProject.name}</span>
              <div className={`w-2 h-2 rounded-full ${currentProject.isLive ? 'bg-green-400' : 'bg-gray-400'}`} />
              <span>{currentProject.activeCollaborators}/{currentProject.totalMembers} online</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Voice Chat Toggle */}
            <button 
              onClick={() => setIsVoiceChatActive(!isVoiceChatActive)}
              className={`p-2 rounded ${isVoiceChatActive ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-700 hover:bg-slate-600'}`}
            >
              {isVoiceChatActive ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            
            {/* Video Call */}
            <button className="p-2 bg-slate-700 hover:bg-slate-600 rounded">
              <Video className="w-4 h-4" />
            </button>
            
            {/* Share Project */}
            <button 
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center space-x-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Invite</span>
            </button>
            
            <button className="p-2 bg-slate-700 hover:bg-slate-600 rounded">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-6 mt-4">
          {[
            { id: 'team', label: 'Team', icon: Users },
            { id: 'activity', label: 'Activity', icon: Activity },
            { id: 'chat', label: 'Chat', icon: MessageCircle },
            { id: 'files', label: 'Shared Files', icon: FileText }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-3 py-2 rounded transition-colors ${
                activeTab === tab.id 
                  ? 'bg-blue-600 text-white' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Main Content */}
        <div className="flex-1 p-6">
          {/* Team Tab */}
          {activeTab === 'team' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Team Members</h2>
                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Search members..."
                      className="pl-10 pr-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg">
                    <Filter className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {teamMembers.map((member) => (
                  <div 
                    key={member.id}
                    className="bg-slate-800 rounded-xl p-6 hover:bg-slate-700 transition-all duration-200 cursor-pointer"
                    onClick={() => setSelectedMember(member)}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="relative">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-xl">
                            {member.avatar}
                          </div>
                          <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${getStatusColor(member.status)} rounded-full border-2 border-slate-800`} />
                        </div>
                        <div>
                          <h3 className="font-medium">{member.name}</h3>
                          <p className="text-sm text-slate-400">{member.email}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {getRoleIcon(member.role)}
                        <button className="text-slate-400 hover:text-white">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Status:</span>
                        <span className={`capitalize ${
                          member.status === 'online' ? 'text-green-400' :
                          member.status === 'away' ? 'text-yellow-400' : 'text-gray-400'
                        }`}>
                          {member.status}
                        </span>
                      </div>
                      
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Role:</span>
                        <span className="capitalize">{member.role}</span>
                      </div>

                      {member.currentFile && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">Editing:</span>
                          <span className="text-blue-400 truncate">{member.currentFile}</span>
                        </div>
                      )}

                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Last seen:</span>
                        <span>{member.lastSeen}</span>
                      </div>
                    </div>

                    {member.isTyping && (
                      <div className="mt-3 flex items-center space-x-2 text-xs text-blue-400">
                        <div className="flex space-x-1">
                          <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" />
                          <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                          <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                        </div>
                        <span>typing...</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Recent Activity</h2>
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="bg-slate-800 rounded-xl p-4 flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-medium">{activity.user}</span>
                        <span className="text-slate-400">{activity.action}</span>
                        <span className="text-blue-400 font-medium">{activity.target}</span>
                      </div>
                      <p className="text-sm text-slate-300 mb-2">{activity.details}</p>
                      <span className="text-xs text-slate-500">{activity.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chat Tab */}
          {activeTab === 'chat' && (
            <div className="h-full flex flex-col">
              <h2 className="text-2xl font-bold mb-6">Team Chat</h2>
              
              <div className="flex-1 bg-slate-800 rounded-xl flex flex-col">
                {/* Chat Messages */}
                <div className="flex-1 p-4 overflow-y-auto space-y-4">
                  {chatMessages.map((message) => (
                    <div key={message.id} className={`flex ${message.type === 'system' ? 'justify-center' : 'justify-start'}`}>
                      {message.type === 'system' ? (
                        <div className="text-xs text-slate-500 bg-slate-700/50 px-3 py-1 rounded-full">
                          {message.message}
                        </div>
                      ) : (
                        <div className="max-w-xs lg:max-w-md">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="text-sm font-medium">{message.user}</span>
                            <span className="text-xs text-slate-500">{message.time}</span>
                          </div>
                          <div className="bg-blue-600 text-white p-3 rounded-lg rounded-tl-sm">
                            {message.message}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Chat Input */}
                <div className="border-t border-slate-700 p-4">
                  <div className="flex items-center space-x-2">
                    <input 
                      type="text" 
                      placeholder="Type a message..."
                      className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                    />
                    <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg">
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Files Tab */}
          {activeTab === 'files' && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Shared Files</h2>
              <div className="bg-slate-800 rounded-xl p-6">
                <p className="text-slate-400 text-center py-8">
                  File sharing feature coming soon...
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - Active Cursors */}
        <div className="w-80 bg-slate-800 border-l border-slate-700 p-6">
          <h3 className="text-lg font-bold mb-4">Live Cursors</h3>
          <div className="space-y-4">
            {activeUsers.filter(user => user.currentFile).map((user) => (
              <div key={user.id} className="bg-slate-700/50 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: user.cursorColor }}
                  />
                  <span className="text-sm font-medium">{user.name}</span>
                </div>
                <div className="text-xs text-slate-400">
                  <div className="flex items-center space-x-1">
                    <FileText className="w-3 h-3" />
                    <span>{user.currentFile}</span>
                  </div>
                  {user.cursorPosition && (
                    <div className="mt-1">
                      Line {user.cursorPosition.line}, Column {user.cursorPosition.column}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Voice Chat Participants */}
          {isVoiceChatActive && (
            <div className="mt-8">
              <h3 className="text-lg font-bold mb-4">Voice Chat</h3>
              <div className="space-y-2">
                {activeUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between bg-green-900/20 rounded-lg p-2">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-sm">
                        {user.avatar}
                      </div>
                      <span className="text-sm">{user.name}</span>
                    </div>
                    <Volume2 className="w-4 h-4 text-green-400" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Invite Team Members</h3>
              <button 
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Email Address
                </label>
                <input 
                  type="email" 
                  placeholder="colleague@company.com"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Role
                </label>
                <select className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              
              <div className="flex space-x-3">
                <button 
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
                >
                  Cancel
                </button>
                <button className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg">
                  Send Invite
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
