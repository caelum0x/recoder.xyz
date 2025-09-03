'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { 
  Calendar,
  Clock,
  Send,
  Wand2,
  Twitter,
  Linkedin,
  Facebook,
  Image,
  BarChart3,
  Users,
  Eye,
  Heart,
  MessageCircle,
  Repeat2,
  CheckCircle,
  AlertCircle,
  Link2,
  Trash2,
  RefreshCw,
  Zap,
  Target,
  TrendingUp
} from 'lucide-react';

interface SocialAccount {
  provider: string;
  user_id: string;
  username?: string;
  display_name: string;
  profile_image?: string;
  followers_count?: number;
  connected: boolean;
  pages?: any[];
}

interface ScheduledPost {
  id: string;
  content: string;
  platform: string;
  scheduled_time: string;
  status: 'scheduled' | 'published' | 'failed';
  media_urls?: string[];
  hashtags?: string[];
  post_url?: string;
}

export function SocialScheduler() {
  const [activeTab, setActiveTab] = useState('compose');
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  
  // Compose form state
  const [postContent, setPostContent] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [scheduledTime, setScheduledTime] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>(['']);
  const [hashtags, setHashtags] = useState<string[]>(['']);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // AI generation state
  const [aiTopic, setAiTopic] = useState('');
  const [aiTone, setAiTone] = useState('professional');
  const [aiPlatform, setAiPlatform] = useState('twitter');
  const [targetAudience, setTargetAudience] = useState('');
  
  const platforms = [
    { id: 'twitter', name: 'Twitter/X', icon: Twitter, color: 'text-blue-500' },
    { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: 'text-blue-700' },
    { id: 'facebook', name: 'Facebook', icon: Facebook, color: 'text-blue-600' }
  ];

  useEffect(() => {
    loadAccounts();
    loadScheduledPosts();
  }, []);

  const loadAccounts = async () => {
    // Load connected social media accounts
    try {
      const responses = await Promise.all(
        platforms.map(platform =>
          fetch(`/api/auth/social?provider=${platform.id}&action=status`)
            .then(res => res.json())
            .catch(err => ({ provider: platform.id, connected: false, error: err.message }))
        )
      );
      
      setAccounts(responses);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const loadScheduledPosts = async () => {
    try {
      const response = await fetch('/api/social/scheduler?action=scheduled_posts');
      if (response.ok) {
        const data = await response.json();
        setScheduledPosts(data.posts || []);
      }
    } catch (error) {
      console.error('Failed to load scheduled posts:', error);
    }
  };

  const connectAccount = async (provider: string) => {
    try {
      const response = await fetch(`/api/auth/social?provider=${provider}&action=initiate`);
      const data = await response.json();
      
      if (data.success) {
        // Open OAuth popup
        const popup = window.open(
          data.auth_url,
          `${provider}_auth`,
          'width=600,height=600,scrollbars=yes,resizable=yes'
        );
        
        // Listen for popup closure
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            loadAccounts(); // Refresh accounts after OAuth
          }
        }, 1000);
      }
    } catch (error) {
      console.error(`Failed to connect ${provider}:`, error);
      alert(`Failed to connect ${provider} account`);
    }
  };

  const generateContent = async () => {
    if (!aiTopic.trim()) {
      alert('Please enter a topic for AI content generation');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/social/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_content',
          topic: aiTopic,
          platform: aiPlatform,
          tone: aiTone,
          target_audience: targetAudience,
          include_hashtags: true,
          max_length: aiPlatform === 'twitter' ? 280 : 500
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPostContent(data.generated_content.content);
          setHashtags(data.generated_content.hashtags || ['']);
          setActiveTab('compose'); // Switch to compose tab
        }
      } else {
        throw new Error('Content generation failed');
      }
    } catch (error) {
      console.error('Content generation error:', error);
      alert('Failed to generate content. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const schedulePost = async () => {
    if (!postContent.trim() || selectedPlatforms.length === 0) {
      alert('Please enter content and select at least one platform');
      return;
    }

    if (!scheduledTime) {
      alert('Please select a scheduled time');
      return;
    }

    setIsScheduling(true);
    try {
      const results = await Promise.all(
        selectedPlatforms.map(platform =>
          fetch('/api/social/scheduler', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'schedule_post',
              platform,
              content: postContent,
              scheduled_time: scheduledTime,
              media_urls: mediaUrls.filter(url => url.trim()),
              hashtags: hashtags.filter(tag => tag.trim()),
              user_tokens: getUserTokens(platform) // Get stored OAuth tokens
            })
          }).then(res => res.json())
        )
      );

      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;

      if (successful > 0) {
        alert(`Successfully scheduled ${successful} post(s)${failed > 0 ? `, ${failed} failed` : ''}`);
        resetForm();
        loadScheduledPosts();
      } else {
        alert('All posts failed to schedule');
      }
    } catch (error) {
      console.error('Scheduling error:', error);
      alert('Failed to schedule posts');
    } finally {
      setIsScheduling(false);
    }
  };

  const postNow = async () => {
    if (!postContent.trim() || selectedPlatforms.length === 0) {
      alert('Please enter content and select at least one platform');
      return;
    }

    setIsScheduling(true);
    try {
      const results = await Promise.all(
        selectedPlatforms.map(platform =>
          fetch('/api/social/scheduler', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'post_now',
              platform,
              content: postContent,
              media_urls: mediaUrls.filter(url => url.trim()),
              hashtags: hashtags.filter(tag => tag.trim()),
              user_tokens: getUserTokens(platform)
            })
          }).then(res => res.json())
        )
      );

      const successful = results.filter(r => r.success);
      const failed = results.length - successful.length;

      if (successful.length > 0) {
        alert(`Successfully posted to ${successful.length} platform(s)${failed > 0 ? `, ${failed} failed` : ''}`);
        resetForm();
        
        // Show post URLs
        successful.forEach(result => {
          if (result.post_url) {
            console.log(`Posted to ${result.platform}: ${result.post_url}`);
          }
        });
      } else {
        alert('All posts failed');
      }
    } catch (error) {
      console.error('Posting error:', error);
      alert('Failed to post');
    } finally {
      setIsScheduling(false);
    }
  };

  const getUserTokens = (platform: string) => {
    // In production, these would be securely stored and retrieved
    const account = accounts.find(acc => acc.provider === platform && acc.connected);
    if (!account) return null;
    
    // Return mock tokens - in production these would be encrypted and stored securely
    return {
      [platform]: {
        access_token: 'stored_access_token',
        access_token_secret: platform === 'twitter' ? 'stored_secret' : undefined,
        page_id: platform === 'facebook' ? 'page_id' : undefined
      }
    };
  };

  const resetForm = () => {
    setPostContent('');
    setSelectedPlatforms([]);
    setScheduledTime('');
    setMediaUrls(['']);
    setHashtags(['']);
  };

  const togglePlatform = (platformId: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(platformId)
        ? prev.filter(id => id !== platformId)
        : [...prev, platformId]
    );
  };

  const addMediaUrl = () => {
    setMediaUrls(prev => [...prev, '']);
  };

  const updateMediaUrl = (index: number, url: string) => {
    setMediaUrls(prev => prev.map((u, i) => i === index ? url : u));
  };

  const removeMediaUrl = (index: number) => {
    if (mediaUrls.length > 1) {
      setMediaUrls(prev => prev.filter((_, i) => i !== index));
    }
  };

  const addHashtag = () => {
    setHashtags(prev => [...prev, '']);
  };

  const updateHashtag = (index: number, tag: string) => {
    const cleanTag = tag.replace(/[^a-zA-Z0-9_]/g, '');
    setHashtags(prev => prev.map((t, i) => i === index ? cleanTag : t));
  };

  const removeHashtag = (index: number) => {
    if (hashtags.length > 1) {
      setHashtags(prev => prev.filter((_, i) => i !== index));
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'published': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'scheduled': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPlatformIcon = (platform: string) => {
    const platformData = platforms.find(p => p.id === platform);
    if (!platformData) return null;
    const IconComponent = platformData.icon;
    return <IconComponent className={`h-4 w-4 ${platformData.color}`} />;
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Social Media Scheduler</h1>
        <p className="text-gray-600">Schedule and publish content across multiple social media platforms with AI assistance</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="compose">
            <Send className="h-4 w-4 mr-2" />
            Compose
          </TabsTrigger>
          <TabsTrigger value="ai-generate">
            <Wand2 className="h-4 w-4 mr-2" />
            AI Generate
          </TabsTrigger>
          <TabsTrigger value="scheduled">
            <Calendar className="h-4 w-4 mr-2" />
            Scheduled
          </TabsTrigger>
          <TabsTrigger value="accounts">
            <Link2 className="h-4 w-4 mr-2" />
            Accounts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Create Post</h3>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="content">Post Content</Label>
                    <Textarea
                      id="content"
                      value={postContent}
                      onChange={(e) => setPostContent(e.target.value)}
                      placeholder="What's happening? Share your thoughts..."
                      rows={6}
                      className="resize-none"
                    />
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm text-gray-500">
                        {postContent.length} characters
                      </span>
                      {selectedPlatforms.includes('twitter') && postContent.length > 280 && (
                        <Badge variant="destructive" className="text-xs">
                          Twitter limit exceeded
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label>Platforms</Label>
                    <div className="grid grid-cols-3 gap-3 mt-2">
                      {platforms.map(platform => {
                        const account = accounts.find(acc => acc.provider === platform.id);
                        const isConnected = account?.connected || false;
                        const isSelected = selectedPlatforms.includes(platform.id);
                        const IconComponent = platform.icon;
                        
                        return (
                          <Button
                            key={platform.id}
                            variant={isSelected ? "default" : "outline"}
                            disabled={!isConnected}
                            onClick={() => togglePlatform(platform.id)}
                            className="justify-start"
                          >
                            <IconComponent className={`h-4 w-4 mr-2 ${platform.color}`} />
                            {platform.name}
                            {!isConnected && <Badge variant="secondary" className="ml-2 text-xs">Disconnected</Badge>}
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="scheduled_time">Schedule Time (optional)</Label>
                    <Input
                      id="scheduled_time"
                      type="datetime-local"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                    />
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Media & Hashtags</h3>
                
                <div className="space-y-4">
                  <div>
                    <Label>Media URLs</Label>
                    {mediaUrls.map((url, index) => (
                      <div key={index} className="flex gap-2 mt-2">
                        <Input
                          value={url}
                          onChange={(e) => updateMediaUrl(index, e.target.value)}
                          placeholder="https://example.com/image.jpg"
                          className="flex-1"
                        />
                        {mediaUrls.length > 1 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeMediaUrl(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addMediaUrl}
                      className="mt-2"
                    >
                      <Image className="h-3 w-3 mr-1" />
                      Add Media
                    </Button>
                  </div>

                  <div>
                    <Label>Hashtags</Label>
                    {hashtags.map((tag, index) => (
                      <div key={index} className="flex gap-2 mt-2">
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">#</span>
                          <Input
                            value={tag}
                            onChange={(e) => updateHashtag(index, e.target.value)}
                            placeholder="hashtag"
                            className="pl-6"
                          />
                        </div>
                        {hashtags.length > 1 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeHashtag(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addHashtag}
                      className="mt-2"
                    >
                      Add Hashtag
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Actions</h3>
                <div className="space-y-3">
                  <Button
                    onClick={postNow}
                    disabled={isScheduling || !postContent.trim() || selectedPlatforms.length === 0}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    {isScheduling ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Posting...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Post Now
                      </>
                    )}
                  </Button>
                  
                  <Button
                    onClick={schedulePost}
                    disabled={isScheduling || !postContent.trim() || selectedPlatforms.length === 0 || !scheduledTime}
                    variant="outline"
                    className="w-full"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Schedule Post
                  </Button>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab('ai-generate')}
                    className="w-full justify-start"
                  >
                    <Wand2 className="h-3 w-3 mr-2" />
                    AI Generate Content
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetForm}
                    className="w-full justify-start"
                  >
                    <RefreshCw className="h-3 w-3 mr-2" />
                    Clear Form
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ai-generate" className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="h-5 w-5 text-yellow-500" />
              <h3 className="text-lg font-semibold">AI Content Generator</h3>
              <Badge variant="secondary" className="bg-green-50 text-green-700">Together AI</Badge>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="ai_topic">Topic / Product / Service</Label>
                  <Input
                    id="ai_topic"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    placeholder="e.g., New AI automation tool for developers"
                  />
                </div>

                <div>
                  <Label htmlFor="ai_platform">Primary Platform</Label>
                  <Select value={aiPlatform} onValueChange={setAiPlatform}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="twitter">Twitter/X (280 chars)</SelectItem>
                      <SelectItem value="linkedin">LinkedIn (longer form)</SelectItem>
                      <SelectItem value="facebook">Facebook (engaging)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="ai_tone">Tone</Label>
                  <Select value={aiTone} onValueChange={setAiTone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="casual">Casual & Friendly</SelectItem>
                      <SelectItem value="urgent">Urgent & Action-oriented</SelectItem>
                      <SelectItem value="educational">Educational</SelectItem>
                      <SelectItem value="humorous">Light & Humorous</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="target_audience">Target Audience</Label>
                  <Input
                    id="target_audience"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="e.g., Software developers, Small business owners"
                  />
                </div>
              </div>

              <div className="flex flex-col justify-center">
                <Button
                  onClick={generateContent}
                  disabled={isGenerating || !aiTopic.trim()}
                  className="bg-blue-600 hover:bg-blue-700"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Generating with AI...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-2" />
                      Generate Content
                    </>
                  )}
                </Button>

                <div className="mt-4 text-center">
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                    <Target className="h-3 w-3" />
                    Platform-optimized content
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mt-1">
                    <TrendingUp className="h-3 w-3" />
                    Engagement-focused
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="scheduled" className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Scheduled Posts</h3>
              <Button variant="outline" size="sm" onClick={loadScheduledPosts}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            </div>
            
            {scheduledPosts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No scheduled posts yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scheduledPosts.map(post => (
                  <div key={post.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getPlatformIcon(post.platform)}
                          <span className="font-medium capitalize">{post.platform}</span>
                          {getStatusIcon(post.status)}
                          <Badge variant="secondary" className="text-xs capitalize">
                            {post.status}
                          </Badge>
                        </div>
                        <p className="text-gray-700 mb-2">{post.content}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(post.scheduled_time).toLocaleDateString()} at {new Date(post.scheduled_time).toLocaleTimeString()}
                          </div>
                          {post.hashtags && post.hashtags.length > 0 && (
                            <div className="flex items-center gap-1">
                              <span>#</span>
                              {post.hashtags.slice(0, 3).join(', ')}
                            </div>
                          )}
                        </div>
                        {post.post_url && (
                          <a
                            href={post.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-sm mt-2 inline-block"
                          >
                            View Post →
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="accounts" className="space-y-6">
          <div className="grid gap-6">
            {platforms.map(platform => {
              const account = accounts.find(acc => acc.provider === platform.id);
              const isConnected = account?.connected || false;
              const IconComponent = platform.icon;
              
              return (
                <Card key={platform.id} className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <IconComponent className={`h-6 w-6 ${platform.color}`} />
                      <div>
                        <h3 className="font-medium">{platform.name}</h3>
                        {isConnected && account ? (
                          <div className="text-sm text-gray-500">
                            Connected as {account.display_name || account.username}
                            {account.followers_count && (
                              <span className="ml-2">• {account.followers_count.toLocaleString()} followers</span>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">Not connected</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {isConnected ? (
                        <Badge className="bg-green-50 text-green-700">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Connected
                        </Badge>
                      ) : (
                        <Button onClick={() => connectAccount(platform.id)}>
                          <Link2 className="h-4 w-4 mr-2" />
                          Connect
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}