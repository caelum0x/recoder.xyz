'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Calendar, 
  BarChart3, 
  Users, 
  Camera,
  Send,
  Edit,
  Trash2,
  Heart,
  MessageCircle,
  Share,
  TrendingUp,
  Settings,
  Bell,
  Search,
  Filter,
  RefreshCw,
  Eye,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Video,
  FileText,
  Sparkles
} from 'lucide-react';

// Mobile-optimized Social Media Management Component
export default function SocialMediaMobile() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [posts, setPosts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Mobile Dashboard View
  const renderDashboard = () => (
    <div className="space-y-4">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">Total Posts</p>
              <p className="text-2xl font-bold">1,234</p>
            </div>
            <BarChart3 className="h-8 w-8 opacity-80" />
          </div>
        </div>
        <div className="bg-gradient-to-r from-green-500 to-teal-600 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">Engagement</p>
              <p className="text-2xl font-bold">89%</p>
            </div>
            <TrendingUp className="h-8 w-8 opacity-80" />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-4 gap-3">
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex flex-col items-center p-3 bg-blue-50 rounded-xl"
          >
            <Plus className="h-6 w-6 text-blue-600 mb-1" />
            <span className="text-xs text-blue-600 font-medium">Create</span>
          </button>
          <button className="flex flex-col items-center p-3 bg-green-50 rounded-xl">
            <Calendar className="h-6 w-6 text-green-600 mb-1" />
            <span className="text-xs text-green-600 font-medium">Schedule</span>
          </button>
          <button className="flex flex-col items-center p-3 bg-purple-50 rounded-xl">
            <BarChart3 className="h-6 w-6 text-purple-600 mb-1" />
            <span className="text-xs text-purple-600 font-medium">Analytics</span>
          </button>
          <button className="flex flex-col items-center p-3 bg-orange-50 rounded-xl">
            <Users className="h-6 w-6 text-orange-600 mb-1" />
            <span className="text-xs text-orange-600 font-medium">Team</span>
          </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Recent Activity</h3>
          <RefreshCw className="h-5 w-5 text-gray-400" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Send className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Post published to Instagram</p>
                <p className="text-xs text-gray-500">2 minutes ago</p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Posts */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <h3 className="font-semibold text-gray-900 mb-3">Upcoming Posts</h3>
        <div className="space-y-3">
          {[1, 2].map((item) => (
            <div key={item} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-12 h-12 bg-gradient-to-r from-pink-500 to-rose-500 rounded-lg flex items-center justify-center">
                <ImageIcon className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 mb-1">Summer collection launch post</p>
                <p className="text-xs text-gray-500 mb-2">Instagram • Today at 3:00 PM</p>
                <div className="flex items-center space-x-2">
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full">Scheduled</span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-500">Auto-post enabled</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Mobile Content Creation View
  const renderCreate = () => (
    <div className="space-y-4">
      {/* Content Type Selector */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <h3 className="font-semibold text-gray-900 mb-3">Create Content</h3>
        <div className="grid grid-cols-3 gap-3">
          <button className="flex flex-col items-center p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
            <ImageIcon className="h-8 w-8 text-blue-600 mb-2" />
            <span className="text-sm font-medium text-blue-600">Photo Post</span>
          </button>
          <button className="flex flex-col items-center p-4 bg-purple-50 rounded-xl border border-gray-200">
            <Video className="h-8 w-8 text-purple-600 mb-2" />
            <span className="text-sm font-medium text-purple-600">Video Post</span>
          </button>
          <button className="flex flex-col items-center p-4 bg-green-50 rounded-xl border border-gray-200">
            <FileText className="h-8 w-8 text-green-600 mb-2" />
            <span className="text-sm font-medium text-green-600">Text Post</span>
          </button>
        </div>
      </div>

      {/* AI Content Generator */}
      <div className="bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl p-4 text-white">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">AI Content Generator</h3>
          <Sparkles className="h-6 w-6" />
        </div>
        <p className="text-sm opacity-90 mb-4">Let AI create engaging content for your audience</p>
        <button className="w-full bg-white text-purple-600 py-3 rounded-xl font-semibold">
          Generate Content with AI
        </button>
      </div>

      {/* Platform Selection */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <h3 className="font-semibold text-gray-900 mb-3">Select Platforms</h3>
        <div className="space-y-2">
          {['Instagram', 'Facebook', 'Twitter', 'LinkedIn', 'TikTok'].map((platform) => (
            <label key={platform} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg"></div>
                <span className="font-medium text-gray-900">{platform}</span>
              </div>
              <input type="checkbox" className="w-5 h-5 text-blue-600 rounded" defaultChecked />
            </label>
          ))}
        </div>
      </div>

      {/* Content Input */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <h3 className="font-semibold text-gray-900 mb-3">Write Your Post</h3>
        <textarea
          className="w-full h-32 p-3 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="What's happening? Share your thoughts..."
        />
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center space-x-3">
            <button className="p-2 bg-gray-100 rounded-lg">
              <Camera className="h-5 w-5 text-gray-600" />
            </button>
            <button className="p-2 bg-gray-100 rounded-lg">
              <Calendar className="h-5 w-5 text-gray-600" />
            </button>
          </div>
          <span className="text-sm text-gray-500">280 characters</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3">
        <button className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold">
          Publish Now
        </button>
        <button className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold">
          Save Draft
        </button>
      </div>
    </div>
  );

  // Mobile Analytics View
  const renderAnalytics = () => (
    <div className="space-y-4">
      {/* Performance Overview */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Performance Overview</h3>
          <button className="text-sm text-blue-600">This Week</button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">124K</div>
            <div className="text-sm text-gray-500">Impressions</div>
            <div className="text-xs text-green-600 mt-1">↑ 12.5%</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">8.2K</div>
            <div className="text-sm text-gray-500">Engagements</div>
            <div className="text-xs text-green-600 mt-1">↑ 8.1%</div>
          </div>
        </div>
      </div>

      {/* Top Performing Posts */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <h3 className="font-semibold text-gray-900 mb-3">Top Performing Posts</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 mb-1">Product launch announcement</p>
                <div className="flex items-center space-x-4 text-xs text-gray-500">
                  <span className="flex items-center">
                    <Heart className="h-3 w-3 mr-1" />
                    245
                  </span>
                  <span className="flex items-center">
                    <MessageCircle className="h-3 w-3 mr-1" />
                    32
                  </span>
                  <span className="flex items-center">
                    <Share className="h-3 w-3 mr-1" />
                    18
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-green-600">8.2%</div>
                <div className="text-xs text-gray-500">engagement</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Audience Insights */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <h3 className="font-semibold text-gray-900 mb-3">Audience Insights</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Age 25-34</span>
              <span>42%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full w-[42%]"></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Age 18-24</span>
              <span>28%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-purple-600 h-2 rounded-full w-[28%]"></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Age 35-44</span>
              <span>21%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-green-600 h-2 rounded-full w-[21%]"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Mobile Posts Management View
  const renderPosts = () => (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex items-center space-x-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Search posts..."
          />
        </div>
        <button className="p-2 bg-gray-100 rounded-xl">
          <Filter className="h-5 w-5 text-gray-600" />
        </button>
      </div>

      {/* Posts List */}
      <div className="space-y-3">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="bg-white rounded-2xl p-4 shadow-sm border">
            <div className="flex items-start space-x-3">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <ImageIcon className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900">Product showcase post</h4>
                  <button className="p-1">
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
                <p className="text-sm text-gray-600 mb-3">Check out our amazing new product lineup! Perfect for the summer season... </p>
                
                {/* Platform Tags */}
                <div className="flex items-center space-x-2 mb-3">
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full">Instagram</span>
                  <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full">Facebook</span>
                  <span className="text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded-full">Published</span>
                </div>

                {/* Engagement Stats */}
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center space-x-4">
                    <span className="flex items-center">
                      <Heart className="h-4 w-4 mr-1 text-red-500" />
                      145
                    </span>
                    <span className="flex items-center">
                      <MessageCircle className="h-4 w-4 mr-1 text-blue-500" />
                      23
                    </span>
                    <span className="flex items-center">
                      <Eye className="h-4 w-4 mr-1 text-green-500" />
                      2.1K
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button className="p-1">
                      <Edit className="h-4 w-4 text-gray-400" />
                    </button>
                    <button className="p-1">
                      <Trash2 className="h-4 w-4 text-gray-400" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Social Media</h1>
            <p className="text-sm text-gray-500">Manage your social presence</p>
          </div>
          <div className="flex items-center space-x-2">
            <button className="p-2 bg-gray-100 rounded-xl relative">
              <Bell className="h-5 w-5 text-gray-600" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></div>
            </button>
            <button className="p-2 bg-gray-100 rounded-xl">
              <Settings className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'create' && renderCreate()}
        {activeTab === 'analytics' && renderAnalytics()}
        {activeTab === 'posts' && renderPosts()}
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="flex items-center justify-around py-2">
          {[
            { id: 'dashboard', icon: BarChart3, label: 'Dashboard' },
            { id: 'create', icon: Plus, label: 'Create' },
            { id: 'posts', icon: FileText, label: 'Posts' },
            { id: 'analytics', icon: TrendingUp, label: 'Analytics' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center py-2 px-3 rounded-xl ${
                activeTab === tab.id 
                  ? 'bg-blue-50 text-blue-600' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-5 w-5 mb-1" />
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end">
          <div className="bg-white w-full max-h-[80vh] rounded-t-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Create New Post</h2>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="p-2 bg-gray-100 rounded-xl"
              >
                <Plus className="h-5 w-5 text-gray-600 transform rotate-45" />
              </button>
            </div>
            {renderCreate()}
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-white bg-opacity-80 z-40 flex items-center justify-center">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 text-blue-600 animate-spin mx-auto mb-2" />
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      )}
    </div>
  );
}