"use strict";
/**
 * CLI-Web Sync Module
 * Exports all sync-related utilities and managers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncManager = exports.getDiffStats = exports.generateUnifiedDiff = exports.getDetailedDiff = exports.diffFileSets = exports.createFileMetaMap = exports.hashContent = void 0;
var file_diff_js_1 = require("./file-diff.js");
Object.defineProperty(exports, "hashContent", { enumerable: true, get: function () { return file_diff_js_1.hashContent; } });
Object.defineProperty(exports, "createFileMetaMap", { enumerable: true, get: function () { return file_diff_js_1.createFileMetaMap; } });
Object.defineProperty(exports, "diffFileSets", { enumerable: true, get: function () { return file_diff_js_1.diffFileSets; } });
Object.defineProperty(exports, "getDetailedDiff", { enumerable: true, get: function () { return file_diff_js_1.getDetailedDiff; } });
Object.defineProperty(exports, "generateUnifiedDiff", { enumerable: true, get: function () { return file_diff_js_1.generateUnifiedDiff; } });
Object.defineProperty(exports, "getDiffStats", { enumerable: true, get: function () { return file_diff_js_1.getDiffStats; } });
var sync_manager_js_1 = require("./sync-manager.js");
Object.defineProperty(exports, "syncManager", { enumerable: true, get: function () { return sync_manager_js_1.syncManager; } });
