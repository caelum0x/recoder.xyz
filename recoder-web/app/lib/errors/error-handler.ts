/**
 * Smart Error Handler
 * Detects common errors and provides actionable solutions
 */

export interface ErrorSolution {
  title: string;
  description: string;
  actions: ErrorAction[];
  autoFixable: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ErrorAction {
  label: string;
  type: 'command' | 'fix' | 'link' | 'copy';
  action: string;
  icon?: string;
}

export interface ParsedError {
  message: string;
  type: string;
  solution?: ErrorSolution;
  rawError: string;
}

/**
 * Common error patterns and their solutions
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  type: string;
  getSolution: (match: RegExpMatchArray) => ErrorSolution;
}> = [
  // Port already in use
  {
    pattern: /EADDRINUSE.*?:(\d+)|Port (\d+) is (already )?in use/i,
    type: 'PORT_IN_USE',
    getSolution: (match) => {
      const port = match[1] || match[2];
      return {
        title: `Port ${port} is already in use`,
        description: 'Another process is using this port. You can kill the process or use a different port.',
        severity: 'medium',
        autoFixable: true,
        actions: [
          {
            label: 'Kill process & restart',
            type: 'command',
            action: `lsof -ti:${port} | xargs kill -9 && npm run dev`,
            icon: '🔄',
          },
          {
            label: 'Use different port',
            type: 'command',
            action: `PORT=${parseInt(port) + 1} npm run dev`,
            icon: '🔢',
          },
          {
            label: 'See what\'s using the port',
            type: 'command',
            action: `lsof -i:${port}`,
            icon: '🔍',
          },
        ],
      };
    },
  },

  // Module not found
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/i,
    type: 'MODULE_NOT_FOUND',
    getSolution: (match) => {
      const moduleName = match[1];
      const packageName = moduleName.startsWith('@') 
        ? moduleName.split('/').slice(0, 2).join('/')
        : moduleName.split('/')[0];

      return {
        title: `Module "${packageName}" not found`,
        description: 'This dependency needs to be installed.',
        severity: 'high',
        autoFixable: true,
        actions: [
          {
            label: 'Install with npm',
            type: 'command',
            action: `npm install ${packageName}`,
            icon: '📦',
          },
          {
            label: 'Install as dev dependency',
            type: 'command',
            action: `npm install -D ${packageName}`,
            icon: '🛠️',
          },
          {
            label: 'Install all dependencies',
            type: 'command',
            action: 'npm install',
            icon: '⚡',
          },
        ],
      };
    },
  },

  // Syntax errors
  {
    pattern: /SyntaxError: (.+?) at (.+?):(\d+):(\d+)/i,
    type: 'SYNTAX_ERROR',
    getSolution: (match) => {
      const [, message, file, line, col] = match;
      return {
        title: 'Syntax Error',
        description: `${message} in ${file} at line ${line}:${col}`,
        severity: 'high',
        autoFixable: false,
        actions: [
          {
            label: 'View file',
            type: 'link',
            action: file,
            icon: '📝',
          },
          {
            label: 'Common fixes',
            type: 'copy',
            action: 'Check for: missing brackets, quotes, semicolons, or typos',
            icon: '💡',
          },
        ],
      };
    },
  },

  // Build errors
  {
    pattern: /Build failed|Failed to compile/i,
    type: 'BUILD_ERROR',
    getSolution: () => {
      return {
        title: 'Build Failed',
        description: 'The application failed to compile. Check the logs for specific errors.',
        severity: 'high',
        autoFixable: true,
        actions: [
          {
            label: 'Clear cache & rebuild',
            type: 'command',
            action: 'rm -rf node_modules/.cache && npm run build',
            icon: '🧹',
          },
          {
            label: 'Reinstall dependencies',
            type: 'command',
            action: 'rm -rf node_modules && npm install',
            icon: '📦',
          },
        ],
      };
    },
  },

  // Module not found (npm install needed)
  {
    pattern: /Module not found|Can't resolve/i,
    type: 'MODULE_NOT_RESOLVED',
    getSolution: () => {
      return {
        title: 'Module Not Found',
        description: 'A required module is missing. Try installing dependencies.',
        severity: 'high',
        autoFixable: true,
        actions: [
          {
            label: 'Install dependencies',
            type: 'command',
            action: 'npm install',
            icon: '📦',
          },
          {
            label: 'Clear & reinstall',
            type: 'command',
            action: 'rm -rf node_modules && npm install',
            icon: '🧹',
          },
        ],
      };
    },
  },

  // Network errors
  {
    pattern: /ENOTFOUND|ETIMEDOUT|ECONNREFUSED|Network request failed/i,
    type: 'NETWORK_ERROR',
    getSolution: () => {
      return {
        title: 'Network Error',
        description: 'Unable to connect to the server or fetch resources.',
        severity: 'medium',
        autoFixable: false,
        actions: [
          {
            label: 'Retry',
            type: 'command',
            action: 'retry',
            icon: '🔄',
          },
          {
            label: 'Check connection',
            type: 'fix',
            action: 'check-connection',
            icon: '🌐',
          },
        ],
      };
    },
  },
];

/**
 * Parse an error and provide smart solutions
 */
export function parseError(error: Error | string): ParsedError {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorStack = typeof error === 'string' ? error : error.stack || '';
  const fullError = errorStack || errorMessage;

  // Try to match against known patterns
  for (const { pattern, type, getSolution } of ERROR_PATTERNS) {
    const match = fullError.match(pattern) || errorMessage.match(pattern);
    if (match) {
      return {
        message: errorMessage,
        type,
        solution: getSolution(match),
        rawError: fullError,
      };
    }
  }

  // Generic error with basic solutions
  return {
    message: errorMessage,
    type: 'UNKNOWN_ERROR',
    solution: {
      title: 'An Error Occurred',
      description: errorMessage,
      severity: 'medium',
      autoFixable: false,
      actions: [
        {
          label: 'Restart server',
          type: 'command',
          action: 'restart',
          icon: '🔄',
        },
        {
          label: 'Copy error',
          type: 'copy',
          action: errorMessage,
          icon: '📋',
        },
      ],
    },
    rawError: fullError,
  };
}

/**
 * Format error message for display
 */
export function formatErrorMessage(parsedError: ParsedError): string {
  if (parsedError.solution) {
    return `${parsedError.solution.title}: ${parsedError.solution.description}`;
  }
  return parsedError.message;
}

/**
 * Get severity color class
 */
export function getSeverityColor(severity: ErrorSolution['severity']): string {
  switch (severity) {
    case 'critical':
      return 'text-red-600 dark:text-red-400';
    case 'high':
      return 'text-orange-600 dark:text-orange-400';
    case 'medium':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'low':
      return 'text-blue-600 dark:text-blue-400';
  }
}

/**
 * Get severity icon
 */
export function getSeverityIcon(severity: ErrorSolution['severity']): string {
  switch (severity) {
    case 'critical':
      return '🚨';
    case 'high':
      return '⚠️';
    case 'medium':
      return '⚡';
    case 'low':
      return 'ℹ️';
  }
}
