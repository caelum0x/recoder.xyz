/**
 * Apply AI Code API Route (Non-Streaming)
 *
 * Parses XML-tagged code blocks from AI output and applies file operations.
 * Returns final results as JSON (not streaming).
 *
 * This is the non-streaming version of api.apply-ai-code-stream.ts
 *
 * Uses docker-api.ts for file operations via the docker-backend service.
 */

import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { dockerWriteFile, dockerReadFile, dockerPost } from '~/lib/services/docker-api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ApplyAiCode');

const DEBUG_APPLY_AI = process.env.NODE_ENV !== 'production' && process.env.DEBUG_APPLY_AI === 'true';

function applyInfo(message: string, meta?: unknown) {
  if (!DEBUG_APPLY_AI) return;
  if (typeof meta !== 'undefined') {
    logger.debug(message, meta);
    return;
  }
  logger.debug(message);
}

/**
 * Parsed response structure from AI output
 */
interface ParsedResponse {
  explanation: string;
  template: string;
  files: Array<{ path: string; content: string }>;
  packages: string[];
  commands: string[];
  structure: string | null;
}

/**
 * Results of applying AI code
 */
interface ApplyResults {
  filesCreated: string[];
  filesUpdated: string[];
  packagesInstalled: string[];
  packagesAlreadyInstalled: string[];
  packagesFailed: string[];
  commandsExecuted: string[];
  errors: string[];
}

/**
 * Extract packages from import statements in code
 */
function extractPackagesFromCode(content: string): string[] {
  const packages: string[] = [];
  // Match ES6 imports
  const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;
  let importMatch;

  while ((importMatch = importRegex.exec(content)) !== null) {
    const importPath = importMatch[1];
    // Skip relative imports and built-in React
    if (
      !importPath.startsWith('.') &&
      !importPath.startsWith('/') &&
      importPath !== 'react' &&
      importPath !== 'react-dom' &&
      !importPath.startsWith('@/')
    ) {
      // Extract package name (handle scoped packages like @heroicons/react)
      const packageName = importPath.startsWith('@')
        ? importPath.split('/').slice(0, 2).join('/')
        : importPath.split('/')[0];

      if (!packages.includes(packageName)) {
        packages.push(packageName);
      }
    }
  }

  return packages;
}

/**
 * Parse AI response to extract files, packages, commands, and other metadata
 */
function parseAIResponse(response: string): ParsedResponse {
  const sections: ParsedResponse = {
    files: [],
    commands: [],
    packages: [],
    structure: null,
    explanation: '',
    template: '',
  };

  // Parse file sections - handle duplicates and prefer complete versions
  const fileMap = new Map<string, { content: string; isComplete: boolean }>();

  // First pass: Find all file declarations using <file path="..."> format
  const fileRegex = /<file path="([^"]+)">([\s\S]*?)(?:<\/file>|$)/g;
  let match;
  while ((match = fileRegex.exec(response)) !== null) {
    const filePath = match[1];
    const content = match[2].trim();
    const hasClosingTag = response.substring(match.index, match.index + match[0].length).includes('</file>');

    // Check if this file already exists in our map
    const existing = fileMap.get(filePath);

    // Decide whether to keep this version
    let shouldReplace = false;
    if (!existing) {
      shouldReplace = true; // First occurrence
    } else if (!existing.isComplete && hasClosingTag) {
      shouldReplace = true; // Replace incomplete with complete
      applyInfo(`[apply-ai-code] Replacing incomplete ${filePath} with complete version`);
    } else if (existing.isComplete && hasClosingTag && content.length > existing.content.length) {
      shouldReplace = true; // Replace with longer complete version
      applyInfo(`[apply-ai-code] Replacing ${filePath} with longer complete version`);
    } else if (!existing.isComplete && !hasClosingTag && content.length > existing.content.length) {
      shouldReplace = true; // Both incomplete, keep longer one
    }

    if (shouldReplace) {
      // Additional validation: reject obviously broken content
      if (content.includes('...') && !content.includes('...props') && !content.includes('...rest')) {
        applyInfo(`[apply-ai-code] Warning: ${filePath} contains ellipsis, may be truncated`);
        // Still use it if it's the only version we have
        if (!existing) {
          fileMap.set(filePath, { content, isComplete: hasClosingTag });
        }
      } else {
        fileMap.set(filePath, { content, isComplete: hasClosingTag });
      }
    }
  }

  // Also parse recoderAction type="file" format (from recoder.xyz)
  const recoderFileRegex = /<recoderAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>([\s\S]*?)<\/recoderAction>/g;
  while ((match = recoderFileRegex.exec(response)) !== null) {
    const filePath = match[1];
    const content = match[2].trim();

    if (!fileMap.has(filePath)) {
      fileMap.set(filePath, { content, isComplete: true });
    }
  }

  // Convert map to array for sections.files
  for (const [path, { content, isComplete }] of Array.from(fileMap.entries())) {
    if (!isComplete) {
      applyInfo(`[apply-ai-code] Warning: File ${path} appears to be truncated (no closing tag)`);
    }

    sections.files.push({
      path,
      content,
    });

    // Extract packages from file content
    const filePackages = extractPackagesFromCode(content);
    for (const pkg of filePackages) {
      if (!sections.packages.includes(pkg)) {
        sections.packages.push(pkg);
        applyInfo(`[apply-ai-code] Package detected from imports: ${pkg}`);
      }
    }
  }

  // Also parse markdown code blocks with file paths
  const markdownFileRegex = /```(?:file )?path="([^"]+)"\n([\s\S]*?)```/g;
  while ((match = markdownFileRegex.exec(response)) !== null) {
    const filePath = match[1];
    const content = match[2].trim();

    // Don't add duplicates
    if (!sections.files.some(f => f.path === filePath)) {
      sections.files.push({
        path: filePath,
        content: content,
      });

      // Extract packages from file content
      const filePackages = extractPackagesFromCode(content);
      for (const pkg of filePackages) {
        if (!sections.packages.includes(pkg)) {
          sections.packages.push(pkg);
        }
      }
    }
  }

  // Parse plain text format like "Generated Files: Header.jsx, index.css"
  const generatedFilesMatch = response.match(/Generated Files?:\s*([^\n]+)/i);
  if (generatedFilesMatch) {
    const filesList = generatedFilesMatch[1]
      .split(',')
      .map((f) => f.trim())
      .filter(
        (f) =>
          f.endsWith('.jsx') ||
          f.endsWith('.js') ||
          f.endsWith('.tsx') ||
          f.endsWith('.ts') ||
          f.endsWith('.css') ||
          f.endsWith('.json') ||
          f.endsWith('.html')
      );
    applyInfo(`[apply-ai-code] Detected generated files from plain text: ${filesList.join(', ')}`);

    // Try to extract the actual file content if it follows
    for (const fileName of filesList) {
      const fileContentRegex = new RegExp(
        `${fileName}[\\s\\S]*?(?:import[\\s\\S]+?)(?=Generated Files:|Applying code|$)`,
        'i'
      );
      const fileContentMatch = response.match(fileContentRegex);
      if (fileContentMatch) {
        const codeMatch = fileContentMatch[0].match(/^(import[\s\S]+)$/m);
        if (codeMatch) {
          const filePath = fileName.includes('/') ? fileName : `src/components/${fileName}`;

          // Don't add duplicates
          if (!sections.files.some(f => f.path === filePath)) {
            sections.files.push({
              path: filePath,
              content: codeMatch[1].trim(),
            });

            // Extract packages from this file
            const filePackages = extractPackagesFromCode(codeMatch[1]);
            for (const pkg of filePackages) {
              if (!sections.packages.includes(pkg)) {
                sections.packages.push(pkg);
              }
            }
          }
        }
      }
    }
  }

  // Parse raw JSX/JS code blocks
  const codeBlockRegex = /```(?:jsx?|tsx?|javascript|typescript)?\n([\s\S]*?)```/g;
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const content = match[1].trim();
    // Try to detect the file name from comments or context
    const fileNameMatch = content.match(/\/\/\s*(?:File:|Component:)\s*([^\n]+)/);
    if (fileNameMatch) {
      const fileName = fileNameMatch[1].trim();
      const filePath = fileName.includes('/') ? fileName : `src/components/${fileName}`;

      // Don't add duplicate files
      if (!sections.files.some((f) => f.path === filePath)) {
        sections.files.push({
          path: filePath,
          content: content,
        });

        // Extract packages
        const filePackages = extractPackagesFromCode(content);
        for (const pkg of filePackages) {
          if (!sections.packages.includes(pkg)) {
            sections.packages.push(pkg);
          }
        }
      }
    }
  }

  // Parse commands
  const cmdRegex = /<command>(.*?)<\/command>/g;
  while ((match = cmdRegex.exec(response)) !== null) {
    sections.commands.push(match[1].trim());
  }

  // Parse packages - support both <package> and <packages> tags
  const pkgRegex = /<package>(.*?)<\/package>/g;
  while ((match = pkgRegex.exec(response)) !== null) {
    const pkg = match[1].trim();
    if (!sections.packages.includes(pkg)) {
      sections.packages.push(pkg);
    }
  }

  // Also parse <packages> tag with multiple packages
  const packagesRegex = /<packages>([\s\S]*?)<\/packages>/;
  const packagesMatch = response.match(packagesRegex);
  if (packagesMatch) {
    const packagesContent = packagesMatch[1].trim();
    // Split by newlines or commas
    const packagesList = packagesContent
      .split(/[\n,]+/)
      .map((pkg) => pkg.trim())
      .filter((pkg) => pkg.length > 0);
    for (const pkg of packagesList) {
      if (!sections.packages.includes(pkg)) {
        sections.packages.push(pkg);
      }
    }
  }

  // Parse structure
  const structureMatch = /<structure>([\s\S]*?)<\/structure>/;
  const structResult = response.match(structureMatch);
  if (structResult) {
    sections.structure = structResult[1].trim();
  }

  // Parse explanation
  const explanationMatch = /<explanation>([\s\S]*?)<\/explanation>/;
  const explResult = response.match(explanationMatch);
  if (explResult) {
    sections.explanation = explResult[1].trim();
  }

  // Parse template
  const templateMatch = /<template>(.*?)<\/template>/;
  const templResult = response.match(templateMatch);
  if (templResult) {
    sections.template = templResult[1].trim();
  }

  return sections;
}

/**
 * Normalize file path to ensure consistent structure
 */
function normalizeFilePath(filePath: string): string {
  const configFiles = [
    'tailwind.config.js',
    'vite.config.js',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'postcss.config.js',
  ];

  let normalized = filePath;
  if (normalized.startsWith('/')) {
    normalized = normalized.substring(1);
  }

  // Don't prefix config files or files already in src/public
  const fileName = normalized.split('/').pop() || '';
  if (
    !normalized.startsWith('src/') &&
    !normalized.startsWith('public/') &&
    normalized !== 'index.html' &&
    !configFiles.includes(fileName)
  ) {
    normalized = 'src/' + normalized;
  }

  return normalized;
}

/**
 * Clean content - remove CSS imports from JSX files (using Tailwind)
 * and fix common Tailwind CSS errors
 */
function cleanContent(filePath: string, content: string): string {
  let cleaned = content;

  // Remove CSS imports from JSX/JS files
  if (
    filePath.endsWith('.jsx') ||
    filePath.endsWith('.js') ||
    filePath.endsWith('.tsx') ||
    filePath.endsWith('.ts')
  ) {
    cleaned = cleaned.replace(/import\s+['"]\.\/[^'"]+\.css['"];?\s*\n?/g, '');
  }

  // Fix common Tailwind CSS errors in CSS files
  if (filePath.endsWith('.css')) {
    // Replace shadow-3xl with shadow-2xl (shadow-3xl doesn't exist)
    cleaned = cleaned.replace(/shadow-3xl/g, 'shadow-2xl');
    cleaned = cleaned.replace(/shadow-4xl/g, 'shadow-2xl');
    cleaned = cleaned.replace(/shadow-5xl/g, 'shadow-2xl');
  }

  return cleaned;
}

/**
 * Check if a file already exists in the project
 */
async function fileExists(projectId: string, filePath: string): Promise<boolean> {
  try {
    await dockerReadFile(projectId, filePath, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Install packages using the install-packages API
 */
async function installPackages(
  projectId: string,
  packages: string[],
  request: Request
): Promise<{
  installed: string[];
  alreadyInstalled: string[];
  failed: string[];
}> {
  const result = {
    installed: [] as string[],
    alreadyInstalled: [] as string[],
    failed: [] as string[],
  };

  if (packages.length === 0) {
    return result;
  }

  try {
    // Get the origin from the request to call our own API
    const url = new URL(request.url);
    const origin = url.origin;

    // Forward auth headers
    const authHeader = request.headers.get('Authorization');
    const cookie = request.headers.get('Cookie');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    if (cookie) {
      headers['Cookie'] = cookie;
    }

    const response = await fetch(`${origin}/api/install-packages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        packages,
        projectId,
      }),
    });

    if (response.ok) {
      const data = await response.json() as {
        success: boolean;
        installedPackages?: string[];
        error?: string;
      };

      if (data.success && data.installedPackages) {
        result.installed = data.installedPackages;
      } else if (data.error) {
        logger.error('[apply-ai-code] Package installation error:', data.error);
        result.failed = packages;
      }
    } else {
      logger.error('[apply-ai-code] Package installation failed:', response.status);
      result.failed = packages;
    }
  } catch (error) {
    logger.error('[apply-ai-code] Error installing packages:', error);
    result.failed = packages;
  }

  return result;
}

/**
 * Execute a command in the container
 */
async function executeCommand(
  projectId: string,
  command: string
): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    const result = await dockerPost<{ output?: string; error?: string; exitCode?: number }>(
      `/api/exec/${projectId}`,
      { command, cwd: '/workspace' },
      { timeout: 60000 }
    );

    if (result.exitCode && result.exitCode !== 0) {
      return {
        success: false,
        output: result.output,
        error: result.error || `Command failed with exit code ${result.exitCode}`,
      };
    }

    return {
      success: true,
      output: result.output,
    };
  } catch (error) {
    return {
      success: false,
      error: 'Command execution failed',
    };
  }
}

/**
 * Generate auto App.jsx if needed
 */
function generateAppJsx(componentFiles: Array<{ path: string; content: string }>): string {
  // Generate imports for components
  const imports = componentFiles
    .filter(f => !f.path.includes('App.') && !f.path.includes('main.') && !f.path.includes('index.'))
    .map(f => {
      const pathParts = f.path.split('/');
      const fileName = pathParts[pathParts.length - 1];
      const componentName = fileName.replace(/\.(jsx|tsx)$/, '');
      // Fix import path - components are in src/components/
      const importPath = f.path.startsWith('src/')
        ? f.path.replace('src/', './').replace(/\.(jsx|tsx)$/, '')
        : './' + f.path.replace(/\.(jsx|tsx)$/, '');
      return `import ${componentName} from '${importPath}';`;
    })
    .join('\n');

  // Find the main component
  const mainComponent = componentFiles.find(f => {
    const name = f.path.toLowerCase();
    return name.includes('header') ||
           name.includes('hero') ||
           name.includes('layout') ||
           name.includes('main') ||
           name.includes('home');
  }) || componentFiles[0];

  const mainComponentName = mainComponent
    ? mainComponent.path.split('/').pop()?.replace(/\.(jsx|tsx)$/, '')
    : null;

  return `import React from 'react';
${imports}

function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      ${mainComponentName ? `<${mainComponentName} />` : '<div className="text-center">\n        <h1 className="text-4xl font-bold mb-4">Welcome to your React App</h1>\n        <p className="text-gray-400">Your components have been created but need to be added here.</p>\n      </div>'}
      {/* Generated components: ${componentFiles.map(f => f.path).join(', ')} */}
    </div>
  );
}

export default App;`;
}

/**
 * Generate index.css with Tailwind
 */
function generateIndexCss(): string {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color-scheme: dark;

  color: rgba(255, 255, 255, 0.87);
  background-color: #0a0a0a;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}`;
}

/**
 * POST /api/apply-ai-code
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const {
      response,
      projectId,
      isEdit = false,
      packages = [],
      existingFiles = [],
    } = await request.json() as {
      response: string;
      projectId: string;
      isEdit?: boolean;
      packages?: string[];
      existingFiles?: string[];
    };

    if (!response) {
      return json({ error: 'response is required' }, { status: 400 });
    }

    if (!projectId) {
      // If no projectId, just return parsed results without applying
      const parsed = parseAIResponse(response);
      return json({
        success: true,
        results: {
          filesCreated: parsed.files.map(f => f.path),
          packagesInstalled: parsed.packages,
          commandsExecuted: parsed.commands,
          errors: [],
        },
        explanation: parsed.explanation,
        structure: parsed.structure,
        parsedFiles: parsed.files,
        message: `Parsed ${parsed.files.length} files successfully. Provide a projectId to apply them.`,
      });
    }

    // Debug log
    applyInfo('[apply-ai-code] Received response to parse:');
    applyInfo('[apply-ai-code] Response length:', response.length);
    applyInfo('[apply-ai-code] Project ID:', projectId);
    applyInfo('[apply-ai-code] Is edit mode:', isEdit);
    applyInfo('[apply-ai-code] Packages:', packages);

    // Parse the AI response
    const parsed = parseAIResponse(response);

    // Log what was parsed
    applyInfo('[apply-ai-code] Parsed result:');
    applyInfo('[apply-ai-code] Files found:', parsed.files.length);
    if (parsed.files.length > 0) {
      parsed.files.forEach((f) => {
        applyInfo(`[apply-ai-code] - ${f.path} (${f.content.length} chars)`);
      });
    }
    applyInfo('[apply-ai-code] Packages found:', parsed.packages);

    // Track existing files
    const existingFilesSet = new Set<string>(existingFiles);

    // Initialize results
    const results: ApplyResults = {
      filesCreated: [],
      filesUpdated: [],
      packagesInstalled: [],
      packagesAlreadyInstalled: [],
      packagesFailed: [],
      commandsExecuted: [],
      errors: [],
    };

    // Step 1: Handle packages
    const packagesArray = Array.isArray(packages) ? packages : [];
    const parsedPackages = Array.isArray(parsed.packages) ? parsed.packages : [];

    // Combine and deduplicate packages
    const allPackages = [...packagesArray.filter((pkg) => pkg && typeof pkg === 'string'), ...parsedPackages];

    // Use Set to remove duplicates, then filter out pre-installed packages
    const uniquePackages = Array.from(new Set(allPackages))
      .filter((pkg) => pkg && typeof pkg === 'string' && pkg.trim() !== '')
      .filter((pkg) => pkg !== 'react' && pkg !== 'react-dom');

    if (uniquePackages.length > 0) {
      applyInfo('[apply-ai-code] Installing packages:', uniquePackages);

      const installResult = await installPackages(projectId, uniquePackages, request);
      results.packagesInstalled = installResult.installed;
      results.packagesAlreadyInstalled = installResult.alreadyInstalled;
      results.packagesFailed = installResult.failed;

      if (installResult.failed.length > 0) {
        results.errors.push(`Failed to install packages: ${installResult.failed.join(', ')}`);
      }
    }

    // Step 2: Create/update files
    const filesArray = Array.isArray(parsed.files) ? parsed.files : [];

    // Filter out config files that shouldn't be created
    const configFiles = [
      'tailwind.config.js',
      'vite.config.js',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'postcss.config.js',
    ];

    const filteredFiles = filesArray.filter((file) => {
      if (!file || typeof file !== 'object') return false;
      const fileName = (file.path || '').split('/').pop() || '';
      if (configFiles.includes(fileName)) {
        applyInfo(`[apply-ai-code] Skipping config file: ${file.path} - already exists in template`);
        return false;
      }
      return true;
    });

    applyInfo('[apply-ai-code] Applying files:', filteredFiles.map(f => f.path));

    for (const file of filteredFiles) {
      try {
        // Normalize the file path
        const normalizedPath = normalizeFilePath(file.path);

        // Check if file already exists
        const isUpdate = existingFilesSet.has(normalizedPath) || (await fileExists(projectId, normalizedPath));

        // Clean the content
        const cleanedContent = cleanContent(file.path, file.content);

        // Write the file using docker-api
        await dockerWriteFile(projectId, normalizedPath, cleanedContent, {
          timeout: 30000,
          onRetry: (attempt) => {
            applyInfo(`[apply-ai-code] Retry ${attempt} for ${normalizedPath}`);
          },
        });

        // Track results
        if (isUpdate) {
          results.filesUpdated.push(normalizedPath);
        } else {
          results.filesCreated.push(normalizedPath);
          existingFilesSet.add(normalizedPath);
        }

        applyInfo(`[apply-ai-code] ${isUpdate ? 'Updated' : 'Created'} file: ${normalizedPath}`);
      } catch (error) {
        logger.error(`[apply-ai-code] Failed to create ${file.path}:`, error);
        results.errors.push(`Failed to create ${file.path}`);
      }
    }

    // Step 3: Auto-generate App.jsx if needed
    const appFileInParsed = parsed.files.some(f => {
      const normalized = f.path.replace(/^\//, '').replace(/^src\//, '');
      return normalized === 'App.jsx' || normalized === 'App.tsx';
    });

    const appFileExists = existingFilesSet.has('src/App.jsx') ||
                         existingFilesSet.has('src/App.tsx') ||
                         existingFilesSet.has('App.jsx') ||
                         existingFilesSet.has('App.tsx');

    if (!isEdit && !appFileInParsed && !appFileExists && parsed.files.length > 0) {
      // Find all component files
      const componentFiles = parsed.files.filter(f =>
        (f.path.endsWith('.jsx') || f.path.endsWith('.tsx')) &&
        f.path.includes('component')
      );

      if (componentFiles.length > 0) {
        try {
          const appContent = generateAppJsx(componentFiles);
          await dockerWriteFile(projectId, 'src/App.jsx', appContent, { timeout: 30000 });
          results.filesCreated.push('src/App.jsx (auto-generated)');
          applyInfo('[apply-ai-code] Auto-generated: src/App.jsx');
        } catch (error) {
          logger.error('[apply-ai-code] Failed to create App.jsx:', error);
          results.errors.push('Failed to create App.jsx');
        }
      }

      // Only create index.css if it doesn't exist
      const indexCssInParsed = parsed.files.some(f => {
        const normalized = f.path.replace(/^\//, '').replace(/^src\//, '');
        return normalized === 'index.css' || f.path === 'src/index.css';
      });

      const indexCssExists = existingFilesSet.has('src/index.css') ||
                            existingFilesSet.has('index.css');

      if (!indexCssInParsed && !indexCssExists) {
        try {
          const indexCssContent = generateIndexCss();
          await dockerWriteFile(projectId, 'src/index.css', indexCssContent, { timeout: 30000 });
          results.filesCreated.push('src/index.css (with Tailwind)');
          applyInfo('[apply-ai-code] Auto-generated: src/index.css');
        } catch (error) {
          logger.error('[apply-ai-code] Failed to create index.css:', error);
          results.errors.push('Failed to create index.css with Tailwind');
        }
      }
    }

    // Step 4: Execute commands
    const commandsArray = Array.isArray(parsed.commands) ? parsed.commands : [];
    for (const cmd of commandsArray) {
      try {
        applyInfo(`[apply-ai-code] Executing command: ${cmd}`);
        const cmdResult = await executeCommand(projectId, cmd);

        if (cmdResult.success) {
          results.commandsExecuted.push(cmd);
          applyInfo(`[apply-ai-code] Command executed: ${cmd}`);
          if (cmdResult.output) {
            applyInfo(`[apply-ai-code] Output: ${cmdResult.output}`);
          }
        } else {
          results.errors.push(`Failed to execute ${cmd}: ${cmdResult.error}`);
        }
      } catch (error) {
        logger.error(`[apply-ai-code] Failed to execute command ${cmd}:`, error);
        results.errors.push(`Failed to execute ${cmd}`);
      }
    }

    // Step 5: Check for missing imports in App.jsx
    const missingImports: string[] = [];
    const appFile = parsed.files.find(f =>
      f.path === 'src/App.jsx' || f.path === 'App.jsx'
    );

    if (appFile) {
      // Extract imports from App.jsx
      const importRegex = /import\s+(?:\w+|\{[^}]+\})\s+from\s+['"]([^'"]+)['"]/g;
      let importMatch;
      const imports: string[] = [];

      while ((importMatch = importRegex.exec(appFile.content)) !== null) {
        const importPath = importMatch[1];
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
          imports.push(importPath);
        }
      }

      // Check if all imported files exist
      for (const imp of imports) {
        // Skip CSS imports for this check
        if (imp.endsWith('.css')) continue;

        // Convert import path to expected file paths
        const basePath = imp.replace('./', 'src/');
        const possiblePaths = [
          basePath + '.jsx',
          basePath + '.js',
          basePath + '/index.jsx',
          basePath + '/index.js'
        ];

        const fileExistsInParsed = parsed.files.some(f =>
          possiblePaths.some(path => f.path === path)
        );

        if (!fileExistsInParsed) {
          missingImports.push(imp);
        }
      }
    }

    // Prepare response
    const responseData: Record<string, unknown> = {
      success: results.errors.length === 0,
      results,
      explanation: parsed.explanation,
      structure: parsed.structure,
      message: `Applied ${results.filesCreated.length} new files and updated ${results.filesUpdated.length} files`,
    };

    // Add warning for missing imports
    if (missingImports.length > 0) {
      applyInfo('[apply-ai-code] Missing imports detected', missingImports);
      responseData.warning = `Missing ${missingImports.length} imported components: ${missingImports.join(', ')}`;
      responseData.missingImports = missingImports;
    }

    applyInfo('[apply-ai-code] Complete. Results:', {
      filesCreated: results.filesCreated.length,
      filesUpdated: results.filesUpdated.length,
      packagesInstalled: results.packagesInstalled.length,
      errors: results.errors.length,
    });

    return json(responseData);
  } catch (error) {
    logger.error('Apply AI code error:', error);
    return json(
      { error: 'Failed to parse AI code' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/apply-ai-code - Not supported
 */
export async function loader() {
  return json({ error: 'Use POST to apply AI code' }, { status: 405 });
}
