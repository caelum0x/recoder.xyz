/**
 * Team Dashboard
 * Manage team members and collaboration
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ArrowLeft,
  Terminal,
  Users,
  Plus,
  Mail,
  Shield,
  Crown,
  MoreVertical,
  Activity,
  TrendingUp,
  UserPlus,
  UserMinus,
  Settings
} from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  avatar?: string;
  status: 'active' | 'pending' | 'inactive';
  joinedDate: string;
  lastActive: string;
  projects: number;
  commits: number;
}

export default function TeamDashboardPage() {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTeamMembers();
  }, []);

  const loadTeamMembers = async () => {
    try {
      const response = await fetch('/api/dashboard/team');
      const data = await response.json();
      
      if (data.success) {
        setTeamMembers(data.data.teamMembers);
      }
    } catch (error) {
      console.error('Failed to load team members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvite = async () => {
    try {
      const response = await fetch('/api/dashboard/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      });
      
      const data = await response.json();
      
      if (data.success) {
        loadTeamMembers();
        setShowInviteModal(false);
        setInviteEmail('');
      } else {
        alert(data.error || 'Failed to send invitation');
      }
    } catch (error) {
      console.error('Failed to send invite:', error);
      alert('Failed to send invitation');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this team member?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/dashboard/team/${memberId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        setTeamMembers(teamMembers.filter(m => m.id !== memberId));
      } else {
        alert(data.error || 'Failed to remove member');
      }
    } catch (error) {
      console.error('Failed to remove member:', error);
      alert('Failed to remove member');
    }
  };

  const handleChangeRole = async (memberId: string, newRole: 'admin' | 'member') => {
    try {
      const response = await fetch(`/api/dashboard/team/${memberId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setTeamMembers(teamMembers.map(m => 
          m.id === memberId ? { ...m, role: newRole } : m
        ));
      } else {
        alert(data.error || 'Failed to change role');
      }
    } catch (error) {
      console.error('Failed to change role:', error);
      alert('Failed to change role');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading team data...</div>
      </div>
    );
  }

  const stats = {
    total: teamMembers.length,
    active: teamMembers.filter(m => m.status === 'active').length,
    pending: teamMembers.filter(m => m.status === 'pending').length,
    totalCommits: teamMembers.reduce((sum, m) => sum + (m.commits || 0), 0)
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="w-4 h-4 text-yellow-500" />;
      case 'admin': return <Shield className="w-4 h-4 text-blue-500" />;
      default: return <Users className="w-4 h-4 text-gray-500" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-yellow-500/20 text-yellow-500';
      case 'admin': return 'bg-blue-500/20 text-blue-500';
      default: return 'bg-gray-500/20 text-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-500';
      case 'pending': return 'bg-yellow-500/20 text-yellow-500';
      default: return 'bg-gray-500/20 text-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center space-x-2 group text-white hover:text-orange-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Dashboard</span>
          </Link>
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-6 py-24">
        <div className="max-w-6xl mx-auto">
          {/* Page Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Team</h1>
              <p className="text-gray-400">Manage team members and collaboration</p>
            </div>
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center space-x-2"
            >
              <UserPlus className="w-5 h-5" />
              <span>Invite Member</span>
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">Total Members</div>
                <Users className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-3xl font-bold">{stats.total}</div>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">Active</div>
                <Activity className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-3xl font-bold">{stats.active}</div>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">Pending Invites</div>
                <Mail className="w-4 h-4 text-yellow-500" />
              </div>
              <div className="text-3xl font-bold">{stats.pending}</div>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">Team Commits</div>
                <TrendingUp className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-3xl font-bold">{stats.totalCommits}</div>
            </div>
          </div>

          {/* Team Members List */}
          <div className="space-y-4">
            {teamMembers.map((member) => (
              <div
                key={member.id}
                className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4 flex-1">
                    {/* Avatar */}
                    <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0 text-2xl font-bold">
                      {member.name.charAt(0)}
                    </div>

                    {/* Member Info */}
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-bold">{member.name}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${getRoleColor(member.role)}`}>
                          {getRoleIcon(member.role)}
                          <span className="capitalize">{member.role}</span>
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(member.status)}`}>
                          {member.status}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 mb-4">
                        <Mail className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-400">{member.email}</span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-gray-400">Joined</div>
                          <div className="font-medium">{new Date(member.joinedDate).toLocaleDateString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Last Active</div>
                          <div className="font-medium">{member.lastActive}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Projects</div>
                          <div className="font-medium">{member.projects}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Commits</div>
                          <div className="font-medium">{member.commits}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {member.role !== 'owner' && (
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {member.status === 'active' && (
                        <select
                          value={member.role}
                          onChange={(e) => handleChangeRole(member.id, e.target.value as any)}
                          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 appearance-none"
                        >
                          <option value="admin" className="bg-gray-900">Admin</option>
                          <option value="member" className="bg-gray-900">Member</option>
                        </select>
                      )}
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="p-2 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors"
                        title="Remove member"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Team Settings */}
          <div className="mt-8 p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">Team Settings</h3>
                <p className="text-sm text-gray-400">Manage team-wide settings and permissions</p>
              </div>
              <Link
                href="/settings/team"
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all flex items-center space-x-2"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </Link>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                <div>
                  <div className="font-medium">Default Member Role</div>
                  <div className="text-sm text-gray-400">Role assigned to new team members</div>
                </div>
                <select className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 appearance-none">
                  <option className="bg-gray-900">Member</option>
                  <option className="bg-gray-900">Admin</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                <div>
                  <div className="font-medium">Project Access</div>
                  <div className="text-sm text-gray-400">Control who can create projects</div>
                </div>
                <button className="relative w-12 h-6 rounded-full bg-orange-500">
                  <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full" />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                <div>
                  <div className="font-medium">Require Approval</div>
                  <div className="text-sm text-gray-400">Approve members before they join</div>
                </div>
                <button className="relative w-12 h-6 rounded-full bg-gray-700">
                  <div className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full p-6 rounded-2xl border border-white/10 bg-black backdrop-blur-xl">
            <h3 className="text-xl font-bold mb-4">Invite Team Member</h3>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white appearance-none"
                >
                  <option value="member" className="bg-gray-900">Member</option>
                  <option value="admin" className="bg-gray-900">Admin</option>
                </select>
                <p className="mt-2 text-xs text-gray-500">
                  {inviteRole === 'admin' 
                    ? 'Admins can manage team members and settings'
                    : 'Members can access and collaborate on projects'
                  }
                </p>
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInvite}
                disabled={!inviteEmail}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all disabled:opacity-50"
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
