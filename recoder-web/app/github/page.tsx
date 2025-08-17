'use client';

/**
 * GitHub Integration Page - Clone and Import Projects
 * KILLER FEATURE: Direct GitHub repository cloning with AI analysis
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
  GitBranch, 
  Star, 
  GitFork, 
  Download, 
  Code, 
  Bot, 
  Zap, 
  Globe,
  Clock,
  CheckCircle,
  AlertCircle,
  Github,
  Search,
  Plus,
  Eye,
  Users
} from 'lucide-react';

interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string;
  url: string;
  stars: number;
  forks: number;
  language: string;
  lastUpdated: string;
  isPrivate: boolean;
  size: number;
}

interface CloneRequest {
  repoUrl: string;
  branch: string;
  projectName: string;
  description: string;
  analysisLevel: 'basic' | 'detailed' | 'comprehensive';
  aiEnhancement: boolean;
}

export default function GitHubPage() {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [cloning, setCloning] = useState<number | null>(null);
  const [showCloneForm, setShowCloneForm] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  
  const [cloneRequest, setCloneRequest] = useState<CloneRequest>({
    repoUrl: '',
    branch: 'main',
    projectName: '',
    description: '',
    analysisLevel: 'detailed',
    aiEnhancement: true
  });

  useEffect(() => {
    loadPopularRepos();
    loadAnalytics();
  }, []);

  const loadPopularRepos = async () => {
    try {
      const response = await fetch('/api/github/popular');
      const data = await response.json();
      if (data.success) {
        setRepos(data.repos || []);
      }
    } catch (error) {
      console.error('Failed to load popular repos:', error);
    }
  };

  const loadAnalytics = async () => {
    try {
      const response = await fetch('/api/github/analytics');
      const data = await response.json();
      if (data.success) {
        setAnalytics(data.analytics);
      }
    } catch (error) {
      console.error('Failed to load GitHub analytics:', error);
    }
  };

  const searchRepos = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/github/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      if (data.success) {
        setRepos(data.repos || []);
      }
    } catch (error) {
      console.error('Failed to search repos:', error);
    } finally {
      setLoading(false);
    }
  };

  const cloneRepository = async (repo: GitHubRepo) => {
    setCloning(repo.id);
    try {
      const response = await fetch('/api/github/clone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repoUrl: repo.url,
          repoName: repo.name,
          fullName: repo.fullName,
          language: repo.language,
          analysisLevel: 'detailed',
          aiEnhancement: true
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Redirect to project analysis page
        window.location.href = `/projects/${data.projectId}?cloned=true`;
      }
    } catch (error) {
      console.error('Failed to clone repository:', error);
    } finally {
      setCloning(null);
    }
  };

  const cloneCustomRepo = async () => {
    if (!cloneRequest.repoUrl.trim() || !cloneRequest.projectName.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/github/clone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...cloneRequest,
          userId: 'web-user',
          userName: 'Web User'
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Redirect to project analysis page
        window.location.href = `/projects/${data.projectId}?cloned=true`;
      }
    } catch (error) {
      console.error('Failed to clone custom repository:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            🔗 GitHub Integration & Cloning
          </h1>
          <p className="text-xl text-gray-600 mb-4">
            Clone any GitHub repository with AI-powered analysis and enhancement
          </p>
          <div className="flex items-center justify-center gap-4 mb-6">
            <Badge variant="secondary" className="text-lg px-4 py-2">
              🏆 KILLER FEATURE
            </Badge>
            <Badge variant="destructive" className="text-lg px-4 py-2">
              Direct GitHub Integration!
            </Badge>
          </div>
          <div className="flex items-center justify-center gap-2 text-green-600">
            <Github className="h-5 w-5" />
            <span className="font-medium">GitHub API Active</span>
          </div>
        </div>

        {/* Analytics Overview */}
        {analytics && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                GitHub Integration Analytics
              </CardTitle>
              <CardDescription>Real-time GitHub integration metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{analytics.totalClones || 0}</div>
                  <div className="text-sm text-gray-600">Total Clones</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{analytics.successRate || '98%'}</div>
                  <div className="text-sm text-gray-600">Success Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{analytics.aiEnhanced || 0}</div>
                  <div className="text-sm text-gray-600">AI Enhanced</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{analytics.avgAnalysisTime || '45s'}</div>
                  <div className="text-sm text-gray-600">Avg Analysis Time</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search & Clone Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* GitHub Search */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search GitHub Repositories
              </CardTitle>
              <CardDescription>Find and clone any public GitHub repository</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search repositories (e.g., facebook/react)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchRepos()}
                />
                <Button onClick={searchRepos} disabled={loading}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {['react', 'next.js', 'vue', 'angular', 'node.js', 'python'].map((tag) => (
                  <Button
                    key={tag}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery(tag);
                      searchRepos();
                    }}
                  >
                    {tag}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Custom Clone */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Clone Custom Repository
              </CardTitle>
              <CardDescription>Clone any repository with custom settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="repoUrl">Repository URL</Label>
                <Input
                  id="repoUrl"
                  placeholder="https://github.com/username/repository"
                  value={cloneRequest.repoUrl}
                  onChange={(e) => setCloneRequest({...cloneRequest, repoUrl: e.target.value})}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="branch">Branch</Label>
                  <Input
                    id="branch"
                    placeholder="main"
                    value={cloneRequest.branch}
                    onChange={(e) => setCloneRequest({...cloneRequest, branch: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="analysisLevel">Analysis Level</Label>
                  <Select 
                    value={cloneRequest.analysisLevel} 
                    onValueChange={(value) => setCloneRequest({...cloneRequest, analysisLevel: value as any})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="detailed">Detailed</SelectItem>
                      <SelectItem value="comprehensive">Comprehensive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <Button onClick={cloneCustomRepo} disabled={loading} className="w-full">
                {loading ? 'Cloning...' : 'Clone Repository'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Repository Results */}
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
          ) : repos.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <div className="text-gray-400 mb-4">
                <Github className="h-12 w-12 mx-auto mb-4" />
                <p className="text-lg">No repositories found</p>
                <p>Search for repositories or check popular ones!</p>
              </div>
            </div>
          ) : (
            repos.map((repo) => (
              <Card key={repo.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg truncate">{repo.name}</CardTitle>
                    {repo.isPrivate && (
                      <Badge variant="secondary" className="text-xs">
                        Private
                      </Badge>
                    )}
                  </div>
                  {repo.description && (
                    <CardDescription className="text-sm line-clamp-2">{repo.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Language:</span>
                      <Badge variant="outline">{repo.language || 'Unknown'}</Badge>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Stars:</span>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-yellow-500" />
                        <span>{repo.stars}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Forks:</span>
                      <div className="flex items-center gap-1">
                        <GitFork className="h-4 w-4" />
                        <span>{repo.forks}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      Updated {repo.lastUpdated}
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => cloneRepository(repo)}
                      size="sm" 
                      className="flex-1"
                      disabled={cloning === repo.id}
                    >
                      {cloning === repo.id ? (
                        <>
                          <Download className="h-4 w-4 mr-1 animate-spin" />
                          Cloning...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-1" />
                          Clone & Analyze
                        </>
                      )}
                    </Button>
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4" />
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
              Why Recoder's GitHub Integration Dominates
            </CardTitle>
            <CardDescription>Features that make other tools jealous</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <Bot className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <h4 className="font-semibold text-gray-900">AI Code Analysis</h4>
                <p className="text-sm text-gray-600 mt-1">Understand any codebase instantly with AI</p>
              </div>
              
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <Code className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <h4 className="font-semibold text-gray-900">Smart Enhancement</h4>
                <p className="text-sm text-gray-600 mt-1">Automatically improve cloned code</p>
              </div>
              
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <Zap className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                <h4 className="font-semibold text-gray-900">Instant Setup</h4>
                <p className="text-sm text-gray-600 mt-1">Clone to production-ready in seconds</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}