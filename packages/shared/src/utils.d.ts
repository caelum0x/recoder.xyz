/**
 * Shared utility functions
 */
/**
 * String utilities
 */
export declare class StringUtils {
    /**
     * Convert string to camelCase
     */
    static camelCase(str: string): string;
    /**
     * Convert string to PascalCase
     */
    static pascalCase(str: string): string;
    /**
     * Convert string to snake_case
     */
    static snakeCase(str: string): string;
    /**
     * Convert string to kebab-case
     */
    static kebabCase(str: string): string;
    /**
     * Convert string to Title Case
     */
    static titleCase(str: string): string;
    /**
     * Capitalize first letter
     */
    static capitalize(str: string): string;
    /**
     * Generate slug from string
     */
    static slugify(str: string): string;
    /**
     * Truncate string with ellipsis
     */
    static truncate(str: string, length: number, suffix?: string): string;
    /**
     * Remove extra whitespace
     */
    static clean(str: string): string;
    /**
     * Escape HTML entities
     */
    static escapeHtml(str: string): string;
    /**
     * Unescape HTML entities
     */
    static unescapeHtml(str: string): string;
    /**
     * Generate random string
     */
    static random(length: number, chars?: string): string;
    /**
     * Pluralize word
     */
    static pluralize(word: string, count?: number): string;
    /**
     * Singularize word
     */
    static singularize(word: string): string;
}
/**
 * Object utilities
 */
export declare class ObjectUtils {
    /**
     * Deep merge objects
     */
    static deepMerge(target: any, ...sources: any[]): any;
    /**
     * Deep clone object
     */
    static deepClone<T>(obj: T): T;
    /**
     * Check if value is object
     */
    static isObject(item: any): boolean;
    /**
     * Get nested value from object
     */
    static get(obj: any, path: string, defaultValue?: any): any;
    /**
     * Set nested value in object
     */
    static set(obj: any, path: string, value: any): void;
    /**
     * Check if object has nested path
     */
    static has(obj: any, path: string): boolean;
    /**
     * Pick keys from object
     */
    static pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>;
    /**
     * Omit keys from object
     */
    static omit<T, K extends keyof T>(obj: T, keys: K[]): Omit<T, K>;
    /**
     * Flatten object
     */
    static flatten(obj: any, prefix?: string): Record<string, any>;
    /**
     * Unflatten object
     */
    static unflatten(obj: Record<string, any>): any;
}
/**
 * Array utilities
 */
export declare class ArrayUtils {
    /**
     * Remove duplicates from array
     */
    static unique<T>(arr: T[]): T[];
    /**
     * Remove duplicates by key
     */
    static uniqueBy<T>(arr: T[], key: keyof T): T[];
    /**
     * Group array by key
     */
    static groupBy<T, K extends keyof T>(arr: T[], key: K): Record<string, T[]>;
    /**
     * Chunk array into smaller arrays
     */
    static chunk<T>(arr: T[], size: number): T[][];
    /**
     * Get random element from array
     */
    static random<T>(arr: T[]): T;
    /**
     * Shuffle array
     */
    static shuffle<T>(arr: T[]): T[];
    /**
     * Sort array by multiple keys
     */
    static sortBy<T>(arr: T[], ...keys: (keyof T)[]): T[];
    /**
     * Find intersection of arrays
     */
    static intersection<T>(...arrays: T[][]): T[];
    /**
     * Find difference of arrays
     */
    static difference<T>(arr1: T[], arr2: T[]): T[];
    /**
     * Find union of arrays
     */
    static union<T>(...arrays: T[][]): T[];
    /**
     * Check if arrays are equal
     */
    static isEqual<T>(arr1: T[], arr2: T[]): boolean;
}
/**
 * Date utilities
 */
export declare class DateUtils {
    /**
     * Format date
     */
    static format(date: Date, format: string): string;
    /**
     * Get relative time
     */
    static relative(date: Date): string;
    /**
     * Add time to date
     */
    static add(date: Date, amount: number, unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'): Date;
    /**
     * Check if date is today
     */
    static isToday(date: Date): boolean;
    /**
     * Check if date is yesterday
     */
    static isYesterday(date: Date): boolean;
    /**
     * Check if date is this week
     */
    static isThisWeek(date: Date): boolean;
}
/**
 * Number utilities
 */
export declare class NumberUtils {
    /**
     * Format number with commas
     */
    static format(num: number): string;
    /**
     * Format file size
     */
    static formatBytes(bytes: number, decimals?: number): string;
    /**
     * Generate random number
     */
    static random(min: number, max: number): number;
    /**
     * Clamp number between min and max
     */
    static clamp(num: number, min: number, max: number): number;
    /**
     * Round to precision
     */
    static round(num: number, decimals?: number): number;
    /**
     * Check if number is even
     */
    static isEven(num: number): boolean;
    /**
     * Check if number is odd
     */
    static isOdd(num: number): boolean;
    /**
     * Get percentage
     */
    static percentage(partial: number, total: number): number;
}
/**
 * Validation utilities
 */
export declare class ValidationUtils {
    /**
     * Validate email
     */
    static isEmail(email: string): boolean;
    /**
     * Validate URL
     */
    static isURL(url: string): boolean;
    /**
     * Validate UUID
     */
    static isUUID(uuid: string): boolean;
    /**
     * Validate semantic version
     */
    static isSemVer(version: string): boolean;
    /**
     * Validate slug
     */
    static isSlug(slug: string): boolean;
    /**
     * Validate hex color
     */
    static isHexColor(color: string): boolean;
    /**
     * Validate JSON string
     */
    static isJSON(str: string): boolean;
    /**
     * Validate IP address
     */
    static isIP(ip: string): boolean;
}
/**
 * Async utilities
 */
export declare class AsyncUtils {
    /**
     * Sleep for specified milliseconds
     */
    static sleep(ms: number): Promise<void>;
    /**
     * Retry function with exponential backoff
     */
    static retry<T>(fn: () => Promise<T>, maxRetries?: number, delay?: number, backoff?: number): Promise<T>;
    /**
     * Debounce function
     */
    static debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void;
    /**
     * Throttle function
     */
    static throttle<T extends (...args: any[]) => any>(func: T, limit: number): (...args: Parameters<T>) => void;
    /**
     * Execute functions in parallel with concurrency limit
     */
    static parallel<T>(tasks: (() => Promise<T>)[], concurrency?: number): Promise<T[]>;
    /**
     * Execute with timeout
     */
    static withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage?: string): Promise<T>;
}
/**
 * ID generation utilities
 */
export declare class IdUtils {
    /**
     * Generate UUID v4
     */
    static uuid(): string;
    /**
     * Generate short ID
     */
    static shortId(length?: number): string;
    /**
     * Generate numeric ID
     */
    static numericId(length?: number): string;
    /**
     * Generate timestamp-based ID
     */
    static timestampId(): string;
    /**
     * Generate nanoid
     */
    static nanoId(size?: number): string;
}
/**
 * Performance utilities
 */
export declare class PerformanceUtils {
    private static timers;
    /**
     * Start timer
     */
    static startTimer(name: string): void;
    /**
     * End timer and get duration
     */
    static endTimer(name: string): number;
    /**
     * Measure function execution time
     */
    static measure<T>(name: string, fn: () => Promise<T>): Promise<{
        result: T;
        duration: number;
    }>;
    /**
     * Get memory usage
     */
    static getMemoryUsage(): NodeJS.MemoryUsage;
    /**
     * Format memory usage
     */
    static formatMemoryUsage(usage: NodeJS.MemoryUsage): Record<string, string>;
}
//# sourceMappingURL=utils.d.ts.map