// Browser-safe logger implementation without winston or chalk
export class Logger {
  private static instance: Logger;

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  static info(message: string, meta?: any): void {
    console.log('ℹ', message);
    if (meta) console.log(meta);
  }

  static warn(message: string, meta?: any): void {
    console.warn('⚠', message);
    if (meta) console.warn(meta);
  }

  static error(message: string, meta?: any): void {
    console.error('✗', message);
    if (meta) console.error(meta);
  }

  static success(message: string, meta?: any): void {
    console.log('✓', message);
    if (meta) console.log(meta);
  }

  static debug(message: string, meta?: any): void {
    if (typeof window !== 'undefined' && localStorage && localStorage.getItem('DEBUG')) {
      console.log('🐛', message);
      if (meta) console.log(meta);
    }
  }

  // Instance methods that delegate to static methods
  info(message: string, meta?: any): void {
    Logger.info(message, meta);
  }

  warn(message: string, meta?: any): void {
    Logger.warn(message, meta);
  }

  error(message: string, meta?: any): void {
    Logger.error(message, meta);
  }

  success(message: string, meta?: any): void {
    Logger.success(message, meta);
  }

  debug(message: string, meta?: any): void {
    Logger.debug(message, meta);
  }
}