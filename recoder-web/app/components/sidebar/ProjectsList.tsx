import { useState, useEffect } from 'react';
import { FolderOpen, Plus, ChevronRight, ChevronDown, MoreVertical } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
  chat_count: number;
  file_count: number;
}

export function ProjectsList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // In dev mode, use the dev user ID that exists in database
    const devUserId = 'dev-user-123';
    let id = localStorage.getItem('recoder_userId');
    
    if (!id || id !== devUserId) {
      id = devUserId;
      localStorage.setItem('recoder_userId', id);
    }
    setUserId(id);
  }, []);

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
      const data = await response.json();
      if (data.projects) {
        setProjects(data.projects);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
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
        <button
          onClick={() => setShowCreateModal(true)}
          className="p-1 hover:bg-bolt-elements-item-backgroundActive rounded transition-colors"
          title="Create project"
        >
          <Plus size={16} className="text-bolt-elements-textSecondary" />
        </button>
      </div>

      <div className="space-y-1">
        {projects.map(project => (
          <div key={project.id} className="group">
            <button
              onClick={() => toggleProject(project.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-bolt-elements-item-backgroundActive rounded transition-colors text-left"
            >
              <span className="text-sm">{expandedProjects.has(project.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
              <span className="text-base">{project.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-bolt-elements-textPrimary truncate">{project.name}</div>
                <div className="text-xs text-bolt-elements-textSecondary">
                  {project.chat_count} chats · {project.file_count} files
                </div>
              </div>
            </button>

            {expandedProjects.has(project.id) && (
              <div className="ml-6 mt-1 text-xs text-bolt-elements-textSecondary">
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
        />
      )}
    </div>
  );
}

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📁');
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('action', 'create');
      formData.append('name', name);
      formData.append('description', description);
      formData.append('icon', icon);

      const response = await fetch('/api/projects', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        onCreated();
      }
    } catch (error) {
      console.error('Failed to create project:', error);
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
              placeholder="📁"
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
              className="px-4 py-2 text-sm text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundActive rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="px-4 py-2 text-sm bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded hover:bg-bolt-elements-button-primary-backgroundHover disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
