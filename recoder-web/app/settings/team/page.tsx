"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { useState, useEffect } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Users, ChevronLeft, Plus, Settings, Crown, Shield, User, 
  Mail, MoreVertical, Trash2, Edit, Eye, Copy, Send, X,
  Check, AlertTriangle, Calendar, Clock, FileText, Lock,
  Globe, UserPlus, UserMinus, Key, Zap, Star, Award, Activity
} from "lucide-react";

interface Team {
  id: string;
  name: string;
  description: string;
  avatar: string | null;
  memberCount: number;
  projectCount: number;
  plan: "free" | "pro" | "enterprise";
  createdAt: string;
  ownerId: string;
}

interface TeamMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  avatar: string | null;
  role: "owner" | "admin" | "member" | "viewer";
  status: "active" | "pending" | "suspended";
  joinedAt: string;
  lastActive: string;
  permissions: string[];
}

interface TeamInvitation {
  id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  status: "pending" | "accepted" | "expired";
}

interface TeamProject {
  id: string;
  name: string;
  description: string;
  visibility: "public" | "team" | "private";
  memberCount: number;
  lastUpdated: string;
  status: "active" | "archived";
}

export default function TeamSettings() {
  const { user, loading } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [projects, setProjects] = useState<TeamProject[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");
  const [newTeamData, setNewTeamData] = useState({
    name: "",
    description: ""
  });

  useEffect(() => {
    if (!user && !loading) {
      redirect("/login");
    }
  }, [user, loading]);

  useEffect(() => {
    if (user) {
      loadTeams();
    }
  }, [user]);

  useEffect(() => {
    if (selectedTeam) {
      loadTeamData(selectedTeam.id);
    }
  }, [selectedTeam]);

  const loadTeams = async () => {
    try {
      const response = await fetch("/api/teams", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setTeams(data);
        if (data.length > 0 && !selectedTeam) {
          setSelectedTeam(data[0]);
        }
      }
    } catch (error) {
      console.error("Failed to load teams:", error);
    }
  };

  const loadTeamData = async (teamId: string) => {
    try {
      const [membersRes, invitationsRes, projectsRes] = await Promise.all([
        fetch(`/api/teams/${teamId}/members`, { credentials: "include" }),
        fetch(`/api/teams/${teamId}/invitations`, { credentials: "include" }),
        fetch(`/api/teams/${teamId}/projects`, { credentials: "include" })
      ]);

      if (membersRes.ok) {
        const data = await membersRes.json();
        setMembers(data);
      }

      if (invitationsRes.ok) {
        const data = await invitationsRes.json();
        setInvitations(data);
      }

      if (projectsRes.ok) {
        const data = await projectsRes.json();
        setProjects(data);
      }
    } catch (error) {
      console.error("Failed to load team data:", error);
    }
  };

  const createTeam = async () => {
    if (!newTeamData.name.trim()) {
      setMessage("Please enter a team name");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newTeamData)
      });

      if (response.ok) {
        const newTeam = await response.json();
        setTeams(prev => [...prev, newTeam]);
        setSelectedTeam(newTeam);
        setNewTeamData({ name: "", description: "" });
        setShowCreateTeam(false);
        setMessage("Team created successfully!");
      } else {
        setMessage("Failed to create team");
      }
    } catch (error) {
      setMessage("Failed to create team");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const inviteMember = async () => {
    if (!inviteEmail.trim()) {
      setMessage("Please enter an email address");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    if (!selectedTeam) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/teams/${selectedTeam.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole
        })
      });

      if (response.ok) {
        const newInvitation = await response.json();
        setInvitations(prev => [...prev, newInvitation]);
        setInviteEmail("");
        setShowInviteModal(false);
        setMessage("Invitation sent successfully!");
      } else {
        const error = await response.json();
        setMessage(error.message || "Failed to send invitation");
      }
    } catch (error) {
      setMessage("Failed to send invitation");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const updateMemberRole = async (memberId: string, newRole: string) => {
    if (!selectedTeam) return;

    try {
      const response = await fetch(`/api/teams/${selectedTeam.id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: newRole })
      });

      if (response.ok) {
        setMembers(prev => prev.map(member => 
          member.id === memberId ? { ...member, role: newRole as any } : member
        ));
        setMessage("Member role updated successfully!");
      } else {
        setMessage("Failed to update member role");
      }
    } catch (error) {
      setMessage("Failed to update member role");
    } finally {
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const removeMember = async (memberId: string) => {
    if (!selectedTeam) return;

    try {
      const response = await fetch(`/api/teams/${selectedTeam.id}/members/${memberId}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (response.ok) {
        setMembers(prev => prev.filter(member => member.id !== memberId));
        setMessage("Member removed successfully!");
      } else {
        setMessage("Failed to remove member");
      }
    } catch (error) {
      setMessage("Failed to remove member");
    } finally {
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const cancelInvitation = async (invitationId: string) => {
    if (!selectedTeam) return;

    try {
      const response = await fetch(`/api/teams/${selectedTeam.id}/invitations/${invitationId}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (response.ok) {
        setInvitations(prev => prev.filter(inv => inv.id !== invitationId));
        setMessage("Invitation cancelled successfully!");
      } else {
        setMessage("Failed to cancel invitation");
      }
    } catch (error) {
      setMessage("Failed to cancel invitation");
    } finally {
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner": return <Crown className="w-4 h-4 text-yellow-600" />;
      case "admin": return <Shield className="w-4 h-4 text-red-600" />;
      case "member": return <User className="w-4 h-4 text-blue-600" />;
      case "viewer": return <Eye className="w-4 h-4 text-gray-600" />;
      default: return <User className="w-4 h-4 text-gray-600" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "owner": return "text-yellow-600 bg-yellow-100";
      case "admin": return "text-red-600 bg-red-100";
      case "member": return "text-blue-600 bg-blue-100";
      case "viewer": return "text-gray-600 bg-gray-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "text-green-600 bg-green-100";
      case "pending": return "text-yellow-600 bg-yellow-100";
      case "suspended": return "text-red-600 bg-red-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading team settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/settings"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Settings
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Team Management</h1>
              <p className="text-gray-600 mt-2">Manage your teams, members, and collaboration settings</p>
            </div>
            <div className="flex items-center gap-3">
              {message && (
                <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  message.includes("successfully") 
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}>
                  {message.includes("successfully") ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  {message}
                </div>
              )}
              <button
                onClick={() => setShowCreateTeam(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Team
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Team Sidebar */}
          <div className="w-80 bg-white rounded-lg shadow-sm border">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Your Teams ({teams.length})</h2>
            </div>
            <div className="p-4 space-y-2">
              {teams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeam(team)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedTeam?.id === team.id
                      ? "bg-indigo-50 border border-indigo-200"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                      {team.avatar ? (
                        <Image
                          src={team.avatar}
                          alt={team.name}
                          width={40}
                          height={40}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <Users className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{team.name}</div>
                      <div className="text-sm text-gray-600">
                        {team.memberCount} members · {team.projectCount} projects
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              {teams.length === 0 && (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Teams</h3>
                  <p className="text-gray-600 mb-4">Create your first team to start collaborating</p>
                  <button
                    onClick={() => setShowCreateTeam(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Create Team
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          {selectedTeam ? (
            <div className="flex-1">
              {/* Team Header */}
              <div className="bg-white rounded-lg shadow-sm border mb-6">
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center">
                        {selectedTeam.avatar ? (
                          <Image
                            src={selectedTeam.avatar}
                            alt={selectedTeam.name}
                            width={64}
                            height={64}
                            className="w-full h-full object-cover rounded-lg"
                          />
                        ) : (
                          <Users className="w-8 h-8 text-gray-400" />
                        )}
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">{selectedTeam.name}</h2>
                        <p className="text-gray-600 mt-1">{selectedTeam.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <span>{selectedTeam.memberCount} members</span>
                          <span>{selectedTeam.projectCount} projects</span>
                          <span className="capitalize">{selectedTeam.plan} plan</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                        <Settings className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="mb-6">
                <nav className="flex space-x-8">
                  {[
                    { id: "overview", label: "Overview", icon: Eye },
                    { id: "members", label: "Members", icon: Users },
                    { id: "projects", label: "Projects", icon: FileText },
                    { id: "settings", label: "Settings", icon: Settings }
                  ].map(({ id, label, icon: Icon }) => (
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
                    </button>
                  ))}
                </nav>
              </div>

              {/* Overview Tab */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  {/* Quick Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg shadow-sm border p-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <Users className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">{members.length}</p>
                          <p className="text-sm text-gray-600">Members</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border p-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg">
                          <FileText className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">{projects.length}</p>
                          <p className="text-sm text-gray-600">Projects</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border p-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-100 rounded-lg">
                          <Send className="w-5 h-5 text-yellow-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">{invitations.length}</p>
                          <p className="text-sm text-gray-600">Pending Invites</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border p-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-lg">
                          <Activity className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">
                            {projects.filter(p => p.status === "active").length}
                          </p>
                          <p className="text-sm text-gray-600">Active Projects</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div className="bg-white rounded-lg shadow-sm border">
                    <div className="p-6 border-b border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
                    </div>
                    <div className="p-6">
                      <div className="space-y-4">
                        {/* Activity items would be populated from API */}
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <UserPlus className="w-4 h-4" />
                          <span>John Doe joined the team</span>
                          <span className="text-gray-400">2 hours ago</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <FileText className="w-4 h-4" />
                          <span>New project "Mobile App" was created</span>
                          <span className="text-gray-400">1 day ago</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <Send className="w-4 h-4" />
                          <span>Invitation sent to jane@example.com</span>
                          <span className="text-gray-400">2 days ago</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Members Tab */}
              {activeTab === "members" && (
                <div className="space-y-6">
                  {/* Invite Member */}
                  <div className="bg-white rounded-lg shadow-sm border">
                    <div className="p-6 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900">Team Members ({members.length})</h3>
                        <button
                          onClick={() => setShowInviteModal(true)}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                        >
                          <UserPlus className="w-4 h-4" />
                          Invite Member
                        </button>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {members.map((member) => (
                        <div key={member.id} className="p-6">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
                                {member.avatar ? (
                                  <Image
                                    src={member.avatar}
                                    alt={member.name}
                                    width={40}
                                    height={40}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <User className="w-5 h-5 text-gray-400" />
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium text-gray-900">{member.name}</h4>
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(member.role)}`}>
                                    {getRoleIcon(member.role)}
                                    <span className="ml-1">{member.role}</span>
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600">{member.email}</p>
                                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                  <span>Joined {new Date(member.joinedAt).toLocaleDateString()}</span>
                                  <span>Last active {new Date(member.lastActive).toLocaleDateString()}</span>
                                  <span className={`px-2 py-1 rounded-full font-medium ${getStatusColor(member.status)}`}>
                                    {member.status}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {member.role !== "owner" && (
                              <div className="flex items-center gap-2">
                                <select
                                  value={member.role}
                                  onChange={(e) => updateMemberRole(member.id, e.target.value)}
                                  className="text-sm border border-gray-300 rounded px-2 py-1"
                                >
                                  <option value="admin">Admin</option>
                                  <option value="member">Member</option>
                                  <option value="viewer">Viewer</option>
                                </select>
                                <button
                                  onClick={() => removeMember(member.id)}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pending Invitations */}
                  {invitations.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm border">
                      <div className="p-6 border-b border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900">Pending Invitations ({invitations.length})</h3>
                      </div>
                      <div className="divide-y divide-gray-200">
                        {invitations.map((invitation) => (
                          <div key={invitation.id} className="p-6">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-medium text-gray-900">{invitation.email}</h4>
                                <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(invitation.role)}`}>
                                    {invitation.role}
                                  </span>
                                  <span>Invited {new Date(invitation.invitedAt).toLocaleDateString()}</span>
                                  <span>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(`${window.location.origin}/invite/${invitation.id}`);
                                    setMessage("Invitation link copied!");
                                    setTimeout(() => setMessage(""), 2000);
                                  }}
                                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => cancelInvitation(invitation.id)}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Projects Tab */}
              {activeTab === "projects" && (
                <div className="bg-white rounded-lg shadow-sm border">
                  <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">Team Projects ({projects.length})</h3>
                      <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        New Project
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {projects.map((project) => (
                      <div key={project.id} className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-gray-900">{project.name}</h4>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                project.visibility === "public" ? "text-green-600 bg-green-100" :
                                project.visibility === "team" ? "text-blue-600 bg-blue-100" :
                                "text-gray-600 bg-gray-100"
                              }`}>
                                {project.visibility}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                project.status === "active" ? "text-green-600 bg-green-100" : "text-gray-600 bg-gray-100"
                              }`}>
                                {project.status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{project.description}</p>
                            <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                              <span>{project.memberCount} members</span>
                              <span>Updated {new Date(project.lastUpdated).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded">
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {projects.length === 0 && (
                      <div className="p-12 text-center">
                        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h4 className="text-lg font-medium text-gray-900 mb-2">No Projects</h4>
                        <p className="text-gray-600">Create your first team project to get started</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === "settings" && (
                <div className="space-y-6">
                  <div className="bg-white rounded-lg shadow-sm border">
                    <div className="p-6 border-b border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900">Team Settings</h3>
                    </div>
                    <div className="p-6">
                      <p className="text-gray-600">Team settings would be implemented here including permissions, billing, and other configuration options.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-gray-900 mb-2">No Team Selected</h3>
                <p className="text-gray-600">Select a team from the sidebar to manage it</p>
              </div>
            </div>
          )}
        </div>

        {/* Create Team Modal */}
        {showCreateTeam && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Create New Team</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Team Name
                  </label>
                  <input
                    type="text"
                    value={newTeamData.name}
                    onChange={(e) => setNewTeamData({ ...newTeamData, name: e.target.value })}
                    placeholder="Enter team name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={newTeamData.description}
                    onChange={(e) => setNewTeamData({ ...newTeamData, description: e.target.value })}
                    placeholder="Enter team description"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={createTeam}
                    disabled={isLoading || !newTeamData.name.trim()}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    {isLoading ? "Creating..." : "Create Team"}
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateTeam(false);
                      setNewTeamData({ name: "", description: "" });
                    }}
                    className="px-4 py-2 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Invite Member Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Invite Team Member</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="viewer">Viewer - Can view projects</option>
                    <option value="member">Member - Can create and edit</option>
                    <option value="admin">Admin - Can manage team</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={inviteMember}
                    disabled={isLoading || !inviteEmail.trim()}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {isLoading ? "Sending..." : "Send Invitation"}
                  </button>
                  <button
                    onClick={() => {
                      setShowInviteModal(false);
                      setInviteEmail("");
                    }}
                    className="px-4 py-2 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const runtime = "edge";
