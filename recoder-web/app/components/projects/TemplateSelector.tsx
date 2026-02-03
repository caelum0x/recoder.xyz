/**
 * TemplateSelector Component
 * Grid-based template selection UI with preview and filtering
 * Uses nanostores for state management (templates store)
 *
 * NOTE: This component is NOT currently used in the application.
 * The actively used template selector is `ProjectTemplateSelector` in
 * `./ProjectTemplateSelector.tsx`, which is imported by `ProjectsPage.client.tsx`.
 *
 * This component uses a more sophisticated store-driven architecture
 * (nanostores + project-templates service) and could replace
 * ProjectTemplateSelector in the future, but is not wired up yet.
 */

import React, { useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import {
  availableTemplates,
  selectedTemplate,
  customTemplates,
  templateFilter,
  filteredTemplates,
  popularTemplates,
  categoryCounts,
  isFilterActive,
  selectTemplate,
  clearSelectedTemplate,
  setFilterQuery,
  setFilterCategory,
  resetFilters,
  initializeTemplatesStore,
  getRecentTemplateObjects,
  recentTemplates,
} from '~/lib/stores/templates';
import {
  TEMPLATE_CATEGORIES,
  getDifficultyColor,
  type ProjectTemplate,
  type TemplateCategory,
} from '~/lib/services/project-templates';

interface TemplateSelectorProps {
  /** Callback when template is selected */
  onSelect?: (template: ProjectTemplate | null) => void;
  /** Additional class name */
  className?: string;
  /** Whether to show the selected template summary */
  showSelectedSummary?: boolean;
  /** Whether to show the search bar */
  showSearch?: boolean;
  /** Whether to show category filter tabs */
  showCategories?: boolean;
  /** Whether to show popular templates section */
  showPopular?: boolean;
  /** Whether to show recent templates section */
  showRecent?: boolean;
  /** Maximum height for the templates grid (e.g., '50vh') */
  maxHeight?: string;
}

/**
 * TemplateCard - Individual template card in the grid
 */
function TemplateCard({
  template,
  isSelected,
  onClick,
  onToggleExpand,
  isExpanded,
}: {
  template: ProjectTemplate;
  isSelected: boolean;
  onClick: () => void;
  onToggleExpand: (e: React.MouseEvent) => void;
  isExpanded: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative p-4 rounded-lg border cursor-pointer transition-all group ${
        isSelected
          ? 'bg-orange-500/10 border-orange-500'
          : 'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColor hover:border-orange-500/50 hover:bg-bolt-elements-background-depth-3'
      }`}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-3 right-3 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
          <div className="i-ph:check text-white text-sm" />
        </div>
      )}

      {/* Popular badge */}
      {template.isPopular && !isSelected && (
        <div className="absolute top-3 right-3 px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded">
          Popular
        </div>
      )}

      {/* Template Icon and Name */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            template.id === 'blank'
              ? 'bg-bolt-elements-background-depth-1 border-2 border-dashed border-bolt-elements-borderColor'
              : 'bg-gradient-to-br from-orange-500/20 to-orange-600/20'
          }`}
        >
          <div
            className={`${template.icon} text-xl ${
              template.id === 'blank' ? 'text-bolt-elements-textSecondary' : 'text-orange-400'
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-bolt-elements-textPrimary truncate">{template.name}</h3>
          <span
            className={`inline-block text-xs px-2 py-0.5 rounded mt-1 ${getDifficultyColor(template.difficulty)}`}
          >
            {template.difficulty}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-bolt-elements-textSecondary mb-3 line-clamp-2">{template.description}</p>

      {/* Technologies */}
      {template.technologies.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {template.technologies.slice(0, 4).map((tech) => (
            <span
              key={tech}
              className="px-2 py-0.5 bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary text-xs rounded"
            >
              {tech}
            </span>
          ))}
          {template.technologies.length > 4 && (
            <span className="px-2 py-0.5 text-bolt-elements-textSecondary text-xs">
              +{template.technologies.length - 4} more
            </span>
          )}
        </div>
      )}

      {/* Expand/Collapse for Features */}
      <button
        onClick={onToggleExpand}
        className="flex items-center gap-1 text-xs text-bolt-elements-textSecondary hover:text-orange-400 transition-colors"
      >
        <div className={`i-ph:caret-${isExpanded ? 'up' : 'down'}`} />
        {isExpanded ? 'Hide features' : 'Show features'}
      </button>

      {/* Expanded Features */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-bolt-elements-borderColor">
          <h4 className="text-xs font-medium text-bolt-elements-textSecondary mb-2">Features:</h4>
          <ul className="space-y-1">
            {template.features.map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-xs text-bolt-elements-textPrimary">
                <div className="i-ph:check-circle text-green-400" />
                {feature}
              </li>
            ))}
          </ul>
          {template.recommendedFor && template.recommendedFor.length > 0 && (
            <>
              <h4 className="text-xs font-medium text-bolt-elements-textSecondary mt-3 mb-2">
                Recommended for:
              </h4>
              <ul className="space-y-1">
                {template.recommendedFor.map((useCase, index) => (
                  <li key={index} className="flex items-center gap-2 text-xs text-bolt-elements-textPrimary">
                    <div className="i-ph:star text-orange-400" />
                    {useCase}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * TemplateSelector - Main component
 */
export function TemplateSelector({
  onSelect,
  className = '',
  showSelectedSummary = true,
  showSearch = true,
  showCategories = true,
  showPopular = true,
  showRecent = true,
  maxHeight = '50vh',
}: TemplateSelectorProps) {
  // Store subscriptions
  const templates = useStore(filteredTemplates);
  const selected = useStore(selectedTemplate);
  const filter = useStore(templateFilter);
  const popular = useStore(popularTemplates);
  const counts = useStore(categoryCounts);
  const filterActive = useStore(isFilterActive);
  const recent = useStore(recentTemplates);

  // Local state for expanded cards
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  // Initialize store on mount
  useEffect(() => {
    initializeTemplatesStore();
  }, []);

  // Sync with external onSelect callback
  useEffect(() => {
    onSelect?.(selected);
  }, [selected, onSelect]);

  // Get recent template objects
  const recentTemplateObjects = useMemo(() => getRecentTemplateObjects(), [recent]);

  // Handlers
  const handleTemplateClick = (template: ProjectTemplate) => {
    if (selected?.id === template.id) {
      clearSelectedTemplate();
    } else {
      selectTemplate(template);
    }
  };

  const handleToggleExpand = (templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedId(expandedId === templateId ? null : templateId);
  };

  const handleClearSelection = () => {
    clearSelectedTemplate();
  };

  return (
    <div className={className}>
      {/* Search and Category Filter */}
      <div className="mb-6 space-y-4">
        {/* Search */}
        {showSearch && (
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <div className="i-ph:magnifying-glass text-bolt-elements-textSecondary" />
            </div>
            <input
              type="text"
              placeholder="Search templates by name or technology..."
              value={filter.query}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary placeholder-bolt-elements-textSecondary focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
            {filter.query && (
              <button
                onClick={() => setFilterQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
              >
                <div className="i-ph:x" />
              </button>
            )}
          </div>
        )}

        {/* Category Tabs */}
        {showCategories && (
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_CATEGORIES.map((category) => (
              <button
                key={category.id}
                onClick={() => setFilterCategory(category.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                  filter.category === category.id
                    ? 'bg-orange-500 text-white'
                    : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3'
                }`}
              >
                <div className={category.icon} />
                {category.name}
                <span className="text-xs opacity-70">({counts[category.id]})</span>
              </button>
            ))}
          </div>
        )}

        {/* Reset filters button */}
        {filterActive && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300 transition-colors"
          >
            <div className="i-ph:x-circle" />
            Clear filters
          </button>
        )}
      </div>

      {/* Recent Templates Section */}
      {showRecent && recentTemplateObjects.length > 0 && !filterActive && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-bolt-elements-textSecondary mb-3 flex items-center gap-2">
            <div className="i-ph:clock-counter-clockwise text-blue-400" />
            Recently Used
          </h3>
          <div className="flex flex-wrap gap-2">
            {recentTemplateObjects.map((template) => (
              <button
                key={template.id}
                onClick={() => handleTemplateClick(template)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${
                  selected?.id === template.id
                    ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                    : 'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:border-orange-500/50'
                }`}
              >
                <div className={template.icon} />
                {template.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Popular Templates Section */}
      {showPopular && !filter.query && filter.category === 'all' && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-bolt-elements-textSecondary mb-3 flex items-center gap-2">
            <div className="i-ph:star-fill text-orange-400" />
            Popular Templates
          </h3>
          <div className="flex flex-wrap gap-2">
            {popular.map((template) => (
              <button
                key={template.id}
                onClick={() => handleTemplateClick(template)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${
                  selected?.id === template.id
                    ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                    : 'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:border-orange-500/50'
                }`}
              >
                <div className={template.icon} />
                {template.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results Count */}
      {filterActive && (
        <div className="mb-4 text-sm text-bolt-elements-textSecondary">
          Found {templates.length} template{templates.length !== 1 ? 's' : ''}
          {filter.query && ` matching "${filter.query}"`}
        </div>
      )}

      {/* Templates Grid */}
      {templates.length > 0 ? (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-2"
          style={{ maxHeight }}
        >
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isSelected={selected?.id === template.id}
              onClick={() => handleTemplateClick(template)}
              onToggleExpand={(e) => handleToggleExpand(template.id, e)}
              isExpanded={expandedId === template.id}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="i-ph:folder-open text-4xl text-bolt-elements-textSecondary mb-4 mx-auto" />
          <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">No templates found</h3>
          <p className="text-bolt-elements-textSecondary">Try adjusting your search or category filter</p>
          {filterActive && (
            <button
              onClick={resetFilters}
              className="mt-4 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Selected Template Summary */}
      {showSelectedSummary && selected && (
        <div className="mt-6 p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <div className={`${selected.icon} text-2xl text-orange-400`} />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-bolt-elements-textPrimary">Selected: {selected.name}</h3>
              <p className="text-sm text-bolt-elements-textSecondary">
                {selected.technologies.join(' + ') || 'Empty project'}
              </p>
            </div>
            <button
              onClick={handleClearSelection}
              className="p-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
              title="Clear selection"
            >
              <div className="i-ph:x" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Export for convenience
export { selectTemplate, clearSelectedTemplate, selectedTemplate };
export type { ProjectTemplate };
