"use strict";
/**
 * Neon PostgreSQL Management Client
 * Uses the Neon API (https://console.neon.tech/api/v2) for project, branch,
 * and connection management.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listProjects = listProjects;
exports.createProject = createProject;
exports.getProject = getProject;
exports.listBranches = listBranches;
exports.createBranch = createBranch;
exports.deleteBranch = deleteBranch;
exports.restoreBranch = restoreBranch;
exports.getConnectionUri = getConnectionUri;
exports.getOrganizations = getOrganizations;
exports.validateApiKey = validateApiKey;
const NEON_API = 'https://console.neon.tech/api/v2';
// ── Helpers ────────────────────────────────────────────────────────
async function neonFetch(apiKey, path, options = {}) {
    const url = `${NEON_API}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(options.headers || {}),
        },
    });
    if (!res.ok) {
        // Handle 423 Locked — project is temporarily locked during operations
        if (res.status === 423) {
            const err = new Error('Neon project is locked (423). Retry after a moment.');
            err.status = 423;
            throw err;
        }
        const text = await res.text().catch(() => '');
        throw new Error(`Neon API ${res.status}: ${text || res.statusText}`);
    }
    if (res.status === 204)
        return undefined;
    return res.json();
}
/**
 * Retry helper for 423 Locked responses.
 * Neon locks projects during certain operations; this retries with exponential backoff.
 */
async function retryOnLocked(fn, maxRetries = 5) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
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
async function listProjects(apiKey) {
    const result = await neonFetch(apiKey, '/projects');
    return result.projects || [];
}
async function createProject(apiKey, name, orgId) {
    const body = {
        project: { name, ...(orgId ? { org_id: orgId } : {}) },
    };
    const result = await retryOnLocked(() => neonFetch(apiKey, '/projects', {
        method: 'POST',
        body: JSON.stringify(body),
    }));
    const mainBranch = result.branch;
    const connectionUri = result.connection_uris?.[0]?.connection_uri || '';
    // Create a preview branch off the main branch
    let previewBranch = null;
    try {
        previewBranch = await createBranch(apiKey, result.project.id, 'preview', mainBranch.id);
    }
    catch {
        // Preview branch creation is best-effort
    }
    return {
        project: result.project,
        connectionUri,
        developmentBranchId: mainBranch.id,
        previewBranchId: previewBranch?.id || '',
    };
}
async function getProject(apiKey, projectId) {
    const result = await neonFetch(apiKey, `/projects/${projectId}`);
    return result.project;
}
// ── Branch Management ──────────────────────────────────────────────
async function listBranches(apiKey, projectId) {
    const result = await neonFetch(apiKey, `/projects/${projectId}/branches`);
    return result.branches || [];
}
async function createBranch(apiKey, projectId, name, parentId) {
    const result = await retryOnLocked(() => neonFetch(apiKey, `/projects/${projectId}/branches`, {
        method: 'POST',
        body: JSON.stringify({
            branch: { name, parent_id: parentId },
            endpoints: [{ type: 'read_write' }],
        }),
    }));
    return result.branch;
}
async function deleteBranch(apiKey, projectId, branchId) {
    await retryOnLocked(() => neonFetch(apiKey, `/projects/${projectId}/branches/${branchId}`, {
        method: 'DELETE',
    }));
}
async function restoreBranch(apiKey, projectId, branchId, timestamp) {
    await retryOnLocked(() => neonFetch(apiKey, `/projects/${projectId}/branches/${branchId}/restore`, {
        method: 'POST',
        body: JSON.stringify({
            source_timestamp: timestamp,
        }),
    }));
}
// ── Connection URI ─────────────────────────────────────────────────
async function getConnectionUri(apiKey, projectId, branchId) {
    // Get endpoints for the branch to find the host
    const endpoints = await neonFetch(apiKey, `/projects/${projectId}/branches/${branchId}/endpoints`);
    if (!endpoints.endpoints?.length) {
        throw new Error(`No endpoints found for branch ${branchId}`);
    }
    const endpoint = endpoints.endpoints[0];
    // Get connection URI using the endpoint
    const result = await neonFetch(apiKey, `/projects/${projectId}/connection_uri?branch_id=${branchId}&endpoint_id=${endpoint.id}&database_name=neondb&role_name=neondb_owner`);
    return result.uri;
}
// ── Organizations ──────────────────────────────────────────────────
async function getOrganizations(apiKey) {
    try {
        const result = await neonFetch(apiKey, '/organizations');
        return result.organizations || [];
    }
    catch {
        // Organizations endpoint may not be available on all plans
        return [];
    }
}
// ── Validation ─────────────────────────────────────────────────────
async function validateApiKey(apiKey) {
    try {
        await listProjects(apiKey);
        return true;
    }
    catch {
        return false;
    }
}
