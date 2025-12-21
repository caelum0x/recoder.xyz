import { readFileSync } from 'fs';
import { join } from 'path';

let cachedPrompt: string | null = null;
let cachedTools: Record<string, any> | null = null;

/**
 * Load agent prompt from recoder/agent_prompt.txt
 */
export function getAgentPrompt(): string {
  if (cachedPrompt) return cachedPrompt;
  
  try {
    const promptPath = join(process.cwd(), 'recoder', 'agent_prompt.txt');
    cachedPrompt = readFileSync(promptPath, 'utf-8');
    
    // Replace {{CURRENT_DATE}} placeholder
    cachedPrompt = cachedPrompt.replace('{{CURRENT_DATE}}', new Date().toISOString().split('T')[0]);
    
    return cachedPrompt;
  } catch (error) {
    console.error('[agent-loader] Failed to load agent_prompt.txt:', error);
    return '';
  }
}

/**
 * Load agent tools from recoder/agent_tools.json
 */
export function getAgentTools(): Record<string, any> {
  if (cachedTools) return cachedTools;
  
  try {
    const toolsPath = join(process.cwd(), 'recoder', 'agent_tools.json');
    const content = readFileSync(toolsPath, 'utf-8');
    cachedTools = JSON.parse(content);
    return cachedTools;
  } catch (error) {
    console.error('[agent-loader] Failed to load agent_tools.json:', error);
    return {};
  }
}

/**
 * Get tools formatted for system prompt injection
 */
export function getToolsPrompt(): string {
  const tools = getAgentTools();
  if (!tools || Object.keys(tools).length === 0) return '';
  
  const toolDescriptions = Object.entries(tools)
    .map(([name, config]: [string, any]) => {
      const params = config.parameters?.properties 
        ? Object.entries(config.parameters.properties)
            .map(([p, v]: [string, any]) => `  - ${p}: ${v.type}${v.description ? ` - ${v.description}` : ''}`)
            .join('\n')
        : '';
      return `### ${name}\n${config.description}\n${params ? `Parameters:\n${params}` : ''}`;
    })
    .join('\n\n');
  
  return `\n## Available Tools\n\n${toolDescriptions}\n`;
}
