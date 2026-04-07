/**
 * Template Catalog
 * Contains all available project templates and starter kits
 */
import type { ProjectTemplate, TemplateCategory } from './types.js';
export declare const TEMPLATE_CATEGORIES: {
    id: TemplateCategory;
    name: string;
    description: string;
    icon: string;
}[];
export declare const PROJECT_TEMPLATES: ProjectTemplate[];
export declare function getTemplateById(id: string): ProjectTemplate | undefined;
export declare function getTemplatesByCategory(category: TemplateCategory): ProjectTemplate[];
export declare function getFeaturedTemplates(): ProjectTemplate[];
export declare function getPopularTemplates(): ProjectTemplate[];
export declare function getNewTemplates(): ProjectTemplate[];
export declare function searchTemplates(query: string): ProjectTemplate[];
