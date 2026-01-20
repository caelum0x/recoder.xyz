import { useState, useEffect } from 'react';
import { classNames } from '~/utils/classNames';

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string;
  featured: number;
  usage_count: number;
}

interface TemplateGalleryProps {
  onSelectTemplate: (template: Template) => void;
}

export function TemplateGallery({ onSelectTemplate }: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    const res = await fetch('/api/templates');
    const data = (await res.json()) as { templates?: Template[] };
    setTemplates(data.templates || []);
  }

  const categories = ['all', ...new Set(templates.map((t) => t.category))];

  const filteredTemplates = templates.filter((t) => {
    const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
    const matchesSearch =
      searchQuery === '' ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-bolt-elements-textPrimary mb-2">Template Gallery</h2>
        <p className="text-bolt-elements-textSecondary">
          Start with a pre-built template and customize it to your needs
        </p>
      </div>

      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-4 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={classNames(
              'px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors',
              selectedCategory === cat
                ? 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text'
                : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((template) => (
          <button
            key={template.id}
            onClick={() => onSelectTemplate(template)}
            className="text-left p-4 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg hover:border-bolt-elements-button-primary-background transition-colors"
          >
            {template.featured === 1 && (
              <div className="inline-block px-2 py-1 mb-2 text-xs bg-yellow-500/20 text-yellow-500 rounded">
                Featured
              </div>
            )}
            <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-2">
              {template.name}
            </h3>
            <p className="text-sm text-bolt-elements-textSecondary mb-3">{template.description}</p>
            <div className="flex items-center gap-2 text-xs text-bolt-elements-textTertiary">
              <span className="px-2 py-1 bg-bolt-elements-background-depth-3 rounded">
                {template.category}
              </span>
              <span>{template.usage_count} uses</span>
            </div>
          </button>
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-12 text-bolt-elements-textSecondary">
          No templates found matching your criteria
        </div>
      )}
    </div>
  );
}
