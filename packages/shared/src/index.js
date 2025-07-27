"use strict";
/**
 * Shared utilities and types for Recoder
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = exports.FEATURE_FLAGS = exports.EXTENSIONS = exports.SUCCESS_MESSAGES = exports.ERROR_MESSAGES = exports.VALIDATION_RULES = exports.INTEGRATION_CATEGORIES = exports.COMPLEXITY_LEVELS = exports.PROJECT_TYPES = exports.FRAMEWORK_TYPES = exports.TEMPLATE_CATEGORIES = exports.ErrorHandler = exports.ErrorCode = exports.RecoderError = exports.Logger = void 0;
const tslib_1 = require("tslib");
var logger_1 = require("./logger");
Object.defineProperty(exports, "Logger", { enumerable: true, get: function () { return logger_1.Logger; } });
var errors_1 = require("./errors");
Object.defineProperty(exports, "RecoderError", { enumerable: true, get: function () { return errors_1.RecoderError; } });
Object.defineProperty(exports, "ErrorCode", { enumerable: true, get: function () { return errors_1.ErrorCode; } });
Object.defineProperty(exports, "ErrorHandler", { enumerable: true, get: function () { return errors_1.ErrorHandler; } });
tslib_1.__exportStar(require("./types"), exports);
// Constants with type aliases to avoid conflicts - export only what exists
var constants_1 = require("./constants");
Object.defineProperty(exports, "TEMPLATE_CATEGORIES", { enumerable: true, get: function () { return constants_1.TEMPLATE_CATEGORIES; } });
Object.defineProperty(exports, "FRAMEWORK_TYPES", { enumerable: true, get: function () { return constants_1.FRAMEWORK_TYPES; } });
Object.defineProperty(exports, "PROJECT_TYPES", { enumerable: true, get: function () { return constants_1.PROJECT_TYPES; } });
Object.defineProperty(exports, "COMPLEXITY_LEVELS", { enumerable: true, get: function () { return constants_1.COMPLEXITY_LEVELS; } });
Object.defineProperty(exports, "INTEGRATION_CATEGORIES", { enumerable: true, get: function () { return constants_1.INTEGRATION_CATEGORIES; } });
Object.defineProperty(exports, "VALIDATION_RULES", { enumerable: true, get: function () { return constants_1.VALIDATION_RULES; } });
Object.defineProperty(exports, "ERROR_MESSAGES", { enumerable: true, get: function () { return constants_1.ERROR_MESSAGES; } });
Object.defineProperty(exports, "SUCCESS_MESSAGES", { enumerable: true, get: function () { return constants_1.SUCCESS_MESSAGES; } });
Object.defineProperty(exports, "EXTENSIONS", { enumerable: true, get: function () { return constants_1.EXTENSIONS; } });
Object.defineProperty(exports, "FEATURE_FLAGS", { enumerable: true, get: function () { return constants_1.FEATURE_FLAGS; } });
tslib_1.__exportStar(require("./utils"), exports);
// Version export
exports.VERSION = '1.0.0';
//# sourceMappingURL=index.js.map