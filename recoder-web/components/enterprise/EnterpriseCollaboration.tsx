"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Users, 
  UserPlus, 
  Activity, 
  BarChart3, 
  Clock, 
  GitBranch, 
  MessageSquare, 
  Settings,
  Crown,
  Shield,
  Eye,
  Lock,
  Unlock,
  Calendar,
  Download,
  Share2,
  TrendingUp,
  TrendingDown,
  Zap,
  Target,
  CheckCircle,
  AlertTriangle,
  Info
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { useSession } from "next-auth/react";
import { useCollaboration } from "@/hooks/use-collaboration";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'owner' | 'admin' | 'developer' | 'viewer';
  status: 'online' | 'offline' | 'away';
  lastActive: Date;
  projectsContributed: number;
  linesOfCode: number;
  commitsCount: number;
}

interface ProjectAnalytics {
  id: string;
  name: string;
  totalLines: number;
  dailyActivity: Array<{ date: string; commits: number; lines: number; users: number }>;
  languageDistribution: Array<{ language: string; percentage: number; color: string }>;
  performance: {
    buildTime: number;
    errorRate: number;
    uptime: number;
    responseTime: number;
  };
  aiUsage: {
    totalGenerations: number;
    successRate: number;
    avgResponseTime: number;
    costThisMonth: number;
  };
}

interface EnterpriseCollaborationProps {
  projectId: string;
  userRole: 'owner' | 'admin' | 'developer' | 'viewer';
}

export default function EnterpriseCollaboration({ projectId, userRole }: EnterpriseCollaborationProps) {
  const [activeTab, setActiveTab] = useState('team');
  const [timeRange, setTimeRange] = useState('7d');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([
    {
      id: '1',
      name: 'Sarah Chen',
      email: 'sarah@company.com',
      role: 'owner',
      status: 'online',
      lastActive: new Date(),
      projectsContributed: 12,
      linesOfCode: 45230,
      commitsCount: 234
    },
    {
      id: '2',
      name: 'Alex Rodriguez',
      email: 'alex@company.com',
      role: 'admin',
      status: 'online',
      lastActive: new Date(Date.now() - 300000),
      projectsContributed: 8,
      linesOfCode: 32100,
      commitsCount: 156
    },
    {
      id: '3',
      name: 'Jamie Park',
      email: 'jamie@company.com',
      role: 'developer',
      status: 'away',
      lastActive: new Date(Date.now() - 1800000),
      projectsContributed: 15,
      linesOfCode: 67890,
      commitsCount: 298
    }
  ]);

  const [analytics, setAnalytics] = useState<ProjectAnalytics>({
    id: projectId,
    name: 'Main Project',
    totalLines: 145220,
    dailyActivity: [
      { date: '2025-01-03', commits: 12, lines: 1250, users: 3 },
      { date: '2025-01-04', commits: 18, lines: 2100, users: 4 },
      { date: '2025-01-05', commits: 15, lines: 1800, users: 3 },
      { date: '2025-01-06', commits: 22, lines: 2800, users: 5 },
      { date: '2025-01-07', commits: 19, lines: 2200, users: 4 },
      { date: '2025-01-08', commits: 25, lines: 3100, users: 6 },
      { date: '2025-01-09', commits: 31, lines: 3800, users: 5 }
    ],
    languageDistribution: [
      { language: 'TypeScript', percentage: 45, color: '#3178c6' },
      { language: 'JavaScript', percentage: 25, color: '#f7df1e' },
      { language: 'CSS', percentage: 15, color: '#1572b6' },
      { language: 'HTML', percentage: 10, color: '#e34f26' },
      { language: 'JSON', percentage: 5, color: '#000000' }
    ],
    performance: {
      buildTime: 45.2,
      errorRate: 2.1,
      uptime: 99.8,
      responseTime: 180
    },
    aiUsage: {
      totalGenerations: 1247,
      successRate: 98.5,
      avgResponseTime: 2.8,
      costThisMonth: 127.50
    }
  });

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="h-4 w-4 text-yellow-500" />;
      case 'admin': return <Shield className="h-4 w-4 text-blue-500" />;
      case 'developer': return <Users className="h-4 w-4 text-green-500" />;
      default: return <Eye className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const formatLastActive = (date: Date) => {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const TeamManagement = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Team Members</h3>
          <p className="text-sm text-muted-foreground">Manage team access and permissions</p>
        </div>
        {(userRole === 'owner' || userRole === 'admin') && (
          <Button>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Member
          </Button>
        )}
      </div>

      <div className="grid gap-4">
        {teamMembers.map((member) => (
          <Card key={member.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <Avatar>
                      <AvatarImage src={member.avatar} />
                      <AvatarFallback>{member.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                    </Avatar>
                    <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-background ${getStatusColor(member.status)}`} />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{member.name}</span>
                      {getRoleIcon(member.role)}
                      <Badge variant="outline" className="text-xs">
                        {member.role}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                    <p className="text-xs text-muted-foreground">Last active: {formatLastActive(member.lastActive)}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4 text-sm">
                  <div className="text-center">
                    <p className="font-medium">{member.commitsCount}</p>
                    <p className="text-muted-foreground">Commits</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium">{(member.linesOfCode / 1000).toFixed(1)}k</p>
                    <p className="text-muted-foreground">Lines</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium">{member.projectsContributed}</p>
                    <p className="text-muted-foreground">Projects</p>
                  </div>
                  
                  {(userRole === 'owner' || userRole === 'admin') && (
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const Analytics = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Project Analytics</h3>
          <p className="text-sm text-muted-foreground">Insights and performance metrics</p>
        </div>
        <div className="flex items-center space-x-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24h</SelectItem>
              <SelectItem value="7d">7d</SelectItem>
              <SelectItem value="30d">30d</SelectItem>
              <SelectItem value="90d">90d</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Build Time</p>
                <p className="text-2xl font-bold">{analytics.performance.buildTime}s</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
            <Progress value={Math.max(0, 100 - analytics.performance.buildTime)} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Error Rate</p>
                <p className="text-2xl font-bold">{analytics.performance.errorRate}%</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
            </div>
            <Progress value={Math.max(0, 100 - analytics.performance.errorRate * 10)} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Uptime</p>
                <p className="text-2xl font-bold">{analytics.performance.uptime}%</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <Progress value={analytics.performance.uptime} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Response Time</p>
                <p className="text-2xl font-bold">{analytics.performance.responseTime}ms</p>
              </div>
              <Zap className="h-8 w-8 text-purple-500" />
            </div>
            <Progress value={Math.max(0, 100 - analytics.performance.responseTime / 5)} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Activity Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Development Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={analytics.dailyActivity}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="commits" stroke="#8884d8" strokeWidth={2} />
              <Line type="monotone" dataKey="lines" stroke="#82ca9d" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Language Distribution & AI Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Language Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.languageDistribution.map((lang) => (
                <div key={lang.language} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: lang.color }}
                    />
                    <span className="text-sm">{lang.language}</span>
                  </div>
                  <span className="text-sm font-medium">{lang.percentage}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Usage Analytics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Generations</span>
                <span className="font-medium">{analytics.aiUsage.totalGenerations.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Success Rate</span>
                <span className="font-medium">{analytics.aiUsage.successRate}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Avg Response Time</span>
                <span className="font-medium">{analytics.aiUsage.avgResponseTime}s</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Cost This Month</span>
                <span className="font-medium">${analytics.aiUsage.costThisMonth}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const ActivityFeed = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Recent Activity</h3>
      <div className="space-y-3">
        {[
          { user: 'Sarah Chen', action: 'deployed to production', time: '2 minutes ago', type: 'deployment' },
          { user: 'Alex Rodriguez', action: 'merged pull request #24', time: '15 minutes ago', type: 'git' },
          { user: 'Jamie Park', action: 'generated React component with AI', time: '1 hour ago', type: 'ai' },
          { user: 'Sarah Chen', action: 'invited new team member', time: '2 hours ago', type: 'team' },
          { user: 'Alex Rodriguez', action: 'fixed critical bug in auth system', time: '3 hours ago', type: 'bug' },
        ].map((activity, index) => (
          <div key={index} className="flex items-start space-x-3 p-3 rounded-lg bg-muted/50">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="text-xs">
                {activity.user.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium">{activity.user}</span> {activity.action}
              </p>
              <p className="text-xs text-muted-foreground">{activity.time}</p>
            </div>
            {activity.type === 'deployment' && <Target className="h-4 w-4 text-green-500" />}
            {activity.type === 'git' && <GitBranch className="h-4 w-4 text-purple-500" />}
            {activity.type === 'ai' && <Zap className="h-4 w-4 text-blue-500" />}
            {activity.type === 'team' && <Users className="h-4 w-4 text-orange-500" />}
            {activity.type === 'bug' && <AlertTriangle className="h-4 w-4 text-red-500" />}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="enterprise-collaboration space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Enterprise Collaboration</h2>
          <p className="text-muted-foreground">Team management and project analytics</p>
        </div>
        <Badge variant="outline" className="flex items-center space-x-1">
          <Crown className="h-3 w-3" />
          <span>Enterprise</span>
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="team" className="flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <span>Team</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center space-x-2">
            <BarChart3 className="h-4 w-4" />
            <span>Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center space-x-2">
            <Activity className="h-4 w-4" />
            <span>Activity</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="mt-6">
          <TeamManagement />
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <Analytics />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <ActivityFeed />
        </TabsContent>
      </Tabs>
    </div>
  );
}
