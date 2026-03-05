'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-provider';
import { ArrowLeft, FolderOpen, Globe, Loader2, RefreshCw } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';

interface Project {
  id: string;
  urlId?: string;
  title?: string;
  description?: string;
  updatedAt?: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/auth/signin');
      return;
    }

    if (!isPending && session) {
      void loadProjects();
    }
  }, [isPending, router, session]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/projects?limit=100', { credentials: 'include' });
      if (!response.ok) {
        setProjects([]);
        return;
      }
      const data = await response.json();
      setProjects(data.data || data.projects || []);
    } catch (error) {
      console.error('Failed to load projects:', error);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  if (isPending || loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <div className="container mx-auto px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </Link>
              <h1 className="text-4xl font-bold mb-2">Projects</h1>
              <p className="text-gray-400">Your Web IDE projects and synced workspaces.</p>
            </div>
            <button
              onClick={() => void loadProjects()}
              className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          {projects.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
              <FolderOpen className="w-16 h-16 text-gray-500 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold mb-2">No projects yet</h2>
              <p className="text-gray-400 mb-6">
                Your account does not have any Web IDE projects yet. Create one in the Web IDE and it will show up here.
              </p>
              <a
                href="https://web.recoder.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 transition-colors"
              >
                <Globe className="w-5 h-5" />
                Open Web IDE
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              {projects.map((project) => (
                <div key={project.id} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">{project.title || project.urlId || project.id}</h2>
                      {project.description ? (
                        <p className="text-gray-400 mt-2">{project.description}</p>
                      ) : null}
                    </div>
                    <div className="text-sm text-gray-500">
                      {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
