"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.rootLogger = void 0;
exports.createLogger = createLogger;
const pino_1 = __importDefault(require("pino"));
const level = process.env.LOG_LEVEL || 'info';
const isDev = process.env.NODE_ENV !== 'production';
exports.rootLogger = (0, pino_1.default)({
    level,
    ...(isDev ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
});
function createLogger(name) {
    return exports.rootLogger.child({ component: name });
}
exports.logger = exports.rootLogger;
