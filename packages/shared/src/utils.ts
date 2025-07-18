/**
 * Shared utility functions
 */

import { v4 as uuidv4 } from 'uuid';
import { VALIDATION_RULES } from './constants';

/**
 * String utilities
 */
export class StringUtils {
  /**
   * Convert string to camelCase
   */
  static camelCase(str: string): string {
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
      })
      .replace(/\s+/g, '');
  }

  /**
   * Convert string to PascalCase
   */
  static pascalCase(str: string): string {
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => {
        return word.toUpperCase();
      })
      .replace(/\s+/g, '');
  }

  /**
   * Convert string to snake_case
   */
  static snakeCase(str: string): string {
    return str
      .replace(/\W+/g, ' ')
      .split(/ |\B(?=[A-Z])/)
      .map(word => word.toLowerCase())
      .join('_');
  }

  /**
   * Convert string to kebab-case
   */
  static kebabCase(str: string): string {
    return str
      .replace(/\W+/g, ' ')
      .split(/ |\B(?=[A-Z])/)
      .map(word => word.toLowerCase())
      .join('-');
  }

  /**
   * Convert string to Title Case
   */
  static titleCase(str: string): string {
    return str.replace(/\w\S*/g, (txt) => {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
  }

  /**
   * Capitalize first letter
   */
  static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Generate slug from string
   */
  static slugify(str: string): string {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Truncate string with ellipsis
   */
  static truncate(str: string, length: number, suffix: string = '...'): string {
    if (str.length <= length) {
      return str;
    }
    return str.substring(0, length - suffix.length) + suffix;
  }

  /**
   * Remove extra whitespace
   */
  static clean(str: string): string {
    return str.replace(/\s+/g, ' ').trim();
  }

  /**
   * Escape HTML entities
   */
  static escapeHtml(str: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return str.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Unescape HTML entities
   */
  static unescapeHtml(str: string): string {
    const map: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
    };
    return str.replace(/&(amp|lt|gt|quot|#39);/g, (m) => map[m]);
  }

  /**
   * Generate random string
   */
  static random(length: number, chars: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Pluralize word
   */
  static pluralize(word: string, count?: number): string {
    if (count === 1) {
      return word;
    }

    const irregulars: Record<string, string> = {
      'man': 'men',
      'woman': 'women',
      'child': 'children',
      'foot': 'feet',
      'tooth': 'teeth',
      'goose': 'geese',
      'mouse': 'mice',
      'person': 'people',
    };

    if (irregulars[word]) {
      return irregulars[word];
    }

    if (word.endsWith('y') && !'aeiou'.includes(word[word.length - 2])) {
      return word.slice(0, -1) + 'ies';
    }

    if (word.endsWith('s') || word.endsWith('sh') || word.endsWith('ch') || word.endsWith('x') || word.endsWith('z')) {
      return word + 'es';
    }

    if (word.endsWith('f')) {
      return word.slice(0, -1) + 'ves';
    }

    if (word.endsWith('fe')) {
      return word.slice(0, -2) + 'ves';
    }

    return word + 's';
  }

  /**
   * Singularize word
   */
  static singularize(word: string): string {
    const irregulars: Record<string, string> = {
      'men': 'man',
      'women': 'woman',
      'children': 'child',
      'feet': 'foot',
      'teeth': 'tooth',
      'geese': 'goose',
      'mice': 'mouse',
      'people': 'person',
    };

    if (irregulars[word]) {
      return irregulars[word];
    }

    if (word.endsWith('ies')) {
      return word.slice(0, -3) + 'y';
    }

    if (word.endsWith('ves')) {
      return word.slice(0, -3) + 'f';
    }

    if (word.endsWith('es')) {
      return word.slice(0, -2);
    }

    if (word.endsWith('s')) {
      return word.slice(0, -1);
    }

    return word;
  }
}

/**
 * Object utilities
 */
export class ObjectUtils {
  /**
   * Deep merge objects
   */
  static deepMerge(target: any, ...sources: any[]): any {
    if (!sources.length) return target;
    const source = sources.shift();

    if (this.isObject(target) && this.isObject(source)) {
      for (const key in source) {
        if (this.isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          this.deepMerge(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }

    return this.deepMerge(target, ...sources);
  }

  /**
   * Deep clone object
   */
  static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime()) as any;
    }

    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item)) as any;
    }

    if (obj instanceof Object) {
      const cloned = {} as any;
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = this.deepClone(obj[key]);
        }
      }
      return cloned;
    }

    return obj;
  }

  /**
   * Check if value is object
   */
  static isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Get nested value from object
   */
  static get(obj: any, path: string, defaultValue?: any): any {
    const keys = path.split('.');
    let result = obj;

    for (const key of keys) {
      if (result === null || result === undefined) {
        return defaultValue;
      }
      result = result[key];
    }

    return result !== undefined ? result : defaultValue;
  }

  /**
   * Set nested value in object
   */
  static set(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || !this.isObject(current[key])) {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Check if object has nested path
   */
  static has(obj: any, path: string): boolean {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined || !(key in current)) {
        return false;
      }
      current = current[key];
    }

    return true;
  }

  /**
   * Pick keys from object
   */
  static pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
    const result = {} as Pick<T, K>;
    for (const key of keys) {
      if (key in obj) {
        result[key] = obj[key];
      }
    }
    return result;
  }

  /**
   * Omit keys from object
   */
  static omit<T, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
    const result = { ...obj };
    for (const key of keys) {
      delete result[key];
    }
    return result;
  }

  /**
   * Flatten object
   */
  static flatten(obj: any, prefix: string = ''): Record<string, any> {
    const result: Record<string, any> = {};

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (this.isObject(obj[key])) {
          Object.assign(result, this.flatten(obj[key], newKey));
        } else {
          result[newKey] = obj[key];
        }
      }
    }

    return result;
  }

  /**
   * Unflatten object
   */
  static unflatten(obj: Record<string, any>): any {
    const result: any = {};

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        this.set(result, key, obj[key]);
      }
    }

    return result;
  }
}

/**
 * Array utilities
 */
export class ArrayUtils {
  /**
   * Remove duplicates from array
   */
  static unique<T>(arr: T[]): T[] {
    return [...new Set(arr)];
  }

  /**
   * Remove duplicates by key
   */
  static uniqueBy<T>(arr: T[], key: keyof T): T[] {
    const seen = new Set();
    return arr.filter(item => {
      const value = item[key];
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
  }

  /**
   * Group array by key
   */
  static groupBy<T, K extends keyof T>(arr: T[], key: K): Record<string, T[]> {
    return arr.reduce((groups, item) => {
      const group = String(item[key]);
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  /**
   * Chunk array into smaller arrays
   */
  static chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get random element from array
   */
  static random<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Shuffle array
   */
  static shuffle<T>(arr: T[]): T[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Sort array by multiple keys
   */
  static sortBy<T>(arr: T[], ...keys: (keyof T)[]): T[] {
    return [...arr].sort((a, b) => {
      for (const key of keys) {
        const aVal = a[key];
        const bVal = b[key];
        
        if (aVal < bVal) return -1;
        if (aVal > bVal) return 1;
      }
      return 0;
    });
  }

  /**
   * Find intersection of arrays
   */
  static intersection<T>(...arrays: T[][]): T[] {
    if (arrays.length === 0) return [];
    
    return arrays.reduce((acc, curr) => {
      return acc.filter(item => curr.includes(item));
    });
  }

  /**
   * Find difference of arrays
   */
  static difference<T>(arr1: T[], arr2: T[]): T[] {
    return arr1.filter(item => !arr2.includes(item));
  }

  /**
   * Find union of arrays
   */
  static union<T>(...arrays: T[][]): T[] {
    return this.unique(arrays.flat());
  }

  /**
   * Check if arrays are equal
   */
  static isEqual<T>(arr1: T[], arr2: T[]): boolean {
    if (arr1.length !== arr2.length) return false;
    return arr1.every((item, index) => item === arr2[index]);
  }
}

/**
 * Date utilities
 */
export class DateUtils {
  /**
   * Format date
   */
  static format(date: Date, format: string): string {
    const map: Record<string, string> = {
      'YYYY': date.getFullYear().toString(),
      'MM': String(date.getMonth() + 1).padStart(2, '0'),
      'DD': String(date.getDate()).padStart(2, '0'),
      'HH': String(date.getHours()).padStart(2, '0'),
      'mm': String(date.getMinutes()).padStart(2, '0'),
      'ss': String(date.getSeconds()).padStart(2, '0'),
    };

    return format.replace(/YYYY|MM|DD|HH|mm|ss/g, match => map[match]);
  }

  /**
   * Get relative time
   */
  static relative(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
    if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
    if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
  }

  /**
   * Add time to date
   */
  static add(date: Date, amount: number, unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'): Date {
    const result = new Date(date);
    
    switch (unit) {
      case 'seconds':
        result.setSeconds(result.getSeconds() + amount);
        break;
      case 'minutes':
        result.setMinutes(result.getMinutes() + amount);
        break;
      case 'hours':
        result.setHours(result.getHours() + amount);
        break;
      case 'days':
        result.setDate(result.getDate() + amount);
        break;
      case 'weeks':
        result.setDate(result.getDate() + amount * 7);
        break;
      case 'months':
        result.setMonth(result.getMonth() + amount);
        break;
      case 'years':
        result.setFullYear(result.getFullYear() + amount);
        break;
    }
    
    return result;
  }

  /**
   * Check if date is today
   */
  static isToday(date: Date): boolean {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  /**
   * Check if date is yesterday
   */
  static isYesterday(date: Date): boolean {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
  }

  /**
   * Check if date is this week
   */
  static isThisWeek(date: Date): boolean {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6));
    return date >= startOfWeek && date <= endOfWeek;
  }
}

/**
 * Number utilities
 */
export class NumberUtils {
  /**
   * Format number with commas
   */
  static format(num: number): string {
    return num.toLocaleString();
  }

  /**
   * Format file size
   */
  static formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Generate random number
   */
  static random(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Clamp number between min and max
   */
  static clamp(num: number, min: number, max: number): number {
    return Math.min(Math.max(num, min), max);
  }

  /**
   * Round to precision
   */
  static round(num: number, decimals: number = 2): number {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  /**
   * Check if number is even
   */
  static isEven(num: number): boolean {
    return num % 2 === 0;
  }

  /**
   * Check if number is odd
   */
  static isOdd(num: number): boolean {
    return num % 2 !== 0;
  }

  /**
   * Get percentage
   */
  static percentage(partial: number, total: number): number {
    return (partial / total) * 100;
  }
}

/**
 * Validation utilities
 */
export class ValidationUtils {
  /**
   * Validate email
   */
  static isEmail(email: string): boolean {
    return VALIDATION_RULES.EMAIL.PATTERN.test(email);
  }

  /**
   * Validate URL
   */
  static isURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate UUID
   */
  static isUUID(uuid: string): boolean {
    return VALIDATION_RULES.UUID.PATTERN.test(uuid);
  }

  /**
   * Validate semantic version
   */
  static isSemVer(version: string): boolean {
    return VALIDATION_RULES.SEMVER.PATTERN.test(version);
  }

  /**
   * Validate slug
   */
  static isSlug(slug: string): boolean {
    return VALIDATION_RULES.SLUG.PATTERN.test(slug);
  }

  /**
   * Validate hex color
   */
  static isHexColor(color: string): boolean {
    return VALIDATION_RULES.COLOR.HEX.test(color);
  }

  /**
   * Validate JSON string
   */
  static isJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate IP address
   */
  static isIP(ip: string): boolean {
    const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6 = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    return ipv4.test(ip) || ipv6.test(ip);
  }
}

/**
 * Async utilities
 */
export class AsyncUtils {
  /**
   * Sleep for specified milliseconds
   */
  static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry function with exponential backoff
   */
  static async retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
    backoff: number = 2
  ): Promise<T> {
    let lastError: Error;
    let currentDelay = delay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          break;
        }

        await this.sleep(currentDelay);
        currentDelay *= backoff;
      }
    }

    throw lastError!;
  }

  /**
   * Debounce function
   */
  static debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;

    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  /**
   * Throttle function
   */
  static throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean;

    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Execute functions in parallel with concurrency limit
   */
  static async parallel<T>(
    tasks: (() => Promise<T>)[],
    concurrency: number = 5
  ): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<any>[] = [];

    for (const task of tasks) {
      const promise = task().then(result => {
        results.push(result);
        executing.splice(executing.indexOf(promise), 1);
      });

      executing.push(promise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
    return results;
  }

  /**
   * Execute with timeout
   */
  static async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string = 'Operation timed out'
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      )
    ]);
  }
}

/**
 * ID generation utilities
 */
export class IdUtils {
  /**
   * Generate UUID v4
   */
  static uuid(): string {
    return uuidv4();
  }

  /**
   * Generate short ID
   */
  static shortId(length: number = 8): string {
    return StringUtils.random(length, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
  }

  /**
   * Generate numeric ID
   */
  static numericId(length: number = 10): string {
    return StringUtils.random(length, '0123456789');
  }

  /**
   * Generate timestamp-based ID
   */
  static timestampId(): string {
    return Date.now().toString(36) + StringUtils.random(4);
  }

  /**
   * Generate nanoid
   */
  static nanoId(size: number = 21): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    
    for (let i = 0; i < size; i++) {
      id += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    
    return id;
  }
}

/**
 * Performance utilities
 */
export class PerformanceUtils {
  private static timers: Map<string, number> = new Map();

  /**
   * Start timer
   */
  static startTimer(name: string): void {
    this.timers.set(name, Date.now());
  }

  /**
   * End timer and get duration
   */
  static endTimer(name: string): number {
    const startTime = this.timers.get(name);
    if (!startTime) {
      throw new Error(`Timer '${name}' not found`);
    }
    
    const duration = Date.now() - startTime;
    this.timers.delete(name);
    return duration;
  }

  /**
   * Measure function execution time
   */
  static async measure<T>(name: string, fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const startTime = Date.now();
    const result = await fn();
    const duration = Date.now() - startTime;
    
    return { result, duration };
  }

  /**
   * Get memory usage
   */
  static getMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  /**
   * Format memory usage
   */
  static formatMemoryUsage(usage: NodeJS.MemoryUsage): Record<string, string> {
    return {
      rss: NumberUtils.formatBytes(usage.rss),
      heapTotal: NumberUtils.formatBytes(usage.heapTotal),
      heapUsed: NumberUtils.formatBytes(usage.heapUsed),
      external: NumberUtils.formatBytes(usage.external),
    };
  }
}