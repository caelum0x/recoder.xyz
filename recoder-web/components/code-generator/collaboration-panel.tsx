'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Users, 
  UserPlus, 
  UserX, 
  Share2, 
  Copy, 
  Send, 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff,
  Crown,
  Edit3,
  Eye,
  Activity,
  MoreVertical,
  MessageCircle,
  Settings,
  Clock,
  Circle
} from 'lucide-react';
import { toast } from 'sonner';

interface Collaborator {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'owner' | 'editor' | 'viewer';
  status: 'online' | 'offline' | 'away';
  cursor?: {
    line: number;
    column: number;
  };
  lastSeen?: string;
  permissions: {
    canEdit: boolean;
    canExecute: boolean;
    canInvite: boolean;
    canManageSettings: boolean;
  };
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: string;
  type: 'text' | 'system' | 'code_share' | 'execution_result';
  metadata?: any;
}

interface VoiceCallState {
  isActive: boolean;
  isMuted: boolean;
  participants: string[];
}

interface CollaborationPanelProps {
  collaborators: Collaborator[];
  isActive: boolean;
  onToggle: (active: boolean) => void;
  currentUserId?: string;
  className?: string;
}

export function CollaborationPanel({
  collaborators,
  isActive,
  onToggle,
  currentUserId = 'current-user',
  className = ''
}: CollaborationPanelProps) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [activeTab, setActiveTab] = useState('users');
  const [voiceCall, setVoiceCall] = useState<VoiceCallState>({
    isActive: false,
    isMuted: false,
    participants: []
  });
  const [isTyping, setIsTyping] = useState<string[]>([]);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  // Enhanced role management
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="w-3 h-3 text-yellow-500" />;
      case 'editor':
        return <Edit3 className="w-3 h-3 text-blue-500" />;
      case 'viewer':
        return <Eye className="w-3 h-3 text-gray-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'away':
        return 'bg-yellow-500';
      case 'offline':
        return 'bg-gray-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getCurrentUser = () => {
    return collaborators.find(c => c.id === currentUserId);
  };

  const canCurrentUserInvite = () => {
    const currentUser = getCurrentUser();
    return currentUser?.permissions.canInvite || currentUser?.role === 'owner';
  };

  // Enhanced invite system with role selection
  const handleInviteUser = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    if (!canCurrentUserInvite()) {
      toast.error('You do not have permission to invite users');
      return;
    }

    try {
      // Simulate invite API call
      const response = await fetch('/api/collaboration/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          sessionId: 'current-session'
        })
      });

      if (response.ok) {
        toast.success(`Invitation sent to ${inviteEmail} as ${inviteRole}`);
        setInviteEmail('');
        
        // Add system message
        const systemMessage: ChatMessage = {
          id: Date.now().toString(),
          userId: 'system',
          userName: 'System',
          message: `${getCurrentUser()?.name} invited ${inviteEmail} as ${inviteRole}`,
          timestamp: new Date().toISOString(),
          type: 'system'
        };
        setChatMessages(prev => [...prev, systemMessage]);
      } else {
        throw new Error('Failed to send invitation');
      }
    } catch (error) {
      toast.error('Failed to send invitation');
    }
  };

  // Enhanced chat with typing indicators
  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    const message: ChatMessage = {
      id: Date.now().toString(),
      userId: currentUserId,
      userName: getCurrentUser()?.name || 'You',
      message: newMessage,
      timestamp: new Date().toISOString(),
      type: 'text'
    };

    setChatMessages(prev => [...prev, message]);
    setNewMessage('');
    
    // Simulate WebSocket message
    try {
      await fetch('/api/collaboration/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  // Voice call management
  const toggleVoiceCall = async () => {
    if (voiceCall.isActive) {
      // End call
      setVoiceCall(prev => ({ ...prev, isActive: false, participants: [] }));
      toast.info('Voice call ended');
    } else {
      // Start call
      setVoiceCall(prev => ({ ...prev, isActive: true, participants: [currentUserId] }));
      toast.success('Voice call started');
    }
  };

  const toggleMute = () => {
    setVoiceCall(prev => ({ ...prev, isMuted: !prev.isMuted }));
    toast.info(voiceCall.isMuted ? 'Microphone unmuted' : 'Microphone muted');
  };

  // Enhanced share link generation
  const generateShareLink = async () => {
    setIsGeneratingLink(true);
    try {
      const response = await fetch('/api/collaboration/share-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'current-session',
          permissions: { canEdit: false, canExecute: false }
        })
      });

      const data = await response.json();
      setShareLink(data.shareLink || `${window.location.origin}/playground/shared/${Date.now()}`);
      toast.success('Share link generated');
    } catch (error) {
      toast.error('Failed to generate share link');
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const copyShareLink = async () => {
    if (shareLink) {
      await navigator.clipboard.writeText(shareLink);
      toast.success('Share link copied to clipboard');
    }
  };

  // Remove user (owner only)
  const removeUser = async (userId: string) => {
    const currentUser = getCurrentUser();
    if (currentUser?.role !== 'owner') {
      toast.error('Only the owner can remove users');
      return;
    }

    try {
      await fetch(`/api/collaboration/remove-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, sessionId: 'current-session' })
      });
      
      toast.info('User removed from session');
    } catch (error) {
      toast.error('Failed to remove user');
    }
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Simulate typing indicators
  useEffect(() => {
    if (newMessage) {
      // Simulate sending typing status
      setIsTyping(prev => prev.includes(currentUserId) ? prev : [...prev, currentUserId]);
    } else {
      setIsTyping(prev => prev.filter(id => id !== currentUserId));
    }
  }, [newMessage, currentUserId]);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!isActive) {
    return (
      <div className={`collaboration-panel p-4 text-center ${className}`}>
        <div className="space-y-4">
          <Users className="w-12 h-12 mx-auto text-muted-foreground" />
          <div>
            <h3 className="font-medium">Real-time Collaboration</h3>
            <p className="text-sm text-muted-foreground">
              Share code, chat, and work together in real-time
            </p>
          </div>
          <Button onClick={() => onToggle(true)} className="w-full">
            Start Collaborating
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`collaboration-panel h-full flex flex-col bg-background ${className}`}>
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Users className="w-4 h-4" />
            Collaboration
            <Badge variant="secondary" className="text-xs">
              {collaborators.length} users
            </Badge>
          </h3>
          
          <div className="flex items-center gap-2">
            {voiceCall.isActive && (
              <Button
                variant={voiceCall.isMuted ? "outline" : "default"}
                size="sm"
                onClick={toggleMute}
                className="h-8 w-8 p-0"
              >
                {voiceCall.isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
            )}
            
            <Button
              variant={voiceCall.isActive ? "default" : "outline"}
              size="sm"
              onClick={toggleVoiceCall}
              className="h-8 w-8 p-0"
            >
              {voiceCall.isActive ? <PhoneOff className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggle(false)}
              className="h-8 w-8 p-0"
            >
              <UserX className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-3 rounded-none border-b">
            <TabsTrigger value="users">
              Users
              <Badge variant="secondary" className="ml-2 text-xs">
                {collaborators.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="chat">
              Chat
              {chatMessages.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {chatMessages.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="share">Share</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="flex-1 m-0">
            <div className="p-4 space-y-4">
              {/* Invite Section */}
              {canCurrentUserInvite() && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Invite Collaborator</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input
                      placeholder="Enter email address"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleInviteUser()}
                    />
                    <div className="flex gap-2">
                      <Select value={inviteRole} onValueChange={(value: 'editor' | 'viewer') => setInviteRole(value)}>
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button onClick={handleInviteUser} disabled={!inviteEmail.trim()}>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Invite
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Users List */}
              <div className="space-y-2">
                {collaborators.map((collaborator) => (
                  <Card key={collaborator.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={collaborator.avatar} />
                            <AvatarFallback className="text-xs">
                              {collaborator.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-background ${getStatusColor(collaborator.status)}`} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {collaborator.name}
                              {collaborator.id === currentUserId && ' (You)'}
                            </span>
                            {getRoleIcon(collaborator.role)}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{collaborator.role}</span>
                            {collaborator.cursor && (
                              <>
                                <span>•</span>
                                <span>Line {collaborator.cursor.line}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {getCurrentUser()?.role === 'owner' && collaborator.id !== currentUserId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeUser(collaborator.id)}
                          className="h-8 w-8 p-0 text-muted-foreground"
                        >
                          <UserX className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="chat" className="flex-1 m-0 flex flex-col">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {chatMessages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No messages yet</p>
                    <p className="text-xs mt-1">Start a conversation with your team</p>
                  </div>
                ) : (
                  chatMessages.map((message) => (
                    <div key={message.id} className={`flex gap-3 ${message.type === 'system' ? 'justify-center' : ''}`}>
                      {message.type === 'system' ? (
                        <div className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-1">
                          {message.message}
                        </div>
                      ) : (
                        <>
                          <Avatar className="w-6 h-6 mt-1">
                            <AvatarFallback className="text-xs">
                              {message.userName.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium">{message.userName}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatTimestamp(message.timestamp)}
                              </span>
                            </div>
                            <p className="text-sm">{message.message}</p>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
                
                {/* Typing Indicators */}
                {isTyping.filter(id => id !== currentUserId).length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Activity className="w-3 h-3 animate-pulse" />
                    <span>
                      {isTyping.filter(id => id !== currentUserId).length === 1 ? 
                        'Someone is typing...' : 
                        `${isTyping.filter(id => id !== currentUserId).length} people are typing...`
                      }
                    </span>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>
            
            <div className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  ref={messageInputRef}
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <Button onClick={handleSendMessage} disabled={!newMessage.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="share" className="flex-1 m-0 p-4">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Share Session</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Generate a secure link to share this coding session with others.
                  </p>
                  
                  {shareLink ? (
                    <div className="space-y-2">
                      <Input
                        value={shareLink}
                        readOnly
                        className="font-mono text-xs"
                      />
                      <div className="flex gap-2">
                        <Button onClick={copyShareLink} className="flex-1">
                          <Copy className="w-4 h-4 mr-2" />
                          Copy Link
                        </Button>
                        <Button variant="outline" onClick={() => setShareLink('')}>
                          New Link
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button onClick={generateShareLink} disabled={isGeneratingLink} className="w-full">
                      {isGeneratingLink ? (
                        <>
                          <Activity className="w-4 h-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Share2 className="w-4 h-4 mr-2" />
                          Generate Share Link
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {voiceCall.isActive && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      Voice Call Active
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {voiceCall.participants.length} participant(s) in call
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={toggleMute} className="flex-1">
                          {voiceCall.isMuted ? (
                            <>
                              <MicOff className="w-4 h-4 mr-2" />
                              Unmute
                            </>
                          ) : (
                            <>
                              <Mic className="w-4 h-4 mr-2" />
                              Mute
                            </>
                          )}
                        </Button>
                        <Button variant="destructive" onClick={toggleVoiceCall}>
                          <PhoneOff className="w-4 h-4 mr-2" />
                          End Call
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
