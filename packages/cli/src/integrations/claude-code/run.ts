/**
 * Claude Code integration runner - Real implementation
 * Based on Anthropic's Claude Code official integration
 */

import { spawn, ChildProcess } from 'child_process';
import { Anthropic } from '@anthropic-ai/sdk';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ClaudeCodeRunResult {
  success?: boolean
  output?: string
  error?: string
  type?: 'system' | 'assistant' | 'result' | 'thinking' | 'tool_use' | 'tool_result'
  subtype?: 'init' | 'message' | 'file_edit' | 'command_run' | 'analysis'
  apiKeySource?: string
  total_cost_usd?: number
  message?: {
    content: Array<{ type: string; text?: string; thinking?: string; tool_name?: string; tool_input?: any }>
    stop_reason: string | null
    usage?: {
      input_tokens: number
      output_tokens: number  
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
  files_changed?: string[]
  commands_run?: string[]
}

export interface ClaudeCodeRunOptions {
  systemPrompt: string
  messages: any[]
  path?: string
  modelId: string
  maxOutputTokens?: number
  apiKey?: string
  baseUrl?: string
  allowFileEdits?: boolean
  allowCommandExecution?: boolean
  workingDirectory?: string
}

export async function* runClaudeCode(options: ClaudeCodeRunOptions): AsyncGenerator<string | ClaudeCodeRunResult> {
  try {
    if (!isClaudeCodeAvailable()) {
      yield {
        success: false,
        error: 'Claude Code dependencies not available. Install @anthropic-ai/claude-code',
        type: 'system'
      };
      return;
    }

    const workingDir = options.workingDirectory || options.path || process.cwd();
    
    yield {
      type: 'system',
      subtype: 'init',
      output: `Initializing Claude Code in ${workingDir}...`
    };

    // Initialize Claude client
    const client = new Anthropic({
      apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY,
      baseURL: options.baseUrl
    });

    // Prepare system prompt with coding capabilities
    const enhancedSystemPrompt = await buildCodingSystemPrompt(options.systemPrompt, workingDir);
    
    // Analyze project structure
    const projectContext = await analyzeProjectStructure(workingDir);
    
    yield {
      type: 'system',
      subtype: 'analysis',
      output: `Analyzed project: ${projectContext.fileCount} files, ${projectContext.languages.join(', ')}`
    };

    // Prepare messages with file context
    const enhancedMessages = await enhanceMessagesWithContext(options.messages, workingDir);
    
    const filesChanged: string[] = [];
    const commandsRun: string[] = [];

    try {
      // Call Claude with enhanced context and tools
      const stream = await client.messages.create({
        model: options.modelId || 'claude-3-5-sonnet-20241022',
        max_tokens: options.maxOutputTokens || 8192,
        system: enhancedSystemPrompt,
        messages: enhancedMessages,
        tools: buildClaudeCodeTools(options),
        stream: true
      });

      let currentThinking = '';
      let currentText = '';
      let totalUsage = { input_tokens: 0, output_tokens: 0 };
      let pendingToolUse: any = null;

      for await (const chunk of stream) {
        switch (chunk.type) {
          case 'message_start':
            if (chunk.message?.usage) {
              totalUsage.input_tokens += chunk.message.usage.input_tokens || 0;
            }
            break;

          case 'content_block_start':
            if ((chunk as any).content_block?.type === 'thinking') {
              yield { type: 'thinking', output: 'Claude is thinking...' };
            } else if ((chunk as any).content_block?.type === 'tool_use') {
              pendingToolUse = (chunk as any).content_block;
            }
            break;

          case 'content_block_delta':
            if ((chunk as any).delta?.type === 'thinking_delta') {
              currentThinking += (chunk as any).delta.thinking || '';
              yield { type: 'thinking', output: (chunk as any).delta.thinking };
            } else if ((chunk as any).delta?.type === 'text_delta') {
              currentText += (chunk as any).delta.text || '';
              yield (chunk as any).delta.text || '';
            } else if ((chunk as any).delta?.type === 'input_json_delta') {
              // Tool input is being streamed
              if (pendingToolUse) {
                pendingToolUse.input = (pendingToolUse.input || '') + ((chunk as any).delta.partial_json || '');
              }
            }
            break;

          case 'content_block_stop':
            if (pendingToolUse) {
              // Handle tool use (file editing, command execution)
              try {
                if (typeof pendingToolUse.input === 'string') {
                  pendingToolUse.input = JSON.parse(pendingToolUse.input);
                }
              } catch {
                // Input might already be parsed
              }
              
              const toolResult = await handleToolUse(
                pendingToolUse, 
                workingDir, 
                options,
                filesChanged,
                commandsRun
              );
              
              if (toolResult) {
                yield toolResult;
              }
              
              pendingToolUse = null;
            }
            break;

          case 'message_delta':
            if ((chunk as any).usage?.output_tokens) {
              totalUsage.output_tokens += (chunk as any).usage.output_tokens;
            }
            break;
        }
      }

      // Calculate cost
      const totalCost = calculateClaudeCodeCost(totalUsage, options.modelId);

      yield {
        success: true,
        type: 'result',
        output: currentText,
        total_cost_usd: totalCost,
        files_changed: filesChanged,
        commands_run: commandsRun,
        message: {
          content: [
            ...(currentThinking ? [{ type: 'thinking', thinking: currentThinking }] : []),
            { type: 'text', text: currentText }
          ],
          stop_reason: 'end_turn',
          usage: totalUsage
        }
      };

    } catch (apiError: any) {
      console.error('Claude API error:', apiError);
      yield {
        success: false,
        error: `Claude API error: ${apiError.message}`,
        type: 'system'
      };
    }

  } catch (error: any) {
    console.error('Claude Code integration error:', error);
    yield {
      success: false,
      error: `Claude Code error: ${error.message}`,
      type: 'system'
    };
  }
}

async function buildCodingSystemPrompt(basePrompt: string, workingDir: string): Promise<string> {
  const projectInfo = await analyzeProjectStructure(workingDir);
  
  return `${basePrompt}

You are Claude Code, an AI assistant specialized in software development. You have access to tools that allow you to:

1. Read and analyze files in the codebase
2. Edit files with precise changes
3. Run terminal commands
4. Create new files and directories
5. Navigate and understand project structure

Current project context:
- Working directory: ${workingDir}
- Languages detected: ${projectInfo.languages.join(', ')}
- File count: ${projectInfo.fileCount}
- Key directories: ${projectInfo.directories.join(', ')}

Guidelines:
- Always explain your reasoning before making changes
- Make precise, targeted edits rather than wholesale replacements
- Test changes when possible by running relevant commands
- Follow the existing code style and patterns
- Be mindful of dependencies and breaking changes
- Ask for clarification if requirements are ambiguous

When editing files:
- Show the specific lines being changed
- Explain why each change is necessary
- Preserve existing functionality unless explicitly asked to change it

When running commands:
- Explain what each command does
- Show the output and interpret results
- Handle errors gracefully and suggest fixes`;
}

async function analyzeProjectStructure(workingDir: string): Promise<{
  fileCount: number;
  languages: string[];
  directories: string[];
}> {
  try {
    const entries = await fs.readdir(workingDir, { withFileTypes: true });
    
    let fileCount = 0;
    const languages = new Set<string>();
    const directories: string[] = [];
    
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        directories.push(entry.name);
      } else if (entry.isFile()) {
        fileCount++;
        const ext = path.extname(entry.name).toLowerCase();
        const langMap: Record<string, string> = {
          '.js': 'JavaScript',
          '.ts': 'TypeScript', 
          '.py': 'Python',
          '.java': 'Java',
          '.cpp': 'C++',
          '.c': 'C',
          '.go': 'Go',
          '.rs': 'Rust',
          '.php': 'PHP',
          '.rb': 'Ruby',
          '.swift': 'Swift',
          '.kt': 'Kotlin',
          '.dart': 'Dart'
        };
        if (langMap[ext]) {
          languages.add(langMap[ext]);
        }
      }
    }
    
    return {
      fileCount,
      languages: Array.from(languages),
      directories: directories.slice(0, 10) // Limit to first 10 dirs
    };
  } catch (error) {
    return { fileCount: 0, languages: [], directories: [] };
  }
}

async function enhanceMessagesWithContext(messages: any[], workingDir: string): Promise<any[]> {
  // Add project context to the first user message
  if (messages.length > 0 && messages[0].role === 'user') {
    try {
      // Read key project files for context
      const keyFiles = ['package.json', 'README.md', 'tsconfig.json', 'requirements.txt'];
      const projectFiles: string[] = [];
      
      for (const fileName of keyFiles) {
        try {
          const filePath = path.join(workingDir, fileName);
          const content = await fs.readFile(filePath, 'utf-8');
          projectFiles.push(`${fileName}:\n\`\`\`\n${content.slice(0, 1000)}\`\`\``);
        } catch {
          // File doesn't exist, skip
        }
      }
      
      if (projectFiles.length > 0) {
        const contextMessage = `Project context:\n\n${projectFiles.join('\n\n')}\n\n---\n\n`;
        messages[0] = {
          ...messages[0],
          content: contextMessage + messages[0].content
        };
      }
    } catch (error) {
      console.warn('Failed to enhance messages with context:', error);
    }
  }
  
  return messages;
}

function buildClaudeCodeTools(options: ClaudeCodeRunOptions) {
  const tools: any[] = [];
  
  if (options.allowFileEdits !== false) {
    tools.push({
      name: 'edit_file',
      description: 'Edit a file with the given content',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'Path to the file to edit' },
          content: { type: 'string', description: 'New content for the file' },
          mode: { type: 'string', enum: ['replace', 'append', 'prepend'], default: 'replace' }
        },
        required: ['path', 'content']
      }
    });
    
    tools.push({
      name: 'read_file',
      description: 'Read the contents of a file',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'Path to the file to read' }
        },
        required: ['path']
      }
    });
  }
  
  if (options.allowCommandExecution !== false) {
    tools.push({
      name: 'run_command',
      description: 'Run a shell command',
      input_schema: {
        type: 'object' as const,
        properties: {
          command: { type: 'string', description: 'The command to run' },
          cwd: { type: 'string', description: 'Working directory for the command' }
        },
        required: ['command']
      }
    });
  }
  
  return tools;
}

async function handleToolUse(
  toolUse: any, 
  workingDir: string, 
  options: ClaudeCodeRunOptions,
  filesChanged: string[],
  commandsRun: string[]
): Promise<ClaudeCodeRunResult | null> {
  
  try {
    switch (toolUse.name) {
      case 'edit_file': {
        const { path: filePath, content, mode = 'replace' } = toolUse.input;
        const fullPath = path.resolve(workingDir, filePath);
        
        // Security check - ensure file is within working directory
        if (!fullPath.startsWith(path.resolve(workingDir))) {
          return {
            success: false,
            error: 'File path outside working directory',
            type: 'tool_result'
          };
        }
        
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        
        if (mode === 'append') {
          await fs.appendFile(fullPath, content);
        } else if (mode === 'prepend') {
          const existing = await fs.readFile(fullPath, 'utf-8').catch(() => '');
          await fs.writeFile(fullPath, content + existing);
        } else {
          await fs.writeFile(fullPath, content);
        }
        
        filesChanged.push(filePath);
        
        return {
          success: true,
          type: 'tool_result',
          subtype: 'file_edit',
          output: `File ${filePath} ${mode === 'replace' ? 'written' : mode + 'ed'} successfully`
        };
      }
      
      case 'read_file': {
        const { path: filePath } = toolUse.input;
        const fullPath = path.resolve(workingDir, filePath);
        
        if (!fullPath.startsWith(path.resolve(workingDir))) {
          return {
            success: false,
            error: 'File path outside working directory',
            type: 'tool_result'
          };
        }
        
        const content = await fs.readFile(fullPath, 'utf-8');
        
        return {
          success: true,
          type: 'tool_result',
          output: `File contents:\n\`\`\`\n${content}\n\`\`\``
        };
      }
      
      case 'run_command': {
        const { command, cwd = workingDir } = toolUse.input;
        
        commandsRun.push(command);
        
        return new Promise((resolve) => {
          const child = spawn('sh', ['-c', command], { 
            cwd, 
            stdio: 'pipe',
            env: process.env 
          });
          
          let stdout = '';
          let stderr = '';
          
          child.stdout?.on('data', (data) => {
            stdout += data.toString();
          });
          
          child.stderr?.on('data', (data) => {
            stderr += data.toString();
          });
          
          child.on('close', (code) => {
            resolve({
              success: code === 0,
              type: 'tool_result',
              subtype: 'command_run',
              output: `Command: ${command}\nExit code: ${code}\n\nOutput:\n${stdout}${stderr ? `\nError:\n${stderr}` : ''}`
            });
          });
          
          // Timeout after 30 seconds
          setTimeout(() => {
            child.kill();
            resolve({
              success: false,
              error: 'Command timed out after 30 seconds',
              type: 'tool_result'
            });
          }, 30000);
        });
      }
      
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolUse.name}`,
          type: 'tool_result'
        };
    }
  } catch (error: any) {
    return {
      success: false,
      error: `Tool execution failed: ${error.message}`,
      type: 'tool_result'
    };
  }
}

function calculateClaudeCodeCost(usage: any, modelId?: string): number {
  if (!usage) return 0;
  
  // Pricing for Claude 3.5 Sonnet (per 1M tokens)
  const pricing = {
    'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
    'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
    'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25 }
  };
  
  const model = pricing[modelId as keyof typeof pricing] || pricing['claude-3-5-sonnet-20241022'];
  
  const inputCost = (usage.input_tokens || 0) / 1_000_000 * model.input;
  const outputCost = (usage.output_tokens || 0) / 1_000_000 * model.output;
  
  return inputCost + outputCost;
}

export function isClaudeCodeAvailable(): boolean {
  try {
    require.resolve('@anthropic-ai/sdk');
    return true;
  } catch {
    // Check if we can at least create basic functionality
    try {
      require('child_process');
      require('fs/promises');
      return true;
    } catch {
      return false;
    }
  }
}