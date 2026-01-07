import { useState, useEffect } from 'react';
import type { ApiResponse } from "~/types/api-responses";

interface SaveToProjectProps {
  chatId: string;
}

export function SaveToProject({ chatId }: SaveToProjectProps) {
  const [projects, setProjects] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (showDropdown) {
      loadProjects();
    }
  }, [showDropdown]);

  async function loadProjects() {
    try {
      const response = await fetch('/api/projects');
      const data = await response.json() as { success: boolean; projects?: any[] };
      if (data.success) {
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  }

  async function saveToProject(projectId: string) {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('action', 'add-chat');
      formData.append('projectId', projectId);
      formData.append('chatId', chatId);

      const response = await fetch('/api/projects', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        setShowDropdown(false);
      }
    } catch (error) {
      console.error('Failed to save to project:', error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-black text-white hover:bg-gray-900 rounded-lg transition-colors"
        title="Save to project"
      >
        {saved ? <span className="i-ph:check text-green-500" /> : <span className="i-ph:folder-plus" />}
        {saved ? 'Saved' : 'Save to Project'}
      </button>

      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
          <div className="absolute top-full right-0 mt-2 w-64 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
            <div className="p-2">
              <div className="text-xs font-semibold text-bolt-elements-textSecondary px-2 py-1">
                Select Project
              </div>
              {projects.length === 0 ? (
                <div className="px-2 py-4 text-sm text-bolt-elements-textSecondary text-center">
                  No projects yet. Create one first.
                </div>
              ) : (
                projects.map(project => (
                  <button
                    key={project.id}
                    onClick={() => saveToProject(project.id)}
                    disabled={saving}
                    className="w-full flex items-center gap-2 px-2 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive rounded transition-colors disabled:opacity-50"
                  >
                    <span className="text-base">{project.icon}</span>
                    <span className="flex-1 text-left truncate">{project.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
