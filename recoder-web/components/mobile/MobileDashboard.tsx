'use client';

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  DollarSign,
  Calendar,
  Bell,
  Settings,
  Search,
  Plus,
  ChevronRight,
  Activity,
  Target,
  Zap,
  Globe,
  Shield,
  Smartphone,
  Laptop,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  MousePointer,
  Clock,
  CheckCircle,
  AlertCircle,
  PlayCircle,
  Pause
} from 'lucide-react';

interface DashboardData {
  overview: {
    totalRevenue: number;
    revenueGrowth: number;
    activeUsers: number;
    userGrowth: number;
    campaigns: number;
    campaignGrowth: number;
    conversion: number;
    conversionGrowth: number;
  };
  recentActivities: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: string;
    status: 'success' | 'warning' | 'error';
  }>;
  campaigns: Array<{
    id: string;
    name: string;
    platform: string;
    status: 'active' | 'paused' | 'completed';
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }>;
  automation: {
    activeRules: number;
    totalExecutions: number;
    successRate: number;
  };
  team: {
    members: number;
    pendingTasks: number;
    pendingApprovals: number;
  };
}

export default function MobileDashboard() {
  const [activeSection, setActiveSection] = useState('overview');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      // Simulate API calls to all our systems
      const [overviewResponse, campaignsResponse, automationResponse, teamResponse] = await Promise.all([
        fetch('/api/analytics/dashboard'),
        fetch('/api/campaigns'),
        fetch('/api/automation/workflows?type=analytics'),
        fetch('/api/teams/collaboration')
      ]);

      // Mock data for demo
      setDashboardData({
        overview: {
          totalRevenue: 125000,
          revenueGrowth: 12.5,
          activeUsers: 8234,
          userGrowth: 8.2,
          campaigns: 24,
          campaignGrowth: 15.7,
          conversion: 3.2,
          conversionGrowth: -2.1
        },
        recentActivities: [
          { id: '1', type: 'campaign', description: 'Instagram campaign "Summer Sale" went live', timestamp: '2 min ago', status: 'success' },
          { id: '2', type: 'automation', description: 'Automated workflow executed successfully', timestamp: '5 min ago', status: 'success' },
          { id: '3', type: 'team', description: 'New team member Sarah joined', timestamp: '1 hour ago', status: 'success' },
          { id: '4', type: 'billing', description: 'Monthly subscription renewed', timestamp: '2 hours ago', status: 'success' },
          { id: '5', type: 'content', description: 'AI generated 5 new post variants', timestamp: '3 hours ago', status: 'success' }
        ],
        campaigns: [
          { id: '1', name: 'Summer Sale 2024', platform: 'Facebook', status: 'active', spend: 1250, impressions: 45000, clicks: 892, conversions: 28 },
          { id: '2', name: 'Brand Awareness Q4', platform: 'Instagram', status: 'active', spend: 890, impressions: 32000, clicks: 567, conversions: 15 },
          { id: '3', name: 'Product Launch', platform: 'LinkedIn', status: 'paused', spend: 650, impressions: 18000, clicks: 234, conversions: 8 }
        ],
        automation: {
          activeRules: 12,
          totalExecutions: 847,
          successRate: 94.2
        },
        team: {
          members: 5,
          pendingTasks: 8,
          pendingApprovals: 3
        }
      });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatNumber = (number: number) => {
    return new Intl.NumberFormat('en-US').format(number);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-600';
      case 'paused': return 'bg-yellow-100 text-yellow-600';
      case 'completed': return 'bg-blue-100 text-blue-600';
      case 'success': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const renderOverview = () => (
    <div className="space-y-4">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="h-6 w-6 opacity-80" />
            <span className={`text-xs flex items-center ${dashboardData?.overview.revenueGrowth >= 0 ? 'text-green-200' : 'text-red-200'}`}>
              {dashboardData?.overview.revenueGrowth >= 0 ? (
                <ArrowUpRight className="h-3 w-3 mr-1" />
              ) : (
                <ArrowDownRight className="h-3 w-3 mr-1" />
              )}
              {Math.abs(dashboardData?.overview.revenueGrowth || 0)}%
            </span>
          </div>
          <div className="text-2xl font-bold">{formatCurrency(dashboardData?.overview.totalRevenue || 0)}</div>
          <div className="text-sm opacity-90">Total Revenue</div>
        </div>

        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <Users className="h-6 w-6 opacity-80" />
            <span className={`text-xs flex items-center ${dashboardData?.overview.userGrowth >= 0 ? 'text-green-200' : 'text-red-200'}`}>
              {dashboardData?.overview.userGrowth >= 0 ? (
                <ArrowUpRight className="h-3 w-3 mr-1" />
              ) : (
                <ArrowDownRight className="h-3 w-3 mr-1" />
              )}
              {Math.abs(dashboardData?.overview.userGrowth || 0)}%
            </span>
          </div>
          <div className="text-2xl font-bold">{formatNumber(dashboardData?.overview.activeUsers || 0)}</div>
          <div className="text-sm opacity-90">Active Users</div>
        </div>

        <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <Target className="h-6 w-6 opacity-80" />
            <span className={`text-xs flex items-center ${dashboardData?.overview.campaignGrowth >= 0 ? 'text-green-200' : 'text-red-200'}`}>
              {dashboardData?.overview.campaignGrowth >= 0 ? (
                <ArrowUpRight className="h-3 w-3 mr-1" />
              ) : (
                <ArrowDownRight className="h-3 w-3 mr-1" />
              )}
              {Math.abs(dashboardData?.overview.campaignGrowth || 0)}%
            </span>
          </div>
          <div className="text-2xl font-bold">{dashboardData?.overview.campaigns}</div>
          <div className="text-sm opacity-90">Active Campaigns</div>
        </div>

        <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <MousePointer className="h-6 w-6 opacity-80" />
            <span className={`text-xs flex items-center ${dashboardData?.overview.conversionGrowth >= 0 ? 'text-green-200' : 'text-red-200'}`}>
              {dashboardData?.overview.conversionGrowth >= 0 ? (
                <ArrowUpRight className="h-3 w-3 mr-1" />
              ) : (
                <ArrowDownRight className="h-3 w-3 mr-1" />
              )}
              {Math.abs(dashboardData?.overview.conversionGrowth || 0)}%
            </span>
          </div>
          <div className="text-2xl font-bold">{dashboardData?.overview.conversion}%</div>
          <div className="text-sm opacity-90">Conversion Rate</div>
        </div>
      </div>

      {/* System Status */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <h3 className="font-semibold text-gray-900 mb-3">System Health</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm text-gray-700">Automation Engine</span>
            </div>
            <span className="text-sm text-green-600 font-medium">Operational</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm text-gray-700">Content Library</span>
            </div>
            <span className="text-sm text-green-600 font-medium">Operational</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm text-gray-700">Analytics System</span>
            </div>
            <span className="text-sm text-green-600 font-medium">Operational</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
              <span className="text-sm text-gray-700">Billing System</span>
            </div>
            <span className="text-sm text-yellow-600 font-medium">Maintenance</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-3">
          <button className="flex items-center justify-between p-3 bg-blue-50 rounded-xl text-blue-600">
            <div className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span className="text-sm font-medium">New Campaign</span>
            </div>
            <ChevronRight className="h-4 w-4" />
          </button>
          <button className="flex items-center justify-between p-3 bg-green-50 rounded-xl text-green-600">
            <div className="flex items-center space-x-2">
              <Zap className="h-4 w-4" />
              <span className="text-sm font-medium">Automation</span>
            </div>
            <ChevronRight className="h-4 w-4" />
          </button>
          <button className="flex items-center justify-between p-3 bg-purple-50 rounded-xl text-purple-600">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span className="text-sm font-medium">Analytics</span>
            </div>
            <ChevronRight className="h-4 w-4" />
          </button>
          <button className="flex items-center justify-between p-3 bg-orange-50 rounded-xl text-orange-600">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span className="text-sm font-medium">Team</span>
            </div>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const renderActivity = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <h3 className="font-semibold text-gray-900 mb-3">Recent Activity</h3>
        <div className="space-y-3">
          {dashboardData?.recentActivities.map((activity) => (
            <div key={activity.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-xl">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                activity.status === 'success' ? 'bg-green-100' :
                activity.status === 'warning' ? 'bg-yellow-100' : 'bg-red-100'
              }`}>
                {activity.status === 'success' ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : activity.status === 'warning' ? (
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{activity.description}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-500">{activity.timestamp}</p>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    activity.type === 'campaign' ? 'bg-blue-100 text-blue-600' :
                    activity.type === 'automation' ? 'bg-purple-100 text-purple-600' :
                    activity.type === 'team' ? 'bg-green-100 text-green-600' :
                    activity.type === 'billing' ? 'bg-orange-100 text-orange-600' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {activity.type}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderCampaigns = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Active Campaigns</h3>
          <button className="p-1">
            <Plus className="h-5 w-5 text-blue-600" />
          </button>
        </div>
        <div className="space-y-3">
          {dashboardData?.campaigns.map((campaign) => (
            <div key={campaign.id} className="p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-900">{campaign.name}</h4>
                <div className="flex items-center space-x-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(campaign.status)}`}>
                    {campaign.status}
                  </span>
                  <button className="p-1">
                    {campaign.status === 'active' ? (
                      <Pause className="h-3 w-3 text-gray-500" />
                    ) : (
                      <PlayCircle className="h-3 w-3 text-gray-500" />
                    )}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                <span>{campaign.platform}</span>
                <span>Spend: {formatCurrency(campaign.spend)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{formatNumber(campaign.impressions)}</div>
                  <div className="text-xs text-gray-500">Impressions</div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">{formatNumber(campaign.clicks)}</div>
                  <div className="text-xs text-gray-500">Clicks</div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">{campaign.conversions}</div>
                  <div className="text-xs text-gray-500">Conversions</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAutomation = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Automation Overview</h3>
          <Zap className="h-5 w-5 text-purple-600" />
        </div>
        <div className="grid grid-cols-1 gap-3">
          <div className="flex items-center justify-between p-3 bg-purple-50 rounded-xl">
            <div>
              <div className="text-lg font-semibold text-purple-900">{dashboardData?.automation.activeRules}</div>
              <div className="text-sm text-purple-700">Active Rules</div>
            </div>
            <Activity className="h-6 w-6 text-purple-600" />
          </div>
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
            <div>
              <div className="text-lg font-semibold text-blue-900">{formatNumber(dashboardData?.automation.totalExecutions || 0)}</div>
              <div className="text-sm text-blue-700">Total Executions</div>
            </div>
            <PlayCircle className="h-6 w-6 text-blue-600" />
          </div>
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl">
            <div>
              <div className="text-lg font-semibold text-green-900">{dashboardData?.automation.successRate}%</div>
              <div className="text-sm text-green-700">Success Rate</div>
            </div>
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <h3 className="font-semibold text-gray-900 mb-3">Team Collaboration</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center space-x-3">
              <Users className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-900">Team Members</span>
            </div>
            <span className="text-lg font-semibold text-gray-900">{dashboardData?.team.members}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center space-x-3">
              <Clock className="h-5 w-5 text-orange-600" />
              <span className="text-sm font-medium text-gray-900">Pending Tasks</span>
            </div>
            <span className="text-lg font-semibold text-orange-600">{dashboardData?.team.pendingTasks}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center space-x-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-gray-900">Pending Approvals</span>
            </div>
            <span className="text-lg font-semibold text-green-600">{dashboardData?.team.pendingApprovals}</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Mobile Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500">Welcome back! Here's your overview</p>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 bg-gray-100 rounded-xl"
            >
              <RefreshCw className={`h-5 w-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
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

      {/* Section Tabs */}
      <div className="bg-white border-b border-gray-200 px-4 py-2">
        <div className="flex space-x-1 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'activity', label: 'Activity', icon: Activity },
            { id: 'campaigns', label: 'Campaigns', icon: Target },
            { id: 'automation', label: 'Automation', icon: Zap }
          ].map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                activeSection === section.id 
                  ? 'bg-blue-100 text-blue-600' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <section.icon className="h-4 w-4" />
              <span>{section.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6">
        {activeSection === 'overview' && renderOverview()}
        {activeSection === 'activity' && renderActivity()}
        {activeSection === 'campaigns' && renderCampaigns()}
        {activeSection === 'automation' && renderAutomation()}
      </div>
    </div>
  );
}