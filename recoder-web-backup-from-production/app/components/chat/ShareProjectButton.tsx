import { useState } from 'react';
import { classNames } from '~/utils/classNames';

interface ShareProjectButtonProps {
  username: string;
  onShare?: () => void;
}

export function ShareProjectButton({ username, onShare }: ShareProjectButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);

  async function handleShare() {
    if (!projectName.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          projectName: projectName.trim(),
          description: description.trim(),
          isPublic,
        }),
      });

      if (res.ok) {
        setIsOpen(false);
        setProjectName('');
        setDescription('');
        onShare?.();
      }
    } catch (error) {
      console.error('Failed to share project:', error);
    }
    setLoading(false);
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-lg hover:bg-bolt-elements-button-primary-backgroundHover"
      >
        <div className="i-ph:share-network" />
        <span>Share Project</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setIsOpen(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-4">
                Share Your Project
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                    Project Name
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="my-awesome-project"
                    className="w-full px-3 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does your project do?"
                    rows={3}
                    className="w-full px-3 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-bolt-elements-textPrimary">
                    Make public (visible to community)
                  </span>
                </label>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setIsOpen(false)}
                  className="flex-1 px-4 py-2 border border-bolt-elements-borderColor rounded-lg hover:bg-bolt-elements-background-depth-3"
                >
                  Cancel
                </button>
                <button
                  onClick={handleShare}
                  disabled={!projectName.trim() || loading}
                  className="flex-1 px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-lg hover:bg-bolt-elements-button-primary-backgroundHover disabled:opacity-50"
                >
                  {loading ? 'Sharing...' : 'Share'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
