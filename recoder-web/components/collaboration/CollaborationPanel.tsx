'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, MessageCircle, Video, 
  Settings, Crown, Shield, Eye, Edit,
  Clock, Check, X, MoreHorizontal, Copy,
  Mail, Share2, Link, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useCollaboration } from '@/hooks/use-collaboration';

interface CollaborationPanelProps {
  projectId: string;
  currentUserId: string;
}

interface Collaborator {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status: 'online' | 'away' | 'offline';
  lastSeen?: string;
  currentFile?: string;
  cursor?: {
    line: number;
    column: number;
  };
}

interface CollaborationInvite {
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  sentAt: string;
  status: 'pending' | 'accepted' | 'declined';
}

const mockCollaborators: Collaborator[] = [
  {
    id: '1',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    avatar: '/avatars/alice.jpg',
    role: 'owner',
    status: 'online',
    currentFile: 'src/components/App.tsx',
    cursor: { line: 45, column: 12 }
  },
  {
    id: '2',
    name: 'Bob Smith',
    email: 'bob@example.com',
    avatar: '/avatars/bob.jpg',
    role: 'editor',
    status: 'online',
    currentFile: 'src/utils/helpers.ts',
    cursor: { line: 23, column: 8 }
  },
  {
    id: '3',
    name: 'Carol Davis',
    email: 'carol@example.com',
    avatar: '/avatars/carol.jpg',
    role: 'viewer',
    status: 'away',
    lastSeen: '5 minutes ago'
  }
];

const mockInvites: CollaborationInvite[] = [
  {
    id: '1',
    email: 'john@example.com',
    role: 'editor',
    sentAt: '2 hours ago',
    status: 'pending'
  },
  {
    id: '2',
    email: 'sarah@example.com',
    role: 'viewer',
    sentAt: '1 day ago',
    status: 'pending'
  }
];

export default function CollaborationPanel({ projectId, currentUserId }: CollaborationPanelProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>(mockCollaborators);
  const [invites, setInvites] = useState<CollaborationInvite[]>(mockInvites);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('editor');
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');

  const { 
    collaborators: realtimeCollaborators, 
    isConnected,
    sendCursorMove
  } = useCollaboration({ 
    projectId,
    user: {
      id: currentUserId,
      name: 'Current User',
      email: 'user@example.com'
    }
  });

  useEffect(() => {
    // Generate share link
    setShareLink(`${window.location.origin}/editor/${projectId}?invite=true`);
  }, [projectId]);

  const handleInviteUser = async () => {
    if (!inviteEmail.trim()) return;

    try {
      // Call API to send invitation
      const response = await fetch(`/api/projects/${projectId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole
        }),
      });

      if (response.ok) {
        const newInvite: CollaborationInvite = {
          id: Date.now().toString(),
          email: inviteEmail,
          role: inviteRole,
          sentAt: 'just now',
          status: 'pending'
        };
        
        setInvites(prev => [...prev, newInvite]);
        setInviteEmail('');
        setIsInviteDialogOpen(false);
      }
    } catch (error) {
      console.error('Failed to send invitation:', error);
    }
  };

  const handleRoleChange = async (collaboratorId: string, newRole: 'admin' | 'editor' | 'viewer') => {
    try {
      const response = await fetch(`/api/projects/${projectId}/collaborators/${collaboratorId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        setCollaborators(prev => prev.map(collab => 
          collab.id === collaboratorId 
            ? { ...collab, role: newRole }
            : collab
        ));
      }
    } catch (error) {
      console.error('Failed to update role:', error);
    }
  };

  const handleRemoveCollaborator = async (collaboratorId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/collaborators/${collaboratorId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setCollaborators(prev => prev.filter(collab => collab.id !== collaboratorId));
      }
    } catch (error) {
      console.error('Failed to remove collaborator:', error);
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink);
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-purple-100 text-purple-800';
      case 'admin': return 'bg-red-100 text-red-800';
      case 'editor': return 'bg-blue-100 text-blue-800';
      case 'viewer': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      case 'offline': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold">Collaboration</h3>
          <Badge variant="secondary" className="text-xs">
            {collaborators.filter(c => c.status === 'online').length} online
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="w-4 h-4 mr-1" />
                Invite
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Collaborator</DialogTitle>
                <DialogDescription>
                  Send an invitation to collaborate on this project
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="inviteEmail">Email Address</Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    placeholder="colleague@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="inviteRole">Role</Label>
                  <Select value={inviteRole} onValueChange={(value: any) => setInviteRole(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin - Full access</SelectItem>
                      <SelectItem value="editor">Editor - Can edit code</SelectItem>
                      <SelectItem value="viewer">Viewer - Read only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleInviteUser} className="flex-1">
                    <Mail className="w-4 h-4 mr-2" />
                    Send Invitation
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsInviteDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Tabs defaultValue="collaborators" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="collaborators">Team</TabsTrigger>
            <TabsTrigger value="invites">Invites</TabsTrigger>
            <TabsTrigger value="share">Share</TabsTrigger>
          </TabsList>

          <TabsContent value="collaborators" className="p-4 space-y-4">
            {/* Active Collaborators */}
            <div className="space-y-3">
              {collaborators.map((collaborator) => (
                <Card key={collaborator.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={collaborator.avatar} alt={collaborator.name} />
                            <AvatarFallback>
                              {collaborator.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div 
                            className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${getStatusColor(collaborator.status)}`}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{collaborator.name}</p>
                            <Badge 
                              variant="secondary" 
                              className={`text-xs ${getRoleColor(collaborator.role)}`}
                            >
                              {collaborator.role}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500">{collaborator.email}</p>
                          {collaborator.status === 'online' && collaborator.currentFile && (
                            <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                              <Edit className="w-3 h-3" />
                              {collaborator.currentFile}
                              {collaborator.cursor && (
                                <span className="text-gray-400">
                                  :{collaborator.cursor.line}:{collaborator.cursor.column}
                                </span>
                              )}
                            </div>
                          )}
                          {collaborator.status !== 'online' && collaborator.lastSeen && (
                            <p className="text-xs text-gray-400">Last seen {collaborator.lastSeen}</p>
                          )}
                        </div>
                      </div>
                      
                      {collaborator.role !== 'owner' && (
                        <div className="flex items-center gap-2">
                          <Select 
                            value={collaborator.role}
                            onValueChange={(value: any) => handleRoleChange(collaborator.id, value)}
                          >
                            <SelectTrigger className="w-24 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="editor">Editor</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveCollaborator(collaborator.id)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="invites" className="p-4 space-y-4">
            {/* Pending Invitations */}
            <div className="space-y-3">
              {invites.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center">
                    <Mail className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">No pending invitations</p>
                  </CardContent>
                </Card>
              ) : (
                invites.map((invite) => (
                  <Card key={invite.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{invite.email}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge 
                              variant="secondary" 
                              className={`text-xs ${getRoleColor(invite.role)}`}
                            >
                              {invite.role}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              Sent {invite.sentAt}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={invite.status === 'pending' ? 'secondary' : 'default'}
                            className="text-xs"
                          >
                            {invite.status}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setInvites(prev => prev.filter(inv => inv.id !== invite.id));
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="share" className="p-4 space-y-4">
            {/* Share Options */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Share Project</CardTitle>
                <CardDescription>
                  Share this project with others using a link
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="shareLink">Project Link</Label>
                  <div className="flex gap-2">
                    <Input
                      id="shareLink"
                      value={shareLink}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={copyShareLink}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Anyone with this link can view the project
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      const text = `Check out my project: ${shareLink}`;
                      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
                      window.open(url, '_blank');
                    }}
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Tweet
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      const text = `Check out my project: ${shareLink}`;
                      const url = `mailto:?subject=Project Collaboration&body=${encodeURIComponent(text)}`;
                      window.location.href = url;
                    }}
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Email
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Live Collaboration Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Live Collaboration</CardTitle>
                <CardDescription>
                  Real-time collaboration status
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-sm">
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                  <Zap className="w-4 h-4 text-yellow-500" />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Real-time cursor tracking and live editing active
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
