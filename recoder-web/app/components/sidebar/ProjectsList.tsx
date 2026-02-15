import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '~/lib/contexts/AuthContext';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('ProjectsList');

interface Project {
  id: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
  chat_count: number;
  file_count: number;
  updatedAt?: string;
}

interface ProjectsApiResponse {
  projects?: Project[];
  error?: string;
}

export function ProjectsList() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Use authenticated user ID
  const userId = user?.id ?? null;

  // Filter projects based on search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const query = searchQuery.toLowerCase();
    return projects.filter(project =>
      project.name.toLowerCase().includes(query) ||
      (project.description && project.description.toLowerCase().includes(query))
    );
  }, [projects, searchQuery]);

  useEffect(() => {
    if (userId) loadProjects();
  }, [userId]);

  useEffect(() => {
    if (showCreateModal) {
      window.dispatchEvent(new CustomEvent('modal-opened'));
    } else {
      window.dispatchEvent(new CustomEvent('modal-closed'));
    }
  }, [showCreateModal]);

  async function loadProjects() {
    if (!userId) return;
    try {
      const response = await fetch(`/api/projects?userId=${userId}`);
      const data = await response.json() as ProjectsApiResponse;
      if (data.projects) {
        setProjects(data.projects);
      }
    } catch (error) {
      logger.error('Failed to load projects:', error);
    }
  }

  function toggleProject(id: string) {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="projects-list mb-4">
      <div className="flex items-center justify-between mb-2 px-2">
        <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Projects</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-1 hover:bg-bolt-elements-background-depth-3 rounded transition-colors"
            title="Search projects"
          >
            <span className="i-ph:magnifying-glass text-bolt-elements-textTertiary text-base" />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-1 hover:bg-bolt-elements-background-depth-3 rounded transition-colors"
            title="Create project"
          >
            <span className="i-ph:plus text-bolt-elements-textTertiary text-base" />
          </button>
        </div>
      </div>

      {/* Search input */}
      {showSearch && (
        <div className="px-2 mb-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter projects..."
            className="w-full px-2 py-1 text-sm bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus:border-orange-500"
            autoFocus
          />
        </div>
      )}

      <div className="space-y-1">
        {filteredProjects.length === 0 && searchQuery && (
          <div className="px-2 py-2 text-xs text-bolt-elements-textTertiary text-center">
            No projects match "{searchQuery}"
          </div>
        )}
        {filteredProjects.map(project => (
          <div key={project.id} className="group">
            <div className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-bolt-elements-background-depth-3 rounded transition-colors">
              <button
                onClick={() => toggleProject(project.id)}
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
              >
                <span className={`text-sm ${expandedProjects.has(project.id) ? 'i-ph:caret-down' : 'i-ph:caret-right'}`} />
                <span className="text-base">{project.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-bolt-elements-textPrimary truncate">{project.name}</div>
                  <div className="text-xs text-bolt-elements-textTertiary">
                    {project.chat_count} chats · {project.file_count} files
                  </div>
                </div>
              </button>
              {/* Quick open button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.href = `/?projectId=${project.id}`;
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-bolt-elements-background-depth-2 rounded transition-all"
                title="Open project"
              >
                <span className="i-ph:arrow-square-out text-bolt-elements-textTertiary text-sm" />
              </button>
            </div>

            {expandedProjects.has(project.id) && (
              <div className="ml-6 mt-1 text-xs text-bolt-elements-textTertiary">
                {project.description || 'No description'}
              </div>
            )}
          </div>
        ))}
      </div>

      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            loadProjects();
            setShowCreateModal(false);
          }}
          userId={userId}
        />
      )}
    </div>
  );
}

function CreateProjectModal({ onClose, onCreated, userId }: { onClose: () => void; onCreated: () => void; userId: string | null }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('i-ph:folder');
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !userId) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          icon,
          userId,
        })
      });

      if (response.ok) {
        onCreated();
      } else {
        const result = await response.json() as { error?: string };
        logger.error('Failed to create project:', result.error);
        alert(result.error || 'Failed to create project');
      }
    } catch (error) {
      logger.error('Failed to create project:', error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-bolt-elements-background-depth-2 rounded-lg p-6 w-96 max-w-full" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4 text-bolt-elements-textPrimary">Create Project</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-bolt-elements-textPrimary">Icon</label>
            <input
              type="text"
              value={icon}
              onChange={e => setIcon(e.target.value)}
              className="w-full px-3 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
              placeholder="i-ph:folder"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-bolt-elements-textPrimary">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
              placeholder="My Project"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-bolt-elements-textPrimary">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
              placeholder="Optional description"
              rows={3}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="px-4 py-2 text-sm bg-orange-500 text-white rounded hover:bg-orange-500Hover disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
