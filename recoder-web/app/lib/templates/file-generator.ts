/**
 * File Generator - utilities for generating project files from templates
 */

import type { GeneratedFile } from './types';
import { templateManager } from './template-manager';

export interface FileGenerationResult {
  success: boolean;
  files: GeneratedFile[];
  errors: string[];
}

export interface FileWriteOperation {
  path: string;
  content: string;
  action: 'create' | 'update' | 'skip';
}

/**
 * Generate a project from a template
 */
export function generateProject(
  templateId: string,
  projectName: string
): FileGenerationResult {
  try {
    const files = templateManager.generateFiles(templateId, { projectName });
    return {
      success: true,
      files,
      errors: []
    };
  } catch (error) {
    return {
      success: false,
      files: [],
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

/**
 * Get file operations needed to apply a template
 * Compares against existing files to determine actions
 */
export function getFileOperations(
  templateId: string,
  projectName: string,
  existingFiles: Set<string> = new Set()
): FileWriteOperation[] {
  const result = generateProject(templateId, projectName);
  if (!result.success) {
    return [];
  }

  return result.files.map(file => ({
    path: file.path,
    content: file.content,
    action: existingFiles.has(file.path) ? 'update' : 'create'
  }));
}

/**
 * Get the package.json content for a template with customizations
 */
export function getPackageJson(
  templateId: string,
  projectName: string
): Record<string, unknown> | null {
  const content = templateManager.getFileContent(templateId, 'package.json');
  if (!content) {
    return null;
  }

  try {
    const packageJson = JSON.parse(content);
    packageJson.name = projectName || packageJson.name;
    return packageJson;
  } catch {
    return null;
  }
}

/**
 * Get initial files needed to bootstrap a project
 * Returns only essential configuration files
 */
export function getBootstrapFiles(
  templateId: string,
  projectName: string
): GeneratedFile[] {
  const result = generateProject(templateId, projectName);
  if (!result.success) {
    return [];
  }

  // Essential files for bootstrapping
  const essentialPaths = [
    'package.json',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'vite.config.ts',
    'tailwind.config.ts',
    'postcss.config.js',
    'index.html',
    'src/main.tsx',
    'src/App.tsx',
    'src/index.css',
    'src/lib/utils.ts',
    'components.json'
  ];

  return result.files.filter(file =>
    essentialPaths.some(p => file.path === p || file.path.endsWith(p))
  );
}

/**
 * Get UI component files from template
 */
export function getUIComponentFiles(templateId: string): GeneratedFile[] {
  const template = templateManager.getTemplate(templateId);
  if (!template) {
    return [];
  }

  const files = templateManager.generateFiles(templateId, {});
  return files.filter(file => file.path.includes('components/ui/'));
}

/**
 * Get specific UI component content
 */
export function getUIComponent(
  templateId: string,
  componentName: string
): string | undefined {
  const normalizedName = componentName.toLowerCase().replace(/\.tsx$/, '');
  const filePath = `src/components/ui/${normalizedName}.tsx`;
  return templateManager.getFileContent(templateId, filePath);
}

/**
 * List all UI components available in a template
 */
export function listUIComponents(templateId: string): string[] {
  const files = getUIComponentFiles(templateId);
  return files
    .map(f => {
      const match = f.path.match(/components\/ui\/(.+)\.tsx$/);
      return match ? match[1] : null;
    })
    .filter((name): name is string => name !== null)
    .sort();
}

/**
 * Create a minimal starter template (subset of full template)
 */
export function getMinimalStarterFiles(
  templateId: string,
  projectName: string
): GeneratedFile[] {
  const result = generateProject(templateId, projectName);
  if (!result.success) {
    return [];
  }

  // Files for a minimal working project
  const minimalPaths = new Set([
    'package.json',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'vite.config.ts',
    'tailwind.config.ts',
    'postcss.config.js',
    'index.html',
    'src/main.tsx',
    'src/App.tsx',
    'src/index.css',
    'src/lib/utils.ts',
    'components.json',
    'src/pages/Index.tsx',
    // Essential UI components
    'src/components/ui/button.tsx',
    'src/components/ui/card.tsx',
    'src/components/ui/input.tsx',
    'src/components/ui/label.tsx',
    'src/components/ui/toast.tsx',
    'src/components/ui/toaster.tsx',
    'src/components/ui/sonner.tsx',
    'src/components/ui/tooltip.tsx',
    'src/hooks/use-toast.ts'
  ]);

  return result.files.filter(file =>
    minimalPaths.has(file.path) ||
    file.path.endsWith('/utils.ts')
  );
}

/**
 * Merge custom files with template files
 * Custom files override template files
 */
export function mergeWithTemplate(
  templateId: string,
  projectName: string,
  customFiles: GeneratedFile[]
): GeneratedFile[] {
  const result = generateProject(templateId, projectName);
  if (!result.success) {
    return customFiles;
  }

  const customPathSet = new Set(customFiles.map(f => f.path));
  const templateFiles = result.files.filter(f => !customPathSet.has(f.path));

  return [...templateFiles, ...customFiles];
}
