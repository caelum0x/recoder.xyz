'use client';

/**
 * Chat History Page - Past Conversations & Learning
 * KILLER FEATURE: AI that learns from every conversation and improves over time
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
  MessageSquare, 
  Brain, 
  History, 
  TrendingUp, 
  Code, 
  Bot, 
  Zap, 
  Search,
  Clock,
  CheckCircle,
  AlertCircle,
  Star,
  Plus,
  Eye,
  Settings,
  BarChart3,
  Users,
  FileText,
  Sparkles,
  ArrowRight,
  MessageCircle,
  Bookmark,
  Target,
  Lightbulb
} from 'lucide-react';

interface ChatSession {
  id: string;
  title: string;
  summary: string;
  messageCount: number;
  startTime: string;
  endTime: string;
  duration: string;
  topics: string[];
  aiModel: string;
  satisfaction: number;
  learningValue: number;
  type: 'code-generation' | 'debugging' | 'architecture' | 'learning' | 'general';
}

interface LearningInsight {
  id: string;
  chatId: string;
  insight: string;
  category: 'pattern' | 'preference' | 'skill' | 'challenge';
  confidence: number;
  applied: boolean;
  timestamp: string;
}

export default function ChatsPage() {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [insights, setInsights] = useState<LearningInsight[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedChat, setSelectedChat] = useState<ChatSession | null>(null);

  useEffect(() => {
    loadChatHistory();
    loadLearningInsights();
    loadAnalytics();
  }, []);

  const loadChatHistory = async () => {
    try {
      const response = await fetch('/api/chats/history');
      const data = await response.json();
      if (data.success) {
        setChats(data.chats || []);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  };

  const loadLearningInsights = async () => {
    try {
      const response = await fetch('/api/chats/insights');
      const data = await response.json();
      if (data.success) {
        setInsights(data.insights || []);
      }
    } catch (error) {
      console.error('Failed to load learning insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const response = await fetch('/api/chats/analytics');
      const data = await response.json();
      if (data.success) {
        setAnalytics(data.analytics);
      }
    } catch (error) {
      console.error('Failed to load chat analytics:', error);
    }
  };

  const startNewChat = () => {
    // Redirect to chat interface
    window.location.href = '/chat';
  };

  const viewChatDetails = async (chat: ChatSession) => {
    setSelectedChat(chat);
    // Could load detailed chat messages here
  };

  const exportChatHistory = async () => {
    try {
      const response = await fetch('/api/chats/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'web-user',
          format: 'json'
        }),
      });

      const data = await response.json();
      if (data.success && data.downloadUrl) {
        window.open(data.downloadUrl, '_blank');
      }
    } catch (error) {
      console.error('Failed to export chat history:', error);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'code-generation': return <Code className="h-4 w-4" />;
      case 'debugging': return <AlertCircle className="h-4 w-4" />;
      case 'architecture': return <Settings className="h-4 w-4" />;
      case 'learning': return <Brain className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getInsightIcon = (category: string) => {
    switch (category) {
      case 'pattern': return <Target className="h-4 w-4" />;
      case 'preference': return <Settings className="h-4 w-4" />;
      case 'skill': return <TrendingUp className="h-4 w-4" />;
      case 'challenge': return <AlertCircle className="h-4 w-4" />;
      default: return <Lightbulb className="h-4 w-4" />;
    }
  };

  const filteredChats = chats.filter(chat => {
    const matchesSearch = !searchQuery || 
      chat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.topics.some(topic => topic.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = selectedType === 'all' || chat.type === selectedType;
    
    return matchesSearch && matchesType;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            💬 Chat History & Learning
          </h1>
          <p className="text-xl text-gray-600 mb-4">
            AI that learns from every conversation and gets smarter over time
          </p>
          <div className="flex items-center justify-center gap-4 mb-6">
            <Badge variant="secondary" className="text-lg px-4 py-2">
              🏆 KILLER FEATURE
            </Badge>
            <Badge variant="destructive" className="text-lg px-4 py-2">
              Conversational Learning AI!
            </Badge>
          </div>
          <div className="flex items-center justify-center gap-2 text-green-600">
            <MessageSquare className="h-5 w-5" />
            <span className="font-medium">Chat Learning Active</span>
          </div>
        </div>

        {/* Analytics Overview */}
        {analytics && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Chat Learning Analytics
              </CardTitle>
              <CardDescription>Conversational AI learning performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{analytics.totalChats || 0}</div>
                  <div className="text-sm text-gray-600">Total Conversations</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{analytics.learningRate || '96%'}</div>
                  <div className="text-sm text-gray-600">Learning Success Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{analytics.insightsGenerated || 0}</div>
                  <div className="text-sm text-gray-600">Insights Generated</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{analytics.avgSatisfaction || '4.7'}/5</div>
                  <div className="text-sm text-gray-600">Avg Satisfaction</div>
                </div>
              </div>
              
              <Separator className="my-6" />
              
              <div className="bg-gradient-to-r from-purple-100 to-blue-100 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">🚀 Learning Advantage</h4>
                <p className="text-gray-700 mb-3">AI learns from every conversation to provide increasingly personalized and accurate responses</p>
                <div className="flex flex-wrap gap-2">
                  {['Conversation Memory', 'Pattern Learning', 'Preference Adaptation', 'Smart Context'].map((feature, index) => (
                    <Badge key={index} variant="secondary">{feature}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <Button 
            onClick={startNewChat}
            size="lg"
            className="flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            Start New Chat
          </Button>
          
          <div className="flex gap-2">
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
            <Button variant="outline" size="lg">
              <Search className="h-4 w-4" />
            </Button>
          </div>
          
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="code-generation">Code Generation</SelectItem>
              <SelectItem value="debugging">Debugging</SelectItem>
              <SelectItem value="architecture">Architecture</SelectItem>
              <SelectItem value="learning">Learning</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            onClick={exportChatHistory}
            variant="outline"
            size="lg"
            className="ml-auto"
          >
            Export History
          </Button>
        </div>

        {/* Learning Insights */}
        {insights.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Recent Learning Insights
              </CardTitle>
              <CardDescription>What AI has learned from your conversations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insights.slice(0, 4).map((insight) => (
                  <div key={insight.id} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getInsightIcon(insight.category)}
                        <span className="font-medium capitalize">{insight.category}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {Math.round(insight.confidence * 100)}% confidence
                        </Badge>
                        {insight.applied && (
                          <Badge variant="default" className="text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Applied
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-700">{insight.insight}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Chat History */}
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
          ) : filteredChats.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <div className="text-gray-400 mb-4">
                <MessageSquare className="h-12 w-12 mx-auto mb-4" />
                <p className="text-lg">No conversations found</p>
                <p>Start your first chat to begin AI learning!</p>
              </div>
              <Button onClick={startNewChat} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Start First Chat
              </Button>
            </div>
          ) : (
            filteredChats.map((chat) => (
              <Card key={chat.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => viewChatDetails(chat)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {getTypeIcon(chat.type)}
                      {chat.title}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star 
                          key={i} 
                          className={`h-3 w-3 ${i < chat.satisfaction ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} 
                        />
                      ))}
                    </div>
                  </div>
                  <CardDescription className="text-sm line-clamp-2">{chat.summary}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Messages:</span>
                      <div className="flex items-center gap-1">
                        <MessageCircle className="h-4 w-4" />
                        <span>{chat.messageCount}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">AI Model:</span>
                      <Badge variant="outline">{chat.aiModel}</Badge>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Learning Value:</span>
                      <div className="flex items-center gap-1">
                        <Brain className="h-4 w-4 text-purple-500" />
                        <span>{Math.round(chat.learningValue * 100)}%</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-1 mt-2">
                      {chat.topics.slice(0, 3).map((topic, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {topic}
                        </Badge>
                      ))}
                      {chat.topics.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{chat.topics.length - 3} more
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-3">
                      <Clock className="h-3 w-3" />
                      {chat.startTime} • {chat.duration}
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/chats/${chat.id}`;
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Chat
                    </Button>
                    <Button variant="outline" size="sm">
                      <Bookmark className="h-4 w-4" />
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
              <Brain className="h-5 w-5" />
              Why Recoder's Chat Learning Dominates
            </CardTitle>
            <CardDescription>Features that make conversations increasingly valuable</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <History className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <h4 className="font-semibold text-gray-900">Conversation Memory</h4>
                <p className="text-sm text-gray-600 mt-1">AI remembers context across all conversations</p>
              </div>
              
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <TrendingUp className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <h4 className="font-semibold text-gray-900">Learning Evolution</h4>
                <p className="text-sm text-gray-600 mt-1">Responses get better with every interaction</p>
              </div>
              
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <Sparkles className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                <h4 className="font-semibold text-gray-900">Smart Insights</h4>
                <p className="text-sm text-gray-600 mt-1">AI generates actionable insights from patterns</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}