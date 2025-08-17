'use client';

/**
 * Projects Management Page - Complete Project Lifecycle Management
 * KILLER FEATURE: AI-powered project creation, monitoring, and optimization
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
  FolderOpen, 
  Code2, 
  Rocket, 
  TrendingUp, 
  Users, 
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
  FileText,
  Sparkles,
  ArrowRight,
  Activity,
  Globe,
  Database,
  Cpu,
  Shield,
  Layers,
  Box,
  Terminal,
  GitBranch,
  Play,
  Pause,
  StopCircle,
  Archive,
  Download,
  Upload,
  Copy,
  ExternalLink,
  Calendar,
  Target,
  Lightbulb,
  Wrench,
  Heart
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string;
  type: 'web' | 'mobile' | 'ai' | 'blockchain' | 'fullstack' | 'microservice';
  status: 'planning' | 'development' | 'testing' | 'deployed' | 'maintenance' | 'archived';
  technology: string[];
  progress: number;
  createdAt: string;
  updatedAt: string;
  repository?: string;
  deploymentUrl?: string;
  aiGenerated: boolean;
  healthScore: number;
  team: string[];
  budget?: number;
  timeline: string;
  complexity: 'simple' | 'medium' | 'complex' | 'enterprise';
}

interface ProjectAnalytics {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  avgProgress: number;
  aiGeneratedPercentage: number;
  healthScoreAvg: number;
  upcomingDeadlines: number;
  techStackDistribution: Record<string, number>;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  useEffect(() => {
    loadProjects();
    loadAnalytics();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      if (data.success) {
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadAnalytics = async () => {
    try {
      const response = await fetch('/api/projects/analytics');
      const data = await response.json();
      if (data.success) {
        setAnalytics(data.analytics);
      }
    } catch (error) {
      console.error('Failed to load project analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const createProject = async (projectData: any) => {
    try {
      const response = await fetch('/api/projects/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(projectData),
      });

      const data = await response.json();
      if (data.success) {
        setProjects([data.project, ...projects]);
        setShowCreateModal(false);
      }
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const deployProject = async (projectId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json();
      if (data.success) {
        // Update project status
        setProjects(projects.map(p => 
          p.id === projectId 
            ? { ...p, status: 'deployed' as const, deploymentUrl: data.deploymentUrl }
            : p
        ));
      }
    } catch (error) {
      console.error('Failed to deploy project:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'planning': return <Lightbulb className="h-4 w-4" />;
      case 'development': return <Code2 className="h-4 w-4" />;
      case 'testing': return <Shield className="h-4 w-4" />;
      case 'deployed': return <Rocket className="h-4 w-4" />;
      case 'maintenance': return <Wrench className="h-4 w-4" />;
      case 'archived': return <Archive className="h-4 w-4" />;
      default: return <FolderOpen className="h-4 w-4" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'web': return <Globe className="h-4 w-4" />;
      case 'mobile': return <Cpu className="h-4 w-4" />;
      case 'ai': return <Sparkles className="h-4 w-4" />;
      case 'blockchain': return <Box className="h-4 w-4" />;
      case 'fullstack': return <Layers className="h-4 w-4" />;
      case 'microservice': return <Activity className="h-4 w-4" />;
      default: return <Code2 className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planning': return 'bg-blue-100 text-blue-800';
      case 'development': return 'bg-yellow-100 text-yellow-800';
      case 'testing': return 'bg-purple-100 text-purple-800';
      case 'deployed': return 'bg-green-100 text-green-800';
      case 'maintenance': return 'bg-orange-100 text-orange-800';
      case 'archived': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const filteredProjects = projects.filter(project => {
    const matchesSearch = !searchQuery || 
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.technology.some(tech => tech.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = selectedType === 'all' || project.type === selectedType;
    const matchesStatus = selectedStatus === 'all' || project.status === selectedStatus;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            🚀 Project Management Hub
          </h1>
          <p className="text-xl text-gray-600 mb-4">
            AI-powered project creation, monitoring, and optimization
          </p>
          <div className="flex items-center justify-center gap-4 mb-6">
            <Badge variant="secondary" className="text-lg px-4 py-2">
              🏆 KILLER FEATURE
            </Badge>
            <Badge variant="destructive" className="text-lg px-4 py-2">
              Complete Project Lifecycle!
            </Badge>
          </div>
          <div className="flex items-center justify-center gap-2 text-green-600">
            <Activity className="h-5 w-5" />
            <span className="font-medium">AI Project Intelligence Active</span>
          </div>
        </div>

        {/* Analytics Overview */}
        {analytics && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Project Portfolio Analytics
              </CardTitle>
              <CardDescription>Comprehensive project management insights and performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{analytics.totalProjects}</div>
                  <div className="text-sm text-gray-600">Total Projects</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{analytics.activeProjects}</div>
                  <div className="text-sm text-gray-600">Active Projects</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{Math.round(analytics.avgProgress)}%</div>
                  <div className="text-sm text-gray-600">Avg Progress</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{Math.round(analytics.healthScoreAvg)}/100</div>
                  <div className="text-sm text-gray-600">Health Score</div>
                </div>
              </div>
              
              <Separator className="my-6" />
              
              <div className="bg-gradient-to-r from-blue-100 to-purple-100 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">🚀 Project Management Advantage</h4>
                <p className="text-gray-700 mb-3">AI-powered project lifecycle management with real-time optimization and predictive insights</p>
                <div className="flex flex-wrap gap-2">
                  {['AI Project Generation', 'Real-time Health Monitoring', 'Predictive Analytics', 'Auto-deployment'].map((feature, index) => (
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
            onClick={() => setShowCreateModal(true)}
            size="lg"
            className="flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            Create New Project
          </Button>
          
          <div className="flex gap-2">
            <Input
              placeholder="Search projects..."
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
              <SelectItem value="web">Web App</SelectItem>
              <SelectItem value="mobile">Mobile App</SelectItem>
              <SelectItem value="ai">AI Project</SelectItem>
              <SelectItem value="blockchain">Blockchain</SelectItem>
              <SelectItem value="fullstack">Full Stack</SelectItem>
              <SelectItem value="microservice">Microservice</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="development">Development</SelectItem>
              <SelectItem value="testing">Testing</SelectItem>
              <SelectItem value="deployed">Deployed</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Projects Grid */}
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
          ) : filteredProjects.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <div className="text-gray-400 mb-4">
                <FolderOpen className="h-12 w-12 mx-auto mb-4" />
                <p className="text-lg">No projects found</p>
                <p>Create your first project to get started!</p>
              </div>
              <Button onClick={() => setShowCreateModal(true)} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Create First Project
              </Button>
            </div>
          ) : (
            filteredProjects.map((project) => (
              <Card key={project.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setSelectedProject(project)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {getTypeIcon(project.type)}
                      {project.name}
                      {project.aiGenerated && (
                        <Badge variant="secondary" className="text-xs">
                          <Sparkles className="h-3 w-3 mr-1" />
                          AI
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      <div className={`text-sm font-medium ${getHealthColor(project.healthScore)}`}>
                        {project.healthScore}/100
                      </div>
                    </div>
                  </div>
                  <CardDescription className="text-sm line-clamp-2">{project.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Status:</span>
                      <Badge className={getStatusColor(project.status)}>
                        {getStatusIcon(project.status)}
                        <span className="ml-1 capitalize">{project.status}</span>
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Progress:</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${project.progress}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">{project.progress}%</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Complexity:</span>
                      <Badge variant="outline" className="capitalize">{project.complexity}</Badge>
                    </div>
                    
                    <div className="flex flex-wrap gap-1 mt-2">
                      {project.technology.slice(0, 3).map((tech, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {tech}
                        </Badge>
                      ))}
                      {project.technology.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{project.technology.length - 3} more
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-3">
                      <Calendar className="h-3 w-3" />
                      Updated {new Date(project.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/projects/${project.id}`;
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                    {project.status === 'development' && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          deployProject(project.id);
                        }}
                      >
                        <Rocket className="h-4 w-4" />
                      </Button>
                    )}
                    {project.deploymentUrl && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(project.deploymentUrl, '_blank');
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Community Project Showcase */}
        <Card className="mt-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              🌟 Community Project Showcase
            </CardTitle>
            <CardDescription>Discover amazing projects built by our community</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {[
                {
                  title: "AI-Powered E-commerce",
                  author: "DevMaster",
                  likes: 1247,
                  forks: 89,
                  tech: ["Next.js", "AI", "Stripe"],
                  image: "🛒",
                  featured: true
                },
                {
                  title: "Blockchain Voting App",
                  author: "CryptoBuilder",
                  likes: 892,
                  forks: 67,
                  tech: ["Solana", "React", "Web3"],
                  image: "🗳️",
                  featured: false
                },
                {
                  title: "Real-time Chat with AI",
                  author: "ChatGuru",
                  likes: 654,
                  forks: 45,
                  tech: ["Socket.io", "AI", "Node.js"],
                  image: "💬",
                  featured: true
                }
              ].map((project, index) => (
                <Card key={index} className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-blue-300">
                  <CardContent className="p-4">
                    <div className="text-center mb-3">
                      <div className="text-4xl mb-2">{project.image}</div>
                      <h4 className="font-semibold text-gray-900">{project.title}</h4>
                      <p className="text-sm text-gray-600">by {project.author}</p>
                      {project.featured && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          <Star className="h-3 w-3 mr-1" />
                          Featured
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-1 mb-3">
                      {project.tech.map((tech, techIndex) => (
                        <Badge key={techIndex} variant="outline" className="text-xs">{tech}</Badge>
                      ))}
                    </div>
                    
                    <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                          <Heart className="h-4 w-4" />
                          {project.likes}
                        </span>
                        <span className="flex items-center gap-1">
                          <GitBranch className="h-4 w-4" />
                          {project.forks}
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
            
            {/* Collaboration Call-to-Action */}
            <div className="bg-gradient-to-r from-purple-100 to-blue-100 rounded-lg p-6 text-center">
              <h4 className="text-xl font-semibold text-gray-900 mb-2">🤝 Join the Collaboration!</h4>
              <p className="text-gray-700 mb-4">
                Connect with other developers, contribute to projects, and build amazing things together
              </p>
              <div className="flex flex-wrap justify-center gap-2 mb-4">
                {['Find Collaborators', 'Share Your Project', 'Join Teams', 'Mentorship'].map((action, index) => (
                  <Badge key={index} variant="secondary" className="cursor-pointer hover:bg-gray-200 px-3 py-1">
                    {action}
                  </Badge>
                ))}
              </div>
              <Button size="lg" className="bg-gradient-to-r from-purple-500 to-blue-500">
                <Users className="h-5 w-5 mr-2" />
                Start Collaborating
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Features Showcase */}
        <Card className="mt-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Why Recoder's Project Management Dominates
            </CardTitle>
            <CardDescription>Advanced features that accelerate project delivery</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <Sparkles className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <h4 className="font-semibold text-gray-900">AI Project Generation</h4>
                <p className="text-sm text-gray-600 mt-1">Generate complete projects from natural language descriptions</p>
              </div>
              
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <Activity className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <h4 className="font-semibold text-gray-900">Real-time Health Monitoring</h4>
                <p className="text-sm text-gray-600 mt-1">Continuous project health assessment and optimization</p>
              </div>
              
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <Rocket className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                <h4 className="font-semibold text-gray-900">One-click Deployment</h4>
                <p className="text-sm text-gray-600 mt-1">Deploy to production with AI-optimized configurations</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}