/**
 * Container Templates - Pre-configured container templates for different project types
 *
 * Features:
 * - Project type detection
 * - Pre-configured environment variables
 * - Optimized resource allocation per project type
 * - Template validation and customization
 *
 * Inspired by patterns from open-lovable sandbox factory and libra templates
 */
import Docker from 'dockerode';
export interface ContainerTemplate {
    id: string;
    name: string;
    description: string;
    category: TemplateCategory;
    image: string;
    workingDir: string;
    env: Record<string, string>;
    resources: ResourceConfig;
    ports: PortConfig[];
    startup: StartupConfig;
    filesystem: FilesystemConfig;
    dependencies?: DependencyConfig;
    tags: string[];
    popularity: number;
    createdAt: Date;
    updatedAt: Date;
}
export type TemplateCategory = 'frontend' | 'backend' | 'fullstack' | 'static' | 'api' | 'database' | 'mobile' | 'custom';
export interface ResourceConfig {
    memory: number;
    memorySwap: number;
    cpuQuota: number;
    cpuPeriod: number;
    pidsLimit: number;
    diskQuota?: number;
}
export interface PortConfig {
    containerPort: number;
    protocol: 'tcp' | 'udp';
    description: string;
    required: boolean;
}
export interface StartupConfig {
    command?: string[];
    entrypoint?: string[];
    healthCheck?: HealthCheckConfig;
    warmupTimeMs: number;
    readinessProbe?: ReadinessProbe;
}
export interface HealthCheckConfig {
    test: string[];
    interval: number;
    timeout: number;
    retries: number;
    startPeriod: number;
}
export interface ReadinessProbe {
    httpGet?: {
        path: string;
        port: number;
    };
    exec?: {
        command: string[];
    };
    initialDelayMs: number;
    periodMs: number;
    timeoutMs: number;
}
export interface FilesystemConfig {
    tmpfs?: Record<string, string>;
    volumes?: VolumeMount[];
    readonlyPaths?: string[];
    writablePaths?: string[];
}
export interface VolumeMount {
    hostPath?: string;
    containerPath: string;
    readOnly: boolean;
}
export interface DependencyConfig {
    packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip' | 'cargo';
    packages: string[];
    devPackages?: string[];
    installCommand?: string;
}
export interface TemplateValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
export declare const BUILTIN_TEMPLATES: ContainerTemplate[];
declare class TemplateManager {
    private templates;
    private customTemplates;
    constructor();
    /**
     * Get a template by ID
     */
    getTemplate(id: string): ContainerTemplate | null;
    /**
     * Get all templates
     */
    getAllTemplates(): ContainerTemplate[];
    /**
     * Get templates by category
     */
    getTemplatesByCategory(category: TemplateCategory): ContainerTemplate[];
    /**
     * Search templates by tags
     */
    searchTemplates(query: string): ContainerTemplate[];
    /**
     * Register a custom template
     */
    registerCustomTemplate(template: ContainerTemplate): TemplateValidationResult;
    /**
     * Remove a custom template
     */
    removeCustomTemplate(id: string): boolean;
    /**
     * Validate a template
     */
    validateTemplate(template: ContainerTemplate): TemplateValidationResult;
    /**
     * Detect project type from files and return best matching template
     */
    detectProjectType(files: string[]): ContainerTemplate | null;
    /**
     * Create Docker container config from template
     */
    createContainerConfig(template: ContainerTemplate, projectId: string, ports: {
        preview: number;
        pty: number;
    }): Docker.ContainerCreateOptions;
    /**
     * Get template statistics
     */
    getStats(): {
        totalTemplates: number;
        builtinTemplates: number;
        customTemplates: number;
        byCategory: Record<string, number>;
    };
}
export declare const templateManager: TemplateManager;
export default templateManager;
