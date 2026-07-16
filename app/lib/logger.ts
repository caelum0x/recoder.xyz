/**
 * Structured JSON logger for production API routes.
 * Zero dependencies — wraps console methods with structured output.
 */

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  msg: string;
  ts: string;
  route?: string;
  [key: string]: unknown;
}

function formatEntry(level: LogLevel, msg: string, meta?: Record<string, unknown>): string {
  const entry: LogEntry = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...meta,
  };
  return JSON.stringify(entry);
}

export const logger = {
  info(msg: string, meta?: Record<string, unknown>) {
    console.log(formatEntry('info', msg, meta));
  },

  warn(msg: string, meta?: Record<string, unknown>) {
    console.warn(formatEntry('warn', msg, meta));
  },

  error(msg: string, meta?: Record<string, unknown>) {
    console.error(formatEntry('error', msg, meta));
  },
};
