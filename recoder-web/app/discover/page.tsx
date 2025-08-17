'use client';

/**
 * Discover Page - Social Exploration for Limited Users
 * KILLER FEATURE: Keep users engaged when they hit usage limits
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SocialFeed from '@/components/social-feed';
import { 
  TrendingUp, 
  Star, 
  Flame, 
  Users, 
  Zap, 
  Crown, 
  Trophy, 
  Sparkles, 
  Heart, 
  Eye, 
  MessageCircle, 
  Share2, 
  Bookmark, 
  Search, 
  Filter, 
  Clock, 
  Bot, 
  Code, 
  Rocket, 
  Activity, 
  Award, 
  Target,
  GitBranch,
  Play,
  ThumbsUp,
  Globe,
  Calendar,
  ChevronRight,
  ArrowRight
} from 'lucide-react';

export default function DiscoverPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [activeTab, setActiveTab] = useState('trending');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            🌟 Discover Amazing AI Creations
          </h1>
          <p className="text-xl text-gray-600 mb-4">
            Explore trending models, innovative projects, and amazing community creations
          </p>
          <div className="flex items-center justify-center gap-4 mb-6">
            <Badge variant="secondary" className="text-lg px-4 py-2">
              🎯 Always Free to Explore
            </Badge>
            <Badge variant="destructive" className="text-lg px-4 py-2">
              No Usage Limits!
            </Badge>
          </div>
          <div className="flex items-center justify-center gap-2 text-green-600">
            <Globe className="h-5 w-5" />
            <span className="font-medium">Community-Powered Discovery</span>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex gap-2 flex-1">
            <Input
              placeholder="Search models, projects, creators..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline">
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="text-center">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600">15.2K</div>
              <div className="text-sm text-gray-600">AI Models</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">8.9K</div>
              <div className="text-sm text-gray-600">Projects</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-purple-600">45K</div>
              <div className="text-sm text-gray-600">Creators</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-orange-600">892K</div>
              <div className="text-sm text-gray-600">Interactions</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="trending" className="flex items-center gap-2">
              <Flame className="h-4 w-4" />
              Trending
            </TabsTrigger>
            <TabsTrigger value="models" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              AI Models
            </TabsTrigger>
            <TabsTrigger value="projects" className="flex items-center gap-2">
              <Code className="h-4 w-4" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="creators" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Creators
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trending" className="mt-8">
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Main Feed */}
              <div className="lg:col-span-2">
                <SocialFeed type="trending" showHeader={false} maxItems={6} />
              </div>
              
              {/* Trending Sidebar */}
              <div className="space-y-6">
                {/* Trending Models */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <TrendingUp className="h-5 w-5" />
                      🔥 Trending Models
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[
                        { name: "Claude Sonnet 4", provider: "Anthropic", trend: "+45%" },
                        { name: "Gemini 2.5 Flash", provider: "Google", trend: "+32%" },
                        { name: "DeepSeek V3", provider: "DeepSeek", trend: "+28%" },
                        { name: "Qwen3 Coder", provider: "Qwen", trend: "+15%" }
                      ].map((model, index) => (
                        <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded cursor-pointer">
                          <div>
                            <div className="font-medium text-sm">{model.name}</div>
                            <div className="text-xs text-gray-500">{model.provider}</div>
                          </div>
                          <Badge variant="secondary" className="text-green-600">
                            {model.trend}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Top Creators */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Crown className="h-5 w-5" />
                      👑 Top Creators
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[
                        { name: "AIExplorer", projects: 156, followers: "23.4K" },
                        { name: "CodeMaster", projects: 134, followers: "19.8K" },
                        { name: "DevGuru", projects: 98, followers: "15.2K" }
                      ].map((creator, index) => (
                        <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded cursor-pointer">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                              {creator.name[0]}
                            </div>
                            <div>
                              <div className="font-medium text-sm">{creator.name}</div>
                              <div className="text-xs text-gray-500">{creator.projects} projects</div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-600">{creator.followers}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="models" className="mt-8">
            {/* AI Models Marketplace */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { rank: 1, name: "Claude Sonnet 4", provider: "Anthropic", tokens: "2.33T", rating: 4.9, reviews: 892, usage: "50%" },
                { rank: 2, name: "Gemini 2.5 Flash", provider: "Google", tokens: "1.23T", rating: 4.8, reviews: 654, usage: "121%" },
                { rank: 3, name: "Gemini 2.0 Flash", provider: "Google", tokens: "1.14T", rating: 4.7, reviews: 567, usage: "4%" },
                { rank: 4, name: "DeepSeek V3 (free)", provider: "DeepSeek", tokens: "819B", rating: 4.6, reviews: 445, usage: "19%" },
                { rank: 5, name: "DeepSeek V3", provider: "DeepSeek", tokens: "711B", rating: 4.5, reviews: 398, usage: "22%" },
                { rank: 6, name: "Gemini 2.5 Pro", provider: "Google", tokens: "683B", rating: 4.7, reviews: 523, usage: "24%" }
              ].map((model) => (
                <Card key={model.rank} className="hover:shadow-lg transition-all cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <Badge variant="secondary">#{model.rank}</Badge>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-yellow-500 fill-current" />
                        <span className="text-sm font-medium">{model.rating}</span>
                        <span className="text-xs text-gray-500">({model.reviews})</span>
                      </div>
                    </div>
                    
                    <h3 className="font-semibold text-lg mb-1">{model.name}</h3>
                    <p className="text-sm text-gray-600 mb-3">by {model.provider}</p>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span>Tokens:</span>
                        <span className="font-medium">{model.tokens}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Usage:</span>
                        <Badge variant="outline">{model.usage}</Badge>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1">
                        <Eye className="h-4 w-4 mr-1" />
                        Details
                      </Button>
                      <Button size="sm" className="flex-1">
                        <Play className="h-4 w-4 mr-1" />
                        Try
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="projects" className="mt-8">
            {/* Community Projects */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  title: "AI-Powered E-commerce Platform",
                  author: "DevMaster",
                  description: "Complete e-commerce solution with AI recommendations and smart inventory management",
                  tech: ["Next.js", "AI", "Stripe", "PostgreSQL"],
                  stats: { likes: 1247, forks: 89, views: 12400 },
                  image: "🛒",
                  featured: true
                },
                {
                  title: "Blockchain Voting System",
                  author: "CryptoBuilder",
                  description: "Decentralized voting platform with smart contracts and real-time results",
                  tech: ["Solana", "React", "Web3", "Rust"],
                  stats: { likes: 892, forks: 67, views: 8900 },
                  image: "🗳️",
                  featured: false
                },
                {
                  title: "Real-time AI Chat Assistant",
                  author: "ChatGuru",
                  description: "Intelligent chat system with context awareness and multi-language support",
                  tech: ["Socket.io", "AI", "Node.js", "MongoDB"],
                  stats: { likes: 654, forks: 45, views: 7800 },
                  image: "💬",
                  featured: true
                },
                {
                  title: "Smart Code Analyzer",
                  author: "CodeNinja",
                  description: "AI-powered code review tool that finds bugs and suggests improvements",
                  tech: ["Python", "AI", "AST", "FastAPI"],
                  stats: { likes: 567, forks: 78, views: 6500 },
                  image: "🔍",
                  featured: false
                },
                {
                  title: "Automated Trading Bot",
                  author: "FinTechPro",
                  description: "ML-powered trading algorithm with risk management and portfolio optimization",
                  tech: ["Python", "ML", "APIs", "Docker"],
                  stats: { likes: 445, forks: 23, views: 5600 },
                  image: "📈",
                  featured: true
                },
                {
                  title: "Voice-Controlled Smart Home",
                  author: "IoTMaster",
                  description: "Complete smart home automation with voice commands and AI optimization",
                  tech: ["Raspberry Pi", "IoT", "Voice AI", "Python"],
                  stats: { likes: 389, forks: 34, views: 4200 },
                  image: "🏠",
                  featured: false
                }
              ].map((project, index) => (
                <Card key={index} className="hover:shadow-lg transition-all cursor-pointer">
                  <CardContent className="p-6">
                    <div className="text-center mb-4">
                      <div className="text-4xl mb-2">{project.image}</div>
                      <h3 className="font-semibold text-lg mb-1">{project.title}</h3>
                      <p className="text-sm text-gray-600">by {project.author}</p>
                      {project.featured && (
                        <Badge variant="secondary" className="mt-2 text-xs">
                          <Star className="h-3 w-3 mr-1" />
                          Featured
                        </Badge>
                      )}
                    </div>
                    
                    <p className="text-sm text-gray-700 mb-4 line-clamp-2">{project.description}</p>
                    
                    <div className="flex flex-wrap gap-1 mb-4">
                      {project.tech.slice(0, 3).map((tech, techIndex) => (
                        <Badge key={techIndex} variant="outline" className="text-xs">{tech}</Badge>
                      ))}
                      {project.tech.length > 3 && (
                        <Badge variant="outline" className="text-xs">+{project.tech.length - 3}</Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Heart className="h-4 w-4" />
                          {project.stats.likes}
                        </span>
                        <span className="flex items-center gap-1">
                          <GitBranch className="h-4 w-4" />
                          {project.stats.forks}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="h-4 w-4" />
                          {project.stats.views.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1">
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button size="sm" className="flex-1">
                        <GitBranch className="h-4 w-4 mr-1" />
                        Fork
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="creators" className="mt-8">
            {/* Top Creators */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  name: "AIExplorer",
                  avatar: "AE",
                  verified: true,
                  followers: "23.4K",
                  projects: 156,
                  totalLikes: "45.2K",
                  specialty: "AI Models & Research",
                  badges: ["Top Creator", "AI Expert", "Community Leader"]
                },
                {
                  name: "CodeMaster",
                  avatar: "CM",
                  verified: true,
                  followers: "19.8K",
                  projects: 134,
                  totalLikes: "38.9K",
                  specialty: "Full-Stack Development",
                  badges: ["Code Wizard", "Project Master"]
                },
                {
                  name: "DevGuru",
                  avatar: "DG",
                  verified: false,
                  followers: "15.2K",
                  projects: 98,
                  totalLikes: "29.1K",
                  specialty: "Blockchain & Web3",
                  badges: ["Blockchain Expert", "Rising Star"]
                },
                {
                  name: "MLEngineer",
                  avatar: "ME",
                  verified: true,
                  followers: "12.7K",
                  projects: 87,
                  totalLikes: "22.8K",
                  specialty: "Machine Learning",
                  badges: ["ML Expert", "Data Scientist"]
                },
                {
                  name: "UIUXMaster",
                  avatar: "UM",
                  verified: false,
                  followers: "10.3K",
                  projects: 76,
                  totalLikes: "18.5K",
                  specialty: "Design & Frontend",
                  badges: ["Design Pro", "UX Expert"]
                },
                {
                  name: "SecurityPro",
                  avatar: "SP",
                  verified: true,
                  followers: "8.9K",
                  projects: 65,
                  totalLikes: "15.2K",
                  specialty: "Security & DevOps",
                  badges: ["Security Expert", "DevOps Master"]
                }
              ].map((creator, index) => (
                <Card key={index} className="hover:shadow-lg transition-all cursor-pointer">
                  <CardContent className="p-6">
                    <div className="text-center mb-4">
                      <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xl font-bold mx-auto mb-3">
                        {creator.avatar}
                      </div>
                      <h3 className="font-semibold text-lg mb-1 flex items-center justify-center gap-2">
                        {creator.name}
                        {creator.verified && <Badge variant="secondary" className="text-xs">✓</Badge>}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">{creator.specialty}</p>
                      <div className="flex flex-wrap justify-center gap-1 mb-3">
                        {creator.badges.map((badge, badgeIndex) => (
                          <Badge key={badgeIndex} variant="outline" className="text-xs">{badge}</Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-center mb-4">
                      <div>
                        <div className="text-lg font-bold text-blue-600">{creator.followers}</div>
                        <div className="text-xs text-gray-600">Followers</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-green-600">{creator.projects}</div>
                        <div className="text-xs text-gray-600">Projects</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-purple-600">{creator.totalLikes}</div>
                        <div className="text-xs text-gray-600">Total Likes</div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1">
                        <Eye className="h-4 w-4 mr-1" />
                        Profile
                      </Button>
                      <Button size="sm" className="flex-1">
                        <Users className="h-4 w-4 mr-1" />
                        Follow
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Call to Action for Limited Users */}
        <Card className="mt-12 bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200">
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              🚀 Ready to Create Your Own?
            </h2>
            <p className="text-gray-700 mb-6 max-w-2xl mx-auto">
              Inspired by what you've seen? Join thousands of creators building amazing AI-powered projects. 
              Start with our free tier and upgrade when you're ready to unlock unlimited potential.
            </p>
            <div className="flex flex-wrap justify-center gap-4 mb-6">
              <Button size="lg" className="bg-gradient-to-r from-blue-500 to-purple-500">
                <Rocket className="h-5 w-5 mr-2" />
                Start Creating
              </Button>
              <Button size="lg" variant="outline">
                <Users className="h-5 w-5 mr-2" />
                Join Community
              </Button>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {['Free Forever', 'Instant Setup', 'Community Support', 'No Credit Card'].map((feature, index) => (
                <Badge key={index} variant="secondary" className="px-3 py-1">
                  {feature}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}