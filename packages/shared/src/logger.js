"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const winston_1 = __importDefault(require("winston"));
const chalk_1 = __importDefault(require("chalk"));
// Create logger instance
const logger = winston_1.default.createLogger({
    level: process.env['LOG_LEVEL'] || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())
        })
    ]
});
class Logger {
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
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
        if (process.env['LOG_LEVEL'] === 'debug') {
            console.log(chalk_1.default.gray('🐛'), message);
            if (meta)
                logger.debug(message, meta);
        }
    }
    // Instance methods that delegate to static methods
    info(message, meta) {
        Logger.info(message, meta);
    }
    warn(message, meta) {
        Logger.warn(message, meta);
    }
    error(message, meta) {
        Logger.error(message, meta);
    }
    success(message, meta) {
        Logger.success(message, meta);
    }
    debug(message, meta) {
        Logger.debug(message, meta);
    }
}
exports.Logger = Logger;
