"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Users, 
  UserPlus, 
  Crown, 
  Shield, 
  Eye, 
  Edit3, 
  MessageCircle, 
  Share2,
  Settings,
  Mail,
  Copy,
  Check,
  Star,
  Globe,
  Lock,
  Zap
} from "lucide-react";

// 👥 TEAM COLLABORATION COMPONENT - CURSOR KILLER FEATURE
// Advanced team features that competitors don't offer

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  avatar?: string;
  lastActive: string;
  status: 'online' | 'offline' | 'busy';
}

interface Project {
  id: string;
  name: string;
  description: string;
  members: number;
  lastModified: string;
  status: 'active' | 'archived';
}

interface TeamCollaborationProps {
  className?: string;
}

export default function TeamCollaboration({ className = "" }: TeamCollaborationProps) {
  const [currentTeam, setCurrentTeam] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([
    {
      id: '1',
      name: 'Alex Johnson',
      email: 'alex@company.com',
      role: 'admin',
      lastActive: '2 minutes ago',
      status: 'online'
    },
    {
      id: '2', 
      name: 'Sarah Kim',
      email: 'sarah@company.com',
      role: 'editor',
      lastActive: '15 minutes ago',
      status: 'online'
    },
    {
      id: '3',
      name: 'Mike Chen',
      email: 'mike@company.com', 
      role: 'viewer',
      lastActive: '1 hour ago',
      status: 'busy'
    }
  ]);
  
  const [projects, setProjects] = useState<Project[]>([
    {
      id: '1',
      name: 'E-commerce Platform',
      description: 'Next.js + Stripe integration',
      members: 5,
      lastModified: '2 hours ago',
      status: 'active'
    },
    {
      id: '2',
      name: 'Mobile App MVP',
      description: 'React Native + Firebase',
      members: 3,
      lastModified: '1 day ago', 
      status: 'active'
    }
  ]);
  
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('editor');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleInviteMember = async () => {
    if (!inviteEmail) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/analytics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'invite-member',
          teamId: 'current-team',
          userId: 'current-user',
          data: { email: inviteEmail, role: inviteRole }
        })
      });
      
      const result = await response.json();
      if (result.success) {
        // Add to team members list
        const newMember: TeamMember = {
          id: `invite-${Date.now()}`,
          name: inviteEmail.split('@')[0],
          email: inviteEmail,
          role: inviteRole,
          lastActive: 'Just invited',
          status: 'offline'
        };
        setTeamMembers([...teamMembers, newMember]);
        setInviteEmail('');
        
        // Copy invite URL to clipboard
        await navigator.clipboard.writeText(result.inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (error) {
      console.error('Invite error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Crown className="w-4 h-4 text-gold-600" />;
      case 'editor': return <Edit3 className="w-4 h-4 text-blue-600" />;
      case 'viewer': return <Eye className="w-4 h-4 text-gray-600" />;
      default: return <Users className="w-4 h-4" />;
    }
  };

  const getStatusDot = (status: string) => {
    const colors = {
      online: 'bg-green-500',
      offline: 'bg-gray-400',
      busy: 'bg-red-500'
    };
    return <div className={`w-3 h-3 rounded-full ${colors[status as keyof typeof colors]}`} />;
  };

  return (
    <div className={`team-collaboration ${className}`}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              👥 Team Collaboration
              <Badge className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                <Star className="w-3 h-3 mr-1" />
                ENTERPRISE
              </Badge>
            </h2>
            <p className="text-gray-600 mt-2">
              Real-time team development with AI-powered collaboration
            </p>
          </div>
          
          <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white">
            <Settings className="w-4 h-4 mr-2" />
            Team Settings
          </Button>
        </div>
        
        {/* Competitive Banner */}
        <div className="bg-gradient-to-r from-purple-500 via-blue-500 to-green-500 text-white p-4 rounded-xl shadow-lg">
          <div className="flex items-center justify-center gap-4 text-center">
            <Users className="w-6 h-6" />
            <span className="font-bold text-lg">🚀 TEAM AI DEVELOPMENT</span>
            <div className="text-sm opacity-90">
              Real-time collaboration • Live cursors • Shared AI context • Team analytics
            </div>
            <Zap className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Team Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              Team Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 mb-1">
              {teamMembers.length}
            </div>
            <div className="text-sm text-gray-600">
              {teamMembers.filter(m => m.status === 'online').length} active now
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
              <Share2 className="w-4 h-4 text-green-600" />
              Active Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 mb-1">
              {projects.filter(p => p.status === 'active').length}
            </div>
            <div className="text-sm text-gray-600">
              {projects.reduce((acc, p) => acc + p.members, 0)} total collaborators
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-purple-600" />
              AI Generations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600 mb-1">
              2,847
            </div>
            <Badge className="bg-purple-100 text-purple-800 text-xs">
              This month
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Team Members & Invite Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Team Members List */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Team Members ({teamMembers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teamMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                        {member.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="absolute -bottom-1 -right-1">
                        {getStatusDot(member.status)}
                      </div>
                    </div>
                    
                    <div>
                      <div className="font-semibold text-gray-900 flex items-center gap-2">
                        {member.name}
                        {getRoleIcon(member.role)}
                      </div>
                      <div className="text-sm text-gray-600">
                        {member.email} • {member.lastActive}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs ${
                      member.role === 'admin' ? 'bg-gold-100 text-gold-800' :
                      member.role === 'editor' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {member.role}
                    </Badge>
                    
                    <Badge className={`text-xs ${
                      member.status === 'online' ? 'bg-green-100 text-green-800' :
                      member.status === 'busy' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {member.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Invite New Member */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-green-600" />
              Invite Team Member
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="viewer">Viewer - Can view projects</option>
                  <option value="editor">Editor - Can edit and create</option>
                  <option value="admin">Admin - Full access</option>
                </select>
              </div>
              
              <Button
                onClick={handleInviteMember}
                disabled={!inviteEmail || loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Sending Invite...
                  </div>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Send Invitation
                  </>
                )}
              </Button>
              
              {copied && (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <Check className="w-4 h-4" />
                  Invite link copied to clipboard!
                </div>
              )}
            </div>
            
            {/* Team Features */}
            <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
              <div className="text-sm font-semibold text-gray-900 mb-2">
                🚀 Team Features
              </div>
              <div className="space-y-1 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <Globe className="w-3 h-3 text-blue-600" />
                  Real-time collaborative coding
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="w-3 h-3 text-green-600" />
                  Shared AI context and memory
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-3 h-3 text-purple-600" />
                  Live cursors and presence
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-3 h-3 text-orange-600" />
                  Team analytics and insights
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Project Collaboration */}
      <Card className="mb-8 hover:shadow-lg transition-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-purple-600" />
            Team Projects
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projects.map((project) => (
              <div key={project.id} className="p-4 bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl border border-gray-200 hover:border-blue-300 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold text-gray-900 text-lg">{project.name}</div>
                    <div className="text-sm text-gray-600">{project.description}</div>
                  </div>
                  <Badge className={`${
                    project.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {project.status}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    {project.members} members
                  </div>
                  <div>Updated {project.lastModified}</div>
                </div>
                
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1">
                    <Edit3 className="w-3 h-3 mr-1" />
                    Open
                  </Button>
                  <Button size="sm" variant="outline">
                    <Share2 className="w-3 h-3 mr-1" />
                    Share
                  </Button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-6 text-center">
            <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white">
              <UserPlus className="w-4 h-4 mr-2" />
              Create New Project
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Team Analytics Teaser */}
      <Card className="border-2 border-gold-200 hover:shadow-xl transition-shadow">
        <CardHeader className="bg-gradient-to-r from-gold-50 to-yellow-50">
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-gold-600" />
            🏆 Team Performance Analytics
            <Badge className="bg-gold-100 text-gold-800 ml-2">
              PREMIUM FEATURE
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600 mb-1">156%</div>
              <div className="text-sm text-gray-600">Faster than solo development</div>
            </div>
            
            <div className="text-center p-4 bg-gradient-to-br from-green-50 to-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600 mb-1">47</div>
              <div className="text-sm text-gray-600">Projects completed this month</div>
            </div>
            
            <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600 mb-1">98.7%</div>
              <div className="text-sm text-gray-600">Team satisfaction score</div>
            </div>
          </div>
          
          <div className="mt-4 text-center">
            <div className="text-sm text-gray-600 mb-3">
              🎯 <strong>Team Productivity Insights</strong>: Track collaboration patterns, identify bottlenecks, optimize workflows
            </div>
            <Button className="bg-gold-600 hover:bg-gold-700 text-white">
              <Crown className="w-4 h-4 mr-2" />
              View Full Analytics
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}