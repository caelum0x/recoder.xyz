import React, { useState } from 'react';
import type { Project } from '~/lib/.server/db/projects-db';

interface ProjectCardProps {
  project: Project;
  onEdit: (project: Project) => void;
  onDelete: (projectId: string) => void;
}

export function ProjectCard({ project, onEdit, onDelete }: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
      Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      'day'
    );
  };

  const handleCardClick = () => {
    // Navigate to project or open chat with project context
    window.location.href = `/?projectId=${project.id}`;
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(project);
    setShowMenu(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
    setShowMenu(false);
  };

  const confirmDelete = () => {
    onDelete(project.id);
    setShowDeleteConfirm(false);
  };

  return (
    <div className="relative">
      <div
        onClick={handleCardClick}
        className="group p-6 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg hover:border-bolt-elements-borderColorActive transition-all cursor-pointer hover:bg-bolt-elements-background-depth-3"
      >
        {/* Project icon and menu button */}
        <div className="flex items-start justify-between mb-4">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
            style={{ backgroundColor: project.color || '#3b82f6' }}
          >
            {project.icon || '📁'}
          </div>
          
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary opacity-0 group-hover:opacity-100 transition-all rounded"
            >
              <div className="i-ph:dots-three-vertical text-lg" />
            </button>

            {/* Context menu */}
            {showMenu && (
              <div className="absolute right-0 top-8 w-32 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg shadow-lg z-10">
                <button
                  onClick={handleEdit}
                  className="w-full px-3 py-2 text-left text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 rounded-t-lg transition-colors flex items-center gap-2"
                >
                  <div className="i-ph:pencil text-sm" />
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 rounded-b-lg transition-colors flex items-center gap-2"
                >
                  <div className="i-ph:trash text-sm" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Project details */}
        <div className="space-y-3">
          <h3 className="font-semibold text-bolt-elements-textPrimary group-hover:text-bolt-elements-textPrimary transition-colors">
            {project.name}
          </h3>
          
          {project.description && (
            <p className="text-sm text-bolt-elements-textSecondary line-clamp-2">
              {project.description}
            </p>
          )}

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-bolt-elements-textSecondary">
            <div className="flex items-center gap-1">
              <div className="i-ph:chat-circle text-sm" />
              <span>{project.chatCount || 0} chats</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="i-ph:file text-sm" />
              <span>{project.fileCount || 0} files</span>
            </div>
          </div>

          {/* Last updated */}
          <div className="text-xs text-bolt-elements-textSecondary">
            Updated {formatDate(project.updatedAt)}
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-3">
              Delete Project
            </h3>
            <p className="text-bolt-elements-textSecondary mb-6">
              Are you sure you want to delete "{project.name}"? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close menu */}
      {showMenu && (
        <div
          className="fixed inset-0 z-5"
          onClick={() => setShowMenu(false)}
        />
      )}
    </div>
  );
}
