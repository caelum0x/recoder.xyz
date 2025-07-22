"use strict";
/**
 * Shared utility functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceUtils = exports.IdUtils = exports.AsyncUtils = exports.ValidationUtils = exports.NumberUtils = exports.DateUtils = exports.ArrayUtils = exports.ObjectUtils = exports.StringUtils = void 0;
const uuid_1 = require("uuid");
const constants_1 = require("./constants");
/**
 * String utilities
 */
class StringUtils {
    /**
     * Convert string to camelCase
     */
    static camelCase(str) {
        return str
            .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
            return index === 0 ? word.toLowerCase() : word.toUpperCase();
        })
            .replace(/\s+/g, '');
    }
    /**
     * Convert string to PascalCase
     */
    static pascalCase(str) {
        return str
            .replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => {
            return word.toUpperCase();
        })
            .replace(/\s+/g, '');
    }
    /**
     * Convert string to snake_case
     */
    static snakeCase(str) {
        return str
            .replace(/\W+/g, ' ')
            .split(/ |\B(?=[A-Z])/)
            .map(word => word.toLowerCase())
            .join('_');
    }
    /**
     * Convert string to kebab-case
     */
    static kebabCase(str) {
        return str
            .replace(/\W+/g, ' ')
            .split(/ |\B(?=[A-Z])/)
            .map(word => word.toLowerCase())
            .join('-');
    }
    /**
     * Convert string to Title Case
     */
    static titleCase(str) {
        return str.replace(/\w\S*/g, (txt) => {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
    }
    /**
     * Capitalize first letter
     */
    static capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    /**
     * Generate slug from string
     */
    static slugify(str) {
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
    static truncate(str, length, suffix = '...') {
        if (str.length <= length) {
            return str;
        }
        return str.substring(0, length - suffix.length) + suffix;
    }
    /**
     * Remove extra whitespace
     */
    static clean(str) {
        return str.replace(/\s+/g, ' ').trim();
    }
    /**
     * Escape HTML entities
     */
    static escapeHtml(str) {
        const map = {
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
    static unescapeHtml(str) {
        const map = {
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
    static random(length, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    /**
     * Pluralize word
     */
    static pluralize(word, count) {
        if (count === 1) {
            return word;
        }
        const irregulars = {
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
    static singularize(word) {
        const irregulars = {
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
exports.StringUtils = StringUtils;
/**
 * Object utilities
 */
class ObjectUtils {
    /**
     * Deep merge objects
     */
    static deepMerge(target, ...sources) {
        if (!sources.length)
            return target;
        const source = sources.shift();
        if (this.isObject(target) && this.isObject(source)) {
            for (const key in source) {
                if (this.isObject(source[key])) {
                    if (!target[key])
                        Object.assign(target, { [key]: {} });
                    this.deepMerge(target[key], source[key]);
                }
                else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }
        return this.deepMerge(target, ...sources);
    }
    /**
     * Deep clone object
     */
    static deepClone(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }
        if (obj instanceof Array) {
            return obj.map(item => this.deepClone(item));
        }
        if (obj instanceof Object) {
            const cloned = {};
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
    static isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }
    /**
     * Get nested value from object
     */
    static get(obj, path, defaultValue) {
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
    static set(obj, path, value) {
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
    static has(obj, path) {
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
    static pick(obj, keys) {
        const result = {};
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
    static omit(obj, keys) {
        const result = { ...obj };
        for (const key of keys) {
            delete result[key];
        }
        return result;
    }
    /**
     * Flatten object
     */
    static flatten(obj, prefix = '') {
        const result = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const newKey = prefix ? `${prefix}.${key}` : key;
                if (this.isObject(obj[key])) {
                    Object.assign(result, this.flatten(obj[key], newKey));
                }
                else {
                    result[newKey] = obj[key];
                }
            }
        }
        return result;
    }
    /**
     * Unflatten object
     */
    static unflatten(obj) {
        const result = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                this.set(result, key, obj[key]);
            }
        }
        return result;
    }
}
exports.ObjectUtils = ObjectUtils;
/**
 * Array utilities
 */
class ArrayUtils {
    /**
     * Remove duplicates from array
     */
    static unique(arr) {
        return [...new Set(arr)];
    }
    /**
     * Remove duplicates by key
     */
    static uniqueBy(arr, key) {
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
    static groupBy(arr, key) {
        return arr.reduce((groups, item) => {
            const group = String(item[key]);
            groups[group] = groups[group] || [];
            groups[group].push(item);
            return groups;
        }, {});
    }
    /**
     * Chunk array into smaller arrays
     */
    static chunk(arr, size) {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    }
    /**
     * Get random element from array
     */
    static random(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }
    /**
     * Shuffle array
     */
    static shuffle(arr) {
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
    static sortBy(arr, ...keys) {
        return [...arr].sort((a, b) => {
            for (const key of keys) {
                const aVal = a[key];
                const bVal = b[key];
                if (aVal < bVal)
                    return -1;
                if (aVal > bVal)
                    return 1;
            }
            return 0;
        });
    }
    /**
     * Find intersection of arrays
     */
    static intersection(...arrays) {
        if (arrays.length === 0)
            return [];
        return arrays.reduce((acc, curr) => {
            return acc.filter(item => curr.includes(item));
        });
    }
    /**
     * Find difference of arrays
     */
    static difference(arr1, arr2) {
        return arr1.filter(item => !arr2.includes(item));
    }
    /**
     * Find union of arrays
     */
    static union(...arrays) {
        return this.unique(arrays.flat());
    }
    /**
     * Check if arrays are equal
     */
    static isEqual(arr1, arr2) {
        if (arr1.length !== arr2.length)
            return false;
        return arr1.every((item, index) => item === arr2[index]);
    }
}
exports.ArrayUtils = ArrayUtils;
/**
 * Date utilities
 */
class DateUtils {
    /**
     * Format date
     */
    static format(date, format) {
        const map = {
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
    static relative(date) {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const weeks = Math.floor(days / 7);
        const months = Math.floor(days / 30);
        const years = Math.floor(days / 365);
        if (years > 0)
            return `${years} year${years > 1 ? 's' : ''} ago`;
        if (months > 0)
            return `${months} month${months > 1 ? 's' : ''} ago`;
        if (weeks > 0)
            return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
        if (days > 0)
            return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0)
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0)
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return 'just now';
    }
    /**
     * Add time to date
     */
    static add(date, amount, unit) {
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
    static isToday(date) {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }
    /**
     * Check if date is yesterday
     */
    static isYesterday(date) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return date.toDateString() === yesterday.toDateString();
    }
    /**
     * Check if date is this week
     */
    static isThisWeek(date) {
        const now = new Date();
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6));
        return date >= startOfWeek && date <= endOfWeek;
    }
}
exports.DateUtils = DateUtils;
/**
 * Number utilities
 */
class NumberUtils {
    /**
     * Format number with commas
     */
    static format(num) {
        return num.toLocaleString();
    }
    /**
     * Format file size
     */
    static formatBytes(bytes, decimals = 2) {
        if (bytes === 0)
            return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
    /**
     * Generate random number
     */
    static random(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    /**
     * Clamp number between min and max
     */
    static clamp(num, min, max) {
        return Math.min(Math.max(num, min), max);
    }
    /**
     * Round to precision
     */
    static round(num, decimals = 2) {
        return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
    }
    /**
     * Check if number is even
     */
    static isEven(num) {
        return num % 2 === 0;
    }
    /**
     * Check if number is odd
     */
    static isOdd(num) {
        return num % 2 !== 0;
    }
    /**
     * Get percentage
     */
    static percentage(partial, total) {
        return (partial / total) * 100;
    }
}
exports.NumberUtils = NumberUtils;
/**
 * Validation utilities
 */
class ValidationUtils {
    /**
     * Validate email
     */
    static isEmail(email) {
        return constants_1.VALIDATION_RULES.EMAIL.PATTERN.test(email);
    }
    /**
     * Validate URL
     */
    static isURL(url) {
        try {
            new URL(url);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Validate UUID
     */
    static isUUID(uuid) {
        return constants_1.VALIDATION_RULES.UUID.PATTERN.test(uuid);
    }
    /**
     * Validate semantic version
     */
    static isSemVer(version) {
        return constants_1.VALIDATION_RULES.SEMVER.PATTERN.test(version);
    }
    /**
     * Validate slug
     */
    static isSlug(slug) {
        return constants_1.VALIDATION_RULES.SLUG.PATTERN.test(slug);
    }
    /**
     * Validate hex color
     */
    static isHexColor(color) {
        return constants_1.VALIDATION_RULES.COLOR.HEX.test(color);
    }
    /**
     * Validate JSON string
     */
    static isJSON(str) {
        try {
            JSON.parse(str);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Validate IP address
     */
    static isIP(ip) {
        const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const ipv6 = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
        return ipv4.test(ip) || ipv6.test(ip);
    }
}
exports.ValidationUtils = ValidationUtils;
/**
 * Async utilities
 */
class AsyncUtils {
    /**
     * Sleep for specified milliseconds
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Retry function with exponential backoff
     */
    static async retry(fn, maxRetries = 3, delay = 1000, backoff = 2) {
        let lastError;
        let currentDelay = delay;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            }
            catch (error) {
                lastError = error;
                if (attempt === maxRetries) {
                    break;
                }
                await this.sleep(currentDelay);
                currentDelay *= backoff;
            }
        }
        throw lastError;
    }
    /**
     * Debounce function
     */
    static debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }
    /**
     * Throttle function
     */
    static throttle(func, limit) {
        let inThrottle;
        return (...args) => {
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
    static async parallel(tasks, concurrency = 5) {
        const results = [];
        const executing = [];
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
    static async withTimeout(promise, timeoutMs, timeoutMessage = 'Operation timed out') {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs))
        ]);
    }
}
exports.AsyncUtils = AsyncUtils;
/**
 * ID generation utilities
 */
class IdUtils {
    /**
     * Generate UUID v4
     */
    static uuid() {
        return (0, uuid_1.v4)();
    }
    /**
     * Generate short ID
     */
    static shortId(length = 8) {
        return StringUtils.random(length, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
    }
    /**
     * Generate numeric ID
     */
    static numericId(length = 10) {
        return StringUtils.random(length, '0123456789');
    }
    /**
     * Generate timestamp-based ID
     */
    static timestampId() {
        return Date.now().toString(36) + StringUtils.random(4);
    }
    /**
     * Generate nanoid
     */
    static nanoId(size = 21) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let id = '';
        for (let i = 0; i < size; i++) {
            id += alphabet[Math.floor(Math.random() * alphabet.length)];
        }
        return id;
    }
}
exports.IdUtils = IdUtils;
/**
 * Performance utilities
 */
class PerformanceUtils {
    /**
     * Start timer
     */
    static startTimer(name) {
        this.timers.set(name, Date.now());
    }
    /**
     * End timer and get duration
     */
    static endTimer(name) {
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
    static async measure(name, fn) {
        const startTime = Date.now();
        const result = await fn();
        const duration = Date.now() - startTime;
        return { result, duration };
    }
    /**
     * Get memory usage
     */
    static getMemoryUsage() {
        return process.memoryUsage();
    }
    /**
     * Format memory usage
     */
    static formatMemoryUsage(usage) {
        return {
            rss: NumberUtils.formatBytes(usage.rss),
            heapTotal: NumberUtils.formatBytes(usage.heapTotal),
            heapUsed: NumberUtils.formatBytes(usage.heapUsed),
            external: NumberUtils.formatBytes(usage.external),
        };
    }
}
exports.PerformanceUtils = PerformanceUtils;
PerformanceUtils.timers = new Map();
//# sourceMappingURL=utils.js.map