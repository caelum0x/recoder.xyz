"use strict";
/**
 * Collaboration Module Exports
 *
 * Real-time collaboration using Yjs CRDT for Google Docs-style
 * multi-user editing in the Recoder IDE.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistenceManager = exports.awarenessHandlers = exports.awarenessManager = exports.saveAllDocuments = exports.getCollaborationStats = exports.createCollaborationServer = void 0;
var yjs_server_1 = require("./yjs-server");
Object.defineProperty(exports, "createCollaborationServer", { enumerable: true, get: function () { return yjs_server_1.createCollaborationServer; } });
Object.defineProperty(exports, "getCollaborationStats", { enumerable: true, get: function () { return yjs_server_1.getCollaborationStats; } });
Object.defineProperty(exports, "saveAllDocuments", { enumerable: true, get: function () { return yjs_server_1.saveAllDocuments; } });
var awareness_1 = require("./awareness");
Object.defineProperty(exports, "awarenessManager", { enumerable: true, get: function () { return awareness_1.awarenessManager; } });
Object.defineProperty(exports, "awarenessHandlers", { enumerable: true, get: function () { return awareness_1.awarenessHandlers; } });
var persistence_1 = require("./persistence");
Object.defineProperty(exports, "persistenceManager", { enumerable: true, get: function () { return persistence_1.persistenceManager; } });
