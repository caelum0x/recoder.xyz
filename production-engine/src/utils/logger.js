"use strict";
/**
 * Logger utility for Production Engine
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
class ConsoleLogger {
    info(message, meta) {
        console.log(`[INFO] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
    }
    warn(message, meta) {
        console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
    }
    error(message, meta) {
        console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
    }
    debug(message, meta) {
        if (process.env.NODE_ENV === 'development') {
            console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
        }
    }
}
exports.logger = new ConsoleLogger();
