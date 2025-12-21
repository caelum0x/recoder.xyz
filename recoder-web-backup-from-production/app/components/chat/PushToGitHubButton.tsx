import { useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';

interface PushResponse {
  repoUrl?: string;
  repoName?: string;
  error?: string;
}

interface PushToGitHubButtonProps {
  projectId?: string;
  className?: string;
}

export function PushToGitHubButton({ projectId, className }: PushToGitHubButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [repoName, setRepoName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);

  const handlePush = async () => {
    if (!projectId) {
      alert('No project selected');
      return;
    }

    if (!repoName.trim()) {
      alert('Repository name is required');
      return;
    }

    setIsPushing(true);

    try {
      const githubToken = localStorage.getItem('github_token');
      
      if (!githubToken) {
        alert('Please connect your GitHub account first');
        setIsOpen(false);
        return;
      }

      const response = await fetch(`/api/project/${projectId}/push-github`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${githubToken}`,
        },
        body: JSON.stringify({
          repoName: repoName.trim(),
          description: description.trim(),
          isPrivate,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as PushResponse;
        throw new Error(errorData.error || 'Push failed');
      }

      const data = await response.json() as PushResponse;
      
      alert(`Successfully pushed to ${data.repoName}!`);
      if (data.repoUrl) window.open(data.repoUrl, '_blank');
      
      setIsOpen(false);
      setRepoName('');
      setDescription('');
    } catch (error) {
      console.error('Push error:', error);
      alert(error instanceof Error ? error.message : 'Failed to push to GitHub');
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <>
      <IconButton
        icon="i-ph:git-branch"
        title="Push to GitHub"
        onClick={() => setIsOpen(true)}
        disabled={!projectId}
        className={className}
      />

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bolt-elements-background-depth-2 rounded-lg p-6 w-full max-w-md border border-bolt-elements-borderColor">
            <h2 className="text-xl font-semibold mb-4 text-bolt-elements-textPrimary">Push to GitHub</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-bolt-elements-textSecondary">Repository Name *</label>
                <input
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="my-awesome-project"
                  className="w-full px-3 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
                  disabled={isPushing}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-bolt-elements-textSecondary">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Project description..."
                  rows={3}
                  className="w-full px-3 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
                  disabled={isPushing}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="private-repo"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="w-4 h-4"
                  disabled={isPushing}
                />
                <label htmlFor="private-repo" className="text-sm text-bolt-elements-textSecondary">Private repository</label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setIsOpen(false)}
                disabled={isPushing}
                className="flex-1 px-4 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePush}
                disabled={isPushing || !repoName.trim()}
                className="flex-1 px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded hover:bg-bolt-elements-button-primary-backgroundHover disabled:opacity-50"
              >
                {isPushing ? 'Pushing...' : 'Create & Push'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
