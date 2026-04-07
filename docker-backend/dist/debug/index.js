"use strict";
/**
 * Debug Module
 *
 * Exports all debug-related functionality for the Debug Adapter Protocol (DAP) implementation.
 * Supports debugging for multiple languages: JavaScript, TypeScript, Python, Go, Rust.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugManager = exports.DEBUG_ADAPTER_CONFIGS = exports.DAPClient = void 0;
// DAP Client - Low-level DAP protocol implementation
var dap_client_js_1 = require("./dap-client.js");
Object.defineProperty(exports, "DAPClient", { enumerable: true, get: function () { return dap_client_js_1.DAPClient; } });
Object.defineProperty(exports, "DEBUG_ADAPTER_CONFIGS", { enumerable: true, get: function () { return dap_client_js_1.DEBUG_ADAPTER_CONFIGS; } });
// Debug Manager - High-level session management
var debug_manager_js_1 = require("./debug-manager.js");
Object.defineProperty(exports, "debugManager", { enumerable: true, get: function () { return debug_manager_js_1.debugManager; } });
