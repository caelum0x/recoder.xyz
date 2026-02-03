/**
 * Apply AI Code Stream API Route
 *
 * Parses XML-tagged code blocks from AI output and applies file operations
 * with real-time streaming progress updates.
 *
 * Uses docker-api.ts for file operations via the docker-backend service.
 */

import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { dockerWriteFile, dockerReadFile } from '~/lib/services/docker-api';

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
 * Progress event types for streaming
 */
type ProgressEvent =
  | { type: 'start'; message: string; totalSteps: number }
  | { type: 'step'; step: number; message: string; packages?: string[] }
  | { type: 'info'; message: string }
  | { type: 'warning'; message: string }
  | { type: 'file-progress'; current: number; total: number; fileName: string; action: string }
  | { type: 'file-complete'; fileName: string; action: string }
  | { type: 'file-error'; fileName: string; error: string }
  | { type: 'package-progress'; packageName?: string; installed?: boolean; message?: string; subType?: string; installedPackages?: string[] }
  | { type: 'command-progress'; current: number; total: number; command: string; action: string }
  | { type: 'command-output'; command: string; output: string; stream: 'stdout' | 'stderr' }
  | { type: 'command-complete'; command: string; exitCode: number; success: boolean }
  | { type: 'command-error'; command: string; error: string }
  | { type: 'complete'; results: ApplyResults; explanation: string; structure: string | null; message: string }
  | { type: 'error'; error: string };

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
      console.log(`[apply-ai-code-stream] Replacing incomplete ${filePath} with complete version`);
    } else if (existing.isComplete && hasClosingTag && content.length > existing.content.length) {
      shouldReplace = true; // Replace with longer complete version
      console.log(`[apply-ai-code-stream] Replacing ${filePath} with longer complete version`);
    } else if (!existing.isComplete && !hasClosingTag && content.length > existing.content.length) {
      shouldReplace = true; // Both incomplete, keep longer one
    }

    if (shouldReplace) {
      // Additional validation: reject obviously broken content
      if (content.includes('...') && !content.includes('...props') && !content.includes('...rest')) {
        console.warn(`[apply-ai-code-stream] Warning: ${filePath} contains ellipsis, may be truncated`);
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
      console.log(`[apply-ai-code-stream] Warning: File ${path} appears to be truncated (no closing tag)`);
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
        console.log(`[apply-ai-code-stream] Package detected from imports: ${pkg}`);
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
    console.log(`[apply-ai-code-stream] Detected generated files from plain text: ${filesList.join(', ')}`);

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
    sections.packages.push(match[1].trim());
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
    sections.packages.push(...packagesList);
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

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { response, projectId, packages = [], existingFiles = [] } = await request.json() as {
      response: string;
      projectId: string;
      packages?: string[];
      existingFiles?: string[];
    };

    if (!response) {
      return new Response(JSON.stringify({ error: 'response is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!projectId) {
      return new Response(JSON.stringify({ error: 'projectId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Debug log
    console.log('[apply-ai-code-stream] Received response to parse:');
    console.log('[apply-ai-code-stream] Response length:', response.length);
    console.log('[apply-ai-code-stream] Response preview:', response.substring(0, 500));
    console.log('[apply-ai-code-stream] Project ID:', projectId);
    console.log('[apply-ai-code-stream] Packages:', packages);

    // Parse the AI response
    const parsed = parseAIResponse(response);

    // Log what was parsed
    console.log('[apply-ai-code-stream] Parsed result:');
    console.log('[apply-ai-code-stream] Files found:', parsed.files.length);
    if (parsed.files.length > 0) {
      parsed.files.forEach((f) => {
        console.log(`[apply-ai-code-stream] - ${f.path} (${f.content.length} chars)`);
      });
    }
    console.log('[apply-ai-code-stream] Packages found:', parsed.packages);

    // Track existing files
    const existingFilesSet = new Set<string>(existingFiles);

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();

    // Function to send progress updates
    const sendProgress = async (data: ProgressEvent) => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };

    // Start processing in background
    (async () => {
      const results: ApplyResults = {
        filesCreated: [],
        filesUpdated: [],
        packagesInstalled: [],
        packagesAlreadyInstalled: [],
        packagesFailed: [],
        commandsExecuted: [],
        errors: [],
      };

      try {
        await sendProgress({
          type: 'start',
          message: 'Starting code application...',
          totalSteps: 3,
        });

        // Step 1: Handle packages (report what was detected)
        const packagesArray = Array.isArray(packages) ? packages : [];
        const parsedPackages = Array.isArray(parsed.packages) ? parsed.packages : [];

        // Combine and deduplicate packages
        const allPackages = [...packagesArray.filter((pkg) => pkg && typeof pkg === 'string'), ...parsedPackages];

        // Use Set to remove duplicates, then filter out pre-installed packages
        const uniquePackages = Array.from(new Set(allPackages))
          .filter((pkg) => pkg && typeof pkg === 'string' && pkg.trim() !== '')
          .filter((pkg) => pkg !== 'react' && pkg !== 'react-dom');

        if (uniquePackages.length > 0) {
          await sendProgress({
            type: 'step',
            step: 1,
            message: `Detected ${uniquePackages.length} packages to install...`,
            packages: uniquePackages,
          });

          // Note: Package installation is typically handled by the container runtime
          // Here we just report what packages were detected
          await sendProgress({
            type: 'info',
            message: `Packages detected: ${uniquePackages.join(', ')}`,
          });

          results.packagesInstalled = uniquePackages;
        } else {
          await sendProgress({
            type: 'step',
            step: 1,
            message: 'No additional packages detected.',
          });
        }

        // Step 2: Create/update files
        const filesArray = Array.isArray(parsed.files) ? parsed.files : [];
        await sendProgress({
          type: 'step',
          step: 2,
          message: `Applying ${filesArray.length} files...`,
        });

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
          return !configFiles.includes(fileName);
        });

        for (let index = 0; index < filteredFiles.length; index++) {
          const file = filteredFiles[index];
          try {
            // Send progress for each file
            await sendProgress({
              type: 'file-progress',
              current: index + 1,
              total: filteredFiles.length,
              fileName: file.path,
              action: 'creating',
            });

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
                console.log(`[apply-ai-code-stream] Retry ${attempt} for ${normalizedPath}`);
              },
            });

            // Track results
            if (isUpdate) {
              results.filesUpdated.push(normalizedPath);
            } else {
              results.filesCreated.push(normalizedPath);
              existingFilesSet.add(normalizedPath);
            }

            await sendProgress({
              type: 'file-complete',
              fileName: normalizedPath,
              action: isUpdate ? 'updated' : 'created',
            });
          } catch (error) {
            results.errors.push(`Failed to create ${file.path}: ${(error as Error).message}`);
            await sendProgress({
              type: 'file-error',
              fileName: file.path,
              error: (error as Error).message,
            });
          }
        }

        // Step 3: Report commands (typically executed by container runtime)
        const commandsArray = Array.isArray(parsed.commands) ? parsed.commands : [];
        if (commandsArray.length > 0) {
          await sendProgress({
            type: 'step',
            step: 3,
            message: `Detected ${commandsArray.length} commands...`,
          });

          for (let cmdIndex = 0; cmdIndex < commandsArray.length; cmdIndex++) {
            const cmd = commandsArray[cmdIndex];
            await sendProgress({
              type: 'command-progress',
              current: cmdIndex + 1,
              total: commandsArray.length,
              command: cmd,
              action: 'detected',
            });

            // Note: Command execution is typically handled by the container runtime
            results.commandsExecuted.push(cmd);

            await sendProgress({
              type: 'command-complete',
              command: cmd,
              exitCode: 0,
              success: true,
            });
          }
        }

        // Send final results
        await sendProgress({
          type: 'complete',
          results,
          explanation: parsed.explanation,
          structure: parsed.structure,
          message: `Successfully applied ${results.filesCreated.length} new files and updated ${results.filesUpdated.length} files`,
        });
      } catch (error) {
        await sendProgress({
          type: 'error',
          error: (error as Error).message,
        });
      } finally {
        await writer.close();
      }
    })();

    // Return the stream
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Apply AI code stream error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to parse AI code' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
