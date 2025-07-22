"use strict";
/**
 * Shared utilities and types for Recoder
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = exports.Logger = void 0;
const tslib_1 = require("tslib");
var logger_1 = require("./logger");
Object.defineProperty(exports, "Logger", { enumerable: true, get: function () { return logger_1.Logger; } });
tslib_1.__exportStar(require("./types"), exports);
tslib_1.__exportStar(require("./constants"), exports);
tslib_1.__exportStar(require("./utils"), exports);
// Version export
exports.VERSION = '1.0.0';
//# sourceMappingURL=index.js.map