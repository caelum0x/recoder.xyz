/**
 * Templates Store
 * Nanostores-based state management for project templates
 *
 * Stores:
 * - availableTemplates: All built-in templates
 * - selectedTemplate: Currently selected template for new project
 * - customTemplates: User-created custom templates
 * - templateFilter: Current filter/search state
 */

import { atom, map, computed } from 'nanostores';
import {
  PROJECT_TEMPLATES,
  TEMPLATE_CATEGORIES,
  type ProjectTemplate,
  type TemplateCategory,
  type TemplateDifficulty,
  searchTemplates,
  filterTemplates,
  getPopularTemplates,
} from '~/lib/services/project-templates';

// ==================== STORES ====================

/**
 * All available built-in templates (read-only computed)
 */
export const availableTemplates = atom<ProjectTemplate[]>(PROJECT_TEMPLATES);

/**
 * Currently selected template for creating a new project
 */
export const selectedTemplate = atom<ProjectTemplate | null>(null);

/**
 * User-created custom templates
 * Stored in localStorage and synced across sessions
 */
export const customTemplates = atom<ProjectTemplate[]>([]);

/**
 * Template filter state
 */
export interface TemplateFilterState {
  query: string;
  category: TemplateCategory;
  difficulty: TemplateDifficulty | null;
  showPopularOnly: boolean;
}

export const templateFilter = map<TemplateFilterState>({
  query: '',
  category: 'all',
  difficulty: null,
  showPopularOnly: false,
});

/**
 * Recently used templates (stored in localStorage)
 */
export const recentTemplates = atom<string[]>([]);

/**
 * Template categories
 */
export const categories = atom(TEMPLATE_CATEGORIES);

// ==================== COMPUTED STORES ====================

/**
 * Filtered templates based on current filter state
 */
export const filteredTemplates = computed(
  [availableTemplates, customTemplates, templateFilter],
  (available, custom, filter) => {
    const allTemplates = [...available, ...custom];

    return filterTemplates({
      category: filter.category,
      difficulty: filter.difficulty ?? undefined,
      query: filter.query,
      popularOnly: filter.showPopularOnly,
    });
  }
);

/**
 * Popular templates (quick access)
 */
export const popularTemplates = computed(availableTemplates, (templates) => {
  return templates.filter(t => t.isPopular);
});

/**
 * Templates grouped by category
 */
export const templatesByCategory = computed(
  [availableTemplates, customTemplates],
  (available, custom) => {
    const allTemplates = [...available, ...custom];
    const grouped = new Map<TemplateCategory, ProjectTemplate[]>();

    TEMPLATE_CATEGORIES.forEach(cat => {
      if (cat.id === 'all') {
        grouped.set('all', allTemplates);
      } else {
        grouped.set(cat.id, allTemplates.filter(t => t.category === cat.id));
      }
    });

    return grouped;
  }
);

/**
 * Count of templates per category
 */
export const categoryCounts = computed(templatesByCategory, (grouped) => {
  const counts: Record<TemplateCategory, number> = {
    all: 0,
    frontend: 0,
    backend: 0,
    fullstack: 0,
    mobile: 0,
    other: 0,
  };

  grouped.forEach((templates, category) => {
    counts[category] = templates.length;
  });

  return counts;
});

/**
 * Whether the filter is active (not in default state)
 */
export const isFilterActive = computed(templateFilter, (filter) => {
  return filter.query !== '' ||
    filter.category !== 'all' ||
    filter.difficulty !== null ||
    filter.showPopularOnly;
});

// ==================== ACTIONS ====================

/**
 * Select a template for project creation
 */
export function selectTemplate(template: ProjectTemplate | null): void {
  selectedTemplate.set(template);

  // Add to recent templates if not null
  if (template) {
    addToRecentTemplates(template.id);
  }
}

/**
 * Clear selected template
 */
export function clearSelectedTemplate(): void {
  selectedTemplate.set(null);
}

/**
 * Update filter query
 */
export function setFilterQuery(query: string): void {
  templateFilter.setKey('query', query);
}

/**
 * Update filter category
 */
export function setFilterCategory(category: TemplateCategory): void {
  templateFilter.setKey('category', category);
}

/**
 * Update filter difficulty
 */
export function setFilterDifficulty(difficulty: TemplateDifficulty | null): void {
  templateFilter.setKey('difficulty', difficulty);
}

/**
 * Toggle popular only filter
 */
export function togglePopularOnly(): void {
  const current = templateFilter.get().showPopularOnly;
  templateFilter.setKey('showPopularOnly', !current);
}

/**
 * Reset all filters to default
 */
export function resetFilters(): void {
  templateFilter.set({
    query: '',
    category: 'all',
    difficulty: null,
    showPopularOnly: false,
  });
}

/**
 * Add a custom template
 */
export function addCustomTemplate(template: ProjectTemplate): void {
  const current = customTemplates.get();

  // Check for duplicate ID
  if (current.some(t => t.id === template.id)) {
    console.warn(`Custom template with ID "${template.id}" already exists`);
    return;
  }

  customTemplates.set([...current, template]);
  saveCustomTemplates();
}

/**
 * Update a custom template
 */
export function updateCustomTemplate(
  templateId: string,
  updates: Partial<ProjectTemplate>
): void {
  const current = customTemplates.get();
  const index = current.findIndex(t => t.id === templateId);

  if (index === -1) {
    console.warn(`Custom template with ID "${templateId}" not found`);
    return;
  }

  const updated = [...current];
  updated[index] = { ...updated[index], ...updates };
  customTemplates.set(updated);
  saveCustomTemplates();
}

/**
 * Remove a custom template
 */
export function removeCustomTemplate(templateId: string): void {
  const current = customTemplates.get();
  customTemplates.set(current.filter(t => t.id !== templateId));
  saveCustomTemplates();
}

/**
 * Add template to recent list
 */
export function addToRecentTemplates(templateId: string): void {
  const current = recentTemplates.get();

  // Remove if already exists (will be moved to front)
  const filtered = current.filter(id => id !== templateId);

  // Add to front, keep only last 5
  const updated = [templateId, ...filtered].slice(0, 5);

  recentTemplates.set(updated);
  saveRecentTemplates();
}

/**
 * Get template by ID (from both built-in and custom)
 */
export function getTemplateById(templateId: string): ProjectTemplate | undefined {
  const builtin = availableTemplates.get().find(t => t.id === templateId);
  if (builtin) return builtin;

  return customTemplates.get().find(t => t.id === templateId);
}

/**
 * Get recent templates as full objects
 */
export function getRecentTemplateObjects(): ProjectTemplate[] {
  const recentIds = recentTemplates.get();
  const allTemplates = [...availableTemplates.get(), ...customTemplates.get()];

  return recentIds
    .map(id => allTemplates.find(t => t.id === id))
    .filter((t): t is ProjectTemplate => t !== undefined);
}

// ==================== PERSISTENCE ====================

const CUSTOM_TEMPLATES_KEY = 'recoder:custom-templates';
const RECENT_TEMPLATES_KEY = 'recoder:recent-templates';

/**
 * Load custom templates from localStorage
 */
export function loadCustomTemplates(): void {
  if (typeof localStorage === 'undefined') return;

  try {
    const stored = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ProjectTemplate[];
      customTemplates.set(parsed);
    }
  } catch (error) {
    console.error('Failed to load custom templates:', error);
  }
}

/**
 * Save custom templates to localStorage
 */
export function saveCustomTemplates(): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(customTemplates.get()));
  } catch (error) {
    console.error('Failed to save custom templates:', error);
  }
}

/**
 * Load recent templates from localStorage
 */
export function loadRecentTemplates(): void {
  if (typeof localStorage === 'undefined') return;

  try {
    const stored = localStorage.getItem(RECENT_TEMPLATES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      recentTemplates.set(parsed);
    }
  } catch (error) {
    console.error('Failed to load recent templates:', error);
  }
}

/**
 * Save recent templates to localStorage
 */
export function saveRecentTemplates(): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(RECENT_TEMPLATES_KEY, JSON.stringify(recentTemplates.get()));
  } catch (error) {
    console.error('Failed to save recent templates:', error);
  }
}

/**
 * Initialize templates store (load from localStorage)
 */
export function initializeTemplatesStore(): void {
  loadCustomTemplates();
  loadRecentTemplates();
}

/**
 * Clear all custom templates
 */
export function clearCustomTemplates(): void {
  customTemplates.set([]);
  saveCustomTemplates();
}

/**
 * Clear recent templates
 */
export function clearRecentTemplates(): void {
  recentTemplates.set([]);
  saveRecentTemplates();
}

// ==================== EXPORT UTILITIES ====================

/**
 * Export custom templates as JSON
 */
export function exportCustomTemplates(): string {
  return JSON.stringify(customTemplates.get(), null, 2);
}

/**
 * Import custom templates from JSON
 */
export function importCustomTemplates(json: string): {
  success: boolean;
  imported: number;
  errors: string[];
} {
  const errors: string[] = [];
  let imported = 0;

  try {
    const parsed = JSON.parse(json) as ProjectTemplate[];

    if (!Array.isArray(parsed)) {
      return { success: false, imported: 0, errors: ['Invalid JSON: expected array'] };
    }

    parsed.forEach((template, index) => {
      if (!template.id || !template.name) {
        errors.push(`Template at index ${index} is missing required fields`);
        return;
      }

      // Add custom prefix to avoid ID conflicts
      const customId = template.id.startsWith('custom-')
        ? template.id
        : `custom-${template.id}`;

      addCustomTemplate({ ...template, id: customId });
      imported++;
    });

    return { success: errors.length === 0, imported, errors };
  } catch (error) {
    return { success: false, imported: 0, errors: ['Invalid JSON format'] };
  }
}
