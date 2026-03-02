import React, { useState, useMemo, useEffect } from 'react';
import type { Project } from '~/lib/.server/db/projects-db';
import { useAuth } from '~/lib/contexts/AuthContext';
import { ProjectTemplateSelector, type ProjectTemplate } from './ProjectTemplateSelector';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ProjectsPage');

interface ProjectsPageProps {
  initialProjects: Project[];
  error: string | null;
  databaseConfigured?: boolean;
}

// Helper function to format relative time
function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString();
}

export function ProjectsPage({ initialProjects, error, databaseConfigured = true }: ProjectsPageProps) {
  const { user, isAuthenticated } = useAuth();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'name'>('updated');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [createStep, setCreateStep] = useState<'template' | 'details'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);

  // Use authenticated user ID
  const userId = user?.id ?? null;

  // Load projects when authenticated
  useEffect(() => {
    if (userId && databaseConfigured && initialProjects.length === 0) {
      refreshProjects(userId);
    }
  }, [userId, databaseConfigured, initialProjects.length]);

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

    // Get template info
    const templateId = selectedTemplate?.id || 'blank';
    const framework = selectedTemplate?.technologies[0] || undefined;
    const language = selectedTemplate?.technologies.includes('TypeScript') ? 'TypeScript' :
                     selectedTemplate?.technologies.includes('JavaScript') ? 'JavaScript' : undefined;
    const starterPath = selectedTemplate?.starterPath || undefined;

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          type,
          userId,
          framework,
          language,
          templateId,
          starterPath,
        }),
      });

      const result = await response.json() as { error?: string; project?: Project };

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create project');
      }

      await refreshProjects(userId);
      closeCreateModal();

      // If project was created successfully and we have the project data, navigate to it
      if (result.project) {
        window.location.href = `/?projectId=${result.project.id}${starterPath ? `&starter=${starterPath}` : ''}`;
      }
    } catch (err) {
      logger.error('Error creating project:', err);
      alert(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsLoading(false);
    }
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setCreateStep('template');
    setSelectedTemplate(null);
  };

  const handleTemplateSelect = (template: ProjectTemplate | null) => {
    setSelectedTemplate(template);
  };

  const handleContinueToDetails = () => {
    setCreateStep('details');
  };

  const handleBackToTemplates = () => {
    setCreateStep('template');
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
        const result = await response.json() as { error?: string };
        throw new Error(result.error || 'Failed to delete project');
      }
      
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (err) {
      logger.error('Error deleting project:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  const refreshProjects = async (uid: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/projects?userId=${uid}`);
      const data = await response.json() as { projects?: Project[] };

      if (response.ok && data.projects) {
        setProjects(data.projects);
      }
    } catch (err) {
      logger.error('Error refreshing projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const openProject = (project: Project) => {
    window.location.href = `/?projectId=${project.id}`;
  };

  const handleDuplicateProject = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userId) return;

    try {
      const response = await fetch('/api/projects/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceProjectId: project.id,
          newProjectName: `${project.name} (Copy)`,
          includeGit: false,
          includeGitRemotes: false,
          includeTriggers: false,
          includeEnvFiles: false,
          includeSecrets: false,
          includeDeployConfig: false,
          includeDomains: false,
        }),
      });

      const result = await response.json() as { error?: string; success?: boolean };

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to duplicate project');
      }

      await refreshProjects(userId);
    } catch (err) {
      logger.error('Error duplicating project:', err);
      alert(err instanceof Error ? err.message : 'Failed to duplicate project');
    }
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
    <div className="flex-1 p-8 bg-recoder-elements-background-depth-1 overflow-auto">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-recoder-elements-textPrimary">Projects</h1>
            <p className="text-recoder-elements-textTertiary mt-1">Manage your AI development projects</p>
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
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 i-ph:magnifying-glass text-recoder-elements-textTertiary" />
            <input
              type="text"
              placeholder="Search projects... (Ctrl+K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:outline-none focus:border-orange-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary"
                title="Clear search"
              >
                <span className="i-ph:x" />
              </button>
            )}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'updated' | 'created' | 'name')}
            className="px-4 py-2 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary focus:outline-none focus:border-orange-500"
          >
            <option value="updated">Last Updated</option>
            <option value="created">Created</option>
            <option value="name">Name</option>
          </select>
          <button
            onClick={() => userId && refreshProjects(userId)}
            disabled={isLoading}
            className="px-4 py-2 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3 disabled:opacity-50"
            title="Refresh projects"
          >
            {isLoading ? '...' : '↻'}
          </button>
        </div>

        {/* Results count */}
        {searchQuery && (
          <div className="mb-4 text-sm text-recoder-elements-textTertiary">
            Found {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''} matching "{searchQuery}"
          </div>
        )}

        {/* Projects Grid */}
        {isLoading && projects.length === 0 ? (
          <div className="text-center py-12 text-recoder-elements-textTertiary">
            Loading projects...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4 opacity-30"><div className="i-ph:folder-open" /></div>
            <h3 className="text-xl font-semibold mb-2 text-recoder-elements-textPrimary">No projects yet</h3>
            <p className="text-recoder-elements-textTertiary mb-6">Create your first project to get started</p>
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
                className="bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg p-4 hover:border-orange-500 transition-all cursor-pointer group"
                onClick={() => openProject(project)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="text-3xl">
                    <div className={`${project.type === 'web' ? 'i-ph:globe' : project.type === 'api' ? 'i-ph:lightning' : project.type === 'mobile' ? 'i-ph:device-mobile' : 'i-ph:folder'}`} />
                  </div>
                  <div className="flex items-center gap-1">
                    {project.isPrivate && (
                      <span className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded">Private</span>
                    )}
                    {/* Quick actions - visible on hover */}
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
                      <button
                        onClick={(e) => handleDuplicateProject(project, e)}
                        className="p-1 text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary transition-colors"
                        title="Duplicate project"
                      >
                        <span className="i-ph:copy" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.id); }}
                        className="p-1 text-red-400 hover:text-red-300 transition-colors"
                        title="Delete project"
                      >
                        <span className="i-ph:trash" />
                      </button>
                    </div>
                  </div>
                </div>
                <h3 className="font-semibold text-recoder-elements-textPrimary mb-1">{project.name}</h3>
                <p className="text-sm text-recoder-elements-textTertiary mb-3 line-clamp-2">
                  {project.description || 'No description'}
                </p>
                <div className="flex items-center gap-2 text-xs text-recoder-elements-textTertiary flex-wrap">
                  <span className="px-2 py-1 bg-recoder-elements-background-depth-1 rounded">{project.type || 'web'}</span>
                  {project.framework && <span className="px-2 py-1 bg-recoder-elements-background-depth-1 rounded">{project.framework}</span>}
                  {project.language && <span className="px-2 py-1 bg-recoder-elements-background-depth-1 rounded">{project.language}</span>}
                  <span className="px-2 py-1 bg-recoder-elements-background-depth-1 rounded">{project.status}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-recoder-elements-textTertiary">
                  <span title={new Date(project.updatedAt).toLocaleString()}>
                    Updated {formatRelativeTime(project.updatedAt)}
                  </span>
                  <span title={new Date(project.createdAt).toLocaleString()}>
                    Created {formatRelativeTime(project.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Modal - Multi-step with Template Selection */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeCreateModal}>
            <div
              className={`bg-recoder-elements-background-depth-1 rounded-lg border border-recoder-elements-borderColor transition-all duration-300 ${
                createStep === 'template' ? 'w-full max-w-4xl max-h-[90vh]' : 'w-full max-w-md'
              }`}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-recoder-elements-borderColor">
                <div className="flex items-center gap-4">
                  {createStep === 'details' && (
                    <button
                      onClick={handleBackToTemplates}
                      className="p-2 text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary transition-colors"
                    >
                      <div className="i-ph:arrow-left" />
                    </button>
                  )}
                  <div>
                    <h2 className="text-xl font-bold text-recoder-elements-textPrimary">
                      {createStep === 'template' ? 'Choose a Template' : 'Project Details'}
                    </h2>
                    <p className="text-sm text-recoder-elements-textTertiary mt-1">
                      {createStep === 'template'
                        ? 'Select a starter template or start from scratch'
                        : 'Configure your new project'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeCreateModal}
                  className="p-2 text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary transition-colors"
                >
                  <div className="i-ph:x text-xl" />
                </button>
              </div>

              {/* Step Indicator */}
              <div className="flex items-center gap-2 px-6 py-3 bg-recoder-elements-background-depth-2">
                <div className={`flex items-center gap-2 text-sm ${createStep === 'template' ? 'text-orange-400' : 'text-recoder-elements-textTertiary'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    createStep === 'template' ? 'bg-orange-500 text-white' : 'bg-recoder-elements-background-depth-2 text-recoder-elements-textTertiary'
                  }`}>
                    1
                  </div>
                  Template
                </div>
                <div className="w-8 h-px bg-recoder-elements-borderColor" />
                <div className={`flex items-center gap-2 text-sm ${createStep === 'details' ? 'text-orange-400' : 'text-recoder-elements-textTertiary'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    createStep === 'details' ? 'bg-orange-500 text-white' : 'bg-recoder-elements-background-depth-2 text-recoder-elements-textTertiary'
                  }`}>
                    2
                  </div>
                  Details
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 200px)' }}>
                {createStep === 'template' ? (
                  /* Step 1: Template Selection */
                  <ProjectTemplateSelector
                    onSelect={handleTemplateSelect}
                    selectedTemplate={selectedTemplate}
                  />
                ) : (
                  /* Step 2: Project Details Form */
                  <form onSubmit={handleCreateProject} id="create-project-form">
                    {/* Selected Template Summary */}
                    {selectedTemplate && (
                      <div className="mb-6 p-4 bg-recoder-elements-background-depth-2 rounded-lg border border-recoder-elements-borderColor">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                            <div className={`${selectedTemplate.icon} text-xl text-orange-400`} />
                          </div>
                          <div>
                            <h4 className="font-medium text-recoder-elements-textPrimary">{selectedTemplate.name}</h4>
                            <p className="text-xs text-recoder-elements-textTertiary">
                              {selectedTemplate.technologies.join(', ') || 'Empty project'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleBackToTemplates}
                            className="ml-auto text-sm text-orange-400 hover:text-orange-300"
                          >
                            Change
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mb-4">
                      <label className="block text-sm text-recoder-elements-textTertiary mb-1">Project Name *</label>
                      <input
                        name="name"
                        required
                        className="w-full px-3 py-2 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="My Awesome Project"
                        defaultValue={selectedTemplate?.name !== 'Blank Project' ? `My ${selectedTemplate?.name || ''} Project`.trim() : ''}
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm text-recoder-elements-textTertiary mb-1">Description</label>
                      <textarea
                        name="description"
                        rows={3}
                        className="w-full px-3 py-2 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="What are you building?"
                        defaultValue={selectedTemplate?.description || ''}
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm text-recoder-elements-textTertiary mb-1">Project Type</label>
                      <select
                        name="type"
                        className="w-full px-3 py-2 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-orange-500"
                        defaultValue={
                          selectedTemplate?.category === 'frontend' ? 'web' :
                          selectedTemplate?.category === 'backend' ? 'api' :
                          selectedTemplate?.category === 'mobile' ? 'mobile' :
                          selectedTemplate?.category === 'fullstack' ? 'web' : 'other'
                        }
                      >
                        <option value="web">Web App</option>
                        <option value="api">API / Backend</option>
                        <option value="mobile">Mobile App</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </form>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex gap-3 p-6 border-t border-recoder-elements-borderColor">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="flex-1 px-4 py-2 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-2 transition-colors"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                {createStep === 'template' ? (
                  <button
                    type="button"
                    onClick={handleContinueToDetails}
                    className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    disabled={!selectedTemplate}
                  >
                    Continue
                    <div className="i-ph:arrow-right" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    form="create-project-form"
                    className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50 transition-colors"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Creating...' : 'Create Project'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
