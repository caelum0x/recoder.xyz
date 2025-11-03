import { useState } from 'react';
import { GitHubImporter } from './GitHubImporter';
import { StartersBrowser } from './StartersBrowser';
import { toast } from 'react-toastify';

interface GitHubIntegrationProps {
  onImportComplete: (data: { files: Record<string, string>; repository: any; template?: any }) => void;
}

export function GitHubIntegration({ onImportComplete }: GitHubIntegrationProps) {
  const [showImporter, setShowImporter] = useState(false);
  const [showStarters, setShowStarters] = useState(false);

  const handleCustomImport = (data: { files: Record<string, string>; repository: any }) => {
    setShowImporter(false);
    onImportComplete(data);
  };

  const handleStarterSelect = async (starter: any) => {
    try {
      toast.info(`Loading ${starter.name} starter...`);

      const response = await fetch('/api/starters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          starterId: starter.id,
          action: 'import',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to import starter');
      }

      const result = await response.json();

      if (result.success) {
        setShowStarters(false);
        onImportComplete({
          files: result.data.files,
          repository: {
            name: starter.name,
            description: starter.description,
            full_name: `local/${starter.id}`,
            html_url: `local://starters/${starter.id}`,
          },
          template: {
            id: starter.id,
            name: starter.name,
            description: starter.description,
            repo: `local:${starter.id}`,
            category: starter.framework,
            tags: [starter.framework],
            featured: false,
            isLocal: true,
          },
        });
        toast.success(`${starter.name} starter loaded!`);
      } else {
        throw new Error(result.error || 'Failed to import');
      }
    } catch (error) {
      console.error('Starter import error:', error);
      toast.error('Failed to import starter');
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowStarters(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 text-white rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl font-medium"
        >
          <div className="i-ph:folder-open text-lg" />
          <span>Browse Local Starters</span>
          <div className="text-xs opacity-80 ml-1">(45+ templates)</div>
        </button>
        <button
          onClick={() => setShowImporter(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text rounded-lg hover:bg-bolt-elements-button-secondary-backgroundHover transition-all duration-200"
        >
          <div className="i-ph:github-logo text-lg" />
          <span>Import from GitHub</span>
        </button>
      </div>

      {showImporter && (
        <GitHubImporter
          onImport={handleCustomImport}
          onClose={() => setShowImporter(false)}
        />
      )}

      {showStarters && (
        <StartersBrowser
          onSelectStarter={handleStarterSelect}
          onClose={() => setShowStarters(false)}
        />
      )}
    </>
  );
}