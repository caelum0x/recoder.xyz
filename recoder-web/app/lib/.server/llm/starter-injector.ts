/**
 * Starter Injector
 * Intercepts chat messages and injects pre-loaded starter files
 * This prevents AI from regenerating code that already exists
 */

import { loadStarterFiles, generateStarterArtifact, generateCustomizationInstructions, type LoadedStarterFiles } from './starter-loader';
import { searchStarters, findBestStarter } from './starter-search';
import { STARTER_CONFIG, log } from './starter-config';

export interface StarterInjectionResult {
  shouldInject: boolean;
  starterId?: string;
  preGeneratedArtifact?: string;
  customizationPrompt?: string;
  loadedFiles?: LoadedStarterFiles;
  confidence?: number;
  reasoning?: string;
  webContainerWarning?: string;
}

/**
 * Detect if we should inject a starter template using search engine
 */
export async function detectAndPrepareStarter(userMessage: string): Promise<StarterInjectionResult> {
  // Use the new search engine for better matching
  const searchResult = findBestStarter(userMessage);
  const minScore = STARTER_CONFIG.injection.customizationThreshold;

  // No match found or score too low
  if (!searchResult || searchResult.score < minScore) {
    log('⚠️  No starter template match found (score too low)');
    return { shouldInject: false };
  }

  const selectedStarterId = searchResult.template.id;
  const confidence = searchResult.score;

  log(`🎯 Search match: ${selectedStarterId} (score: ${confidence.toFixed(3)})`);
  log(`   Reasoning: ${searchResult.reasoning}`);

  // Auto-swap to WebContainer compatible alternative if available
  let finalStarterId = selectedStarterId;
  if (searchResult.template.webContainerCompatible === false) {
    log(`⚠️  WARNING: ${selectedStarterId} is NOT WebContainer compatible`);
    log(`   → Requires native binaries (e.g., Prisma)`);

    if (searchResult.template.hasWebContainerAlternative) {
      finalStarterId = searchResult.template.hasWebContainerAlternative;
      log(`✨ Auto-switching to WebContainer alternative: ${finalStarterId}`);
    } else {
      log(`   → Will likely fail in browser environment`);
    }
  }

  log(`📦 Preparing to inject starter: ${finalStarterId}`);

  try {
    // Load all files from the starter (use finalStarterId which may be swapped)
    const loadedFiles = await loadStarterFiles(finalStarterId);

    // Generate pre-built artifact with all files
    const artifactId = `${finalStarterId}-starter`;
    const artifactTitle = `${finalStarterId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Project`;
    const preGeneratedArtifact = generateStarterArtifact(loadedFiles, artifactId, artifactTitle);

    // Generate customization instructions for AI
    const customizationPrompt = generateCustomizationInstructions(loadedFiles, userMessage);

    log(`✅ Starter prepared: ${loadedFiles.fileCount} files ready to inject`);

    // Add WebContainer warning if needed
    const webContainerWarning = searchResult.template.webContainerCompatible === false
      ? `⚠️ IMPORTANT: This starter uses Prisma which requires native binaries and WILL NOT WORK in WebContainer. You must explain this limitation to the user and offer to adapt the code to use @libsql/client or sql.js instead (pure JavaScript SQLite libraries that work in the browser).`
      : undefined;

    return {
      shouldInject: true,
      starterId: selectedStarterId,
      preGeneratedArtifact,
      customizationPrompt,
      loadedFiles,
      confidence,
      reasoning: searchResult.reasoning,
      webContainerWarning,
    };
  } catch (error) {
    console.error(`❌ Failed to load starter ${selectedStarterId}:`, error);
    return { shouldInject: false };
  }
}

/**
 * Inject starter into the message flow
 * This modifies the assistant's response to include pre-loaded files
 */
export function injectStarterIntoMessages(
  messages: Array<{ role: string; content: string }>,
  injectionResult: StarterInjectionResult
): Array<{ role: string; content: string }> {
  if (!injectionResult.shouldInject || !injectionResult.preGeneratedArtifact) {
    return messages;
  }

  const lastUserMessage = messages[messages.length - 1];
  
  if (!lastUserMessage || lastUserMessage.role !== 'user') {
    return messages;
  }

  // Create a modified version of messages with pre-loaded starter context
  const modifiedMessages = [...messages];

  // Replace the last user message with enhanced version
  const webContainerWarningText = injectionResult.webContainerWarning
    ? `\n\n${injectionResult.webContainerWarning}\n`
    : '';

  modifiedMessages[modifiedMessages.length - 1] = {
    role: 'user',
    content: `${lastUserMessage.content}

[SYSTEM: A starter template has been detected and pre-loaded for you]${webContainerWarningText}

${injectionResult.customizationPrompt}

IMPORTANT: DO NOT regenerate the entire project. The base files are already loaded.
Your job is to:
1. Present the pre-loaded starter files as the foundation
2. Only suggest ADDITIONAL changes/customizations the user requested
3. Keep the response focused on what's being ADDED or MODIFIED

If the user just wants the starter template as-is, you can present it without modifications.
`
  };

  return modifiedMessages;
}

/**
 * Create a direct response with pre-loaded starter
 * Always returns the pre-loaded starter files - AI can add customizations on top
 */
export function createDirectStarterResponse(injectionResult: StarterInjectionResult, userMessage: string): string {
  if (!injectionResult.shouldInject || !injectionResult.preGeneratedArtifact) {
    return '';
  }

  const { starterId, loadedFiles } = injectionResult;

  // Always return the starter - intro message adapts based on context
  const intro = `I've loaded the **${starterId}** starter template with ${loadedFiles?.fileCount} pre-configured files.`;

  const response = `${intro}

${injectionResult.preGeneratedArtifact}

All base files are loaded and ready!
`;

  return response;
}
