/**
 * Template System Types
 * Defines the structure for project templates and starter kits
 */
export type TemplateCategory = 'frontend' | 'backend' | 'fullstack' | 'mobile' | 'ai' | 'other';
export type TemplateDifficulty = 'beginner' | 'intermediate' | 'advanced';
export interface TemplateFile {
    path: string;
    content: string;
    encoding?: 'utf-8' | 'base64';
}
export interface TemplateDependency {
    name: string;
    version: string;
    dev?: boolean;
}
export interface SetupCommand {
    command: string;
    description: string;
    optional?: boolean;
}
export interface EnvironmentVariable {
    key: string;
    description: string;
    required: boolean;
    defaultValue?: string;
    sensitive?: boolean;
}
export interface ProjectTemplate {
    id: string;
    name: string;
    description: string;
    longDescription?: string;
    category: TemplateCategory;
    difficulty: TemplateDifficulty;
    icon: string;
    previewImage?: string;
    technologies: string[];
    tags: string[];
    features: string[];
    starterPath?: string;
    repoUrl?: string;
    branch?: string;
    dependencies?: TemplateDependency[];
    setupCommands?: SetupCommand[];
    environmentVariables?: EnvironmentVariable[];
    author?: string;
    license?: string;
    version?: string;
    isPopular?: boolean;
    isFeatured?: boolean;
    isNew?: boolean;
    usageCount?: number;
    lastUsed?: Date;
    nodeVersion?: string;
    supportedRuntimes?: string[];
}
export interface ResolvedTemplate extends ProjectTemplate {
    files: TemplateFile[];
}
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
export interface TemplateFilter {
    category?: TemplateCategory;
    difficulty?: TemplateDifficulty;
    technologies?: string[];
    search?: string;
    featured?: boolean;
    popular?: boolean;
}
export interface TemplateApplyResult {
    success: boolean;
    filesCreated: string[];
    filesSkipped: string[];
    errors: string[];
    setupCommands?: SetupCommand[];
    environmentVariables?: EnvironmentVariable[];
}
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
export interface TemplateValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
