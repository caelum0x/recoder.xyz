/**
 * Supabase Management API Client
 * Wraps the Supabase Management API (https://api.supabase.com/v1/)
 * for organizations, projects, branches, SQL, edge functions, etc.
 */

const SUPABASE_API = 'https://api.supabase.com/v1';

// ── Types ──────────────────────────────────────────────────────────

export interface SupabaseOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface SupabaseProject {
  id: string;
  name: string;
  region: string;
  organization_id: string;
  status: string;
}

export interface SupabaseBranch {
  id: string;
  name: string;
  is_default: boolean;
  project_ref: string;
  parent_project_ref?: string;
}

export interface SupabaseApiKey {
  name: string;
  api_key: string;
}

export interface SupabaseLogEntry {
  id: string;
  timestamp: number;
  event_message: string;
  metadata?: Record<string, unknown>;
}

export interface SupabaseDeployResult {
  id: string;
  slug: string;
  name: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────

async function supabaseFetch<T>(
  accessToken: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${SUPABASE_API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase API ${res.status}: ${text || res.statusText}`);
  }

  // Some endpoints return empty body (204)
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ── Organization & Project Listing ─────────────────────────────────

export async function listOrganizations(accessToken: string): Promise<SupabaseOrganization[]> {
  return supabaseFetch<SupabaseOrganization[]>(accessToken, '/organizations');
}

export async function listProjects(accessToken: string): Promise<SupabaseProject[]> {
  return supabaseFetch<SupabaseProject[]>(accessToken, '/projects');
}

export async function listBranches(
  accessToken: string,
  projectId: string,
): Promise<SupabaseBranch[]> {
  return supabaseFetch<SupabaseBranch[]>(accessToken, `/projects/${projectId}/branches`);
}

export async function getProjectApiKeys(
  accessToken: string,
  projectId: string,
): Promise<SupabaseApiKey[]> {
  return supabaseFetch<SupabaseApiKey[]>(accessToken, `/projects/${projectId}/api-keys`);
}

// ── SQL Execution ──────────────────────────────────────────────────

export async function executeSql(
  accessToken: string,
  projectId: string,
  query: string,
): Promise<unknown> {
  return supabaseFetch(accessToken, `/projects/${projectId}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export async function getTableSchema(
  accessToken: string,
  projectId: string,
): Promise<string> {
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

  const result = await executeSql(accessToken, projectId, query) as any[];

  // Format into readable schema text
  const tables = new Map<string, Array<{ column: string; type: string; nullable: string; default_val: string | null }>>();

  for (const row of result || []) {
    const key = `${row.table_schema}.${row.table_name}`;
    if (!tables.has(key)) tables.set(key, []);
    tables.get(key)!.push({
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

export async function getEdgeFunctionLogs(
  accessToken: string,
  projectId: string,
  since?: number,
): Promise<SupabaseLogEntry[]> {
  const sinceTs = Math.floor(Number(since) || Date.now() - 60 * 60 * 1000); // Default: last hour
  if (!Number.isFinite(sinceTs) || sinceTs < 0) {
    return [];
  }
  const sql = encodeURIComponent(
    `SELECT id, timestamp, event_message, metadata FROM edge_logs WHERE timestamp >= ${sinceTs} ORDER BY timestamp DESC LIMIT 100`,
  );
  try {
    const result = await supabaseFetch<{ result: SupabaseLogEntry[] }>(
      accessToken,
      `/projects/${projectId}/analytics/endpoints/logs.all?sql=${sql}`,
    );
    return result.result || [];
  } catch {
    // Analytics endpoint may not be available on all plans
    return [];
  }
}

// ── Edge Function Deployment ───────────────────────────────────────

export async function deployEdgeFunction(
  accessToken: string,
  projectId: string,
  functionName: string,
  fileContents: Uint8Array,
): Promise<SupabaseDeployResult> {
  const url = `${SUPABASE_API}/projects/${projectId}/functions/deploy?slug=${encodeURIComponent(functionName)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: fileContents as any,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Edge function deploy failed (${res.status}): ${text || res.statusText}`);
  }

  return res.json() as Promise<SupabaseDeployResult>;
}

/**
 * Validate that a Supabase access token is valid by listing organizations.
 */
export async function validateAccessToken(accessToken: string): Promise<boolean> {
  try {
    await listOrganizations(accessToken);
    return true;
  } catch {
    return false;
  }
}
