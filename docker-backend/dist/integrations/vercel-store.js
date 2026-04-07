"use strict";
/**
 * Vercel Integration Store
 * Manages Vercel access tokens, project linking, and deployment history.
 * Uses JSON file persistence via loadStore/saveStore.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVercelToken = getVercelToken;
exports.setVercelToken = setVercelToken;
exports.removeVercelToken = removeVercelToken;
exports.getVercelProjectLink = getVercelProjectLink;
exports.setVercelProjectLink = setVercelProjectLink;
exports.removeVercelProjectLink = removeVercelProjectLink;
exports.validateVercelToken = validateVercelToken;
exports.listVercelTeams = listVercelTeams;
exports.listVercelProjects = listVercelProjects;
exports.getVercelDeployments = getVercelDeployments;
exports.isProjectNameAvailable = isProjectNameAvailable;
exports.createVercelProject = createVercelProject;
exports.connectToExistingProject = connectToExistingProject;
exports.detectFramework = detectFramework;
const persistence_js_1 = require("../persistence.js");
const STORE_NAME = 'vercel-integrations';
// ── Helpers ────────────────────────────────────────────────────────
function load() {
    return (0, persistence_js_1.loadStore)(STORE_NAME, { tokens: {}, projectLinks: {} });
}
function save(data) {
    (0, persistence_js_1.saveStore)(STORE_NAME, data);
}
// ── Token Management ──────────────────────────────────────────────
function getVercelToken(userId) {
    const store = load();
    return store.tokens[userId] || null;
}
function setVercelToken(userId, token) {
    const store = load();
    store.tokens[userId] = token;
    save(store);
}
function removeVercelToken(userId) {
    const store = load();
    delete store.tokens[userId];
    save(store);
}
// ── Project Linking ───────────────────────────────────────────────
function getVercelProjectLink(projectId) {
    const store = load();
    return store.projectLinks[projectId] || null;
}
function setVercelProjectLink(projectId, link) {
    const store = load();
    store.projectLinks[projectId] = link;
    save(store);
}
function removeVercelProjectLink(projectId) {
    const store = load();
    delete store.projectLinks[projectId];
    save(store);
}
// ── Vercel API Client ─────────────────────────────────────────────
const VERCEL_API = 'https://api.vercel.com';
async function vercelFetch(token, path, options = {}, teamId) {
    const separator = path.includes('?') ? '&' : '?';
    const teamParam = teamId ? `${separator}teamId=${teamId}` : '';
    const url = `${VERCEL_API}${path}${teamParam}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Vercel API ${res.status}: ${text || res.statusText}`);
    }
    if (res.status === 204)
        return undefined;
    return res.json();
}
// ── Vercel API Functions ──────────────────────────────────────────
async function validateVercelToken(token) {
    try {
        const user = await vercelFetch(token, '/v2/user');
        return { valid: true, username: user.user.username };
    }
    catch {
        return { valid: false };
    }
}
async function listVercelTeams(token) {
    try {
        const result = await vercelFetch(token, '/v2/teams');
        return result.teams || [];
    }
    catch {
        return [];
    }
}
async function listVercelProjects(token, teamId) {
    const result = await vercelFetch(token, '/v9/projects?limit=50', {}, teamId);
    return (result.projects || []).map(p => ({
        id: p.id,
        name: p.name,
        framework: p.framework,
    }));
}
async function getVercelDeployments(token, projectId, teamId) {
    const result = await vercelFetch(token, `/v6/deployments?projectId=${projectId}&limit=10`, {}, teamId);
    return (result.deployments || []).map(d => ({
        uid: d.uid,
        url: d.url,
        state: d.state || d.readyState,
        createdAt: d.created,
        target: d.target,
        readyState: d.readyState,
    }));
}
async function isProjectNameAvailable(token, name, teamId) {
    try {
        const result = await vercelFetch(token, `/v9/projects?search=${encodeURIComponent(name)}`, {}, teamId);
        return !(result.projects || []).some(p => p.name.toLowerCase() === name.toLowerCase());
    }
    catch {
        return false;
    }
}
async function createVercelProject(token, name, framework, teamId) {
    const body = { name };
    if (framework)
        body.framework = framework;
    const result = await vercelFetch(token, '/v9/projects', { method: 'POST', body: JSON.stringify(body) }, teamId);
    return { id: result.id, name: result.name, framework: result.framework };
}
async function connectToExistingProject(token, vercelProjectId, teamId) {
    return vercelFetch(token, `/v9/projects/${vercelProjectId}`, {}, teamId);
}
/**
 * Detect framework from common config files present in the project.
 */
function detectFramework(fileList) {
    const fileSet = new Set(fileList.map(f => f.split('/').pop() || ''));
    if (fileSet.has('next.config.js') || fileSet.has('next.config.mjs') || fileSet.has('next.config.ts'))
        return 'nextjs';
    if (fileSet.has('nuxt.config.js') || fileSet.has('nuxt.config.ts'))
        return 'nuxtjs';
    if (fileSet.has('astro.config.mjs') || fileSet.has('astro.config.ts'))
        return 'astro';
    if (fileSet.has('svelte.config.js'))
        return 'sveltekit';
    if (fileSet.has('remix.config.js') || fileSet.has('remix.config.ts'))
        return 'remix';
    if (fileSet.has('vite.config.js') || fileSet.has('vite.config.ts') || fileSet.has('vite.config.mjs'))
        return 'vite';
    if (fileSet.has('angular.json'))
        return 'angular';
    if (fileSet.has('gatsby-config.js') || fileSet.has('gatsby-config.ts'))
        return 'gatsby';
    return null;
}
