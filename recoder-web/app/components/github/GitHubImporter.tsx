import { useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';

interface GitHubImporterProps {
  onImport: (repoData: { files: Record<string, string>; repository: any }) => void;
  onClose: () => void;
}

export function GitHubImporter({ onImport, onClose }: GitHubImporterProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [subPath, setSubPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repoInfo, setRepoInfo] = useState<any>(null);

  const handleAnalyzeRepo = async () => {
    if (!repoUrl.trim()) {
      setError('Please enter a repository URL');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append('action', 'get-repo-info');
      formData.append('repoUrl', repoUrl.trim());

      const response = await fetch('/api/github', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || 'Failed to analyze repository');
      }

      const data = await response.json() as { repository: any };
      setRepoInfo(data.repository);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze repository');
      setRepoInfo(null);
    } finally {
      setLoading(false);
    }
  };

  const handleImportRepo = async () => {
    if (!repoUrl.trim()) {
      setError('Please enter a repository URL');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append('action', 'clone-repo');
      formData.append('repoUrl', repoUrl.trim());
      if (subPath.trim()) {
        formData.append('path', subPath.trim());
      }

      const response = await fetch('/api/github', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || 'Failed to import repository');
      }

      const data = await response.json() as { files: Record<string, string>; repository: any };
      onImport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import repository');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        className="rounded-lg shadow-xl w-full max-w-2xl"
        style={{ backgroundColor: 'var(--bolt-elements-bg-depth-2)', border: '1px solid var(--bolt-elements-borderColor)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-6"
          style={{ borderBottom: '1px solid var(--bolt-elements-borderColor)' }}
        >
          <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">
            Import from GitHub
          </h2>
          <IconButton onClick={onClose}>
            <div className="i-ph:x text-lg" />
          </IconButton>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="space-y-4">
            {/* Repository URL */}
            <div>
              <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                Repository URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://github.com/username/repository"
                  value={repoUrl}
                  onChange={(e) => {
                    setRepoUrl(e.target.value);
                    setRepoInfo(null);
                    setError(null);
                  }}
                  className="flex-1 px-3 py-2 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  style={{
                    backgroundColor: 'var(--bolt-elements-bg-depth-2)',
                    border: '1px solid var(--bolt-elements-borderColor)',
                    color: 'var(--bolt-elements-textPrimary)',
                  }}
                />
                <button
                  onClick={handleAnalyzeRepo}
                  disabled={loading || !repoUrl.trim()}
                  className="px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-80 bg-blue-600 text-white"
                >
                  {loading ? 'Analyzing...' : 'Analyze'}
                </button>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--bolt-elements-textTertiary)' }}>
                Enter a public GitHub repository URL
              </p>
            </div>

            {/* Sub-path (optional) */}
            <div>
              <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                Sub-path (optional)
              </label>
              <input
                type="text"
                placeholder="examples/basic-app"
                value={subPath}
                onChange={(e) => setSubPath(e.target.value)}
                className="w-full px-3 py-2 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                style={{
                  backgroundColor: 'var(--bolt-elements-bg-depth-2)',
                  border: '1px solid var(--bolt-elements-borderColor)',
                  color: 'var(--bolt-elements-textPrimary)',
                }}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--bolt-elements-textTertiary)' }}>
                Import only files from a specific directory
              </p>
            </div>

            {/* Repository Info */}
            {repoInfo && (
              <div
                className="rounded-lg p-4"
                style={{ backgroundColor: 'var(--bolt-elements-bg-depth-2)', border: '1px solid var(--bolt-elements-borderColor)' }}
              >
                <h3 className="font-semibold text-bolt-elements-textPrimary mb-2">
                  {repoInfo.name}
                </h3>
                {repoInfo.description && (
                  <p className="text-sm mb-3" style={{ color: 'var(--bolt-elements-textSecondary)' }}>
                    {repoInfo.description}
                  </p>
                )}
                <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--bolt-elements-textTertiary)' }}>
                  {repoInfo.language && (
                    <span className="flex items-center gap-1">
                      <div className="i-ph:code text-sm" />
                      {repoInfo.language}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <div className="i-ph:star text-sm" />
                    {repoInfo.stars.toLocaleString()}
                  </span>
                  {repoInfo.topics && repoInfo.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {repoInfo.topics.slice(0, 3).map((topic: string) => (
                        <span
                          key={topic}
                          className="px-2 py-0.5 rounded text-xs"
                          style={{ backgroundColor: 'var(--bolt-elements-bg-depth-3)' }}
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div
                className="rounded-lg p-3"
                style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.3)' }}
              >
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 p-6"
          style={{ borderTop: '1px solid var(--bolt-elements-borderColor)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 transition-colors text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
          >
            Cancel
          </button>
          <button
            onClick={handleImportRepo}
            disabled={loading || !repoUrl.trim()}
            className="px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-80 bg-blue-600 text-white"
          >
            {loading ? 'Importing...' : 'Import Repository'}
          </button>
        </div>
      </div>
    </div>
  );
}