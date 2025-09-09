'use client';

export const dynamic = 'force-dynamic';

/**
 * Projects Management Page - Complete Project Lifecycle Management
 * KILLER FEATURE: AI-powered project creation, monitoring, and optimization
 */

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ProjectCreationModal } from '@/components/projects/create-project-modal';
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
  type: 'web' | 'mobile' | 'ai' | 'blockchain' | 'fullstack' | 'microservice' | 'pwa';
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
  const sessionData = useSession();
  const session = sessionData?.data;
  const status = sessionData?.status || 'loading';
  const [projects, setProjects] = useState<Project[]>([]);
  const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // Redirect to login if not authenticated
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Code2 className="w-12 h-12 animate-pulse mx-auto mb-4 text-blue-600" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Code2 className="w-12 h-12 mx-auto mb-4 text-blue-600" />
          <p>Please sign in to access your projects</p>
          <button 
            onClick={() => window.location.href = '/auth/login'}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  useEffect(() => {
    loadProjects();
    loadAnalytics();
    loadTemplates();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      if (data.success) {
        setProjects(data.data.projects || []);
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

  const loadTemplates = async () => {
    try {
      setTemplatesLoading(true);
      const response = await fetch('/api/templates');
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data.templates || []);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const createProject = async (projectData: any) => {
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(projectData),
      });

      const data = await response.json();
      if (data.success) {
        setProjects([data.data.project, ...projects]);
        setShowCreateModal(false);
        // Redirect to editor
        window.location.href = `/editor/${data.data.project.id}`;
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

  const viewAnalytics = async (projectId: string) => {
    try {
      // Navigate to analytics page or open analytics modal
      window.location.href = `/projects/${projectId}/analytics`;
    } catch (error) {
      console.error('Failed to view analytics:', error);
    }
  };

  const startCollaboration = async (projectId: string) => {
    try {
      // Navigate to collaboration page or start collaboration session
      window.location.href = `/projects/${projectId}/collaborate`;
    } catch (error) {
      console.error('Failed to start collaboration:', error);
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50/30 via-white to-purple-50/30 relative">
      {/* Enhanced Background Pattern */}
      <div className="absolute inset-0 bg-grid-slate-100/50 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
      <div className="container mx-auto px-4 py-8">
        {/* Enhanced Professional Header */}
        <div className="text-center mb-16 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 rounded-3xl blur-3xl -z-10"></div>
          <div className="relative bg-white/80 backdrop-blur-sm rounded-3xl p-12 shadow-xl ring-1 ring-gray-200/50 mx-auto max-w-4xl">
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                <FolderOpen className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-5xl font-black bg-gradient-to-r from-gray-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
                Project Hub
              </h1>
            </div>
            
            <p className="text-xl text-gray-700 mb-6 font-medium max-w-3xl mx-auto">
              Complete project lifecycle management with AI-powered insights, real-time monitoring, and collaborative development workflows
            </p>
            
            <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
              <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-100 to-green-100 px-4 py-2 rounded-xl ring-1 ring-emerald-200/50">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="font-bold text-emerald-800">Real-time Intelligence</span>
              </div>
              <div className="flex items-center gap-2 bg-gradient-to-r from-blue-100 to-purple-100 px-4 py-2 rounded-xl ring-1 ring-blue-200/50">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-blue-800">AI Project Generation</span>
              </div>
              <div className="flex items-center gap-2 bg-gradient-to-r from-orange-100 to-red-100 px-4 py-2 rounded-xl ring-1 ring-orange-200/50">
                <Rocket className="w-4 h-4 text-orange-600" />
                <span className="font-bold text-orange-800">One-click Deployment</span>
              </div>
            </div>
            
            <div className="flex items-center justify-center gap-3">
              <div className="flex -space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full ring-2 ring-white shadow-sm" title="Web Projects" />
                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-full ring-2 ring-white shadow-sm" title="AI Projects" />
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full ring-2 ring-white shadow-sm" title="Blockchain" />
                <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full ring-2 ring-white shadow-sm" title="Mobile Apps" />
              </div>
              <span className="font-semibold text-gray-700">Multi-platform Project Support</span>
            </div>
          </div>
        </div>

        {/* Enhanced Analytics Dashboard */}
        {analytics && (
          <div className="mb-12">
            <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl ring-1 ring-gray-200/50 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 px-8 py-6 border-b border-gray-200/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Portfolio Analytics</h3>
                      <p className="text-sm text-gray-600">Real-time project performance insights</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-green-100 px-3 py-1 rounded-full">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-semibold text-green-700">Live Data</span>
                  </div>
                </div>
              </div>
              
              <div className="p-8">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-6 text-center ring-1 ring-blue-200/50 hover:scale-105 transition-transform">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                      <FolderOpen className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-3xl font-black text-blue-700 mb-1">{analytics.totalProjects}</div>
                    <div className="text-sm font-medium text-blue-600">Total Projects</div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-6 text-center ring-1 ring-green-200/50 hover:scale-105 transition-transform">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                      <Activity className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-3xl font-black text-green-700 mb-1">{analytics.activeProjects}</div>
                    <div className="text-sm font-medium text-green-600">Active Projects</div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 text-center ring-1 ring-purple-200/50 hover:scale-105 transition-transform">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                      <TrendingUp className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-3xl font-black text-purple-700 mb-1">{Math.round(analytics.avgProgress)}%</div>
                    <div className="text-sm font-medium text-purple-600">Avg Progress</div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-2xl p-6 text-center ring-1 ring-orange-200/50 hover:scale-105 transition-transform">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                      <Shield className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-3xl font-black text-orange-700 mb-1">{Math.round(analytics.healthScoreAvg)}</div>
                    <div className="text-sm font-medium text-orange-600">Health Score</div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 rounded-2xl p-6 ring-1 ring-gray-200/50">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                      <Zap className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-lg font-bold text-gray-900 mb-2">Project Intelligence Advantage</h4>
                      <p className="text-gray-700 mb-4">Advanced AI-powered project lifecycle management with predictive analytics, real-time optimization, and intelligent resource allocation</p>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {['AI Generation', 'Health Monitoring', 'Predictive Analytics', 'Auto-deployment'].map((feature, index) => (
                          <div key={index} className="flex items-center gap-2 bg-white/80 px-3 py-2 rounded-xl">
                            <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"></div>
                            <span className="text-sm font-semibold text-gray-700">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Professional Controls */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-xl ring-1 ring-gray-200/50 mb-12">
          <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center">
            {/* Primary Action */}
            <Button 
              onClick={() => setShowCreateModal(true)}
              size="lg"
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 flex items-center gap-3 font-semibold"
            >
              <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
                <Plus className="h-4 w-4" />
              </div>
              <span>Create New Project</span>
            </Button>

            {/* Templates Action */}
            <Button 
              onClick={() => setShowTemplates(true)}
              variant="outline"
              size="lg"
              className="border-2 border-gray-200/50 hover:border-gray-300 bg-white/80 backdrop-blur-sm px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 flex items-center gap-3 font-semibold"
            >
              <div className="w-6 h-6 bg-gray-100 rounded-lg flex items-center justify-center">
                <Lightbulb className="h-4 w-4 text-gray-600" />
              </div>
              <span>Use Template</span>
            </Button>
            
            {/* Search Section */}
            <div className="flex-1 flex gap-3 min-w-0">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="Search projects, technologies, teams..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 h-12 rounded-xl border-2 border-gray-200/50 focus:border-blue-300 bg-white/80 backdrop-blur-sm font-medium"
                />
              </div>
            </div>
            
            {/* Filter Controls */}
            <div className="flex gap-3">
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[180px] h-12 rounded-xl border-2 border-gray-200/50 bg-white/80 backdrop-blur-sm font-medium">
                  <div className="flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-gray-500" />
                    <SelectValue placeholder="Project Type" />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-xl border-2 border-gray-200/50 bg-white/95 backdrop-blur-sm">
                  <SelectItem value="all" className="rounded-lg">All Types</SelectItem>
                  <SelectItem value="web" className="rounded-lg">🌐 Web App</SelectItem>
                  <SelectItem value="mobile" className="rounded-lg">📱 Mobile App</SelectItem>
                  <SelectItem value="ai" className="rounded-lg">🤖 AI Project</SelectItem>
                  <SelectItem value="blockchain" className="rounded-lg">⛓️ Blockchain</SelectItem>
                  <SelectItem value="fullstack" className="rounded-lg">🏗️ Full Stack</SelectItem>
                  <SelectItem value="pwa" className="rounded-lg">📱 Progressive Web App</SelectItem>
                  <SelectItem value="microservice" className="rounded-lg">🔧 Microservice</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-[180px] h-12 rounded-xl border-2 border-gray-200/50 bg-white/80 backdrop-blur-sm font-medium">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-gray-500" />
                    <SelectValue placeholder="Status" />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-xl border-2 border-gray-200/50 bg-white/95 backdrop-blur-sm">
                  <SelectItem value="all" className="rounded-lg">All Status</SelectItem>
                  <SelectItem value="planning" className="rounded-lg">💡 Planning</SelectItem>
                  <SelectItem value="development" className="rounded-lg">⚡ Development</SelectItem>
                  <SelectItem value="testing" className="rounded-lg">🛡️ Testing</SelectItem>
                  <SelectItem value="deployed" className="rounded-lg">🚀 Deployed</SelectItem>
                  <SelectItem value="maintenance" className="rounded-lg">🔧 Maintenance</SelectItem>
                  <SelectItem value="archived" className="rounded-lg">📦 Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Quick Stats Bar */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200/50 mt-4">
            <div className="flex items-center gap-6 text-sm">
              <span className="text-gray-600">Showing <span className="font-bold text-gray-900">{filteredProjects.length}</span> projects</span>
              {searchQuery && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">for</span>
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg font-medium">"{searchQuery}"</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Last updated</span>
              <span className="text-gray-700 font-medium">just now</span>
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>

        {/* Enhanced Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {loading ? (
            Array.from({length: 6}).map((_, i) => (
              <div key={i} className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-lg animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-xl"></div>
                  <div className="flex-1">
                    <div className="h-5 bg-gray-200 rounded-lg mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded-lg w-2/3"></div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="h-4 bg-gray-200 rounded-lg"></div>
                  <div className="h-4 bg-gray-200 rounded-lg w-3/4"></div>
                  <div className="flex gap-2">
                    <div className="h-6 bg-gray-200 rounded-lg w-16"></div>
                    <div className="h-6 bg-gray-200 rounded-lg w-20"></div>
                  </div>
                  <div className="h-10 bg-gray-200 rounded-xl mt-6"></div>
                </div>
              </div>
            ))
          ) : filteredProjects.length === 0 ? (
            <div className="col-span-full">
              <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-12 text-center shadow-xl ring-1 ring-gray-200/50">
                <div className="w-20 h-20 bg-gradient-to-br from-gray-200 to-gray-300 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <FolderOpen className="h-10 w-10 text-gray-400" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">No Projects Found</h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  {searchQuery ? `No projects match "${searchQuery}". Try different keywords or filters.` : 'Start your development journey by creating your first project!'}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button 
                    onClick={() => setShowCreateModal(true)} 
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 px-8 py-3 rounded-xl shadow-lg hover:scale-105 transition-all"
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    Create First Project
                  </Button>
                  {searchQuery && (
                    <Button 
                      variant="outline" 
                      onClick={() => setSearchQuery('')}
                      className="px-6 py-3 rounded-xl border-2 hover:scale-105 transition-all"
                    >
                      Clear Search
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            filteredProjects.map((project) => (
              <div 
                key={project.id} 
                className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer hover:scale-105 ring-1 ring-gray-200/50 hover:ring-gray-300/50 group"
                onClick={() => setSelectedProject(project)}
              >
                {/* Enhanced Project Header */}
                <div className="p-6 pb-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
                        project.type === 'web' ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
                        project.type === 'mobile' ? 'bg-gradient-to-br from-green-500 to-green-600' :
                        project.type === 'ai' ? 'bg-gradient-to-br from-purple-500 to-purple-600' :
                        project.type === 'blockchain' ? 'bg-gradient-to-br from-orange-500 to-orange-600' :
                        project.type === 'fullstack' ? 'bg-gradient-to-br from-indigo-500 to-indigo-600' :
                        'bg-gradient-to-br from-gray-500 to-gray-600'
                      }`}>
                        {getTypeIcon(project.type)}
                        <span className="text-white">{React.cloneElement(getTypeIcon(project.type), { className: 'w-6 h-6 text-white' })}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-lg text-gray-900 group-hover:text-blue-700 transition-colors truncate">
                          {project.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm text-gray-500 capitalize">{project.type} project</span>
                          {project.aiGenerated && (
                            <div className="flex items-center gap-1 bg-gradient-to-r from-purple-100 to-blue-100 px-2 py-1 rounded-lg">
                              <Sparkles className="h-3 w-3 text-purple-600" />
                              <span className="text-xs font-semibold text-purple-700">AI Generated</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Health Score Badge */}
                    <div className={`flex items-center gap-1 px-3 py-1 rounded-xl font-bold text-sm ${
                      project.healthScore >= 90 ? 'bg-green-100 text-green-700' :
                      project.healthScore >= 70 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${
                        project.healthScore >= 90 ? 'bg-green-500' :
                        project.healthScore >= 70 ? 'bg-yellow-500' :
                        'bg-red-500'
                      } animate-pulse`}></div>
                      <span>{project.healthScore}/100</span>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{project.description}</p>
                  
                  {/* Status and Progress */}
                  <div className="space-y-3 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</span>
                      <div className={`flex items-center gap-2 px-3 py-1 rounded-xl text-sm font-semibold ${
                        getStatusColor(project.status)
                      }`}>
                        {getStatusIcon(project.status)}
                        <span className="capitalize">{project.status}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</span>
                      <div className="flex items-center gap-3">
                        <div className="w-24 bg-gray-200 rounded-full h-2.5 overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${project.progress}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-bold text-gray-700 tabular-nums">{project.progress}%</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Complexity</span>
                      <div className={`px-3 py-1 rounded-xl text-xs font-bold capitalize ${
                        project.complexity === 'simple' ? 'bg-green-100 text-green-700' :
                        project.complexity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        project.complexity === 'complex' ? 'bg-orange-100 text-orange-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {project.complexity}
                      </div>
                    </div>
                  </div>
                  
                  {/* Technology Stack */}
                  <div className="mb-4">
                    <div className="flex flex-wrap gap-2">
                      {project.technology.slice(0, 4).map((tech, index) => (
                        <div key={index} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors">
                          {tech}
                        </div>
                      ))}
                      {project.technology.length > 4 && (
                        <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold">
                          +{project.technology.length - 4} more
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Updated Info */}
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-6">
                    <Calendar className="h-3 w-3" />
                    <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex gap-2 mb-4">
                    <Button 
                      className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/editor/${project.id}`;
                      }}
                    >
                      <Code2 className="h-4 w-4 mr-2" />
                      Open Editor
                    </Button>
                    
                    <Button 
                      variant="outline"
                      className="flex-1 rounded-xl font-semibold hover:bg-gray-50 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/projects/${project.id}`;
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Button>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-2">
                    {project.status === 'development' && (
                      <Button 
                        variant="outline" 
                        className="w-12 h-12 rounded-xl border-2 hover:bg-green-50 hover:border-green-300 hover:scale-110 transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          deployProject(project.id);
                        }}
                        title="Deploy Project"
                      >
                        <Rocket className="h-4 w-4 text-green-600" />
                      </Button>
                    )}
                    
                    <Button 
                      variant="outline" 
                      className="w-12 h-12 rounded-xl border-2 hover:bg-purple-50 hover:border-purple-300 hover:scale-110 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        viewAnalytics(project.id);
                      }}
                      title="View Analytics"
                    >
                      <BarChart3 className="h-4 w-4 text-purple-600" />
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="w-12 h-12 rounded-xl border-2 hover:bg-orange-50 hover:border-orange-300 hover:scale-110 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        startCollaboration(project.id);
                      }}
                      title="Start Collaboration"
                    >
                      <Users className="h-4 w-4 text-orange-600" />
                    </Button>
                    
                    {project.deploymentUrl && (
                      <Button 
                        variant="outline" 
                        className="w-12 h-12 rounded-xl border-2 hover:bg-purple-50 hover:border-purple-300 hover:scale-110 transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(project.deploymentUrl, '_blank');
                        }}
                        title="View Live Project"
                      >
                        <ExternalLink className="h-4 w-4 text-purple-600" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Enhanced Community Project Showcase */}
        <div className="mt-16 bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl ring-1 ring-gray-200/50 overflow-hidden">
          <div className="bg-gradient-to-r from-pink-50 via-purple-50 to-blue-50 px-8 py-6 border-b border-gray-200/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">Community Showcase</h3>
                  <p className="text-gray-600">Discover amazing projects built by our developer community</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-purple-100 px-4 py-2 rounded-xl">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-semibold text-purple-700">Live Updates</span>
              </div>
            </div>
          </div>
          
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
              {[
                {
                  title: "AI-Powered E-commerce Platform",
                  author: "DevMaster",
                  likes: 1247,
                  forks: 89,
                  tech: ["Next.js", "OpenAI", "Stripe", "PostgreSQL"],
                  image: "🛍️",
                  featured: true,
                  color: "from-blue-500 to-purple-600"
                },
                {
                  title: "Decentralized Voting System",
                  author: "CryptoBuilder",
                  likes: 892,
                  forks: 67,
                  tech: ["Solana", "React", "Web3.js", "Rust"],
                  image: "🗳️",
                  featured: false,
                  color: "from-orange-500 to-red-600"
                },
                {
                  title: "AI-Enhanced Chat Application",
                  author: "ChatGuru",
                  likes: 654,
                  forks: 45,
                  tech: ["Socket.io", "Claude API", "Node.js", "Redis"],
                  image: "💬",
                  featured: true,
                  color: "from-green-500 to-teal-600"
                }
              ].map((project, index) => (
                <div key={index} className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer hover:scale-105 ring-1 ring-gray-200/50 hover:ring-gray-300/50 group overflow-hidden">
                  <div className="p-6">
                    {/* Project Icon & Featured Badge */}
                    <div className="relative text-center mb-6">
                      <div className={`w-16 h-16 bg-gradient-to-br ${project.color} rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                        <span className="text-3xl">{project.image}</span>
                      </div>
                      <h4 className="font-bold text-lg text-gray-900 group-hover:text-blue-700 transition-colors mb-1">{project.title}</h4>
                      <p className="text-sm text-gray-600 mb-2">Created by <span className="font-semibold">{project.author}</span></p>
                      {project.featured && (
                        <div className="inline-flex items-center gap-1 bg-gradient-to-r from-yellow-100 to-orange-100 px-3 py-1 rounded-xl">
                          <Star className="h-3 w-3 text-yellow-600 fill-current" />
                          <span className="text-xs font-bold text-yellow-700">Featured Project</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Technology Stack */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      {project.tech.map((tech, techIndex) => (
                        <div key={techIndex} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded-lg text-xs font-medium transition-colors">
                          {tech}
                        </div>
                      ))}
                    </div>
                    
                    {/* Stats */}
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200/50">
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1 text-red-600">
                          <Heart className="h-4 w-4 fill-current" />
                          <span className="font-semibold">{project.likes.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-1 text-blue-600">
                          <GitBranch className="h-4 w-4" />
                          <span className="font-semibold">{project.forks}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span>Active</span>
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <Button className="flex-1 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white rounded-xl font-semibold transition-all hover:scale-105">
                        <Eye className="h-4 w-4 mr-2" />
                        Explore
                      </Button>
                      <Button className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-semibold transition-all hover:scale-105">
                        <GitBranch className="h-4 w-4 mr-2" />
                        Fork & Build
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Enhanced Collaboration Call-to-Action */}
            <div className="bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-pink-500/10 rounded-2xl p-8 ring-1 ring-gray-200/50 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-blue-500/5 rounded-2xl"></div>
              <div className="relative text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                  <Users className="w-8 h-8 text-white" />
                </div>
                
                <h4 className="text-2xl font-bold text-gray-900 mb-3">🤝 Join the Developer Community</h4>
                <p className="text-gray-700 mb-6 max-w-2xl mx-auto">
                  Connect with talented developers worldwide, collaborate on cutting-edge projects, and accelerate your learning through peer programming and mentorship
                </p>
                
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  {[
                    { icon: '🔍', label: 'Find Collaborators', desc: 'Connect with developers' },
                    { icon: '🚀', label: 'Share Projects', desc: 'Showcase your work' },
                    { icon: '👥', label: 'Join Teams', desc: 'Work together' },
                    { icon: '🎯', label: 'Get Mentorship', desc: 'Learn from experts' }
                  ].map((action, index) => (
                    <div key={index} className="bg-white/80 backdrop-blur-sm rounded-xl p-4 hover:bg-white hover:scale-105 transition-all cursor-pointer ring-1 ring-gray-200/50 hover:ring-gray-300/50">
                      <div className="text-2xl mb-2">{action.icon}</div>
                      <div className="font-semibold text-gray-900 text-sm mb-1">{action.label}</div>
                      <div className="text-xs text-gray-600">{action.desc}</div>
                    </div>
                  ))}
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105">
                    <Users className="h-5 w-5 mr-2" />
                    Start Collaborating
                  </Button>
                  <Button variant="outline" className="border-2 px-8 py-3 rounded-xl font-semibold hover:scale-105 transition-all">
                    <Target className="h-5 w-5 mr-2" />
                    Browse Projects
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Features Showcase */}
        <div className="mt-16 bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl ring-1 ring-gray-200/50 overflow-hidden">
          <div className="bg-gradient-to-r from-green-50 via-blue-50 to-purple-50 px-8 py-6 border-b border-gray-200/50">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Target className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Why Recoder Dominates Project Management</h3>
              <p className="text-gray-600 max-w-2xl mx-auto">Revolutionary features that transform how you build, deploy, and scale applications</p>
            </div>
          </div>
          
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="text-center group">
                <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg group-hover:scale-110 transition-transform">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
                <h4 className="text-lg font-bold text-gray-900 mb-2">AI Project Generation</h4>
                <p className="text-gray-600 text-sm leading-relaxed">Transform natural language descriptions into complete, production-ready applications with intelligent code generation and architecture planning</p>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-green-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="font-semibold">AI-Powered</span>
                </div>
              </div>
              
              <div className="text-center group">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg group-hover:scale-110 transition-transform">
                  <Activity className="w-10 h-10 text-white" />
                </div>
                <h4 className="text-lg font-bold text-gray-900 mb-2">Real-time Health Monitoring</h4>
                <p className="text-gray-600 text-sm leading-relaxed">Continuous project health assessment with predictive analytics, performance optimization, and intelligent alerts for proactive maintenance</p>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-blue-600">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="font-semibold">Live Monitoring</span>
                </div>
              </div>
              
              <div className="text-center group">
                <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg group-hover:scale-110 transition-transform">
                  <Rocket className="w-10 h-10 text-white" />
                </div>
                <h4 className="text-lg font-bold text-gray-900 mb-2">One-click Deployment</h4>
                <p className="text-gray-600 text-sm leading-relaxed">Deploy to production environments instantly with AI-optimized configurations, automatic scaling, and intelligent infrastructure management</p>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-purple-600">
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                  <span className="font-semibold">Auto-Deploy</span>
                </div>
              </div>
            </div>
            
            {/* Call to Action */}
            <div className="text-center mt-12 pt-8 border-t border-gray-200/50">
              <h4 className="text-lg font-bold text-gray-900 mb-3">Ready to Transform Your Development Workflow?</h4>
              <Button 
                onClick={() => setShowCreateModal(true)}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105"
              >
                <Plus className="h-5 w-5 mr-2" />
                Start Your First Project
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Project Creation Modal */}
      <ProjectCreationModal 
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onProjectCreated={(project) => {
          console.log('New project created:', project);
          // Refresh projects list or add to current list
          // setProjects(prev => [project, ...prev]);
        }}
      />
    </div>
  );
}