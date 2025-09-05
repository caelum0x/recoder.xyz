"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import {
  Users, UserPlus, UserMinus, Crown, Shield, Edit,
  Settings, Trash2, Mail, MoreHorizontal, Search,
  Check, X, AlertTriangle, Copy, ExternalLink,
  Calendar, Activity, Globe, Eye, EyeOff, Filter,
  ChevronDown, ChevronUp, Zap, Clock, Target
} from "lucide-react";
import Image from "next/image";

interface TeamMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  avatar?: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: "active" | "pending" | "inactive";
  permissions: string[];
  joinedAt: string;
  lastActive?: string;
  invitedBy?: string;
  twoFactorEnabled: boolean;
}

interface TeamInvite {
  id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  permissions: string[];
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  status: "pending" | "expired" | "cancelled";
}

interface Team {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  plan: "free" | "pro" | "enterprise";
  memberCount: number;
  maxMembers: number;
  createdAt: string;
  settings: {
    requireTwoFactor: boolean;
    allowMemberInvites: boolean;
    defaultRole: "member" | "viewer";
    sessionTimeout: number;
  };
}

interface TeamManagerProps {
  teamId?: string;
  onTeamUpdate?: (team: Team) => void;
}

export function TeamManager({ teamId, onTeamUpdate }: TeamManagerProps) {
  const { user } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("members");
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const [inviteForm, setInviteForm] = useState({
    email: "",
    role: "member" as const,
    permissions: [] as string[],
    message: "",
  });

  const availablePermissions = [
    { id: "projects:read", name: "View Projects", description: "Can view team projects" },
    { id: "projects:write", name: "Edit Projects", description: "Can create and edit projects" },
    { id: "projects:delete", name: "Delete Projects", description: "Can delete projects" },
    { id: "deployments:read", name: "View Deployments", description: "Can view deployment status" },
    { id: "deployments:write", name: "Manage Deployments", description: "Can deploy projects" },
    { id: "analytics:read", name: "View Analytics", description: "Can view team analytics" },
    { id: "billing:read", name: "View Billing", description: "Can view billing information" },
    { id: "billing:write", name: "Manage Billing", description: "Can update billing settings" },
    { id: "members:invite", name: "Invite Members", description: "Can invite new team members" },
    { id: "members:manage", name: "Manage Members", description: "Can edit member roles" },
    { id: "settings:read", name: "View Settings", description: "Can view team settings" },
    { id: "settings:write", name: "Manage Settings", description: "Can update team settings" },
  ];

  const rolePermissions = {
    owner: availablePermissions.map(p => p.id),
    admin: [
      "projects:read", "projects:write", "projects:delete",
      "deployments:read", "deployments:write", 
      "analytics:read", "members:invite", "members:manage",
      "settings:read", "settings:write"
    ],
    member: [
      "projects:read", "projects:write", 
      "deployments:read", "deployments:write",
      "analytics:read"
    ],
    viewer: ["projects:read", "deployments:read", "analytics:read"],
  };

  useEffect(() => {
    if (teamId) {
      loadTeamData();
    }
  }, [teamId]);

  const loadTeamData = async () => {
    setIsLoading(true);
    try {
      const [teamRes, membersRes, invitesRes] = await Promise.all([
        fetch(`/api/teams/${teamId}`, { credentials: "include" }),
        fetch(`/api/teams/${teamId}/members`, { credentials: "include" }),
        fetch(`/api/teams/${teamId}/invites`, { credentials: "include" })
      ]);

      if (teamRes.ok) {
        const teamData = await teamRes.json();
        setTeam(teamData.team);
      }

      if (membersRes.ok) {
        const membersData = await membersRes.json();
        setMembers(membersData.members || []);
      }

      if (invitesRes.ok) {
        const invitesData = await invitesRes.json();
        setInvites(invitesData.invites || []);
      }
    } catch (error) {
      console.error("Failed to load team data:", error);
      setMessage("Failed to load team information");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const inviteMember = async () => {
    if (!inviteForm.email) {
      setMessage("Please enter an email address");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: inviteForm.email,
          role: inviteForm.role,
          permissions: rolePermissions[inviteForm.role],
          message: inviteForm.message,
        }),
      });

      if (response.ok) {
        await loadTeamData();
        setShowInviteDialog(false);
        setInviteForm({ email: "", role: "member", permissions: [], message: "" });
        setMessage("Invitation sent successfully!");
      } else {
        const errorData = await response.json();
        setMessage(errorData.error || "Failed to send invitation");
      }
    } catch (error) {
      setMessage("Failed to send invitation");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const updateMemberRole = async (memberId: string, newRole: string, permissions: string[]) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: newRole, permissions }),
      });

      if (response.ok) {
        await loadTeamData();
        setMessage("Member role updated successfully!");
      } else {
        setMessage("Failed to update member role");
      }
    } catch (error) {
      setMessage("Failed to update member role");
    } finally {
      setIsLoading(false);
      setSelectedMember(null);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const removeMember = async (memberId: string) => {
    if (!confirm("Are you sure you want to remove this member from the team?")) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        await loadTeamData();
        setMessage("Member removed successfully!");
      } else {
        setMessage("Failed to remove member");
      }
    } catch (error) {
      setMessage("Failed to remove member");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const cancelInvite = async (inviteId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/invites/${inviteId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        await loadTeamData();
        setMessage("Invitation cancelled");
      } else {
        setMessage("Failed to cancel invitation");
      }
    } catch (error) {
      setMessage("Failed to cancel invitation");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const resendInvite = async (inviteId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/invites/${inviteId}/resend`, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        setMessage("Invitation resent successfully!");
      } else {
        setMessage("Failed to resend invitation");
      }
    } catch (error) {
      setMessage("Failed to resend invitation");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const updateTeamSettings = async (settings: Partial<Team['settings']>) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        const updatedTeam = { ...team!, settings: { ...team!.settings, ...settings } };
        setTeam(updatedTeam);
        if (onTeamUpdate) onTeamUpdate(updatedTeam);
        setMessage("Team settings updated!");
      } else {
        setMessage("Failed to update team settings");
      }
    } catch (error) {
      setMessage("Failed to update team settings");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "owner": return "bg-purple-100 text-purple-800";
      case "admin": return "bg-blue-100 text-blue-800";
      case "member": return "bg-green-100 text-green-800";
      case "viewer": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "text-green-600";
      case "pending": return "text-yellow-600";
      case "inactive": return "text-gray-600";
      case "expired": return "text-red-600";
      default: return "text-gray-600";
    }
  };

  const filteredMembers = members.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         member.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || member.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const currentUserMember = members.find(m => m.userId === user?.id);
  const canInviteMembers = currentUserMember?.permissions.includes("members:invite") || 
                          currentUserMember?.role === "owner";
  const canManageMembers = currentUserMember?.permissions.includes("members:manage") || 
                          currentUserMember?.role === "owner";

  if (isLoading && !team) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">Team not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
            {team.avatar ? (
              <Image src={team.avatar} alt="Team" width={48} height={48} className="rounded-full" />
            ) : (
              <Users className="w-6 h-6 text-indigo-600" />
            )}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{team.name}</h2>
            <p className="text-gray-600">
              {team.memberCount} members • {team.plan.charAt(0).toUpperCase() + team.plan.slice(1)} plan
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {message && (
            <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
              message.includes("successfully") || message.includes("updated") || message.includes("sent")
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}>
              {message.includes("successfully") || message.includes("updated") || message.includes("sent") ? (
                <Check className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              {message}
            </div>
          )}

          {canInviteMembers && (
            <button
              onClick={() => setShowInviteDialog(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Invite Member
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: "members", label: "Members", icon: Users, count: members.length },
            { id: "invites", label: "Invites", icon: Mail, count: invites.length },
            { id: "settings", label: "Settings", icon: Settings },
          ].map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === id
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {count !== undefined && (
                <span className={`px-2 py-1 rounded-full text-xs ${
                  activeTab === id ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-600"
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Members Tab */}
      {activeTab === "members" && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Roles</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          {/* Members List */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="divide-y divide-gray-200">
              {filteredMembers.map((member) => (
                <div key={member.id} className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                        {member.avatar ? (
                          <Image 
                            src={member.avatar} 
                            alt={member.name} 
                            width={40} 
                            height={40} 
                            className="rounded-full" 
                          />
                        ) : (
                          <span className="text-sm font-medium text-gray-600">
                            {member.name.split(" ").map(n => n[0]).join("").toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900">{member.name}</h3>
                          {member.role === "owner" && (
                            <Crown className="w-4 h-4 text-yellow-500" />
                          )}
                          {member.twoFactorEnabled && (
                            <Shield className="w-4 h-4 text-green-500" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{member.email}</p>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                          <span className={getStatusColor(member.status)}>
                            {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                          </span>
                          <span>Joined {new Date(member.joinedAt).toLocaleDateString()}</span>
                          {member.lastActive && (
                            <span>Last active {new Date(member.lastActive).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(member.role)}`}>
                        {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                      </span>
                      
                      {canManageMembers && member.role !== "owner" && member.userId !== user?.id && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setSelectedMember(member)}
                            className="p-1 text-gray-400 hover:text-gray-600"
                            title="Edit member"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeMember(member.id)}
                            className="p-1 text-red-400 hover:text-red-600"
                            title="Remove member"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {filteredMembers.length === 0 && (
                <div className="p-12 text-center">
                  <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Members Found</h3>
                  <p className="text-gray-600">
                    {searchQuery ? "No members match your search criteria" : "This team has no members yet"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invites Tab */}
      {activeTab === "invites" && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="divide-y divide-gray-200">
            {invites.map((invite) => (
              <div key={invite.id} className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{invite.email}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(invite.role)}`}>
                        {invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}
                      </span>
                      <span className={`text-xs ${getStatusColor(invite.status)}`}>
                        {invite.status.charAt(0).toUpperCase() + invite.status.slice(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span>Invited {new Date(invite.invitedAt).toLocaleDateString()}</span>
                      <span>Expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
                      <span>Invited by {invite.invitedBy}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {invite.status === "pending" && (
                      <button
                        onClick={() => resendInvite(invite.id)}
                        disabled={isLoading}
                        className="px-3 py-1 text-indigo-600 hover:text-indigo-700 text-sm disabled:opacity-50"
                      >
                        Resend
                      </button>
                    )}
                    <button
                      onClick={() => cancelInvite(invite.id)}
                      disabled={isLoading}
                      className="px-3 py-1 text-red-600 hover:text-red-700 text-sm disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {invites.length === 0 && (
              <div className="p-12 text-center">
                <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Invites</h3>
                <p className="text-gray-600">There are no pending invitations at this time</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && currentUserMember?.permissions.includes("settings:write") && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Team Settings</h3>
          
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-700">Require Two-Factor Authentication</p>
                <p className="text-sm text-gray-500">All team members must enable 2FA</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={team.settings.requireTwoFactor}
                  onChange={(e) => updateTeamSettings({ requireTwoFactor: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-700">Allow Member Invitations</p>
                <p className="text-sm text-gray-500">Members can invite other users to the team</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={team.settings.allowMemberInvites}
                  onChange={(e) => updateTeamSettings({ allowMemberInvites: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <div>
              <label className="block font-medium text-gray-700 mb-2">Default Role for New Members</label>
              <select
                value={team.settings.defaultRole}
                onChange={(e) => updateTeamSettings({ defaultRole: e.target.value as "member" | "viewer" })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-gray-700 mb-2">Session Timeout (hours)</label>
              <select
                value={team.settings.sessionTimeout}
                onChange={(e) => updateTeamSettings({ sessionTimeout: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value={1}>1 hour</option>
                <option value={6}>6 hours</option>
                <option value={12}>12 hours</option>
                <option value={24}>24 hours</option>
                <option value={168}>1 week</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Invite Dialog */}
      {showInviteDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Invite Team Member</h3>
              <button
                onClick={() => setShowInviteDialog(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="user@example.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Personal Message (Optional)</label>
                <textarea
                  value={inviteForm.message}
                  onChange={(e) => setInviteForm({ ...inviteForm, message: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Add a personal message to the invitation..."
                />
              </div>
              
              {/* Role Permissions Preview */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-sm font-medium text-gray-900 mb-2">
                  {inviteForm.role.charAt(0).toUpperCase() + inviteForm.role.slice(1)} Permissions:
                </p>
                <div className="space-y-1">
                  {rolePermissions[inviteForm.role].map((permission) => {
                    const perm = availablePermissions.find(p => p.id === permission);
                    return perm ? (
                      <div key={permission} className="text-xs text-gray-600 flex items-center gap-2">
                        <Check className="w-3 h-3 text-green-500" />
                        {perm.name}
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowInviteDialog(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={inviteMember}
                disabled={isLoading || !inviteForm.email}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isLoading ? "Sending..." : "Send Invitation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Dialog */}
      {selectedMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit Member Role</h3>
              <button
                onClick={() => setSelectedMember(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <span className="text-xs font-medium text-gray-600">
                    {selectedMember.name.split(" ").map(n => n[0]).join("").toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{selectedMember.name}</p>
                  <p className="text-sm text-gray-600">{selectedMember.email}</p>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  defaultValue={selectedMember.role}
                  onChange={(e) => {
                    const newRole = e.target.value as keyof typeof rolePermissions;
                    updateMemberRole(selectedMember.id, newRole, rolePermissions[newRole]);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setSelectedMember(null)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}