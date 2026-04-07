"use strict";
/**
 * Database Module
 * Secure database exploration and query execution
 *
 * SECURITY OVERVIEW:
 * - All queries use parameterized statements (NEVER concatenates user input)
 * - Credentials are encrypted at rest using AES-256-GCM
 * - Input validation on all identifiers (table names, column names, etc.)
 * - Connection pooling with timeout cleanup
 * - Audit logging for all database operations
 * - Path traversal protection for SQLite files
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteDriver = exports.PostgresDriver = exports.SchemaInspector = exports.schemaInspector = exports.analyzeQuery = exports.QueryExecutor = exports.queryExecutor = exports.decryptCredential = exports.encryptCredential = exports.ConnectionManager = exports.connectionManager = void 0;
// Connection Manager - Handles secure database connections
var connection_manager_js_1 = require("./connection-manager.js");
Object.defineProperty(exports, "connectionManager", { enumerable: true, get: function () { return connection_manager_js_1.connectionManager; } });
Object.defineProperty(exports, "ConnectionManager", { enumerable: true, get: function () { return connection_manager_js_1.ConnectionManager; } });
Object.defineProperty(exports, "encryptCredential", { enumerable: true, get: function () { return connection_manager_js_1.encryptCredential; } });
Object.defineProperty(exports, "decryptCredential", { enumerable: true, get: function () { return connection_manager_js_1.decryptCredential; } });
// Query Executor - Executes parameterized queries securely
var query_executor_js_1 = require("./query-executor.js");
Object.defineProperty(exports, "queryExecutor", { enumerable: true, get: function () { return query_executor_js_1.queryExecutor; } });
Object.defineProperty(exports, "QueryExecutor", { enumerable: true, get: function () { return query_executor_js_1.QueryExecutor; } });
Object.defineProperty(exports, "analyzeQuery", { enumerable: true, get: function () { return query_executor_js_1.analyzeQuery; } });
// Schema Inspector - Safely inspects database schemas
var schema_inspector_js_1 = require("./schema-inspector.js");
Object.defineProperty(exports, "schemaInspector", { enumerable: true, get: function () { return schema_inspector_js_1.schemaInspector; } });
Object.defineProperty(exports, "SchemaInspector", { enumerable: true, get: function () { return schema_inspector_js_1.SchemaInspector; } });
// Drivers
var postgresql_js_1 = require("./drivers/postgresql.js");
Object.defineProperty(exports, "PostgresDriver", { enumerable: true, get: function () { return postgresql_js_1.PostgresDriver; } });
var sqlite_js_1 = require("./drivers/sqlite.js");
Object.defineProperty(exports, "SqliteDriver", { enumerable: true, get: function () { return sqlite_js_1.SqliteDriver; } });
