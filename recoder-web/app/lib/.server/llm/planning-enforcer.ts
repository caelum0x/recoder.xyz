/**
 * Planning step enforcer for agentic AI behavior
 * Forces the AI to explore and plan before writing code
 */

/**
 * Detect if a message is asking to fix errors
 */
export function isErrorFixRequest(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('fix') ||
    lowerMessage.includes('error') ||
    lowerMessage.includes('failed') ||
    lowerMessage.includes('cannot find') ||
    lowerMessage.includes('not defined') ||
    lowerMessage.includes('not found') ||
    lowerMessage.includes('undefined') ||
    lowerMessage.includes('broken')
  );
}

/**
 * Detect if a message is asking to modify existing code
 */
export function isModificationRequest(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('add') ||
    lowerMessage.includes('change') ||
    lowerMessage.includes('update') ||
    lowerMessage.includes('modify') ||
    lowerMessage.includes('edit') ||
    lowerMessage.includes('improve') ||
    lowerMessage.includes('refactor')
  );
}

/**
 * Detect if this is a brand new project request
 */
export function isNewProjectRequest(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('create a') ||
    lowerMessage.includes('build a') ||
    lowerMessage.includes('make a') ||
    lowerMessage.includes('new project') ||
    lowerMessage.includes('new app') ||
    lowerMessage.includes('from scratch')
  );
}

/**
 * Generate a planning prompt that forces exploration
 */
export function getPlanningPrompt(userMessage: string, hasExistingFiles: boolean): string | null {
  // For new projects, no planning needed - just build
  if (isNewProjectRequest(userMessage) && !hasExistingFiles) {
    return null;
  }
  
  // For error fixes, force exploration
  if (isErrorFixRequest(userMessage)) {
    return `🔍 PLANNING STEP REQUIRED

Before fixing this error, you MUST first explore:

1. Use \`readFile\` to read the file(s) mentioned in the error
2. Use \`readFile\` to check package.json for dependencies
3. Use \`searchFiles\` if you need to find related code

Only AFTER exploring should you make changes. Your first response should contain ONLY readFile/listFiles/searchFiles actions.

User's request: ${userMessage}`;
  }
  
  // For modifications to existing code, force exploration
  if (isModificationRequest(userMessage) && hasExistingFiles) {
    return `🔍 PLANNING STEP REQUIRED

Before modifying the code, you MUST first explore:

1. Use \`listFiles\` to see the project structure
2. Use \`readFile\` to read relevant files
3. Use \`searchFiles\` to find where things are used

Only AFTER understanding the codebase should you make changes. Your first response should contain exploration actions.

User's request: ${userMessage}`;
  }
  
  return null;
}

/**
 * Check if AI response contains exploration actions
 */
export function hasExplorationActions(response: string): boolean {
  return (
    response.includes('type="readFile"') ||
    response.includes('type="listFiles"') ||
    response.includes('type="searchFiles"')
  );
}

/**
 * Check if AI response contains file write actions
 */
export function hasWriteActions(response: string): boolean {
  return (
    response.includes('type="file"') ||
    response.includes('type="shell"')
  );
}

/**
 * Validate that AI followed the planning pattern
 * Returns warning message if AI skipped exploration
 */
export function validateAgenticResponse(
  response: string, 
  wasErrorFix: boolean,
  wasModification: boolean
): string | null {
  // If this was an error fix or modification, AI should have explored first
  if ((wasErrorFix || wasModification) && hasWriteActions(response) && !hasExplorationActions(response)) {
    return `⚠️ Warning: AI wrote code without exploring first. This may cause issues.`;
  }
  return null;
}

/**
 * Inject planning context into messages
 */
export function injectPlanningContext(
  messages: Array<{ role: string; content: string }>,
  hasExistingFiles: boolean
): Array<{ role: string; content: string }> {
  // Find the last user message
  const lastUserIdx = messages.map((m, i) => m.role === 'user' ? i : -1).filter(i => i >= 0).pop();
  
  if (lastUserIdx === undefined) {
    return messages;
  }
  
  const lastUserMessage = messages[lastUserIdx].content;
  const planningPrompt = getPlanningPrompt(lastUserMessage, hasExistingFiles);
  
  if (!planningPrompt) {
    return messages;
  }
  
  // Insert planning prompt before the last user message
  const result = [...messages];
  result.splice(lastUserIdx, 0, {
    role: 'system',
    content: planningPrompt
  });
  
  return result;
}
