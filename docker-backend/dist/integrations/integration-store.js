"use strict";
/**
 * Integration Credentials & Project Links Store
 * Manages per-user credentials (Supabase, Neon) and per-project integration links.
 * Uses JSON file persistence via loadStore/saveStore.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserCredentials = getUserCredentials;
exports.setUserCredentials = setUserCredentials;
exports.removeUserCredentials = removeUserCredentials;
exports.getProjectLinks = getProjectLinks;
exports.setProjectLink = setProjectLink;
exports.removeProjectLink = removeProjectLink;
const persistence_js_1 = require("../persistence.js");
const STORE_NAME = 'integrations';
// ── Helpers ────────────────────────────────────────────────────────
function load() {
    return (0, persistence_js_1.loadStore)(STORE_NAME, { credentials: {}, projectLinks: {} });
}
function save(data) {
    (0, persistence_js_1.saveStore)(STORE_NAME, data);
}
// ── Credential CRUD ────────────────────────────────────────────────
function getUserCredentials(userId) {
    const store = load();
    return store.credentials[userId] || {};
}
function setUserCredentials(userId, provider, creds) {
    const store = load();
    if (!store.credentials[userId]) {
        store.credentials[userId] = {};
    }
    if (provider === 'supabase' && creds.accessToken) {
        store.credentials[userId].supabase = { accessToken: creds.accessToken };
    }
    else if (provider === 'neon' && creds.apiKey) {
        store.credentials[userId].neon = { apiKey: creds.apiKey };
    }
    save(store);
}
function removeUserCredentials(userId, provider) {
    const store = load();
    if (store.credentials[userId]) {
        delete store.credentials[userId][provider];
        if (!store.credentials[userId].supabase && !store.credentials[userId].neon) {
            delete store.credentials[userId];
        }
        save(store);
    }
}
// ── Project Link CRUD ──────────────────────────────────────────────
function getProjectLinks(projectId) {
    const store = load();
    return store.projectLinks[projectId] || {};
}
function setProjectLink(projectId, provider, link) {
    const store = load();
    if (!store.projectLinks[projectId]) {
        store.projectLinks[projectId] = {};
    }
    if (provider === 'supabase') {
        store.projectLinks[projectId].supabase = link;
    }
    else {
        store.projectLinks[projectId].neon = link;
    }
    save(store);
}
function removeProjectLink(projectId, provider) {
    const store = load();
    if (store.projectLinks[projectId]) {
        delete store.projectLinks[projectId][provider];
        if (!store.projectLinks[projectId].supabase && !store.projectLinks[projectId].neon) {
            delete store.projectLinks[projectId];
        }
        save(store);
    }
}
