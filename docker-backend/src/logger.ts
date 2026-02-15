import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';
const isDev = process.env.NODE_ENV !== 'production';

export const rootLogger = pino({
  level,
  ...(isDev ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
});

export function createLogger(name: string) {
  return rootLogger.child({ component: name });
}

export const logger = rootLogger;
