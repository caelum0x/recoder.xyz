/**
 * Template System Types
 * Defines the structure for project templates and starter kits
 */

// Template categories
export type TemplateCategory = 'frontend' | 'backend' | 'fullstack' | 'mobile' | 'ai' | 'other';

// Template difficulty levels
export type TemplateDifficulty = 'beginner' | 'intermediate' | 'advanced';

// File entry in a template
export interface TemplateFile {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
}

// Dependency specification
export interface TemplateDependency {
  name: string;
  version: string;
  dev?: boolean;
}

// Setup command to run after template is applied
export interface SetupCommand {
  command: string;
  description: string;
  optional?: boolean;
}

// Environment variable template
export interface EnvironmentVariable {
  key: string;
  description: string;
  required: boolean;
  defaultValue?: string;
  sensitive?: boolean;
}

// Complete project template definition
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  category: TemplateCategory;
  difficulty: TemplateDifficulty;
  icon: string;
  previewImage?: string;

  // Technologies and tags
  technologies: string[];
  tags: string[];

  // Features and highlights
  features: string[];

  // Template content
  starterPath?: string; // Path to local starter directory
  repoUrl?: string; // GitHub repo URL for remote templates
  branch?: string; // Branch to use for remote templates

  // Dependencies
  dependencies?: TemplateDependency[];

  // Setup configuration
  setupCommands?: SetupCommand[];
  environmentVariables?: EnvironmentVariable[];

  // Metadata
  author?: string;
  license?: string;
  version?: string;
  isPopular?: boolean;
  isFeatured?: boolean;
  isNew?: boolean;

  // Usage tracking
  usageCount?: number;
  lastUsed?: Date;

  // Compatibility
  nodeVersion?: string;
  supportedRuntimes?: string[];
}

// Template with resolved files (for applying)
export interface ResolvedTemplate extends ProjectTemplate {
  files: TemplateFile[];
}

// Template summary for listing
export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  difficulty: TemplateDifficulty;
  icon: string;
  technologies: string[];
  isPopular?: boolean;
  isFeatured?: boolean;
  isNew?: boolean;
  usageCount?: number;
}

// Filter options for template listing
export interface TemplateFilter {
  category?: TemplateCategory;
  difficulty?: TemplateDifficulty;
  technologies?: string[];
  search?: string;
  featured?: boolean;
  popular?: boolean;
}

// Result of applying a template
export interface TemplateApplyResult {
  success: boolean;
  filesCreated: string[];
  filesSkipped: string[];
  errors: string[];
  setupCommands?: SetupCommand[];
  environmentVariables?: EnvironmentVariable[];
}

// Custom template creation input
export interface CreateCustomTemplateInput {
  name: string;
  description: string;
  category: TemplateCategory;
  difficulty: TemplateDifficulty;
  technologies: string[];
  features: string[];
  files: TemplateFile[];
  setupCommands?: SetupCommand[];
}

// Template validation result
export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
