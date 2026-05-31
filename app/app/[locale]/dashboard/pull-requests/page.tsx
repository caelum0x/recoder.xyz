/**
 * Dashboard — Pull Requests
 *
 * Surfaces GitHub pull requests as first-class artifacts inside the dashboard.
 * Lets the user pick one of their projects (Spaces) and manage its PRs via the
 * PullRequestsPanel, which consumes the existing docker-backend git routes.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { GitPullRequest, Loader2 } from 'lucide-react';
import { PullRequestsPanel } from '@/components/dashboard/PullRequestsPanel';

interface DashboardProject {
  id: string;
  urlId?: string;
  title?: string;
  description?: string;
}

export default function DashboardPullRequestsPage() {
  const [projects, setProjects] = useState<DashboardProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/projects?limit=100', { credentials: 'include' });
        if (!response.ok) {
          if (active) setProjects([]);
          return;
        }
        const data = await response.json();
        const list: DashboardProject[] = data.data || data.projects || [];
        if (active) {
          setProjects(list);
          setSelectedId((prev) => prev ?? list[0]?.id ?? null);
        }
      } catch (error) {
        console.error('Failed to load projects:', error);
        if (active) setProjects([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? null,
    [projects, selectedId]
  );

  const projectLabel = selectedProject
    ? selectedProject.title || selectedProject.urlId || selectedProject.id
    : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mb-2 flex items-center gap-2 text-3xl font-bold text-white">
              <GitPullRequest className="h-7 w-7 text-purple-400" />
              Pull Requests
            </h1>
            <p className="text-gray-400">
              Open and track GitHub pull requests for your projects.
            </p>
          </div>

          {projects.length > 0 ? (
            <div>
              <label className="mb-1 block text-xs text-gray-400">Project</label>
              <select
                value={selectedId ?? ''}
                onChange={(event) => setSelectedId(event.target.value || null)}
                className="min-w-56 rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-2 text-sm text-white focus:border-purple-500/50 focus:outline-none"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title || project.urlId || project.id}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 p-10 text-center text-gray-400">
            No projects found. Create a project first, then open pull requests for it here.
          </div>
        ) : (
          <PullRequestsPanel projectId={selectedId} projectLabel={projectLabel} />
        )}
      </div>
    </div>
  );
}
