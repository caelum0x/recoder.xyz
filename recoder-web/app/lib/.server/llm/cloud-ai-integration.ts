/**
 * Google Cloud AI Integration
 * Optional enterprise-grade AI provider using Google Cloud Code Assist
 */

import { createCodeAssistContentGenerator } from './code_assist/codeAssist';
import { AuthType } from './core/contentGenerator';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CloudAIIntegration');

let cloudAIProvider: any = null;

/**
 * Initialize Google Cloud AI provider (optional)
 */
export async function initializeCloudAI(config?: any): Promise<boolean> {
  try {
    if (!config?.googleCloudProject) {
      return false; // Not configured
    }

    cloudAIProvider = await createCodeAssistContentGenerator(
      {} as any, // HttpOptions - port property removed as it's not part of the type
      AuthType.LOGIN_WITH_GOOGLE,
      config
    );

    logger.info('✅ Google Cloud AI provider initialized');
    return true;
  } catch (error) {
    logger.warn('Google Cloud AI initialization failed:', error);
    return false;
  }
}

/**
 * Use Google Cloud AI for enhanced code generation (fallback to regular AI)
 */
export async function generateWithCloudAI(prompt: string, context?: any): Promise<{ success: boolean; content?: string; fallback?: boolean }> {
  if (!cloudAIProvider) {
    return { success: false, fallback: true };
  }

  try {
    const result = await cloudAIProvider.generateContent(prompt, context);
    return {
      success: true,
      content: result.content
    };
  } catch (error) {
    logger.warn('Cloud AI generation failed, using fallback:', error);
    return { success: false, fallback: true };
  }
}

/**
 * Check if Google Cloud AI is available
 */
export function isCloudAIAvailable(): boolean {
  return cloudAIProvider !== null;
}
