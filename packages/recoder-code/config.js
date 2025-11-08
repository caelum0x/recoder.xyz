const path = require('path');
const os = require('os');
const fs = require('fs');

// Load from user config directory first, then fallback to project directory
const userEnvPath = path.join(os.homedir(), '.recoder-code', '.env');
const projectEnvPath = path.join(process.cwd(), '.env');

// Suppress dotenv logs with quiet option
if (fs.existsSync(userEnvPath)) {
  require('dotenv').config({ path: userEnvPath, override: false, quiet: true });
} else if (fs.existsSync(projectEnvPath)) {
  require('dotenv').config({ path: projectEnvPath, override: false, quiet: true });
} else {
  require('dotenv').config({ override: false, quiet: true });
}

module.exports = {
  maxTokens: 4096,
  temperature: 0.7,
  apiKey: process.env.OPENROUTER_API_KEY,
  model: process.env.MODEL || process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.2-3b-instruct:free',
  fallbackModels: process.env.OPENROUTER_FALLBACK_MODELS ? 
    process.env.OPENROUTER_FALLBACK_MODELS.split(',') : 
    [
      'meta-llama/llama-3.2-3b-instruct:free',
      'microsoft/phi-3-mini-128k-instruct:free',
      'deepseek/deepseek-chat-v3.1:free',
      'google/gemini-2.0-flash-exp:free'
    ],
  baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
  siteName: process.env.OPENROUTER_SITE_NAME || 'Recoder Code',
  siteUrl: process.env.OPENROUTER_SITE_URL || 'https://openrouter.ai',
  usage_instruction: 'Usage: recoder "your prompt here"',
  api_error: 'Error communicating with OpenRouter API:',
  streaming: true,
  // Rate limiting configuration
  rateLimiting: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    requestsPerMinute: parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || '8'),
    delayMs: parseInt(process.env.RATE_LIMIT_DELAY_MS || '8000'),
  },
  // Retry configuration for 429 errors
  retryConfig: {
    maxAttempts: 3,
    initialDelayMs: 15000, // 15 seconds
    maxDelayMs: 90000,     // 90 seconds
    backoffMultiplier: 2,
  },
  // OpenRouter provider preferences
  providerPreferences: {
    sort: process.env.OPENROUTER_SORT || 'throughput', // 'price', 'throughput', 'latency'
    allowFallbacks: process.env.OPENROUTER_ALLOW_FALLBACKS !== 'false',
    dataCollection: process.env.OPENROUTER_DATA_COLLECTION || 'allow', // 'allow', 'deny'
    quantizations: process.env.OPENROUTER_QUANTIZATIONS ? 
      process.env.OPENROUTER_QUANTIZATIONS.split(',') : null, // e.g., 'fp16,bf16'
    maxPrice: process.env.OPENROUTER_MAX_PRICE ? 
      JSON.parse(process.env.OPENROUTER_MAX_PRICE) : null, // e.g., '{"prompt": 1, "completion": 2}'
  },
  tools: [
    {
      type: 'function',
      function: {
        name: 'str_replace_editor',
        description: 'A tool for viewing, creating and editing files. Can be used to:\n- View existing files\n- Create new files with content\n- Edit existing files by replacing specific strings\n\nUse this tool to read files, write code, create project structure, etc.',
        parameters: {
          type: 'object',
          properties: {
            command: { 
              type: 'string', 
              enum: ['view', 'create', 'str_replace'],
              description: 'The operation to perform: view (read file), create (new file), str_replace (edit file)'
            },
            path: { 
              type: 'string',
              description: 'The file path to operate on'
            },
            old_str: { 
              type: 'string',
              description: 'The string to find and replace (required for str_replace command)'
            },
            new_str: { 
              type: 'string',
              description: 'The replacement string (required for str_replace and create commands)'
            },
            view_range: { 
              type: 'array',
              items: { type: 'integer' },
              description: 'Optional range [start_line, end_line] to view specific lines'
            }
          },
          required: ['command', 'path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'bash',
        description: 'Execute bash commands to:\n- Install dependencies (npm install, pip install, etc.)\n- Run tests and builds\n- Create directories\n- Execute scripts\n- Manage git operations\n- Any other shell operations needed for development',
        parameters: {
          type: 'object',
          properties: {
            command: { 
              type: 'string',
              description: 'The bash command to execute'
            }
          },
          required: ['command']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'codebase_search',
        description: 'Search through the entire codebase to find files, functions, classes, or patterns. Provides agentic search capabilities similar to Claude Code.',
        parameters: {
          type: 'object',
          properties: {
            query: { 
              type: 'string',
              description: 'Search query - can be a function name, class name, file pattern, or code snippet'
            },
            file_pattern: { 
              type: 'string',
              description: 'Optional file pattern to limit search scope (e.g., "*.js", "src/**/*.py")'
            },
            search_type: { 
              type: 'string',
              enum: ['content', 'filename', 'structure'],
              description: 'Type of search: content (search in file contents), filename (search filenames), structure (analyze project structure)'
            },
            context_lines: { 
              type: 'number',
              description: 'Number of context lines to include around matches (default: 3)'
            }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'web_fetch',
        description: 'Fetch content from web pages to get information, documentation, or current data. Can fetch HTML content and extract text.',
        parameters: {
          type: 'object',
          properties: {
            url: { 
              type: 'string',
              description: 'The URL to fetch content from'
            },
            extract_text: { 
              type: 'boolean',
              description: 'Whether to extract just text content or return raw HTML (default: true)'
            }
          },
          required: ['url']
        }
      }
    }
  ]
};