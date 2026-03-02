import { useState, useEffect } from 'react';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('ProjectGallery');

interface Project {
  id: string;
  username: string;
  project_name: string;
  description: string;
  likes_count: number;
  views_count: number;
  created_at: string;
}

export function ProjectGallery() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const res = await fetch('/api/projects');
      const data = (await res.json()) as { projects?: Project[] };
      setProjects(data.projects || []);
    } catch (error) {
      logger.error('Failed to load projects:', error);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="text-center py-8 text-recoder-elements-textSecondary">
        Loading projects...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-recoder-elements-textPrimary">
          Community Projects
        </h3>
        <span className="text-sm text-recoder-elements-textSecondary">
          {projects.length} projects
        </span>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12 text-recoder-elements-textSecondary">
          No projects shared yet. Be the first to share!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="p-4 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg hover:border-recoder-elements-button-primary-background transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-recoder-elements-textPrimary">
                    {project.project_name}
                  </h4>
                  <p className="text-sm text-recoder-elements-textSecondary">
                    by @{project.username}
                  </p>
                </div>
              </div>

              {project.description && (
                <p className="text-sm text-recoder-elements-textSecondary mb-3 line-clamp-2">
                  {project.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-recoder-elements-textTertiary">
                <div className="flex items-center gap-1">
                  <div className="i-ph:heart" />
                  <span>{project.likes_count}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="i-ph:eye" />
                  <span>{project.views_count}</span>
                </div>
                <div className="ml-auto">
                  {new Date(project.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
