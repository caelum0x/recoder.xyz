/**
 * Google Cloud AI Integration
 * Optional enterprise-grade AI provider using Google Cloud Code Assist
 */

import { createCodeAssistContentGenerator } from './code_assist/codeAssist';
import { AuthType } from './core/contentGenerator';

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
      { port: 3000 },
      AuthType.LOGIN_WITH_GOOGLE,
      config
    );

    console.log('✅ Google Cloud AI provider initialized');
    return true;
  } catch (error) {
    console.warn('Google Cloud AI initialization failed:', error);
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
    console.warn('Cloud AI generation failed, using fallback:', error);
    return { success: false, fallback: true };
  }
}

/**
 * Check if Google Cloud AI is available
 */
export function isCloudAIAvailable(): boolean {
  return cloudAIProvider !== null;
}
