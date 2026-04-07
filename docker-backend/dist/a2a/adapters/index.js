"use strict";
/**
 * @module adapters
 *
 * Barrel export for A2A protocol adapters.
 *
 * Adapters translate A2A envelopes to/from different communication protocols,
 * enabling agents on various platforms to participate in the A2A mesh.
 *
 * - REST adapter: HTTP-based agents (Replit, custom webhooks, external services)
 * - Git adapter: File/branch-based agents (VS Code+Copilot, JetBrains)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetAdapterRegistry = exports.getAdapterRegistry = exports.AdapterRegistry = exports.gitAdapterRouter = exports.restAdapterRouter = exports.DEFAULT_GIT_ADAPTER_CONFIG = exports.resetGitAdapters = exports.unregisterGitAdapter = exports.listGitAdapters = exports.getGitAdapter = exports.registerGitAdapter = exports.DefaultGitExecutor = exports.GitAdapter = exports.DEFAULT_REST_ADAPTER_CONFIG = exports.resetRestAdapters = exports.unregisterRestAdapter = exports.listRestAdapters = exports.getRestAdapter = exports.registerRestAdapter = exports.buildEnvelope = exports.RestAdapter = void 0;
// REST adapter
var rest_adapter_1 = require("./rest-adapter");
Object.defineProperty(exports, "RestAdapter", { enumerable: true, get: function () { return rest_adapter_1.RestAdapter; } });
Object.defineProperty(exports, "buildEnvelope", { enumerable: true, get: function () { return rest_adapter_1.buildEnvelope; } });
Object.defineProperty(exports, "registerRestAdapter", { enumerable: true, get: function () { return rest_adapter_1.registerRestAdapter; } });
Object.defineProperty(exports, "getRestAdapter", { enumerable: true, get: function () { return rest_adapter_1.getRestAdapter; } });
Object.defineProperty(exports, "listRestAdapters", { enumerable: true, get: function () { return rest_adapter_1.listRestAdapters; } });
Object.defineProperty(exports, "unregisterRestAdapter", { enumerable: true, get: function () { return rest_adapter_1.unregisterRestAdapter; } });
Object.defineProperty(exports, "resetRestAdapters", { enumerable: true, get: function () { return rest_adapter_1.resetRestAdapters; } });
Object.defineProperty(exports, "DEFAULT_REST_ADAPTER_CONFIG", { enumerable: true, get: function () { return rest_adapter_1.DEFAULT_REST_ADAPTER_CONFIG; } });
// Git adapter
var git_adapter_1 = require("./git-adapter");
Object.defineProperty(exports, "GitAdapter", { enumerable: true, get: function () { return git_adapter_1.GitAdapter; } });
Object.defineProperty(exports, "DefaultGitExecutor", { enumerable: true, get: function () { return git_adapter_1.DefaultGitExecutor; } });
Object.defineProperty(exports, "registerGitAdapter", { enumerable: true, get: function () { return git_adapter_1.registerGitAdapter; } });
Object.defineProperty(exports, "getGitAdapter", { enumerable: true, get: function () { return git_adapter_1.getGitAdapter; } });
Object.defineProperty(exports, "listGitAdapters", { enumerable: true, get: function () { return git_adapter_1.listGitAdapters; } });
Object.defineProperty(exports, "unregisterGitAdapter", { enumerable: true, get: function () { return git_adapter_1.unregisterGitAdapter; } });
Object.defineProperty(exports, "resetGitAdapters", { enumerable: true, get: function () { return git_adapter_1.resetGitAdapters; } });
Object.defineProperty(exports, "DEFAULT_GIT_ADAPTER_CONFIG", { enumerable: true, get: function () { return git_adapter_1.DEFAULT_GIT_ADAPTER_CONFIG; } });
// REST adapter routes
var rest_adapter_routes_1 = require("./rest-adapter.routes");
Object.defineProperty(exports, "restAdapterRouter", { enumerable: true, get: function () { return rest_adapter_routes_1.restAdapterRouter; } });
// Git adapter routes
var git_adapter_routes_1 = require("./git-adapter.routes");
Object.defineProperty(exports, "gitAdapterRouter", { enumerable: true, get: function () { return git_adapter_routes_1.gitAdapterRouter; } });
// Unified Adapter Registry
var adapter_registry_1 = require("./adapter-registry");
Object.defineProperty(exports, "AdapterRegistry", { enumerable: true, get: function () { return adapter_registry_1.AdapterRegistry; } });
Object.defineProperty(exports, "getAdapterRegistry", { enumerable: true, get: function () { return adapter_registry_1.getAdapterRegistry; } });
Object.defineProperty(exports, "resetAdapterRegistry", { enumerable: true, get: function () { return adapter_registry_1.resetAdapterRegistry; } });
