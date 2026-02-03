/**
 * Context Selector Service
 * Intelligent file selection and context building for AI interactions
 *
 * Inspired by open-lovable's context-selector
 * Adapted for recoder-web with Docker backend integration
 *
 * Features:
 * 1. selectFilesForEdit() - Intelligent file selection based on edit intent
 * 2. Prioritizes key files: App.jsx/tsx, tailwind.config.js, index.css, package.json
 * 3. Builds enhanced system prompts with file structure context
 * 4. Edit examples injection for better AI behavior
 */

import {
  analyzeEditIntent,
  EditType,
  type EditIntent,
} from './edit-intent';
import {
  loadProjectContext,
  type ProjectContext,
  type FileContext,
} from './code-context';

// ============================================================================
// Types
// ============================================================================

export interface FileSelectionContext {
  primaryFiles: string[];     // Files to edit
  contextFiles: string[];     // Files to include for reference
  systemPrompt: string;       // Enhanced prompt with file info
  editIntent: EditIntent;     // Analyzed edit intent
}

export interface ComponentInfo {
  name: string;
  path: string;
  type: 'component' | 'page' | 'layout' | 'utility';
  imports?: string[];
  importedBy?: string[];
}

export interface FileManifest {
  files: Map<string, FileContext>;
  entryPoint: string;
  styleFiles: string[];
  configFiles: string[];
  componentTree: Map<string, ComponentInfo>;
  routes: RouteInfo[];
}

export interface RouteInfo {
  path: string;
  component: string;
  layout?: string;
}

// ============================================================================
// Edit Examples (teaches AI proper editing behavior)
// ============================================================================

const EDIT_EXAMPLES = `
## Edit Strategy Examples

### Example 1: Update Header Color
USER: "Make the header background black"

CORRECT APPROACH:
1. Identify Header component location
2. Edit ONLY Header.jsx/tsx
3. Change background color class/style

INCORRECT APPROACH:
- Regenerating entire App.jsx
- Creating new Header.jsx from scratch
- Modifying unrelated files

EXPECTED OUTPUT:
<file path="src/components/Header.jsx">
// Only the Header component with updated background
// Preserving all existing functionality
</file>

### Example 2: Add New Page
USER: "Add a videos page"

CORRECT APPROACH:
1. Create Videos.jsx component
2. Update routing in App.jsx or Router component
3. Add navigation link if needed

INCORRECT APPROACH:
- Regenerating entire application
- Recreating all existing pages

EXPECTED OUTPUT:
<file path="src/components/Videos.jsx">
// New Videos component
</file>

<file path="src/App.jsx">
// ONLY the routing update, preserving everything else
</file>

### Example 3: Add Feature to Component
USER: "Add a search bar to the header"

CORRECT APPROACH:
1. Modify Header.jsx to add search functionality
2. Preserve all existing header content
3. Integrate search seamlessly

INCORRECT APPROACH:
- Creating Header.jsx from scratch
- Losing existing navigation/branding

### Example 4: Add New Component
USER: "Add a newsletter signup to the footer"

CORRECT APPROACH:
1. Create Newsletter.jsx component
2. UPDATE Footer.jsx to import Newsletter
3. Add <Newsletter /> in the appropriate place in Footer

EXPECTED OUTPUT:
<file path="src/components/Newsletter.jsx">
// New Newsletter component
</file>

<file path="src/components/Footer.jsx">
// Updated Footer with Newsletter import and usage
import Newsletter from './Newsletter';
// ... existing code ...
// Add <Newsletter /> in the render
</file>

### Example 5: Remove Element
USER: "Remove start deploying button"

CORRECT APPROACH:
1. Search for "start deploying" in all component files
2. Find it in Hero.jsx
3. Edit ONLY Hero.jsx to remove that button

INCORRECT APPROACH:
- Creating a new file
- Editing multiple files
- Redesigning the entire Hero

### Example 6: Change a Single Style (CRITICAL EXAMPLE)
USER: "update the hero to bg blue"

CORRECT APPROACH:
1. Identify the Hero component file: 'src/components/Hero.jsx'.
2. Locate the outermost 'div' or container element.
3. Find the existing background color class (e.g., 'bg-gray-900').
4. Replace ONLY that class with 'bg-blue-500'.
5. Return the entire file, completely unchanged except for that single class modification.

**Original File Content (BEFORE):**
<file path="src/components/Hero.jsx">
import React from 'react';

export default function Hero() {
  return (
    <div className="w-full bg-gray-900 text-white py-20 px-4">
      <h1 className="text-5xl font-bold">Welcome to the App</h1>
      <p className="mt-4 text-lg">This is the original hero section.</p>
      <button className="mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg">
        Get Started
      </button>
    </div>
  );
}
</file>

**Expected Output (AFTER):**
<file path="src/components/Hero.jsx">
import React from 'react';

export default function Hero() {
  return (
    <div className="w-full bg-blue-500 text-white py-20 px-4">
      <h1 className="text-5xl font-bold">Welcome to the App</h1>
      <p className="mt-4 text-lg">This is the original hero section.</p>
      <button className="mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg">
        Get Started
      </button>
    </div>
  );
}
</file>

NOTICE: Everything remains EXACTLY the same except 'bg-gray-900' → 'bg-blue-500'.
- The button still has bg-blue-600 (unchanged)
- All text, structure, imports are identical
- No reformatting, no "improvements", no cleanup

## Key Principles

1. **Minimal Changes**: Only modify what's necessary
2. **Preserve Functionality**: Keep all existing features
3. **Respect Structure**: Follow existing patterns
4. **Target Precision**: Edit specific files, not everything
5. **Context Awareness**: Use imports/exports to understand relationships

## File Identification Patterns

- "header" → src/components/Header.jsx
- "navigation" → src/components/Nav.jsx or Header.jsx
- "footer" → src/components/Footer.jsx
- "home page" → src/App.jsx or src/pages/Home.jsx
- "styling" → Component files (Tailwind) or index.css
- "routing" → App.jsx or Router component
- "layout" → Layout components or App.jsx

## Edit Intent Classification

UPDATE_COMPONENT: Modify existing component
- Keywords: update, change, modify, edit, fix
- Action: Edit single file

ADD_FEATURE: Add new functionality
- Keywords: add, create, implement, build
- Action: Create new files + minimal edits

FIX_ISSUE: Resolve problems
- Keywords: fix, resolve, debug, repair
- Action: Targeted fixes

UPDATE_STYLE: Change appearance
- Keywords: style, color, theme, design
- Action: Update Tailwind classes

REFACTOR: Improve code quality
- Keywords: refactor, clean, optimize
- Action: Restructure without changing behavior
`;

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Select files and build context based on user prompt
 */
export function selectFilesForEdit(
  userPrompt: string,
  context: ProjectContext | null
): FileSelectionContext {
  // Analyze the edit intent
  const editIntent = analyzeEditIntent(userPrompt, context);

  // Get the files based on intent - only edit target files, but provide all others as context
  const primaryFiles = editIntent.targetFiles;
  const allFiles = context ? Array.from(context.files.keys()) : [];
  let contextFiles = allFiles.filter(file => !primaryFiles.includes(file));

  // ALWAYS include key files in context if they exist and aren't already primary files
  const keyFiles: string[] = [];

  // App.jsx/tsx is most important - shows component structure
  const appFile = allFiles.find(f =>
    f.endsWith('App.jsx') || f.endsWith('App.tsx') ||
    f.endsWith('App.js') || f.endsWith('App.ts')
  );
  if (appFile && !primaryFiles.includes(appFile)) {
    keyFiles.push(appFile);
  }

  // Include design system files for style context
  const tailwindConfig = allFiles.find(f =>
    f.includes('tailwind.config.js') || f.includes('tailwind.config.ts') ||
    f.includes('tailwind.config.mjs')
  );
  if (tailwindConfig && !primaryFiles.includes(tailwindConfig)) {
    keyFiles.push(tailwindConfig);
  }

  const indexCss = allFiles.find(f =>
    f.endsWith('index.css') || f.endsWith('globals.css') ||
    f.endsWith('global.css') || f.endsWith('app.css')
  );
  if (indexCss && !primaryFiles.includes(indexCss)) {
    keyFiles.push(indexCss);
  }

  // Include package.json to understand dependencies
  const packageJson = allFiles.find(f => f.endsWith('package.json') && !f.includes('node_modules'));
  if (packageJson && !primaryFiles.includes(packageJson)) {
    keyFiles.push(packageJson);
  }

  // Put key files at the beginning of context for visibility
  contextFiles = [...keyFiles, ...contextFiles.filter(f => !keyFiles.includes(f))];

  // Build the manifest for prompt generation
  const manifest = buildFileManifest(context);

  // Build enhanced system prompt
  const systemPrompt = buildSystemPrompt(
    userPrompt,
    editIntent,
    primaryFiles,
    contextFiles,
    manifest
  );

  return {
    primaryFiles,
    contextFiles,
    systemPrompt,
    editIntent,
  };
}

/**
 * Select files for edit asynchronously (loads context if needed)
 */
export async function selectFilesForEditAsync(
  userPrompt: string,
  projectId: string
): Promise<FileSelectionContext> {
  const context = await loadProjectContext(projectId);
  return selectFilesForEdit(userPrompt, context);
}

// ============================================================================
// Manifest Building
// ============================================================================

/**
 * Build file manifest from project context
 */
function buildFileManifest(context: ProjectContext | null): FileManifest {
  const manifest: FileManifest = {
    files: context?.files || new Map(),
    entryPoint: '',
    styleFiles: [],
    configFiles: [],
    componentTree: new Map(),
    routes: [],
  };

  if (!context) return manifest;

  // Find entry point
  const entryPatterns = [
    'src/App.tsx', 'src/App.jsx', 'src/App.ts', 'src/App.js',
    'src/main.tsx', 'src/main.ts', 'src/main.jsx', 'src/main.js',
    'app/page.tsx', 'app/page.jsx', // Next.js App Router
    'pages/index.tsx', 'pages/index.jsx', // Next.js Pages Router
  ];

  for (const pattern of entryPatterns) {
    if (context.files.has(pattern)) {
      manifest.entryPoint = pattern;
      break;
    }
  }

  // If no entry point found, try to find any App file
  if (!manifest.entryPoint && context.entryPoints.length > 0) {
    manifest.entryPoint = context.entryPoints[0];
  }

  // Categorize files
  for (const [path] of context.files) {
    if (path.endsWith('.css') || path.endsWith('.scss') || path.endsWith('.less')) {
      manifest.styleFiles.push(path);
    }
    if (
      path.includes('config') ||
      path.endsWith('.config.ts') ||
      path.endsWith('.config.js') ||
      path === 'package.json' ||
      path === 'tsconfig.json' ||
      path.includes('vite.config') ||
      path.includes('next.config')
    ) {
      manifest.configFiles.push(path);
    }
  }

  // Build component tree
  buildComponentTree(context, manifest);

  // Detect routes
  detectRoutes(context, manifest);

  return manifest;
}

/**
 * Build component relationship tree
 */
function buildComponentTree(context: ProjectContext, manifest: FileManifest): void {
  for (const [path, fileInfo] of context.files) {
    // Only process component-like files
    if (!isComponentFile(path)) continue;

    const fileName = path.split('/').pop() || '';
    const componentName = fileName.replace(/\.(tsx?|jsx?)$/, '');

    // Determine component type
    let type: ComponentInfo['type'] = 'component';
    if (path.includes('pages/') || path.includes('app/') && path.endsWith('page.tsx')) {
      type = 'page';
    } else if (path.includes('layout') || componentName.toLowerCase().includes('layout')) {
      type = 'layout';
    } else if (path.includes('utils/') || path.includes('lib/') || path.includes('helpers/')) {
      type = 'utility';
    }

    manifest.componentTree.set(componentName, {
      name: componentName,
      path,
      type,
      imports: fileInfo.imports,
      importedBy: [],
    });
  }

  // Build reverse relationships (importedBy)
  for (const [, component] of manifest.componentTree) {
    if (!component.imports) continue;

    for (const imp of component.imports) {
      // Try to find the imported component
      const importedName = imp.split('/').pop()?.replace(/\.(tsx?|jsx?)$/, '') || '';
      const importedComponent = manifest.componentTree.get(importedName);
      if (importedComponent) {
        importedComponent.importedBy = importedComponent.importedBy || [];
        importedComponent.importedBy.push(component.name);
      }
    }
  }
}

/**
 * Detect routes from file structure and content
 */
function detectRoutes(context: ProjectContext, manifest: FileManifest): void {
  // Check for React Router patterns in App files
  const appFile = manifest.entryPoint ? context.files.get(manifest.entryPoint) : null;
  if (appFile) {
    const routeMatches = appFile.content.matchAll(/<Route\s+[^>]*path=["']([^"']+)["'][^>]*element=\{<(\w+)/g);
    for (const match of routeMatches) {
      manifest.routes.push({
        path: match[1],
        component: match[2],
      });
    }
  }

  // Check for Next.js file-based routing (App Router)
  for (const [path] of context.files) {
    if (path.includes('app/') && path.endsWith('page.tsx')) {
      const routePath = path
        .replace(/^.*app/, '')
        .replace('/page.tsx', '')
        .replace('/page.jsx', '') || '/';

      manifest.routes.push({
        path: routePath,
        component: path,
      });
    }
  }

  // Check for Next.js Pages Router
  for (const [path] of context.files) {
    if (path.includes('pages/') && !path.includes('_app') && !path.includes('_document')) {
      const routePath = path
        .replace(/^.*pages/, '')
        .replace(/\.(tsx?|jsx?)$/, '')
        .replace('/index', '') || '/';

      manifest.routes.push({
        path: routePath,
        component: path,
      });
    }
  }
}

// ============================================================================
// System Prompt Building
// ============================================================================

/**
 * Build an enhanced system prompt with file structure context
 */
function buildSystemPrompt(
  userPrompt: string,
  editIntent: EditIntent,
  primaryFiles: string[],
  contextFiles: string[],
  manifest: FileManifest
): string {
  const sections: string[] = [];

  // Add edit examples first for better understanding (but not for full rebuilds)
  if (editIntent.type !== EditType.FULL_REBUILD) {
    sections.push(EDIT_EXAMPLES);
  }

  // Add edit intent section
  sections.push(`## Edit Intent
Type: ${editIntent.type}
Description: ${editIntent.description}
Confidence: ${(editIntent.confidence * 100).toFixed(0)}%

User Request: "${userPrompt}"`);

  // Add file structure overview
  sections.push(buildFileStructureSection(manifest));

  // Add component patterns
  const fileList = Array.from(manifest.files.keys())
    .filter(f => !f.includes('node_modules'))
    .join('\n');
  sections.push(getComponentPatternPrompt(fileList));

  // Add primary files section
  if (primaryFiles.length > 0) {
    sections.push(`## Files to Edit
${primaryFiles.map(f => {
  const component = findComponentForFile(f, manifest);
  return `- ${f}${component ? ` (${component.name} ${component.type})` : ''}`;
}).join('\n')}`);
  }

  // Add context files section
  if (contextFiles.length > 0) {
    const limitedContextFiles = contextFiles.slice(0, 20); // Limit to prevent token overflow
    sections.push(`## Context Files (for reference only)
${limitedContextFiles.map(f => {
  const component = findComponentForFile(f, manifest);
  return `- ${f}${component ? ` (${component.name} ${component.type})` : ''}`;
}).join('\n')}${contextFiles.length > 20 ? `\n... and ${contextFiles.length - 20} more files` : ''}`);
  }

  // Add specific instructions based on edit type
  sections.push(buildEditInstructions(editIntent.type));

  // Add component relationships if relevant
  if (editIntent.type === EditType.UPDATE_COMPONENT ||
      editIntent.type === EditType.ADD_FEATURE) {
    sections.push(buildComponentRelationships(primaryFiles, manifest));
  }

  return sections.join('\n\n');
}

/**
 * Build file structure overview section
 */
function buildFileStructureSection(manifest: FileManifest): string {
  const allFiles = Array.from(manifest.files.keys())
    .filter(path => !path.includes('node_modules'))
    .sort();

  const componentFiles = Array.from(manifest.componentTree.values())
    .filter(c => c.type === 'component' || c.type === 'page');

  return `## EXISTING PROJECT FILES - DO NOT CREATE NEW FILES WITH SIMILAR NAMES

### ALL PROJECT FILES (${allFiles.length} files)
\`\`\`
${allFiles.slice(0, 50).join('\n')}${allFiles.length > 50 ? `\n... and ${allFiles.length - 50} more files` : ''}
\`\`\`

### Component Files (USE THESE EXACT NAMES)
${componentFiles.slice(0, 20).map(c =>
  `- ${c.name} -> ${c.path} (${c.type})`
).join('\n')}

### CRITICAL: Component Relationships
**ALWAYS CHECK App.jsx/tsx FIRST** to understand what components exist and how they're imported!

Common component overlaps to watch for:
- "nav" or "navigation" -> Often INSIDE Header.jsx, not a separate file
- "menu" -> Usually part of Header/Nav, not separate
- "logo" -> Typically in Header, not standalone

When user says "nav" or "navigation":
1. First check if Header.jsx exists
2. Look inside Header.jsx for navigation elements
3. Only create Nav.jsx if navigation doesn't exist anywhere

Entry Point: ${manifest.entryPoint || 'Not detected'}

### Routes
${manifest.routes.slice(0, 10).map(r =>
  `- ${r.path} -> ${r.component.split('/').pop()}`
).join('\n') || 'No routes detected'}`;
}

/**
 * Build edit-type specific instructions
 */
function buildEditInstructions(editType: EditType): string {
  const instructions: Record<EditType, string> = {
    [EditType.UPDATE_COMPONENT]: `## SURGICAL EDIT INSTRUCTIONS
- You MUST preserve 99% of the original code
- ONLY edit the specific component(s) mentioned
- Make ONLY the minimal change requested
- DO NOT rewrite or refactor unless explicitly asked
- DO NOT remove any existing code unless explicitly asked
- DO NOT change formatting or structure
- Preserve all imports and exports
- Maintain the existing code style
- Return the COMPLETE file with the surgical change applied
- Think of yourself as a surgeon making a precise incision, not an artist repainting`,

    [EditType.ADD_FEATURE]: `## Instructions
- Create new components in appropriate directories
- IMPORTANT: Update parent components to import and use the new component
- Update routing if adding new pages
- Follow existing patterns and conventions
- Add necessary styles to match existing design
- Example workflow:
  1. Create NewComponent.jsx
  2. Import it in the parent: import NewComponent from './NewComponent'
  3. Use it in the parent's render: <NewComponent />`,

    [EditType.FIX_ISSUE]: `## Instructions
- Identify and fix the specific issue
- Test the fix doesn't break other functionality
- Preserve existing behavior except for the bug
- Add error handling if needed`,

    [EditType.UPDATE_STYLE]: `## SURGICAL STYLE EDIT INSTRUCTIONS
- Change ONLY the specific style/class mentioned
- If user says "change background to blue", change ONLY the background class
- DO NOT touch any other styles, classes, or attributes
- DO NOT refactor or "improve" the styling
- DO NOT change the component structure
- Preserve ALL other classes and styles exactly as they are
- Return the COMPLETE file with only the specific style change`,

    [EditType.REFACTOR]: `## Instructions
- Improve code quality without changing functionality
- Follow project conventions
- Maintain all existing features
- Improve readability and maintainability`,

    [EditType.FULL_REBUILD]: `## Instructions
- You may rebuild the entire application
- Keep the same core functionality
- Improve upon the existing design
- Use modern best practices`,

    [EditType.ADD_DEPENDENCY]: `## Instructions
- Update package.json with new dependency
- Add necessary import statements
- Configure the dependency if needed
- Update any build configuration`,

    [EditType.GENERAL_QUERY]: `## Instructions
- Provide helpful information based on the question
- Reference relevant files and code patterns when applicable
- Suggest best practices and improvements`,
  };

  return instructions[editType] || instructions[EditType.UPDATE_COMPONENT];
}

/**
 * Build component relationship information
 */
function buildComponentRelationships(
  files: string[],
  manifest: FileManifest
): string {
  const relationships: string[] = ['## Component Relationships'];

  for (const file of files) {
    const component = findComponentForFile(file, manifest);
    if (!component) continue;

    relationships.push(`\n### ${component.name}`);

    if (component.imports && component.imports.length > 0) {
      const localImports = component.imports.filter(imp =>
        imp.startsWith('.') || imp.startsWith('/')
      );
      if (localImports.length > 0) {
        relationships.push(`Imports: ${localImports.slice(0, 5).join(', ')}${localImports.length > 5 ? '...' : ''}`);
      }
    }

    if (component.importedBy && component.importedBy.length > 0) {
      relationships.push(`Used by: ${component.importedBy.slice(0, 5).join(', ')}${component.importedBy.length > 5 ? '...' : ''}`);
    }
  }

  return relationships.join('\n');
}

/**
 * Get component pattern prompt
 */
function getComponentPatternPrompt(fileStructure: string): string {
  return `
## Current Project Structure

\`\`\`
${fileStructure.split('\n').slice(0, 30).join('\n')}
\`\`\`

## Component Naming Patterns
Based on your file structure, here are the patterns to follow:

1. Component files are typically in: src/components/ or components/
2. Page components might be in: src/pages/, pages/, or app/
3. Utility functions are in: src/utils/, src/lib/, or utils/
4. Styles use Tailwind classes inline
5. Main app entry is usually: src/App.jsx, src/App.tsx, or app/page.tsx

When the user mentions a component by name, look for:
- Exact matches first (Header -> Header.jsx)
- Partial matches (nav -> Navigation.jsx, NavBar.jsx)
- Semantic matches (top bar -> Header.jsx)
`;
}

// ============================================================================
// File Content Functions
// ============================================================================

/**
 * Get file content for selected files
 */
export function getFileContents(
  files: string[],
  context: ProjectContext | null
): Record<string, string> {
  const contents: Record<string, string> = {};

  if (!context) return contents;

  for (const file of files) {
    const fileInfo = context.files.get(file);
    if (fileInfo) {
      contents[file] = fileInfo.content;
    }
  }

  return contents;
}

/**
 * Format files for AI context
 */
export function formatFilesForAI(
  primaryFiles: Record<string, string>,
  contextFiles: Record<string, string>
): string {
  const sections: string[] = [];

  // Add primary files
  sections.push('## Files to Edit (ONLY OUTPUT THESE FILES)\n');
  sections.push('CRITICAL: You MUST ONLY generate the files listed below. Do NOT generate any other files!\n');
  sections.push('WARNING: Return the COMPLETE file - NEVER truncate with "..." or skip any lines!\n');
  sections.push('The file MUST include ALL imports, ALL functions, ALL JSX, and ALL closing tags.\n\n');

  for (const [path, content] of Object.entries(primaryFiles)) {
    sections.push(`### ${path}
**IMPORTANT: This is the COMPLETE file. Your output must include EVERY line shown below, modified only where necessary.**
\`\`\`${getFileExtension(path)}
${content}
\`\`\`
`);
  }

  // Add context files if any - but truncate large files
  if (Object.keys(contextFiles).length > 0) {
    sections.push('\n## Context Files (Reference Only - Do Not Edit)\n');

    for (const [path, content] of Object.entries(contextFiles)) {
      // Truncate very large context files to save tokens
      let truncatedContent = content;
      if (content.length > 2000) {
        truncatedContent = content.substring(0, 2000) + '\n// ... [truncated for context length]';
      }

      sections.push(`### ${path}
\`\`\`${getFileExtension(path)}
${truncatedContent}
\`\`\`
`);
    }
  }

  return sections.join('\n');
}

/**
 * Build complete AI context from selection
 */
export function buildCompleteContext(
  selection: FileSelectionContext,
  context: ProjectContext | null
): string {
  const sections: string[] = [];

  // Add system prompt with edit instructions
  sections.push(selection.systemPrompt);

  // Get file contents
  const primaryContents = getFileContents(selection.primaryFiles, context);
  const contextContents = getFileContents(selection.contextFiles.slice(0, 10), context); // Limit context files

  // Add formatted file contents
  sections.push(formatFilesForAI(primaryContents, contextContents));

  return sections.join('\n\n');
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if file is a component file
 */
function isComponentFile(path: string): boolean {
  return (
    path.endsWith('.tsx') ||
    path.endsWith('.jsx') ||
    path.endsWith('.ts') ||
    path.endsWith('.js')
  ) && !path.includes('.test.') && !path.includes('.spec.');
}

/**
 * Get file extension for syntax highlighting
 */
function getFileExtension(path: string): string {
  const ext = path.split('.').pop() || '';
  const mapping: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'css': 'css',
    'scss': 'scss',
    'json': 'json',
    'md': 'markdown',
    'html': 'html',
  };
  return mapping[ext] || ext;
}

/**
 * Find component info for a file path
 */
function findComponentForFile(filePath: string, manifest: FileManifest): ComponentInfo | null {
  const fileName = filePath.split('/').pop() || '';
  const componentName = fileName.replace(/\.(tsx?|jsx?)$/, '');
  return manifest.componentTree.get(componentName) || null;
}

/**
 * Estimate token count for a string
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Prioritize files based on relevance
 */
export function prioritizeFiles(
  files: string[],
  userPrompt: string
): string[] {
  const lowerPrompt = userPrompt.toLowerCase();

  // Score each file based on relevance
  const scored = files.map(file => {
    let score = 0;
    const fileName = file.split('/').pop()?.toLowerCase() || '';

    // Boost for files mentioned in prompt
    if (lowerPrompt.includes(fileName.replace(/\.(tsx?|jsx?)$/, ''))) {
      score += 100;
    }

    // Boost for entry points
    if (fileName.includes('app') || fileName.includes('index') || fileName.includes('main')) {
      score += 50;
    }

    // Boost for config files when dependencies mentioned
    if (lowerPrompt.includes('install') || lowerPrompt.includes('dependency')) {
      if (fileName === 'package.json') score += 80;
    }

    // Boost for style files when styling mentioned
    if (lowerPrompt.includes('style') || lowerPrompt.includes('css') || lowerPrompt.includes('color')) {
      if (fileName.includes('tailwind') || fileName.endsWith('.css')) score += 60;
    }

    return { file, score };
  });

  // Sort by score descending
  return scored.sort((a, b) => b.score - a.score).map(s => s.file);
}

/**
 * Get key files that should always be included in context
 */
export function getKeyFiles(allFiles: string[]): string[] {
  const keyFilePatterns = [
    /App\.(tsx?|jsx?)$/,
    /tailwind\.config\.(ts|js|mjs)$/,
    /(index|globals?|app)\.css$/,
    /package\.json$/,
    /tsconfig\.json$/,
  ];

  return allFiles.filter(file =>
    keyFilePatterns.some(pattern => pattern.test(file)) &&
    !file.includes('node_modules')
  );
}
