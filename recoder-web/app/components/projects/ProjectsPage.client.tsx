import React, { useState, useMemo } from 'react';
import { ProjectCard } from './ProjectCard';
import { ProjectModal } from './ProjectModal';
import { SearchAndFilter } from './SearchAndFilter';
import type { Project } from '~/lib/.server/db/projects-db';

interface ProjectsPageProps {
  initialProjects: Project[];
  error: string | null;
}

export function ProjectsPage({ initialProjects, error }: ProjectsPageProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'name'>('updated');
  const [showArchived, setShowArchived] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Filter and sort projects
  const filteredProjects = useMemo(() => {
    let filtered = projects.filter(project => {
      const matchesSearch = !searchQuery || 
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (project.description && project.description.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // For now, we'll treat projects as non-archived unless we add an archived field
      const matchesArchived = !showArchived; // Show non-archived by default
      
      return matchesSearch && matchesArchived;
    });

    // Sort projects
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'updated':
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });

    return filtered;
  }, [projects, searchQuery, sortBy, showArchived]);

  const handleCreateProject = async (projectData: { name: string; description: string; icon: string; color: string }) => {
    try {
      // Get user/anonymous ID (in a real app, this would come from auth context)
      const anonymousId = localStorage.getItem('anonymousId') || crypto.randomUUID();
      localStorage.setItem('anonymousId', anonymousId);

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...projectData,
          anonymousId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create project');
      }

      const result = await response.json();
      
      // Refresh projects list
      await refreshProjects();
      setIsCreateModalOpen(false);
    } catch (error) {
      console.error('Error creating project:', error);
      // TODO: Show error toast
    }
  };

  const handleEditProject = async (projectData: { name: string; description: string; icon: string; color: string }) => {
    if (!editingProject) return;

    try {
      const anonymousId = localStorage.getItem('anonymousId');
      
      const response = await fetch(`/api/projects/${editingProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...projectData,
          anonymousId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update project');
      }

      // Refresh projects list
      await refreshProjects();
      setEditingProject(null);
    } catch (error) {
      console.error('Error updating project:', error);
      // TODO: Show error toast
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    try {
      const anonymousId = localStorage.getItem('anonymousId');
      
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anonymousId }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete project');
      }

      // Remove project from local state
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (error) {
      console.error('Error deleting project:', error);
      // TODO: Show error toast
    }
  };

  const refreshProjects = async () => {
    try {
      const anonymousId = localStorage.getItem('anonymousId');
      const url = new URL('/projects', window.location.origin);
      if (anonymousId) {
        url.searchParams.set('anonymousId', anonymousId);
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.projects) {
          setProjects(data.projects);
        }
      }
    } catch (error) {
      console.error('Error refreshing projects:', error);
    }
  };

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
    <div className="flex-1 p-8 bg-bolt-elements-background-depth-1">
      <div className="max-w-7xl mx-auto">
        {/* Header with title and new project button */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-bolt-elements-textPrimary">Projects</h1>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-bolt-elements-button-primary-background hover:bg-bolt-elements-button-primary-backgroundHover text-bolt-elements-button-primary-text rounded-lg transition-all"
          >
            <div className="i-ph:plus text-lg" />
            New Project
          </button>
        </div>

        {/* Search and filter controls */}
        <SearchAndFilter
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          onSortChange={setSortBy}
          showArchived={showArchived}
          onArchivedToggle={setShowArchived}
        />

        {/* Projects grid */}
        {filteredProjects.length === 0 ? (
          <div className="text-center py-12">
            {projects.length === 0 ? (
              <div className="text-bolt-elements-textSecondary">
                <div className="i-ph:folder-plus text-6xl mb-4 opacity-30" />
                <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
                <p className="mb-6">Create your first project to get started</p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="px-6 py-3 bg-bolt-elements-button-primary-background hover:bg-bolt-elements-button-primary-backgroundHover text-bolt-elements-button-primary-text rounded-lg transition-all"
                >
                  Create Project
                </button>
              </div>
            ) : (
              <div className="text-bolt-elements-textSecondary">
                <div className="i-ph:magnifying-glass text-4xl mb-4 opacity-30" />
                <h3 className="text-xl font-semibold mb-2">No projects found</h3>
                <p>Try adjusting your search or filters</p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProjects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                onEdit={setEditingProject}
                onDelete={handleDeleteProject}
              />
            ))}
          </div>
        )}

        {/* Create/Edit Project Modal */}
        <ProjectModal
          isOpen={isCreateModalOpen || !!editingProject}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingProject(null);
          }}
          onSubmit={editingProject ? handleEditProject : handleCreateProject}
          initialData={editingProject || undefined}
          mode={editingProject ? 'edit' : 'create'}
        />
      </div>
    </div>
  );
}
