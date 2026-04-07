"use strict";
/**
 * Supabase Management API Client
 * Wraps the Supabase Management API (https://api.supabase.com/v1/)
 * for organizations, projects, branches, SQL, edge functions, etc.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listOrganizations = listOrganizations;
exports.listProjects = listProjects;
exports.listBranches = listBranches;
exports.getProjectApiKeys = getProjectApiKeys;
exports.executeSql = executeSql;
exports.getTableSchema = getTableSchema;
exports.getEdgeFunctionLogs = getEdgeFunctionLogs;
exports.deployEdgeFunction = deployEdgeFunction;
exports.validateAccessToken = validateAccessToken;
const SUPABASE_API = 'https://api.supabase.com/v1';
// ── Helpers ────────────────────────────────────────────────────────
async function supabaseFetch(accessToken, path, options = {}) {
    const url = `${SUPABASE_API}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Supabase API ${res.status}: ${text || res.statusText}`);
    }
    // Some endpoints return empty body (204)
    if (res.status === 204)
        return undefined;
    return res.json();
}
// ── Organization & Project Listing ─────────────────────────────────
async function listOrganizations(accessToken) {
    return supabaseFetch(accessToken, '/organizations');
}
async function listProjects(accessToken) {
    return supabaseFetch(accessToken, '/projects');
}
async function listBranches(accessToken, projectId) {
    return supabaseFetch(accessToken, `/projects/${projectId}/branches`);
}
async function getProjectApiKeys(accessToken, projectId) {
    return supabaseFetch(accessToken, `/projects/${projectId}/api-keys`);
}
// ── SQL Execution ──────────────────────────────────────────────────
async function executeSql(accessToken, projectId, query) {
    return supabaseFetch(accessToken, `/projects/${projectId}/database/query`, {
        method: 'POST',
        body: JSON.stringify({ query }),
    });
}
async function getTableSchema(accessToken, projectId) {
    const query = `
    SELECT
      table_schema,
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast', 'auth', 'storage', 'extensions', 'graphql', 'graphql_public', 'pgbouncer', 'pgsodium', 'pgsodium_masks', 'realtime', 'vault', '_realtime', 'supabase_functions', 'supabase_migrations')
    ORDER BY table_schema, table_name, ordinal_position;
  `;
    const result = await executeSql(accessToken, projectId, query);
    // Format into readable schema text
    const tables = new Map();
    for (const row of result || []) {
        const key = `${row.table_schema}.${row.table_name}`;
        if (!tables.has(key))
            tables.set(key, []);
        tables.get(key).push({
            column: row.column_name,
            type: row.data_type,
            nullable: row.is_nullable,
            default_val: row.column_default,
        });
    }
    let schemaText = '';
    for (const [tableName, columns] of tables) {
        schemaText += `\nTABLE ${tableName}:\n`;
        for (const col of columns) {
            const nullable = col.nullable === 'YES' ? ' (nullable)' : '';
            const def = col.default_val ? ` DEFAULT ${col.default_val}` : '';
            schemaText += `  ${col.column} ${col.type}${nullable}${def}\n`;
        }
    }
    return schemaText.trim();
}
// ── Edge Function Logs ─────────────────────────────────────────────
async function getEdgeFunctionLogs(accessToken, projectId, since) {
    const sinceTs = Math.floor(Number(since) || Date.now() - 60 * 60 * 1000); // Default: last hour
    if (!Number.isFinite(sinceTs) || sinceTs < 0) {
        return [];
    }
    const sql = encodeURIComponent(`SELECT id, timestamp, event_message, metadata FROM edge_logs WHERE timestamp >= ${sinceTs} ORDER BY timestamp DESC LIMIT 100`);
    try {
        const result = await supabaseFetch(accessToken, `/projects/${projectId}/analytics/endpoints/logs.all?sql=${sql}`);
        return result.result || [];
    }
    catch {
        // Analytics endpoint may not be available on all plans
        return [];
    }
}
// ── Edge Function Deployment ───────────────────────────────────────
async function deployEdgeFunction(accessToken, projectId, functionName, fileContents) {
    const url = `${SUPABASE_API}/projects/${projectId}/functions/deploy?slug=${encodeURIComponent(functionName)}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/octet-stream',
        },
        body: fileContents,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Edge function deploy failed (${res.status}): ${text || res.statusText}`);
    }
    return res.json();
}
/**
 * Validate that a Supabase access token is valid by listing organizations.
 */
async function validateAccessToken(accessToken) {
    try {
        await listOrganizations(accessToken);
        return true;
    }
    catch {
        return false;
    }
}
