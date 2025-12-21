import { useState, useEffect } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import type { TemplateRepo } from '~/lib/.server/github/types';

interface TemplateBrowserProps {
  onSelectTemplate: (template: TemplateRepo) => void;
  onClose: () => void;
}

export function TemplateBrowser({ onSelectTemplate, onClose }: TemplateBrowserProps) {
  const [templates, setTemplates] = useState<TemplateRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [
    { id: 'nextjs', name: 'Next.js', icon: 'i-logos:nextjs-icon' },
    { id: 'react', name: 'React', icon: 'i-logos:react' },
    { id: 'vue', name: 'Vue', icon: 'i-logos:vue' },
    { id: 'angular', name: 'Angular', icon: 'i-logos:angular-icon' },
    { id: 'svelte', name: 'Svelte', icon: 'i-logos:svelte-icon' },
    { id: 'astro', name: 'Astro', icon: 'i-logos:astro-icon' },
    { id: 'node', name: 'Node.js', icon: 'i-logos:nodejs-icon' },
    { id: 'vanilla', name: 'Vanilla JS', icon: 'i-logos:javascript' },
    { id: 'mobile', name: 'Mobile', icon: 'i-ph:device-mobile' },
    { id: 'other', name: 'Other', icon: 'i-ph:code' }
  ];

  useEffect(() => {
    loadTemplates();
  }, [selectedCategory, searchQuery]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append('action', 'get-templates');
      if (selectedCategory) formData.append('category', selectedCategory);
      if (searchQuery) formData.append('query', searchQuery);

      const response = await fetch('/api/github', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to load templates');
      }

      const data = await response.json() as { templates?: TemplateRepo[] };
      setTemplates(data.templates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-bolt-elements-background-depth-1 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-bolt-elements-borderColor">
          <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">
            Browse Templates
          </h2>
          <IconButton onClick={onClose}>
            <div className="i-ph:x text-lg" />
          </IconButton>
        </div>

        {/* Search and Filters */}
        <div className="p-6 border-b border-bolt-elements-borderColor">
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:ring-2 focus:ring-bolt-elements-focus focus:border-transparent"
              />
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                selectedCategory === null
                  ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                  : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundActive'
              }`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                  selectedCategory === category.id
                    ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                    : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundActive'
                }`}
              >
                <div className={`${category.icon} text-sm`} />
                {category.name}
              </button>
            ))}
          </div>
        </div>

        {/* Template Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-bolt-elements-textSecondary">Loading templates...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-red-400">{error}</div>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-bolt-elements-textSecondary">No templates found</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onSelect={() => onSelectTemplate(template)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface TemplateCardProps {
  template: TemplateRepo;
  onSelect: () => void;
}

function TemplateCard({ template, onSelect }: TemplateCardProps) {
  return (
    <div
      className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg p-4 hover:border-bolt-elements-focus transition-colors cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-bolt-elements-textPrimary text-sm">
          {template.name}
        </h3>
        <div className="flex gap-1">
          {template.repo.startsWith('local:') && (
            <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
              Local
            </span>
          )}
          {template.featured && (
            <span className="bg-yellow-500 text-black text-xs px-2 py-0.5 rounded-full">
              Featured
            </span>
          )}
        </div>
      </div>

      <p className="text-bolt-elements-textSecondary text-xs mb-3 line-clamp-2">
        {template.description}
      </p>

      <div className="flex flex-wrap gap-1 mb-3">
        {template.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary text-xs px-2 py-0.5 rounded"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-bolt-elements-textTertiary text-xs capitalize">
          {template.category}
        </span>
        <button className="text-bolt-elements-textPrimary hover:text-bolt-elements-focus transition-colors">
          <div className="i-ph:arrow-right text-sm" />
        </button>
      </div>
    </div>
  );
}