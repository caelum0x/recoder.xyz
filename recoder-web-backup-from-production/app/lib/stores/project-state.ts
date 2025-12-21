/**
 * Project State Store
 * Tracks current project context to prevent agent confusion
 */

import { atom } from 'nanostores';

export interface ProjectState {
  // Project identification
  projectId: string | null;
  projectType: string | null; // 'react', 'nextjs', 'express', 'trading', 'blog', etc.
  projectName: string | null;
  
  // What was built
  templateUsed: string | null;
  mainTechnologies: string[];
  
  // Files created
  filesCreated: string[];
  
  // Context summary for AI
  contextSummary: string | null;
  
  // Timestamps
  createdAt: number | null;
  lastUpdatedAt: number | null;
}

const defaultState: ProjectState = {
  projectId: null,
  projectType: null,
  projectName: null,
  templateUsed: null,
  mainTechnologies: [],
  filesCreated: [],
  contextSummary: null,
  createdAt: null,
  lastUpdatedAt: null,
};

export const projectState = atom<ProjectState>(defaultState);

/**
 * Initialize project state when a new project starts
 */
export function initProject(data: {
  projectId: string;
  projectType?: string;
  projectName?: string;
  templateUsed?: string;
}) {
  projectState.set({
    ...defaultState,
    projectId: data.projectId,
    projectType: data.projectType || null,
    projectName: data.projectName || null,
    templateUsed: data.templateUsed || null,
    createdAt: Date.now(),
    lastUpdatedAt: Date.now(),
  });
}

/**
 * Update project type (detected from user message or files)
 */
export function setProjectType(type: string) {
  const current = projectState.get();
  projectState.set({
    ...current,
    projectType: type,
    lastUpdatedAt: Date.now(),
  });
}

/**
 * Add technology to project
 */
export function addTechnology(tech: string) {
  const current = projectState.get();
  if (!current.mainTechnologies.includes(tech)) {
    projectState.set({
      ...current,
      mainTechnologies: [...current.mainTechnologies, tech],
      lastUpdatedAt: Date.now(),
    });
  }
}

/**
 * Track file creation
 */
export function trackFileCreated(filePath: string) {
  const current = projectState.get();
  if (!current.filesCreated.includes(filePath)) {
    projectState.set({
      ...current,
      filesCreated: [...current.filesCreated, filePath],
      lastUpdatedAt: Date.now(),
    });
  }
  
  // Auto-detect project type from files
  detectProjectTypeFromFile(filePath);
}

/**
 * Auto-detect project type from file paths
 */
function detectProjectTypeFromFile(filePath: string) {
  const current = projectState.get();
  if (current.projectType) return; // Already set
  
  const detections: Record<string, string> = {
    'next.config': 'nextjs',
    'vite.config': 'vite',
    'angular.json': 'angular',
    'vue.config': 'vue',
    'remix.config': 'remix',
    'express': 'express',
    'fastify': 'fastify',
    'trading': 'trading',
    'chart': 'trading',
    'candlestick': 'trading',
  };
  
  for (const [pattern, type] of Object.entries(detections)) {
    if (filePath.toLowerCase().includes(pattern)) {
      setProjectType(type);
      break;
    }
  }
}

/**
 * Generate context summary for AI prompt
 */
export function getContextSummary(): string {
  const state = projectState.get();
  
  if (!state.projectId) {
    return '';
  }
  
  const parts: string[] = [];
  
  if (state.projectType) {
    parts.push(`Current project type: ${state.projectType}`);
  }
  
  if (state.projectName) {
    parts.push(`Project name: ${state.projectName}`);
  }
  
  if (state.templateUsed) {
    parts.push(`Template used: ${state.templateUsed}`);
  }
  
  if (state.mainTechnologies.length > 0) {
    parts.push(`Technologies: ${state.mainTechnologies.join(', ')}`);
  }
  
  if (state.filesCreated.length > 0) {
    const recentFiles = state.filesCreated.slice(-10);
    parts.push(`Recent files: ${recentFiles.join(', ')}`);
  }
  
  if (parts.length === 0) {
    return '';
  }
  
  return `
<current_project_context>
${parts.join('\n')}

IMPORTANT: Continue working on this existing project. Do NOT start a new project or use a different template unless explicitly asked.
</current_project_context>
`;
}

/**
 * Reset project state (for new chat)
 */
export function resetProjectState() {
  projectState.set(defaultState);
}

/**
 * Check if we have an active project
 */
export function hasActiveProject(): boolean {
  const state = projectState.get();
  return state.projectId !== null && state.filesCreated.length > 0;
}
