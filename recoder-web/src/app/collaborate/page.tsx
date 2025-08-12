'use client';

/**
 * Collaboration Page - Real-Time Collaborative Development
 * KILLER FEATURE: Multi-developer + AI agent pair programming
 * Cursor can't do this - major competitive advantage!
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  Users, 
  Plus, 
  Video, 
  MessageSquare, 
  Code, 
  Bot, 
  Zap, 
  Globe,
  Clock,
  CheckCircle,
  AlertCircle,
  Wifi
} from 'lucide-react';

interface CollaborationSession {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
  userCount: number;
  aiAgentsEnabled: boolean;
  language: string;
  description: string;
  isActive: boolean;
}

export default function CollaboratePage() {
  const [sessions, setSessions] = useState<CollaborationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  
  const [newSession, setNewSession] = useState({
    name: '',
    description: '',
    language: 'typescript',
    maxUsers: 5,
    allowAIAgents: true
  });

  useEffect(() => {
    loadSessions();
    loadAnalytics();
  }, []);

  const loadSessions = async () => {
    try {
      const response = await fetch('/api/collaboration/sessions');
      const data = await response.json();
      if (data.success) {
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Failed to load collaboration sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const response = await fetch('/api/collaboration/analytics');
      const data = await response.json();
      if (data.success) {
        setAnalytics(data.analytics);
      }
    } catch (error) {
      console.error('Failed to load collaboration analytics:', error);
    }
  };

  const createSession = async () => {
    if (!newSession.name.trim()) return;
    
    setCreating(true);
    try {
      const response = await fetch('/api/collaboration/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newSession,
          userId: 'web-user',
          userName: 'Web User',
          userEmail: 'user@recoder.dev'
        }),
      });

      const data = await response.json();
      if (data.success) {
        await loadSessions();
        setShowCreateForm(false);
        setNewSession({
          name: '',
          description: '',
          language: 'typescript',
          maxUsers: 5,
          allowAIAgents: true
        });
      }
    } catch (error) {
      console.error('Failed to create collaboration session:', error);
    } finally {
      setCreating(false);
    }
  };

  const joinSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/collaboration/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'web-user',
          userName: 'Web User',
          userEmail: 'user@recoder.dev'
        }),
      });

      const data = await response.json();
      if (data.success) {
        // In a real app, this would redirect to the collaboration interface
        alert(`Joined session! WebSocket URL: ${data.session?.websocketUrl}`);
        await loadSessions();
      }
    } catch (error) {
      console.error('Failed to join collaboration session:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            🤝 Real-Time Collaborative Development
          </h1>
          <p className="text-xl text-gray-600 mb-4">
            Multi-developer + AI agent pair programming
          </p>
          <div className="flex items-center justify-center gap-4 mb-6">
            <Badge variant="secondary" className="text-lg px-4 py-2">
              🏆 KILLER FEATURE
            </Badge>
            <Badge variant="destructive" className="text-lg px-4 py-2">
              Cursor Can't Do This!
            </Badge>
          </div>
          <div className="flex items-center justify-center gap-2 text-green-600">
            <Wifi className="h-5 w-5" />
            <span className="font-medium">WebSocket Server Active</span>
          </div>
        </div>

        {/* Analytics Overview */}
        {analytics && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Collaboration Analytics
              </CardTitle>
              <CardDescription>Real-time collaboration metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{analytics.overview.totalSessions}</div>
                  <div className="text-sm text-gray-600">Total Sessions</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{analytics.overview.activeSessions}</div>
                  <div className="text-sm text-gray-600">Active Sessions</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{analytics.overview.totalUsers}</div>
                  <div className="text-sm text-gray-600">Total Users</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{analytics.realTimeSync.conflictsResolved}</div>
                  <div className="text-sm text-gray-600">Conflicts Resolved</div>
                </div>
              </div>
              
              <Separator className="my-6" />
              
              <div className="bg-gradient-to-r from-purple-100 to-blue-100 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">🚀 Competitive Advantage</h4>
                <p className="text-gray-700 mb-3">{analytics.competitiveAdvantage.advantage}</p>
                <div className="flex flex-wrap gap-2">
                  {analytics.competitiveAdvantage.uniqueFeatures.slice(0, 4).map((feature: string, index: number) => (
                    <Badge key={index} variant="secondary">{feature}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <Button 
            onClick={() => setShowCreateForm(true)}
            size="lg"
            className="flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            Create New Session
          </Button>
          <Button 
            onClick={loadSessions}
            variant="outline"
            size="lg"
            className="flex items-center gap-2"
          >
            <Wifi className="h-5 w-5" />
            Refresh Sessions
          </Button>
        </div>

        {/* Create Session Form */}
        {showCreateForm && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Create Collaboration Session</CardTitle>
              <CardDescription>Set up a new real-time collaborative coding session</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="sessionName">Session Name</Label>
                <Input
                  id="sessionName"
                  value={newSession.name}
                  onChange={(e) => setNewSession({...newSession, name: e.target.value})}
                  placeholder="My Awesome Project"
                  className="mt-2"
                />
              </div>
              
              <div>
                <Label htmlFor="sessionDescription">Description (Optional)</Label>
                <Textarea
                  id="sessionDescription"
                  value={newSession.description}
                  onChange={(e) => setNewSession({...newSession, description: e.target.value})}
                  placeholder="Working on a new feature together..."
                  className="mt-2"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="language">Programming Language</Label>
                  <Select value={newSession.language} onValueChange={(value) => setNewSession({...newSession, language: value})}>
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="typescript">TypeScript</SelectItem>
                      <SelectItem value="javascript">JavaScript</SelectItem>
                      <SelectItem value="python">Python</SelectItem>
                      <SelectItem value="java">Java</SelectItem>
                      <SelectItem value="go">Go</SelectItem>
                      <SelectItem value="rust">Rust</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="maxUsers">Max Users</Label>
                  <Input
                    id="maxUsers"
                    type="number"
                    value={newSession.maxUsers}
                    onChange={(e) => setNewSession({...newSession, maxUsers: parseInt(e.target.value) || 5})}
                    min="2"
                    max="20"
                    className="mt-2"
                  />
                </div>
                
                <div className="flex items-center space-x-2 mt-6">
                  <input
                    type="checkbox"
                    id="aiAgents"
                    checked={newSession.allowAIAgents}
                    onChange={(e) => setNewSession({...newSession, allowAIAgents: e.target.checked})}
                  />
                  <Label htmlFor="aiAgents">Enable AI Agents</Label>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Button onClick={createSession} disabled={creating || !newSession.name.trim()}>
                  {creating ? 'Creating...' : 'Create Session'}
                </Button>
                <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sessions List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            Array.from({length: 6}).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded mb-4"></div>
                  <div className="h-8 bg-gray-200 rounded"></div>
                </CardContent>
              </Card>
            ))
          ) : sessions.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <div className="text-gray-400 mb-4">
                <Users className="h-12 w-12 mx-auto mb-4" />
                <p className="text-lg">No collaboration sessions yet</p>
                <p>Create your first session to start collaborating!</p>
              </div>
            </div>
          ) : (
            sessions.map((session) => (
              <Card key={session.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{session.name}</CardTitle>
                    {session.isActive ? (
                      <Badge variant="default" className="text-xs">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Inactive
                      </Badge>
                    )}
                  </div>
                  {session.description && (
                    <CardDescription className="text-sm">{session.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Language:</span>
                      <Badge variant="outline">{session.language}</Badge>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Users:</span>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        <span>{session.userCount}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">AI Agents:</span>
                      <div className="flex items-center gap-1">
                        {session.aiAgentsEnabled ? (
                          <>
                            <Bot className="h-4 w-4 text-green-600" />
                            <span className="text-green-600">Enabled</span>
                          </>
                        ) : (
                          <>
                            <Bot className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-400">Disabled</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      Created {new Date(session.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => joinSession(session.id)}
                      size="sm" 
                      className="flex-1"
                      disabled={!session.isActive}
                    >
                      Join Session
                    </Button>
                    <Button variant="outline" size="sm">
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm">
                      <Video className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Features Showcase */}
        <Card className="mt-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Why Recoder Dominates Collaborative Development
            </CardTitle>
            <CardDescription>Features that make Cursor users jealous</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <Code className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <h4 className="font-semibold text-gray-900">Real-Time Code Sync</h4>
                <p className="text-sm text-gray-600 mt-1">Operational Transform conflict resolution</p>
              </div>
              
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <Bot className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <h4 className="font-semibold text-gray-900">AI Agent Integration</h4>
                <p className="text-sm text-gray-600 mt-1">AI assistants join your coding sessions</p>
              </div>
              
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <Video className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                <h4 className="font-semibold text-gray-900">Voice Chat</h4>
                <p className="text-sm text-gray-600 mt-1">Built-in voice for pair programming</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}