import { useState, useEffect } from 'react';
import type { TemplateRepo } from '~/lib/.server/github/types';

interface TemplateQuickStartProps {
  onSelectTemplate: (template: TemplateRepo) => void;
}

export function TemplateQuickStart({ onSelectTemplate }: TemplateQuickStartProps) {
  const [templates, setTemplates] = useState<TemplateRepo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeaturedTemplates();
  }, []);

  const loadFeaturedTemplates = async () => {
    try {
      const response = await fetch('/api/github');
      if (response.ok) {
        const data = await response.json() as { templates?: TemplateRepo[] };
        // Show only featured local templates for quick start
        const featuredTemplates = (data.templates || [])
          .filter((t: TemplateRepo) => t.featured && t.repo.startsWith('local:'))
          .slice(0, 6); // Limit to 6 for clean layout
        setTemplates(featuredTemplates);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="text-bolt-elements-textSecondary">Loading templates...</div>
      </div>
    );
  }

  if (templates.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-bolt-elements-textPrimary mb-4">
        Quick Start Templates
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onSelect={() => onSelectTemplate(template)}
          />
        ))}
      </div>
    </div>
  );
}

interface TemplateCardProps {
  template: TemplateRepo;
  onSelect: () => void;
}

function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      'nextjs': 'i-logos:nextjs-icon',
      'react': 'i-logos:react',
      'vue': 'i-logos:vue',
      'angular': 'i-logos:angular-icon',
      'svelte': 'i-logos:svelte-icon',
      'node': 'i-logos:nodejs-icon',
      'vanilla': 'i-logos:javascript',
      'astro': 'i-logos:astro-icon'
    };
    return icons[category] || 'i-ph:code';
  };

  return (
    <button
      onClick={onSelect}
      className="text-left bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg p-4 hover:border-bolt-elements-focus hover:bg-bolt-elements-background-depth-3 transition-all duration-200 group"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`${getCategoryIcon(template.category)} text-xl`} />
        <h3 className="font-medium text-bolt-elements-textPrimary group-hover:text-bolt-elements-focus transition-colors">
          {template.name}
        </h3>
      </div>

      <p className="text-sm text-bolt-elements-textSecondary mb-3 line-clamp-2">
        {template.description}
      </p>

      <div className="flex flex-wrap gap-1">
        {template.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="text-xs bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary px-2 py-0.5 rounded"
          >
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}