import React, { useState, useMemo, useEffect } from 'react';
import type { Project } from '~/lib/.server/db/projects-db';

interface ProjectsPageProps {
  initialProjects: Project[];
  error: string | null;
  databaseConfigured?: boolean;
}

export function ProjectsPage({ initialProjects, error, databaseConfigured = true }: ProjectsPageProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'name'>('updated');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Get or create user ID and load projects
  useEffect(() => {
    // In dev mode, use the dev user ID that exists in database
    const devUserId = 'dev-user-123';
    let id = localStorage.getItem('recoder_userId');
    
    // For development, always use dev user to avoid FK constraint errors
    if (!id || id !== devUserId) {
      id = devUserId;
      localStorage.setItem('recoder_userId', id);
    }
    setUserId(id);
    
    if (databaseConfigured && initialProjects.length === 0) {
      refreshProjects(id);
    }
  }, [databaseConfigured, initialProjects.length]);

  const filteredProjects = useMemo(() => {
    let filtered = projects.filter(project => {
      return !searchQuery || 
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (project.description && project.description.toLowerCase().includes(searchQuery.toLowerCase()));
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'updated':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return filtered;
  }, [projects, searchQuery, sortBy]);

  const handleCreateProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userId) return;

    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const type = formData.get('type') as string;

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, type, userId }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create project');
      }

      await refreshProjects(userId);
      setIsCreateModalOpen(false);
    } catch (err) {
      console.error('Error creating project:', err);
      alert(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!userId || !confirm('Are you sure you want to delete this project?')) return;

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to delete project');
      }
      
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (err) {
      console.error('Error deleting project:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  const refreshProjects = async (uid: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/projects?userId=${uid}`);
      const data = await response.json();
      
      if (response.ok && data.projects) {
        setProjects(data.projects);
      }
    } catch (err) {
      console.error('Error refreshing projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const openProject = (project: Project) => {
    window.location.href = `/?projectId=${project.id}`;
  };

  if (!databaseConfigured) {
    return (
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-yellow-400">
            <h2 className="font-semibold mb-2">Database Not Configured</h2>
            <p>Projects feature requires database configuration. Please set DATABASE_URL environment variable.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
            <h2 className="font-semibold mb-2">Error Loading Projects</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 bg-bolt-elements-background-depth-1 overflow-auto">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-bolt-elements-textPrimary">Projects</h1>
            <p className="text-bolt-elements-textSecondary mt-1">Manage your AI development projects</p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-all"
          >
            <span className="text-lg">+</span>
            New Project
          </button>
        </div>

        {/* Search & Filter */}
        <div className="mb-6 flex gap-4">
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary placeholder-bolt-elements-textSecondary"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'updated' | 'created' | 'name')}
            className="px-4 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary"
          >
            <option value="updated">Last Updated</option>
            <option value="created">Created</option>
            <option value="name">Name</option>
          </select>
          <button
            onClick={() => userId && refreshProjects(userId)}
            disabled={isLoading}
            className="px-4 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-50"
          >
            {isLoading ? '...' : '↻'}
          </button>
        </div>

        {/* Projects Grid */}
        {isLoading && projects.length === 0 ? (
          <div className="text-center py-12 text-bolt-elements-textSecondary">
            Loading projects...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4 opacity-30">📁</div>
            <h3 className="text-xl font-semibold mb-2 text-bolt-elements-textPrimary">No projects yet</h3>
            <p className="text-bolt-elements-textSecondary mb-6">Create your first project to get started</p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg"
            >
              Create Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map(project => (
              <div
                key={project.id}
                className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg p-4 hover:border-orange-500 transition-all cursor-pointer group"
                onClick={() => openProject(project)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="text-3xl">
                    {project.type === 'web' ? '🌐' : project.type === 'api' ? '⚡' : project.type === 'mobile' ? '📱' : '📁'}
                  </div>
                  <div className="flex gap-1">
                    {project.isPrivate && (
                      <span className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded">Private</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300 transition-all"
                      title="Delete project"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                <h3 className="font-semibold text-bolt-elements-textPrimary mb-1">{project.name}</h3>
                <p className="text-sm text-bolt-elements-textSecondary mb-3 line-clamp-2">
                  {project.description || 'No description'}
                </p>
                <div className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary flex-wrap">
                  <span className="px-2 py-1 bg-bolt-elements-background-depth-1 rounded">{project.type || 'web'}</span>
                  {project.framework && <span className="px-2 py-1 bg-bolt-elements-background-depth-1 rounded">{project.framework}</span>}
                  {project.language && <span className="px-2 py-1 bg-bolt-elements-background-depth-1 rounded">{project.language}</span>}
                  <span className="px-2 py-1 bg-bolt-elements-background-depth-1 rounded">{project.status}</span>
                </div>
                <div className="mt-3 text-xs text-bolt-elements-textSecondary">
                  Updated {new Date(project.updatedAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Modal */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsCreateModalOpen(false)}>
            <div className="bg-bolt-elements-background-depth-1 rounded-lg p-6 w-full max-w-md border border-bolt-elements-borderColor" onClick={e => e.stopPropagation()}>
              <h2 className="text-xl font-bold text-bolt-elements-textPrimary mb-4">Create New Project</h2>
              <form onSubmit={handleCreateProject}>
                <div className="mb-4">
                  <label className="block text-sm text-bolt-elements-textSecondary mb-1">Project Name *</label>
                  <input
                    name="name"
                    required
                    className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary"
                    placeholder="My Awesome Project"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm text-bolt-elements-textSecondary mb-1">Description</label>
                  <textarea
                    name="description"
                    rows={3}
                    className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary"
                    placeholder="What are you building?"
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm text-bolt-elements-textSecondary mb-1">Project Type</label>
                  <select
                    name="type"
                    className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary"
                  >
                    <option value="web">🌐 Web App</option>
                    <option value="api">⚡ API / Backend</option>
                    <option value="mobile">📱 Mobile App</option>
                    <option value="blockchain">🔗 Blockchain / Web3</option>
                    <option value="ai">🤖 AI / ML</option>
                    <option value="game">🎮 Game</option>
                    <option value="other">📁 Other</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="flex-1 px-4 py-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2"
                    disabled={isLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
