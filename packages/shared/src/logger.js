"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const tslib_1 = require("tslib");
const winston_1 = tslib_1.__importDefault(require("winston"));
const chalk_1 = tslib_1.__importDefault(require("chalk"));
// Create logger instance
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())
        })
    ]
});
class Logger {
    static info(message, meta) {
        console.log(chalk_1.default.blue('ℹ'), message);
        if (meta)
            logger.info(message, meta);
    }
    static warn(message, meta) {
        console.log(chalk_1.default.yellow('⚠'), message);
        if (meta)
            logger.warn(message, meta);
    }
    static error(message, meta) {
        console.log(chalk_1.default.red('✗'), message);
        if (meta)
            logger.error(message, meta);
    }
    static success(message, meta) {
        console.log(chalk_1.default.green('✓'), message);
        if (meta)
            logger.info(message, meta);
    }
    static debug(message, meta) {
        if (process.env.LOG_LEVEL === 'debug') {
            console.log(chalk_1.default.gray('🐛'), message);
            if (meta)
                logger.debug(message, meta);
        }
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map