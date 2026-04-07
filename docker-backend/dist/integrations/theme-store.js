"use strict";
/**
 * Theme Store — CRUD for custom themes and per-project theme assignments.
 * Uses JSON file persistence via loadStore/saveStore.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listThemes = listThemes;
exports.listAllThemes = listAllThemes;
exports.createTheme = createTheme;
exports.updateTheme = updateTheme;
exports.deleteTheme = deleteTheme;
exports.getProjectTheme = getProjectTheme;
exports.setProjectTheme = setProjectTheme;
exports.removeProjectTheme = removeProjectTheme;
exports.getBuiltinTheme = getBuiltinTheme;
exports.resolveThemePrompt = resolveThemePrompt;
const uuid_1 = require("uuid");
const persistence_js_1 = require("../persistence.js");
const builtin_themes_js_1 = require("./builtin-themes.js");
const STORE_NAME = 'themes';
// ── Helpers ────────────────────────────────────────────────────────
function load() {
    return (0, persistence_js_1.loadStore)(STORE_NAME, { customThemes: [], projectThemes: {} });
}
function save(data) {
    (0, persistence_js_1.saveStore)(STORE_NAME, data);
}
// ── Custom Theme CRUD ──────────────────────────────────────────────
function listThemes(userId) {
    const store = load();
    return store.customThemes.filter((t) => t.createdBy === userId);
}
function listAllThemes() {
    return load().customThemes;
}
function createTheme(userId, name, description, prompt) {
    const store = load();
    const theme = {
        id: (0, uuid_1.v4)(),
        name,
        description,
        prompt,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: userId,
    };
    store.customThemes.push(theme);
    save(store);
    return theme;
}
function updateTheme(themeId, updates) {
    const store = load();
    const idx = store.customThemes.findIndex((t) => t.id === themeId);
    if (idx === -1)
        return null;
    const theme = store.customThemes[idx];
    if (updates.name !== undefined)
        theme.name = updates.name;
    if (updates.description !== undefined)
        theme.description = updates.description;
    if (updates.prompt !== undefined)
        theme.prompt = updates.prompt;
    theme.updatedAt = Date.now();
    save(store);
    return theme;
}
function deleteTheme(themeId) {
    const store = load();
    const before = store.customThemes.length;
    store.customThemes = store.customThemes.filter((t) => t.id !== themeId);
    // Also remove any project assignments referencing this theme
    for (const [pid, tid] of Object.entries(store.projectThemes)) {
        if (tid === themeId)
            delete store.projectThemes[pid];
    }
    if (store.customThemes.length !== before) {
        save(store);
        return true;
    }
    return false;
}
// ── Per-project Theme Assignment ───────────────────────────────────
function getProjectTheme(projectId) {
    const store = load();
    return store.projectThemes[projectId] || null;
}
function setProjectTheme(projectId, themeId) {
    const store = load();
    store.projectThemes[projectId] = themeId;
    save(store);
}
function removeProjectTheme(projectId) {
    const store = load();
    delete store.projectThemes[projectId];
    save(store);
}
// ── Built-in Theme Lookup ──────────────────────────────────────────
function getBuiltinTheme(themeId) {
    return builtin_themes_js_1.BUILTIN_THEMES.find((t) => t.id === themeId) || null;
}
/**
 * Resolve a theme ID to its prompt text.
 * Checks built-ins first, then custom themes for the given user.
 */
function resolveThemePrompt(themeId, userId) {
    // Check built-in themes
    const builtin = getBuiltinTheme(themeId);
    if (builtin)
        return builtin.prompt;
    // Check custom themes
    const store = load();
    const custom = store.customThemes.find((t) => t.id === themeId);
    if (custom)
        return custom.prompt;
    return null;
}
