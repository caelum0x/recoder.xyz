/**
 * Projects Dashboard
 * Manage and monitor all projects
 */

'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft,
  Terminal,
  FolderGit2,
  Plus,
  Search,
  MoreVertical,
  Star,
  StarOff,
  Trash2,
  ExternalLink,
  Code2,
  Clock,
  Users,
  GitBranch,
  Activity,
  Loader2
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string | null;
  language: string | null;
  framework: string | null;
  type: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  stats: {
    codeGenerations: number;
    usageRecords: number;
    totalTokens: number;
    totalCost: number;
  };
}

export default function ProjectsDashboardPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'usage'>('recent');
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [authStatus, router]);

  // Load projects
  useEffect(() => {
    if (authStatus === 'authenticated') {
      loadProjects();
    }
  }, [authStatus, filterStatus]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (searchQuery) params.append('search', searchQuery);

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/dashboard/projects?${params}`);
      const data = await response.json();

      if (data.success) {
        setProjects(data.data.projects);
      } else {
        setError(data.error || 'Failed to load projects');
      }
    } catch (err) {
      console.error('Error loading projects:', err);
      setError('Failed to connect to API');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/projects/${projectId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setProjects(projects.filter(p => p.id !== projectId));
      } else {
        alert('Failed to delete project');
      }
    } catch (err) {
      console.error('Error deleting project:', err);
      alert('Failed to delete project');
    }
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString();
  };

  const filteredProjects = projects.filter(project => {
    const matchesSearch = 
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.description && project.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'usage') return b.stats.usageRecords - a.stats.usageRecords;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const stats = {
    total: projects.length,
    active: projects.filter(p => p.status === 'active').length,
    totalGenerations: projects.reduce((sum, p) => sum + p.stats.codeGenerations, 0),
    totalCost: projects.reduce((sum, p) => sum + p.stats.totalCost, 0)
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-500';
      case 'draft': return 'bg-yellow-500/20 text-yellow-500';
      case 'archived': return 'bg-gray-500/20 text-gray-500';
      case 'planning': return 'bg-blue-500/20 text-blue-500';
      default: return 'bg-gray-500/20 text-gray-500';
    }
  };

  const getLanguageColor = (language: string | null) => {
    if (!language) return 'bg-gray-500/20 text-gray-500';
    const colors: Record<string, string> = {
      'TypeScript': 'bg-blue-500/20 text-blue-500',
      'JavaScript': 'bg-yellow-500/20 text-yellow-500',
      'Python': 'bg-green-500/20 text-green-500',
      'Go': 'bg-cyan-500/20 text-cyan-500',
      'Rust': 'bg-orange-500/20 text-orange-500',
      'Java': 'bg-red-500/20 text-red-500'
    };
    return colors[language] || 'bg-gray-500/20 text-gray-500';
  };

  if (authStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center space-x-2 group text-white hover:text-orange-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Dashboard</span>
          </Link>
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-6 py-24">
        <div className="max-w-7xl mx-auto">
          {/* Page Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Projects</h1>
              <p className="text-gray-400">Manage and monitor all your projects</p>
            </div>
            <Link
              href="/dashboard/projects/new"
              className="px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>New Project</span>
            </Link>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500">
              {error}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">Total Projects</div>
                <FolderGit2 className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-3xl font-bold">{stats.total}</div>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">Active</div>
                <Activity className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-3xl font-bold">{stats.active}</div>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">Code Generations</div>
                <Code2 className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-3xl font-bold">{stats.totalGenerations}</div>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">Total Cost</div>
                <GitBranch className="w-4 h-4 text-orange-500" />
              </div>
              <div className="text-3xl font-bold">${stats.totalCost.toFixed(2)}</div>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="mb-6 flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && loadProjects()}
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white appearance-none cursor-pointer"
            >
              <option value="all" className="bg-gray-900">All Status</option>
              <option value="active" className="bg-gray-900">Active</option>
              <option value="draft" className="bg-gray-900">Draft</option>
              <option value="planning" className="bg-gray-900">Planning</option>
              <option value="archived" className="bg-gray-900">Archived</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white appearance-none cursor-pointer"
            >
              <option value="recent" className="bg-gray-900">Most Recent</option>
              <option value="name" className="bg-gray-900">Name</option>
              <option value="usage" className="bg-gray-900">Most Usage</option>
            </select>
          </div>

          {/* Projects Grid */}
          <div className="grid md:grid-cols-2 gap-4">
            {sortedProjects.map((project) => (
              <div
                key={project.id}
                className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl hover:border-white/20 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <FolderGit2 className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="text-lg font-bold truncate">{project.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                          {project.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                        {project.description || 'No description provided'}
                      </p>
                      
                      <div className="flex flex-wrap gap-2 mb-3">
                        {project.language && (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getLanguageColor(project.language)}`}>
                            {project.language}
                          </span>
                        )}
                        {project.framework && (
                          <span className="px-2 py-1 bg-white/5 text-gray-400 rounded text-xs">
                            {project.framework}
                          </span>
                        )}
                        <span className="px-2 py-1 bg-white/5 text-gray-400 rounded text-xs">
                          {project.type}
                        </span>
                      </div>

                      <div className="flex items-center space-x-4 text-xs text-gray-400">
                        <div className="flex items-center space-x-1">
                          <Code2 className="w-3 h-3" />
                          <span>{project.stats.codeGenerations} generations</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Activity className="w-3 h-3" />
                          <span>{project.stats.usageRecords} uses</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{formatDate(project.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="p-2 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors"
                      title="Delete project"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex space-x-2 pt-4 border-t border-white/10">
                  <Link
                    href={`/dashboard/projects/${project.id}`}
                    className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all flex items-center justify-center space-x-2 text-sm"
                  >
                    <Code2 className="w-4 h-4" />
                    <span>View Project</span>
                  </Link>
                  <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-400">
                    ${project.stats.totalCost.toFixed(3)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {sortedProjects.length === 0 && !loading && (
            <div className="text-center py-12">
              <FolderGit2 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-400 mb-2">No projects found</h3>
              <p className="text-sm text-gray-500">
                {searchQuery ? 'Try adjusting your search' : 'Create your first project to get started'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
