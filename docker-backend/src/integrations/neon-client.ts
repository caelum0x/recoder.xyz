/**
 * Neon PostgreSQL Management Client
 * Uses the Neon API (https://console.neon.tech/api/v2) for project, branch,
 * and connection management.
 */

const NEON_API = 'https://console.neon.tech/api/v2';

// ── Types ──────────────────────────────────────────────────────────

export interface NeonProject {
  id: string;
  name: string;
  region_id: string;
  org_id?: string;
  created_at?: string;
}

export interface NeonBranch {
  id: string;
  name: string;
  project_id: string;
  parent_id?: string;
  created_at: string;
  default: boolean;
}

export interface NeonProjectCreated {
  project: NeonProject;
  connectionUri: string;
  developmentBranchId: string;
  previewBranchId: string;
}

export interface NeonOrg {
  id: string;
  name: string;
}

export interface NeonEndpoint {
  id: string;
  host: string;
  branch_id: string;
  type: string;
}

// ── Helpers ────────────────────────────────────────────────────────

async function neonFetch<T>(
  apiKey: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${NEON_API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    },
  });

  if (!res.ok) {
    // Handle 423 Locked — project is temporarily locked during operations
    if (res.status === 423) {
      const err = new Error('Neon project is locked (423). Retry after a moment.');
      (err as any).status = 423;
      throw err;
    }
    const text = await res.text().catch(() => '');
    throw new Error(`Neon API ${res.status}: ${text || res.statusText}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Retry helper for 423 Locked responses.
 * Neon locks projects during certain operations; this retries with exponential backoff.
 */
async function retryOnLocked<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let lastErr: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.status === 423 && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise((r) => setTimeout(r, delay));
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('retryOnLocked exhausted');
}

// ── Project Management ─────────────────────────────────────────────

export async function listProjects(apiKey: string): Promise<NeonProject[]> {
  const result = await neonFetch<{ projects: NeonProject[] }>(apiKey, '/projects');
  return result.projects || [];
}

export async function createProject(
  apiKey: string,
  name: string,
  orgId?: string,
): Promise<NeonProjectCreated> {
  const body: Record<string, unknown> = {
    project: { name, ...(orgId ? { org_id: orgId } : {}) },
  };

  const result = await retryOnLocked(() =>
    neonFetch<{
      project: NeonProject;
      connection_uris: Array<{ connection_uri: string }>;
      branch: NeonBranch;
    }>(apiKey, '/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );

  const mainBranch = result.branch;
  const connectionUri = result.connection_uris?.[0]?.connection_uri || '';

  // Create a preview branch off the main branch
  let previewBranch: NeonBranch | null = null;
  try {
    previewBranch = await createBranch(apiKey, result.project.id, 'preview', mainBranch.id);
  } catch {
    // Preview branch creation is best-effort
  }

  return {
    project: result.project,
    connectionUri,
    developmentBranchId: mainBranch.id,
    previewBranchId: previewBranch?.id || '',
  };
}

export async function getProject(
  apiKey: string,
  projectId: string,
): Promise<NeonProject> {
  const result = await neonFetch<{ project: NeonProject }>(apiKey, `/projects/${projectId}`);
  return result.project;
}

// ── Branch Management ──────────────────────────────────────────────

export async function listBranches(
  apiKey: string,
  projectId: string,
): Promise<NeonBranch[]> {
  const result = await neonFetch<{ branches: NeonBranch[] }>(
    apiKey,
    `/projects/${projectId}/branches`,
  );
  return result.branches || [];
}

export async function createBranch(
  apiKey: string,
  projectId: string,
  name: string,
  parentId: string,
): Promise<NeonBranch> {
  const result = await retryOnLocked(() =>
    neonFetch<{ branch: NeonBranch }>(apiKey, `/projects/${projectId}/branches`, {
      method: 'POST',
      body: JSON.stringify({
        branch: { name, parent_id: parentId },
        endpoints: [{ type: 'read_write' }],
      }),
    }),
  );
  return result.branch;
}

export async function deleteBranch(
  apiKey: string,
  projectId: string,
  branchId: string,
): Promise<void> {
  await retryOnLocked(() =>
    neonFetch<void>(apiKey, `/projects/${projectId}/branches/${branchId}`, {
      method: 'DELETE',
    }),
  );
}

export async function restoreBranch(
  apiKey: string,
  projectId: string,
  branchId: string,
  timestamp: string,
): Promise<void> {
  await retryOnLocked(() =>
    neonFetch<void>(apiKey, `/projects/${projectId}/branches/${branchId}/restore`, {
      method: 'POST',
      body: JSON.stringify({
        source_timestamp: timestamp,
      }),
    }),
  );
}

// ── Connection URI ─────────────────────────────────────────────────

export async function getConnectionUri(
  apiKey: string,
  projectId: string,
  branchId: string,
): Promise<string> {
  // Get endpoints for the branch to find the host
  const endpoints = await neonFetch<{ endpoints: NeonEndpoint[] }>(
    apiKey,
    `/projects/${projectId}/branches/${branchId}/endpoints`,
  );

  if (!endpoints.endpoints?.length) {
    throw new Error(`No endpoints found for branch ${branchId}`);
  }

  const endpoint = endpoints.endpoints[0];

  // Get connection URI using the endpoint
  const result = await neonFetch<{ uri: string }>(
    apiKey,
    `/projects/${projectId}/connection_uri?branch_id=${branchId}&endpoint_id=${endpoint.id}&database_name=neondb&role_name=neondb_owner`,
  );

  return result.uri;
}

// ── Organizations ──────────────────────────────────────────────────

export async function getOrganizations(apiKey: string): Promise<NeonOrg[]> {
  try {
    const result = await neonFetch<{ organizations: NeonOrg[] }>(apiKey, '/organizations');
    return result.organizations || [];
  } catch {
    // Organizations endpoint may not be available on all plans
    return [];
  }
}

// ── Validation ─────────────────────────────────────────────────────

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    await listProjects(apiKey);
    return true;
  } catch {
    return false;
  }
}
