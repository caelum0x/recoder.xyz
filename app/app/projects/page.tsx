'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/lib/auth-client';
import {
  Terminal, Globe, Settings, LogOut, ArrowRight, Search,
  Calendar, MessageSquare, FileText, ExternalLink, Copy,
  Check, FolderOpen, Clock, Trash2, RefreshCw, Download
} from 'lucide-react';

interface Project {
  id: string;
  urlId: string;
  title: string;
  description?: string;
  timestamp: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount: number;
  fileCount: number;
  webUrl: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/auth/signin');
      return;
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (session) {
      fetchProjects();
    }
  }, [session]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredProjects(projects);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = projects.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.urlId.includes(query)
      );
      setFilteredProjects(filtered);
    }
  }, [searchQuery, projects]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/projects?limit=100');
      const data = await response.json();

      if (data.success && data.data) {
        setProjects(data.data);
        setFilteredProjects(data.data);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    const { signOut } = await import('@/lib/auth-client');
    await signOut();
    router.push('/');
  };

  const copyToClipboard = async (text: string, commandType: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCommand(commandType);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  if (isPending || loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
              Dashboard
            </Link>
            <Link href="/settings" className="text-gray-400 hover:text-white transition-colors">
              <Settings className="w-5 h-5" />
            </Link>
            <button onClick={handleSignOut} className="text-gray-400 hover:text-white transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-12">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">
            My <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-purple-600">Projects</span>
          </h1>
          <p className="text-xl text-gray-400">
            Manage your Web IDE projects from one place
          </p>
        </div>

        {/* Search and Actions */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/50 transition-colors"
            />
          </div>
          <button
            onClick={fetchProjects}
            className="flex items-center space-x-2 px-4 py-3 bg-white/5 border border-white/10 rounded-xl hover:border-white/20 hover:bg-white/10 transition-all"
          >
            <RefreshCw className="w-5 h-5" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400">Total Projects</span>
              <FolderOpen className="w-5 h-5 text-orange-500" />
            </div>
            <div className="text-3xl font-bold">{projects.length}</div>
          </div>
          <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400">Total Files</span>
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-3xl font-bold">
              {projects.reduce((sum, p) => sum + p.fileCount, 0)}
            </div>
          </div>
          <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400">Total Messages</span>
              <MessageSquare className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-3xl font-bold">
              {projects.reduce((sum, p) => sum + p.messageCount, 0)}
            </div>
          </div>
        </div>

        {/* Projects List */}
        {filteredProjects.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">
              {searchQuery ? 'No projects found' : 'No projects yet'}
            </h3>
            <p className="text-gray-400 mb-6">
              {searchQuery
                ? 'Try adjusting your search query'
                : 'Create your first project in the Web IDE'}
            </p>
            {!searchQuery && (
              <Link
                href={process.env.NEXT_PUBLIC_RECODER_WEB_URL || 'http://localhost:5173'}
                target="_blank"
                className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all"
              >
                <Globe className="w-5 h-5" />
                <span>Open Web IDE</span>
                <ExternalLink className="w-4 h-4" />
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold mb-2 truncate">{project.title}</h3>
                    {project.description && (
                      <p className="text-gray-400 mb-4 line-clamp-2">{project.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400 mb-4">
                      <div className="flex items-center space-x-1">
                        <FileText className="w-4 h-4" />
                        <span>{project.fileCount} files</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <MessageSquare className="w-4 h-4" />
                        <span>{project.messageCount} messages</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Clock className="w-4 h-4" />
                        <span>{formatDate(project.updatedAt || project.timestamp)}</span>
                      </div>
                      <div className="flex items-center space-x-1 font-mono text-xs bg-white/5 px-2 py-1 rounded">
                        <span>ID: {project.urlId}</span>
                      </div>
                    </div>

                    {/* CLI Commands */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-sm bg-black/50 px-3 py-2 rounded border border-white/10 font-mono text-green-400 overflow-x-auto">
                          recoder web download {project.urlId}
                        </code>
                        <button
                          onClick={() =>
                            copyToClipboard(
                              `recoder web download ${project.urlId}`,
                              `download-${project.id}`
                            )
                          }
                          className="p-2 bg-white/5 border border-white/10 rounded hover:border-white/20 hover:bg-white/10 transition-all"
                          title="Copy download command"
                        >
                          {copiedCommand === `download-${project.id}` ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-sm bg-black/50 px-3 py-2 rounded border border-white/10 font-mono text-blue-400 overflow-x-auto">
                          recoder web sync {project.urlId}
                        </code>
                        <button
                          onClick={() =>
                            copyToClipboard(
                              `recoder web sync ${project.urlId}`,
                              `sync-${project.id}`
                            )
                          }
                          className="p-2 bg-white/5 border border-white/10 rounded hover:border-white/20 hover:bg-white/10 transition-all"
                          title="Copy sync command"
                        >
                          {copiedCommand === `sync-${project.id}` ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <Link
                      href={project.webUrl}
                      target="_blank"
                      className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all whitespace-nowrap"
                    >
                      <Globe className="w-4 h-4" />
                      <span>Open</span>
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Help Section */}
        <div className="mt-12 p-6 rounded-2xl border border-white/10 bg-white/5">
          <h3 className="text-lg font-bold mb-4">CLI Quick Reference</h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-mono text-green-400 mb-1">recoder web list</div>
              <div className="text-gray-400">List all your projects</div>
            </div>
            <div>
              <div className="font-mono text-green-400 mb-1">recoder web download &lt;urlId&gt;</div>
              <div className="text-gray-400">Download project to local machine</div>
            </div>
            <div>
              <div className="font-mono text-blue-400 mb-1">recoder web push &lt;urlId&gt;</div>
              <div className="text-gray-400">Upload local changes to web</div>
            </div>
            <div>
              <div className="font-mono text-blue-400 mb-1">recoder web sync &lt;urlId&gt;</div>
              <div className="text-gray-400">Intelligent two-way sync</div>
            </div>
            <div>
              <div className="font-mono text-purple-400 mb-1">recoder web open &lt;urlId&gt;</div>
              <div className="text-gray-400">Open project in browser</div>
            </div>
            <div>
              <div className="font-mono text-purple-400 mb-1">recoder web info &lt;urlId&gt;</div>
              <div className="text-gray-400">Show project details</div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/10">
            <Link
              href="/cli"
              className="text-orange-500 hover:text-orange-400 flex items-center space-x-1"
            >
              <span>View full CLI documentation</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
