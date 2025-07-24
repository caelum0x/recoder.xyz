/**
 * Unified CLI Commands for Recoder.xyz Ecosystem
 * 
 * Provides consistent commands across CLI, Web Platform, and VS Code Extension
 */

export interface CommandDefinition {
  name: string;
  description: string;
  aliases?: string[];
  arguments?: Array<{
    name: string;
    description: string;
    required: boolean;
    type: 'string' | 'number' | 'boolean';
  }>;
  options?: Array<{
    name: string;
    description: string;
    type: 'string' | 'number' | 'boolean';
    default?: any;
    choices?: string[];
  }>;
  platform: 'all' | 'cli' | 'web' | 'extension';
  category: string;
  examples: string[];
}

export const UNIFIED_COMMANDS: CommandDefinition[] = [
  // Core Code Generation Commands
  {
    name: 'generate',
    description: 'Generate production-ready code using multi-AI intelligence',
    aliases: ['gen', 'g'],
    arguments: [
      {
        name: 'description',
        description: 'Description of what to generate',
        required: true,
        type: 'string'
      }
    ],
    options: [
      {
        name: 'provider',
        description: 'AI provider to use (claude, groq, gemini, ollama)',
        type: 'string',
        choices: ['claude', 'groq', 'gemini', 'ollama']
      },
      {
        name: 'language',
        description: 'Programming language',
        type: 'string',
        default: 'typescript'
      },
      {
        name: 'framework',
        description: 'Framework to use',
        type: 'string'
      },
      {
        name: 'tests',
        description: 'Include test files',
        type: 'boolean',
        default: true
      },
      {
        name: 'docs',
        description: 'Include documentation',
        type: 'boolean',
        default: false
      },
      {
        name: 'output',
        description: 'Output directory',
        type: 'string'
      }
    ],
    platform: 'all',
    category: 'Code Generation',
    examples: [
      'recoder generate "a REST API for user management"',
      'recoder gen "React component for file upload" --framework react --tests',
      'recoder g "blockchain smart contract for NFT marketplace" --language solidity'
    ]
  },

  // AI Provider Management
  {
    name: 'providers',
    description: 'Manage AI providers and their configurations',
    aliases: ['ai', 'models'],
    options: [
      {
        name: 'list',
        description: 'List all configured providers',
        type: 'boolean'
      },
      {
        name: 'add',
        description: 'Add a new provider',
        type: 'string'
      },
      {
        name: 'remove',
        description: 'Remove a provider',
        type: 'string'
      },
      {
        name: 'test',
        description: 'Test provider connection',
        type: 'string'
      },
      {
        name: 'set-key',
        description: 'Set API key for provider',
        type: 'string'
      }
    ],
    platform: 'all',
    category: 'Configuration',
    examples: [
      'recoder providers --list',
      'recoder providers --test claude',
      'recoder providers --set-key claude',
      'recoder ai --add groq'
    ]
  },

  // Session Management
  {
    name: 'session',
    description: 'Manage development sessions across platforms',
    aliases: ['sess', 's'],
    options: [
      {
        name: 'list',
        description: 'List all sessions',
        type: 'boolean'
      },
      {
        name: 'create',
        description: 'Create a new session',
        type: 'string'
      },
      {
        name: 'switch',
        description: 'Switch to a session',
        type: 'string'
      },
      {
        name: 'delete',
        description: 'Delete a session',
        type: 'string'
      },
      {
        name: 'export',
        description: 'Export session to file',
        type: 'string'
      },
      {
        name: 'import',
        description: 'Import session from file',
        type: 'string'
      },
      {
        name: 'sync',
        description: 'Enable cross-platform synchronization',
        type: 'boolean'
      }
    ],
    platform: 'all',
    category: 'Session Management',
    examples: [
      'recoder session --list',
      'recoder session --create "E-commerce project"',
      'recoder session --switch session_123',
      'recoder session --export session_123 --output ./session.json',
      'recoder session --sync'
    ]
  },

  // Project Management
  {
    name: 'project',
    description: 'Manage projects and their structure',
    aliases: ['proj', 'p'],
    arguments: [
      {
        name: 'action',
        description: 'Action to perform (init, analyze, plan, build)',
        required: true,
        type: 'string'
      }
    ],
    options: [
      {
        name: 'name',
        description: 'Project name',
        type: 'string'
      },
      {
        name: 'template',
        description: 'Project template to use',
        type: 'string'
      },
      {
        name: 'platform',
        description: 'Target platform (web, mobile, desktop, api)',
        type: 'string'
      },
      {
        name: 'stack',
        description: 'Technology stack',
        type: 'string'
      }
    ],
    platform: 'all',
    category: 'Project Management',
    examples: [
      'recoder project init --name "my-app" --template react',
      'recoder project analyze',
      'recoder project plan --platform web --stack "react,typescript,tailwind"',
      'recoder proj build --output ./dist'
    ]
  },

  // Configuration Management
  {
    name: 'config',
    description: 'Manage Recoder configuration',
    aliases: ['cfg', 'conf'],
    options: [
      {
        name: 'get',
        description: 'Get configuration value',
        type: 'string'
      },
      {
        name: 'set',
        description: 'Set configuration value',
        type: 'string'
      },
      {
        name: 'list',
        description: 'List all configuration',
        type: 'boolean'
      },
      {
        name: 'reset',
        description: 'Reset to default configuration',
        type: 'boolean'
      },
      {
        name: 'export',
        description: 'Export configuration',
        type: 'string'
      },
      {
        name: 'import',
        description: 'Import configuration',
        type: 'string'
      },
      {
        name: 'validate',
        description: 'Validate current configuration',
        type: 'boolean'
      }
    ],
    platform: 'all',
    category: 'Configuration',
    examples: [
      'recoder config --list',
      'recoder config --get aiProviders.claude.enabled',
      'recoder config --set defaultProvider claude',
      'recoder config --export ./recoder-config.json',
      'recoder config --validate'
    ]
  },

  // Package Management
  {
    name: 'packages',
    description: 'Manage Recoder packages and plugins',
    aliases: ['pkg', 'install'],
    arguments: [
      {
        name: 'action',
        description: 'Action to perform (install, uninstall, list, search, update)',
        required: false,
        type: 'string'
      },
      {
        name: 'package',
        description: 'Package name',
        required: false,
        type: 'string'
      }
    ],
    options: [
      {
        name: 'global',
        description: 'Install globally',
        type: 'boolean'
      },
      {
        name: 'version',
        description: 'Specific version to install',
        type: 'string'
      },
      {
        name: 'force',
        description: 'Force installation',
        type: 'boolean'
      }
    ],
    platform: 'all',
    category: 'Package Management',
    examples: [
      'recoder packages list',
      'recoder packages install @recoder/blockchain-agent',
      'recoder packages search blockchain',
      'recoder packages update',
      'recoder pkg uninstall @recoder/mobile-agent'
    ]
  },

  // Agent Management
  {
    name: 'agent',
    description: 'Manage specialized AI agents',
    aliases: ['agents'],
    arguments: [
      {
        name: 'action',
        description: 'Action to perform (list, create, run, delete)',
        required: true,
        type: 'string'
      }
    ],
    options: [
      {
        name: 'name',
        description: 'Agent name',
        type: 'string'
      },
      {
        name: 'type',
        description: 'Agent type (blockchain, web, mobile, security)',
        type: 'string',
        choices: ['blockchain', 'web', 'mobile', 'security', 'devops', 'ai']
      },
      {
        name: 'prompt',
        description: 'Task prompt for the agent',
        type: 'string'
      }
    ],
    platform: 'all',
    category: 'AI Agents',
    examples: [
      'recoder agent list',
      'recoder agent create --name blockchain-expert --type blockchain',
      'recoder agent run blockchain-expert --prompt "build a DeFi lending protocol"',
      'recoder agents list --type web'
    ]
  },

  // Quality and Validation
  {
    name: 'validate',
    description: 'Validate generated code for production readiness',
    aliases: ['check', 'test'],
    arguments: [
      {
        name: 'path',
        description: 'Path to validate',
        required: false,
        type: 'string'
      }
    ],
    options: [
      {
        name: 'security',
        description: 'Run security vulnerability scan',
        type: 'boolean'
      },
      {
        name: 'quality',
        description: 'Run code quality checks',
        type: 'boolean'
      },
      {
        name: 'functionality',
        description: 'Test real functionality',
        type: 'boolean'
      },
      {
        name: 'integration',
        description: 'Run integration tests',
        type: 'boolean'
      },
      {
        name: 'fix',
        description: 'Automatically fix issues',
        type: 'boolean'
      }
    ],
    platform: 'all',
    category: 'Quality Assurance',
    examples: [
      'recoder validate ./src --security --quality',
      'recoder validate --functionality --integration',
      'recoder check ./components --fix',
      'recoder test --all'
    ]
  },

  // Deployment Commands (CLI specific)
  {
    name: 'deploy',
    description: 'Deploy generated code to production platforms',
    arguments: [
      {
        name: 'target',
        description: 'Deployment target (vercel, netlify, aws, docker)',
        required: true,
        type: 'string'
      }
    ],
    options: [
      {
        name: 'env',
        description: 'Environment (staging, production)',
        type: 'string',
        default: 'staging'
      },
      {
        name: 'config',
        description: 'Deployment configuration file',
        type: 'string'
      },
      {
        name: 'build',
        description: 'Build before deployment',
        type: 'boolean',
        default: true
      }
    ],
    platform: 'cli',
    category: 'Deployment',
    examples: [
      'recoder deploy vercel --env production',
      'recoder deploy docker --config ./deploy.yml',
      'recoder deploy aws --build'
    ]
  },

  // Analytics and Usage
  {
    name: 'analytics',
    description: 'View usage analytics and statistics',
    aliases: ['stats', 'usage'],
    options: [
      {
        name: 'period',
        description: 'Time period (day, week, month)',
        type: 'string',
        default: 'week',
        choices: ['day', 'week', 'month', 'year']
      },
      {
        name: 'provider',
        description: 'Filter by AI provider',
        type: 'string'
      },
      {
        name: 'export',
        description: 'Export analytics to file',
        type: 'string'
      }
    ],
    platform: 'all',
    category: 'Analytics',
    examples: [
      'recoder analytics --period month',
      'recoder stats --provider claude',
      'recoder usage --export ./usage-report.json'
    ]
  },

  // Update and Version Management
  {
    name: 'update',
    description: 'Update Recoder and its components',
    options: [
      {
        name: 'check',
        description: 'Check for available updates',
        type: 'boolean'
      },
      {
        name: 'all',
        description: 'Update all components',
        type: 'boolean'
      },
      {
        name: 'core',
        description: 'Update core packages only',
        type: 'boolean'
      },
      {
        name: 'force',
        description: 'Force update',
        type: 'boolean'
      }
    ],
    platform: 'all',
    category: 'Maintenance',
    examples: [
      'recoder update --check',
      'recoder update --all',
      'recoder update --core --force'
    ]
  }
];

/**
 * Get commands by platform
 */
export function getCommandsByPlatform(platform: 'cli' | 'web' | 'extension'): CommandDefinition[] {
  return UNIFIED_COMMANDS.filter(cmd => 
    cmd.platform === 'all' || cmd.platform === platform
  );
}

/**
 * Get commands by category
 */
export function getCommandsByCategory(category: string): CommandDefinition[] {
  return UNIFIED_COMMANDS.filter(cmd => cmd.category === category);
}

/**
 * Find command by name or alias
 */
export function findCommand(nameOrAlias: string): CommandDefinition | undefined {
  return UNIFIED_COMMANDS.find(cmd => 
    cmd.name === nameOrAlias || 
    (cmd.aliases && cmd.aliases.includes(nameOrAlias))
  );
}

/**
 * Get all available categories
 */
export function getCategories(): string[] {
  return [...new Set(UNIFIED_COMMANDS.map(cmd => cmd.category))];
}

/**
 * Generate help text for a command
 */
export function generateCommandHelp(command: CommandDefinition): string {
  let help = `${command.name} - ${command.description}\n\n`;
  
  if (command.aliases && command.aliases.length > 0) {
    help += `Aliases: ${command.aliases.join(', ')}\n\n`;
  }
  
  if (command.arguments && command.arguments.length > 0) {
    help += 'Arguments:\n';
    command.arguments.forEach(arg => {
      const required = arg.required ? '<required>' : '[optional]';
      help += `  ${arg.name} ${required} - ${arg.description}\n`;
    });
    help += '\n';
  }
  
  if (command.options && command.options.length > 0) {
    help += 'Options:\n';
    command.options.forEach(opt => {
      const defaultValue = opt.default !== undefined ? ` (default: ${opt.default})` : '';
      help += `  --${opt.name} - ${opt.description}${defaultValue}\n`;
    });
    help += '\n';
  }
  
  if (command.examples && command.examples.length > 0) {
    help += 'Examples:\n';
    command.examples.forEach(example => {
      help += `  ${example}\n`;
    });
  }
  
  return help;
}

/**
 * Generate full help documentation
 */
export function generateFullHelp(platform: 'cli' | 'web' | 'extension'): string {
  const commands = getCommandsByPlatform(platform);
  const categories = getCategories();
  
  let help = `Recoder ${platform.charAt(0).toUpperCase() + platform.slice(1)} Commands\n`;
  help += '='.repeat(40) + '\n\n';
  
  categories.forEach(category => {
    const categoryCommands = commands.filter(cmd => cmd.category === category);
    if (categoryCommands.length === 0) return;
    
    help += `${category}:\n`;
    categoryCommands.forEach(cmd => {
      const aliases = cmd.aliases ? ` (${cmd.aliases.join(', ')})` : '';
      help += `  ${cmd.name}${aliases} - ${cmd.description}\n`;
    });
    help += '\n';
  });
  
  help += 'Use "recoder <command> --help" for detailed information about a specific command.\n';
  return help;
}

export default UNIFIED_COMMANDS;