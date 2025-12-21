/**
 * Context-Aware Starter Detection
 * Fixes Issue #5: AI Chat Context Bug
 * 
 * Problem: Template matcher was triggering on every message, ignoring conversation context
 * Solution: Only match templates for new conversations or explicit template requests
 */

import { detectAndPrepareStarter, type StarterInjectionResult } from './starter-injector';
import { log } from './starter-config';

interface ConversationContext {
  messageCount: number;
  hasExistingProject: boolean;
  lastTemplateMatch: string | null;
  isComponentRequest: boolean;
}

/**
 * Analyze conversation context to determine if template matching should run
 */
function analyzeConversationContext(messages: Array<{ role: string; content: string }>): ConversationContext {
  const userMessages = messages.filter(m => m.role === 'user');
  const messageCount = userMessages.length;
  
  // Check if there's already a project/artifact in the conversation
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  const hasExistingProject = assistantMessages.some(m => 
    m.content.includes('<recoderArtifact') || 
    m.content.includes('recoderAction') ||
    m.content.includes('I\'ve created') ||
    m.content.includes('I\'ve loaded')
  );
  
  // Check if last template match is still relevant
  const lastTemplateMatch = assistantMessages
    .reverse()
    .find(m => m.content.includes('starter template'))
    ?.content.match(/\*\*([^*]+)\*\* starter template/)?.[1] || null;
  
  // Check if this is a component/modification request (not a new project)
  const lastUserMessage = userMessages[userMessages.length - 1]?.content.toLowerCase() || '';
  const isComponentRequest = 
    /\b(add|create|make|update|modify|change|fix|edit)\s+(a|an|the)?\s*(component|button|form|page|feature|function|style)/i.test(lastUserMessage) ||
    /\b(component|button|form|input|modal|card|navbar|footer|header)\b/i.test(lastUserMessage) && 
    !/\b(app|application|project|website|site|platform|system)\b/i.test(lastUserMessage);
  
  return {
    messageCount,
    hasExistingProject,
    lastTemplateMatch,
    isComponentRequest,
  };
}

/**
 * Determine if template matching should be skipped based on context
 */
function shouldSkipTemplateMatching(
  context: ConversationContext,
  userMessage: string
): { skip: boolean; reason?: string } {
  // Skip if this is a component/modification request in an existing conversation
  if (context.messageCount > 1 && context.isComponentRequest) {
    return {
      skip: true,
      reason: 'Component modification request in existing conversation',
    };
  }
  
  // Skip if there's already a project and this isn't an explicit new project request
  if (context.hasExistingProject) {
    const isExplicitNewProject = /\b(new|another|different|separate)\s+(app|application|project|website|site)/i.test(userMessage);
    
    if (!isExplicitNewProject) {
      return {
        skip: true,
        reason: 'Existing project detected, not a new project request',
      };
    }
  }
  
  // Skip if message is clearly a follow-up question or modification
  const followUpPatterns = [
    /^(can you|could you|please|now|also|and|but|however)/i,
    /\b(instead|rather|better|improve|enhance|optimize)/i,
    /\?$/,  // Questions
  ];
  
  if (followUpPatterns.some(pattern => pattern.test(userMessage.trim()))) {
    return {
      skip: true,
      reason: 'Follow-up question or modification request',
    };
  }
  
  return { skip: false };
}

/**
 * Context-aware starter detection
 * Only triggers template matching when appropriate
 */
export async function detectStarterWithContext(
  userMessage: string,
  conversationMessages: Array<{ role: string; content: string }>
): Promise<StarterInjectionResult> {
  // Analyze conversation context
  const context = analyzeConversationContext(conversationMessages);
  
  log(`📊 Conversation context: ${context.messageCount} messages, hasProject: ${context.hasExistingProject}, isComponent: ${context.isComponentRequest}`);
  
  // Check if we should skip template matching
  const skipCheck = shouldSkipTemplateMatching(context, userMessage);
  
  if (skipCheck.skip) {
    log(`⏭️  Skipping template matching: ${skipCheck.reason}`);
    return { shouldInject: false };
  }
  
  // First message or explicit new project request - proceed with template matching
  log(`✅ Proceeding with template matching (${context.messageCount === 1 ? 'first message' : 'explicit new project'})`);
  
  return await detectAndPrepareStarter(userMessage);
}

/**
 * Check if message is explicitly requesting a template/starter
 */
export function isExplicitTemplateRequest(userMessage: string): boolean {
  const explicitPatterns = [
    /\b(use|start with|begin with|load|give me)\s+(a|an|the)?\s*(starter|template|boilerplate)/i,
    /\b(create|build|make|setup|initialize)\s+(a|an|the)?\s*(new)?\s+(app|application|project|website|site)/i,
    /\bfrom scratch\b/i,
  ];
  
  return explicitPatterns.some(pattern => pattern.test(userMessage));
}
