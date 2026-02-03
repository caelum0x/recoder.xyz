/**
 * Project Templates Module
 *
 * This module provides template management for creating new projects
 * with pre-configured file structures and dependencies.
 */

// Types
export type {
  TemplateConfig,
  TemplateMetadata,
  GeneratedFile,
  TemplateGenerationOptions,
  FileStructure,
  TemplateNode,
  TemplateFile,
  TemplateDirectory
} from './types';

// Template Manager
export {
  TemplateManager,
  templateManager,
  templateRegistry,
  templateMetadataList,
  viteShadcnTemplate
} from './template-manager';

// File structure (for direct access if needed)
export { fileStructure as viteShadcnFileStructure } from './vite-shadcn-template';

// File Generator utilities
export {
  generateProject,
  getFileOperations,
  getPackageJson,
  getBootstrapFiles,
  getUIComponentFiles,
  getUIComponent,
  listUIComponents,
  getMinimalStarterFiles,
  mergeWithTemplate,
  type FileGenerationResult,
  type FileWriteOperation
} from './file-generator';

// Convenience functions
import { templateManager } from './template-manager';

/**
 * Generate files for a template
 */
export function generateTemplateFiles(
  templateId: string,
  projectName?: string
) {
  return templateManager.generateFiles(templateId, { projectName });
}

/**
 * Get template by ID
 */
export function getTemplate(templateId: string) {
  return templateManager.getTemplate(templateId);
}

/**
 * Get all available templates
 */
export function getAllTemplates() {
  return templateManager.getAllTemplates();
}

/**
 * Get template file content
 */
export function getTemplateFileContent(templateId: string, filePath: string) {
  return templateManager.getFileContent(templateId, filePath);
}

/**
 * Get template file tree
 */
export function getTemplateFileTree(templateId: string) {
  return templateManager.getFileTree(templateId);
}

/**
 * Get template conventions
 */
export function getTemplateConventions(templateId: string) {
  return templateManager.getConventions(templateId);
}

/**
 * Get run command for template
 */
export function getTemplateRunCommand(templateId: string) {
  return templateManager.getRunCommand(templateId);
}

/**
 * Get build command for template
 */
export function getTemplateBuildCommand(templateId: string) {
  return templateManager.getBuildCommand(templateId);
}

/**
 * Get preview port for template
 */
export function getTemplatePreviewPort(templateId: string) {
  return templateManager.getPreviewPort(templateId);
}

/**
 * Get all dependencies for a template
 */
export function getTemplateDependencies(templateId: string) {
  return {
    dependencies: templateManager.getDependencies(templateId),
    devDependencies: templateManager.getDevDependencies(templateId)
  };
}
