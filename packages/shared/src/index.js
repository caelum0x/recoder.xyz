"use strict";
/**
 * CodeCraft Shared Utilities
 * Common types, utilities, and constants shared across all packages
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = exports.Logger = void 0;
// Utilities
class Logger {
    static info(message) {
        console.log(`[INFO] ${message}`);
    }
    static error(message) {
        console.error(`[ERROR] ${message}`);
    }
    static warn(message) {
        console.warn(`[WARN] ${message}`);
    }
}
exports.Logger = Logger;
exports.VERSION = '1.0.0';
//# sourceMappingURL=index.js.map