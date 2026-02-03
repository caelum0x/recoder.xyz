/**
 * Template types for project scaffolding
 */

export interface TemplateFile {
  type: 'file';
  isBinary: boolean;
  content: string;
}

export interface TemplateDirectory {
  type: 'directory';
  children: Record<string, TemplateFile | TemplateDirectory>;
}

export type TemplateNode = TemplateFile | TemplateDirectory;

export interface FileStructure {
  [key: string]: TemplateNode;
}

export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  runCommand: string;
  devCommand: string;
  buildCommand: string;
  previewPort: number;
  fileStructure: FileStructure;
  conventions: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
}

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  icon?: string;
  tags: string[];
  category: 'frontend' | 'backend' | 'fullstack' | 'other';
}

export interface GeneratedFile {
  path: string;
  content: string;
  isBinary: boolean;
}

export interface TemplateGenerationOptions {
  projectName?: string;
  customizations?: Record<string, unknown>;
}
