/**
 * Starters Browser Component
 * Browse and import local starter templates
 */

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('StartersBrowser');

interface Starter {
  id: string;
  name: string;
  description: string;
  framework: string;
  path: string;
}

interface StartersBrowserProps {
  onSelectStarter: (starter: Starter) => void;
  onClose: () => void;
}

export function StartersBrowser({ onSelectStarter, onClose }: StartersBrowserProps) {
  const [starters, setStarters] = useState<Starter[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFramework, setSelectedFramework] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadStarters();
  }, []);

  const loadStarters = async () => {
    try {
      const response = await fetch('/api/starters');
      const result = (await response.json()) as {
        success: boolean;
        data?: Starter[];
      };

      if (result.success && result.data) {
        setStarters(result.data);
      } else {
        toast.error('Failed to load starters');
      }
    } catch (error) {
      logger.error('Failed to load starters:', error);
      toast.error('Failed to load starters');
    } finally {
      setLoading(false);
    }
  };

  const frameworks = ['all', ...new Set(starters.map(s => s.framework))];

  const filteredStarters = starters.filter(starter => {
    const matchesFramework = selectedFramework === 'all' || starter.framework === selectedFramework;
    const matchesSearch = !searchQuery ||
      starter.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      starter.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFramework && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-bolt-elements-background-depth-1 rounded-lg shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-bolt-elements-borderColor">
          <div>
            <h2 className="text-2xl font-bold text-bolt-elements-textPrimary">
              Local Starters
            </h2>
            <p className="text-sm text-bolt-elements-textSecondary mt-1">
              Choose a pre-built starter template to begin your project
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-bolt-elements-background-depth-2 rounded-lg transition-colors"
          >
            <div className="i-ph:x text-xl text-bolt-elements-textPrimary" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-6 border-b border-bolt-elements-borderColor space-y-4">
          <input
            type="text"
            placeholder="Search starters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary placeholder-bolt-elements-textSecondary focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex flex-wrap gap-2">
            {frameworks.map((framework) => (
              <button
                key={framework}
                onClick={() => setSelectedFramework(framework)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedFramework === framework
                    ? 'bg-blue-500 text-white'
                    : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3'
                }`}
              >
                {framework}
              </button>
            ))}
          </div>
        </div>

        {/* Starters Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-bolt-elements-textSecondary">
                <div className="i-ph:spinner animate-spin text-3xl mb-2" />
                <p>Loading starters...</p>
              </div>
            </div>
          ) : filteredStarters.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-bolt-elements-textSecondary">
                <div className="i-ph:folder-open text-5xl mb-4 opacity-50" />
                <p>No starters found</p>
                <p className="text-sm mt-2">Try adjusting your filters</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredStarters.map((starter) => (
                <button
                  key={starter.id}
                  onClick={() => onSelectStarter(starter)}
                  className="group p-6 bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor hover:border-blue-500 rounded-lg transition-all text-left"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <div className="i-ph:folder-open text-2xl text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-bolt-elements-textPrimary group-hover:text-blue-400 transition-colors">
                          {starter.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400">
                            {starter.framework}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="i-ph:arrow-right text-xl text-bolt-elements-textSecondary group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                  </div>
                  <p className="text-sm text-bolt-elements-textSecondary line-clamp-2">
                    {starter.description || 'No description available'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-bolt-elements-textSecondary">
              {filteredStarters.length} starter{filteredStarters.length !== 1 ? 's' : ''} available
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-bolt-elements-button-secondary-background hover:bg-bolt-elements-button-secondary-backgroundHover text-bolt-elements-button-secondary-text rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
