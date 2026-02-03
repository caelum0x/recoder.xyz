export type DebugLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

type LoggerFunction = (...messages: any[]) => void;

interface Logger {
  trace: LoggerFunction;
  debug: LoggerFunction;
  info: LoggerFunction;
  warn: LoggerFunction;
  error: LoggerFunction;
  setLevel: (level: DebugLevel) => void;
}

// ============================
// DEBUG FLAG & TIMING UTILITIES
// ============================

/**
 * Global DEBUG flag - enable verbose logging
 * Set via VITE_DEBUG=true or localStorage.setItem('DEBUG', 'true')
 */
export const DEBUG = typeof window !== 'undefined'
  ? (localStorage.getItem('DEBUG') === 'true' || import.meta.env.VITE_DEBUG === 'true')
  : (import.meta.env.VITE_DEBUG === 'true');

/**
 * Enable/disable debug mode at runtime
 */
export function setDebugMode(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    if (enabled) {
      localStorage.setItem('DEBUG', 'true');
    } else {
      localStorage.removeItem('DEBUG');
    }
    console.log(`[Logger] Debug mode ${enabled ? 'ENABLED' : 'DISABLED'}. Refresh page for full effect.`);
  }
}

/**
 * Get current timestamp in ISO format
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Timer utility for measuring execution time
 * Usage:
 *   const timer = createTimer('operationName');
 *   // ... do work ...
 *   timer.end(); // logs "operationName completed in 123ms"
 */
export interface Timer {
  /** End the timer and log the duration */
  end: (additionalInfo?: string) => number;
  /** Get elapsed time without ending */
  elapsed: () => number;
  /** Get the start time */
  startTime: number;
}

export function createTimer(operationName: string, scope?: string): Timer {
  const startTime = performance.now();
  const scopePrefix = scope ? `[${scope}] ` : '';

  return {
    startTime,
    elapsed: () => Math.round(performance.now() - startTime),
    end: (additionalInfo?: string) => {
      const duration = Math.round(performance.now() - startTime);
      const info = additionalInfo ? ` - ${additionalInfo}` : '';
      if (DEBUG) {
        console.log(`${scopePrefix}${operationName} completed in ${duration}ms${info}`);
      }
      return duration;
    }
  };
}

/**
 * Structured log entry for debugging
 */
export interface StructuredLogEntry {
  timestamp: string;
  level: DebugLevel;
  scope?: string;
  message: string;
  data?: Record<string, unknown>;
  duration?: number;
}

/**
 * Format a structured log entry
 */
export function formatStructuredLog(entry: StructuredLogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    entry.scope ? `[${entry.scope}]` : '',
    entry.message,
    entry.duration !== undefined ? `(${entry.duration}ms)` : '',
  ].filter(Boolean);

  return parts.join(' ');
}

let currentLevel: DebugLevel = import.meta.env.VITE_LOG_LEVEL ?? import.meta.env.DEV ? 'debug' : 'info';

// Scopes to suppress from console output
const suppressedScopes = new Set(['ChatHistory']);

const isWorker = 'HTMLRewriter' in globalThis;
const supportsColor = !isWorker;

export const logger: Logger = {
  trace: (...messages: any[]) => log('trace', undefined, messages),
  debug: (...messages: any[]) => log('debug', undefined, messages),
  info: (...messages: any[]) => log('info', undefined, messages),
  warn: (...messages: any[]) => log('warn', undefined, messages),
  error: (...messages: any[]) => log('error', undefined, messages),
  setLevel,
};

/**
 * Extended Logger with timing and structured logging support
 */
export interface ExtendedLogger extends Logger {
  /** Create a timer for this scope */
  time: (operationName: string) => Timer;
  /** Log with timing information */
  timed: (level: DebugLevel, message: string, duration: number, data?: Record<string, unknown>) => void;
  /** Structured debug log (only when DEBUG=true) */
  debugVerbose: (...messages: any[]) => void;
}

export function createScopedLogger(scope: string): ExtendedLogger {
  return {
    trace: (...messages: any[]) => log('trace', scope, messages),
    debug: (...messages: any[]) => log('debug', scope, messages),
    info: (...messages: any[]) => log('info', scope, messages),
    warn: (...messages: any[]) => log('warn', scope, messages),
    error: (...messages: any[]) => log('error', scope, messages),
    setLevel,
    // Extended methods
    time: (operationName: string) => createTimer(operationName, scope),
    timed: (level: DebugLevel, message: string, duration: number, data?: Record<string, unknown>) => {
      const timedMessage = `${message} (${duration}ms)`;
      if (data && DEBUG) {
        log(level, scope, [timedMessage, data]);
      } else {
        log(level, scope, [timedMessage]);
      }
    },
    debugVerbose: (...messages: any[]) => {
      if (DEBUG) {
        log('debug', scope, messages);
      }
    },
  };
}

function setLevel(level: DebugLevel) {
  if ((level === 'trace' || level === 'debug') && import.meta.env.PROD) {
    return;
  }

  currentLevel = level;
}

function log(level: DebugLevel, scope: string | undefined, messages: any[]) {
  const levelOrder: DebugLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];

  if (levelOrder.indexOf(level) < levelOrder.indexOf(currentLevel)) {
    return;
  }

  // Suppress logs from specific scopes
  if (scope && suppressedScopes.has(scope)) {
    return;
  }

  const allMessages = messages.reduce((acc, current) => {
    if (acc.endsWith('\n')) {
      return acc + current;
    }

    if (!acc) {
      return current;
    }

    return `${acc} ${current}`;
  }, '');

  if (!supportsColor) {
    console.log(`[${level.toUpperCase()}]`, allMessages);

    return;
  }

  const labelBackgroundColor = getColorForLevel(level);
  const labelTextColor = level === 'warn' ? 'black' : 'white';

  const labelStyles = getLabelStyles(labelBackgroundColor, labelTextColor);
  const scopeStyles = getLabelStyles('#77828D', 'white');

  const styles = [labelStyles];

  if (typeof scope === 'string') {
    styles.push('', scopeStyles);
  }

  console.log(`%c${level.toUpperCase()}${scope ? `%c %c${scope}` : ''}`, ...styles, allMessages);
}

function getLabelStyles(color: string, textColor: string) {
  return `background-color: ${color}; color: white; border: 4px solid ${color}; color: ${textColor};`;
}

function getColorForLevel(level: DebugLevel): string {
  switch (level) {
    case 'trace':
    case 'debug': {
      return '#77828D';
    }
    case 'info': {
      return '#1389FD';
    }
    case 'warn': {
      return '#FFDB6C';
    }
    case 'error': {
      return '#EE4744';
    }
    default: {
      return 'black';
    }
  }
}

export const renderLogger = createScopedLogger('Render');
