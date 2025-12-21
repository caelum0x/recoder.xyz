/**
 * Starter File Loader
 * Loads actual files from pre-bundled JSON file
 * Works in Cloudflare Workers by importing the JSON directly
 */

import { log, logVerbose } from './starter-config';
// Import the bundle directly as a module - works in both Node.js and Cloudflare Workers
import startersBundleData from './starters-bundle.json';

export interface LoadedStarterFiles {
  starterId: string;
  files: Record<string, string>; // filepath -> content
  packageJson: any;
  fileCount: number;
}

// Cache the bundle in memory
let startersBundle: any = null;

function loadBundle() {
  if (startersBundle) {
    return startersBundle;
  }

  try {
    // Use the imported JSON data directly
    startersBundle = startersBundleData;
    return startersBundle;
  } catch (error) {
    console.error('Failed to load starters bundle:', error);
    return {};
  }
}

/**
 * Load all files from a starter template (from pre-bundled data)
 * Returns actual file contents ready to inject into artifact
 */
export async function loadStarterFiles(starterId: string): Promise<LoadedStarterFiles> {
  log(`📦 Loading starter files from bundle: ${starterId}`);

  const bundle = loadBundle();
  const starter = bundle[starterId];

  if (!starter) {
    const available = Object.keys(bundle).slice(0, 10).join(', ');
    throw new Error(`Starter "${starterId}" not found in bundle. Available: ${available}...`);
  }

  const { files, packageJson, metadata } = starter;

  logVerbose(`   Found ${metadata.fileCount} files`);
  Object.keys(files).slice(0, 5).forEach((f: string) => {
    logVerbose(`   - ${f}`);
  });

  log(`✅ Loaded ${metadata.fileCount} files from ${starterId}`);

  return {
    starterId,
    files,
    packageJson,
    fileCount: metadata.fileCount,
  };
}

/**
 * Generate artifact with pre-loaded starter files
 * This creates a complete recoderArtifact with all starter files already included
 */
export function generateStarterArtifact(
  loadedStarter: LoadedStarterFiles,
  artifactId: string,
  title: string
): string {
  const { files, packageJson } = loadedStarter;

  let artifact = `<recoderArtifact id="${artifactId}" title="${title}">\n`;

  // Add package.json first if it exists
  if (packageJson && files['package.json']) {
    artifact += `  <recoderAction type="file" filePath="package.json">\n`;
    artifact += files['package.json'];
    artifact += `\n  </recoderAction>\n\n`;
  }

  // Add all other files
  const sortedFiles = Object.keys(files)
    .filter((path) => path !== 'package.json') // Skip package.json, we already added it
    .sort((a, b) => {
      // Prioritize config files and source files
      const aIsConfig = /\.(json|config|rc)$/.test(a);
      const bIsConfig = /\.(json|config|rc)$/.test(b);
      if (aIsConfig && !bIsConfig) return -1;
      if (!aIsConfig && bIsConfig) return 1;

      // Then by directory depth (shallow first)
      const aDepth = a.split('/').length;
      const bDepth = b.split('/').length;
      if (aDepth !== bDepth) return aDepth - bDepth;

      // Finally alphabetically
      return a.localeCompare(b);
    });

  for (const filePath of sortedFiles) {
    const content = files[filePath];
    artifact += `  <recoderAction type="file" filePath="${filePath}">\n`;
    artifact += content;
    artifact += `\n  </recoderAction>\n\n`;
  }

  // Add install and dev command
  if (packageJson) {
    artifact += `  <recoderAction type="shell">\n`;
    artifact += `npm install\n`;
    artifact += `  </recoderAction>\n\n`;

    // Add dev command if it exists
    if (packageJson.scripts?.dev) {
      artifact += `  <recoderAction type="shell">\n`;
      artifact += `npm run dev\n`;
      artifact += `  </recoderAction>\n`;
    }
  }

  artifact += `</recoderArtifact>`;

  return artifact;
}

/**
 * Generate customization instructions for AI
 * This tells the AI what to modify in the pre-loaded starter
 */
export function generateCustomizationInstructions(
  loadedStarter: LoadedStarterFiles,
  userRequest: string
): string {
  const { starterId, fileCount, packageJson } = loadedStarter;

  return `
🎯 STARTER TEMPLATE LOADED: ${starterId}

I've already loaded ${fileCount} files from the ${starterId} starter template into the project.
All the base code is already there - you don't need to recreate it!

WHAT'S ALREADY INCLUDED:
${packageJson ? `- Framework: ${packageJson.dependencies ? Object.keys(packageJson.dependencies).slice(0, 5).join(', ') : 'N/A'}` : ''}
- ${fileCount} pre-coded files
- Complete project structure
- All dependencies configured

USER'S REQUEST: ${userRequest}

YOUR TASK:
1. ✅ The starter files are ALREADY in the project
2. ✅ Identify which files need customization for the user's request
3. ✅ ONLY modify/add files that need changes
4. ❌ DO NOT recreate existing files unless they need modification
5. ❌ DO NOT generate boilerplate - it's already there

EXAMPLE:
- If user wants "add a contact page" → Only create the contact page component
- If user wants "change theme to dark mode" → Only modify theme/style files
- If user wants "add authentication" → Only add auth-related files

Focus on the DELTA (changes needed), not the FULL project!
`.trim();
}
