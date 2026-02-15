/**
 * PromptLibraryPanel — Manage reusable prompts.
 * Create, edit, delete prompts. Reference them in chat via @prompt:id.
 */

import { useState, useCallback } from 'react';
import { usePrompts, type Prompt } from '~/lib/hooks/usePrompts';

export function PromptLibraryPanel() {
  const {
    prompts,
    createPrompt,
    updatePrompt,
    deletePrompt,
    isLoading,
  } = usePrompts();

  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formContent, setFormContent] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setFormTitle('');
    setFormDescription('');
    setFormContent('');
    setEditingPrompt(null);
    setIsCreating(false);
  }, []);

  const startCreate = useCallback(() => {
    resetForm();
    setIsCreating(true);
  }, [resetForm]);

  const startEdit = useCallback((prompt: Prompt) => {
    setFormTitle(prompt.title);
    setFormDescription(prompt.description);
    setFormContent(prompt.content);
    setEditingPrompt(prompt);
    setIsCreating(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formTitle.trim() || !formContent.trim()) return;

    if (editingPrompt) {
      await updatePrompt(editingPrompt.id, {
        title: formTitle,
        description: formDescription,
        content: formContent,
      });
    } else {
      await createPrompt(formTitle, formDescription, formContent);
    }
    resetForm();
  }, [formTitle, formDescription, formContent, editingPrompt, createPrompt, updatePrompt, resetForm]);

  const handleDelete = useCallback(async (id: string) => {
    await deletePrompt(id);
    setDeleteConfirm(null);
    if (editingPrompt?.id === id) {
      resetForm();
    }
  }, [deletePrompt, editingPrompt, resetForm]);

  const showForm = isCreating || editingPrompt;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bolt-elements-borderColor">
        <div>
          <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Prompt Library</h3>
          <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
            Save reusable prompts. Use @prompt in chat to reference them.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={startCreate}
            className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
          >
            + New Prompt
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="px-4 py-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-bolt-elements-textSecondary mb-1">Title</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. React Component Generator"
                className="w-full px-3 py-1.5 text-sm bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-bolt-elements-textSecondary mb-1">Description (optional)</label>
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Brief description of what this prompt does"
                className="w-full px-3 py-1.5 text-sm bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-bolt-elements-textSecondary mb-1">Content</label>
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="The prompt content that will be injected when referenced..."
                rows={6}
                className="w-full px-3 py-2 text-sm bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus:border-purple-500 resize-y min-h-[100px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={!formTitle.trim() || !formContent.trim() || isLoading}
                className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-md transition-colors"
              >
                {editingPrompt ? 'Update' : 'Create'}
              </button>
              <button
                onClick={resetForm}
                className="px-3 py-1.5 text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt List */}
      <div className="flex-1 overflow-auto">
        {prompts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="i-ph:note-pencil text-4xl text-bolt-elements-textTertiary mb-3" />
            <p className="text-sm text-bolt-elements-textSecondary mb-1">No prompts yet</p>
            <p className="text-xs text-bolt-elements-textTertiary mb-3">
              Create reusable prompts to speed up your workflow.
            </p>
            {!showForm && (
              <button
                onClick={startCreate}
                className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
              >
                Create your first prompt
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-bolt-elements-borderColor">
            {prompts.map((prompt) => (
              <div
                key={prompt.id}
                className={`px-4 py-3 hover:bg-bolt-elements-background-depth-3 transition-colors ${
                  editingPrompt?.id === prompt.id ? 'bg-bolt-elements-background-depth-3' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-bolt-elements-textPrimary truncate">
                        {prompt.title}
                      </h4>
                      <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded font-mono shrink-0">
                        @prompt
                      </span>
                    </div>
                    {prompt.description && (
                      <p className="text-xs text-bolt-elements-textSecondary mt-0.5 truncate">
                        {prompt.description}
                      </p>
                    )}
                    <p className="text-xs text-bolt-elements-textTertiary mt-1 line-clamp-2 font-mono">
                      {prompt.content.slice(0, 150)}{prompt.content.length > 150 ? '...' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(prompt)}
                      className="p-1 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
                      title="Edit"
                    >
                      <div className="i-ph:pencil-simple text-sm" />
                    </button>
                    {deleteConfirm === prompt.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(prompt.id)}
                          className="px-2 py-0.5 text-[10px] bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-0.5 text-[10px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(prompt.id)}
                        className="p-1 text-bolt-elements-textSecondary hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <div className="i-ph:trash text-sm" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
