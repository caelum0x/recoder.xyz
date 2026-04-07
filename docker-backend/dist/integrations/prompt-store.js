"use strict";
/**
 * Prompt Library Store
 * CRUD for reusable custom prompts. Users can reference prompts via @prompt:id in chat.
 * Uses JSON file persistence via loadStore/saveStore.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPrompts = listPrompts;
exports.getPrompt = getPrompt;
exports.createPrompt = createPrompt;
exports.updatePrompt = updatePrompt;
exports.deletePrompt = deletePrompt;
exports.replacePromptReferences = replacePromptReferences;
exports.getPromptsByIds = getPromptsByIds;
const persistence_js_1 = require("../persistence.js");
const crypto_1 = __importDefault(require("crypto"));
const STORE_NAME = 'prompts';
// ── Helpers ────────────────────────────────────────────────────────
function load() {
    return (0, persistence_js_1.loadStore)(STORE_NAME, { prompts: [] });
}
function save(data) {
    (0, persistence_js_1.saveStore)(STORE_NAME, data);
}
// ── CRUD ───────────────────────────────────────────────────────────
function listPrompts(userId) {
    const store = load();
    return store.prompts.filter(p => p.createdBy === userId);
}
function getPrompt(promptId) {
    const store = load();
    return store.prompts.find(p => p.id === promptId) || null;
}
function createPrompt(userId, title, description, content) {
    const store = load();
    const now = Date.now();
    const prompt = {
        id: crypto_1.default.randomUUID(),
        title: title.trim(),
        description: description.trim(),
        content,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
    };
    store.prompts.push(prompt);
    save(store);
    return prompt;
}
function updatePrompt(promptId, updates) {
    const store = load();
    const idx = store.prompts.findIndex(p => p.id === promptId);
    if (idx === -1)
        return null;
    if (updates.title !== undefined)
        store.prompts[idx].title = updates.title.trim();
    if (updates.description !== undefined)
        store.prompts[idx].description = updates.description.trim();
    if (updates.content !== undefined)
        store.prompts[idx].content = updates.content;
    store.prompts[idx].updatedAt = Date.now();
    save(store);
    return store.prompts[idx];
}
function deletePrompt(promptId) {
    const store = load();
    const before = store.prompts.length;
    store.prompts = store.prompts.filter(p => p.id !== promptId);
    if (store.prompts.length < before) {
        save(store);
        return true;
    }
    return false;
}
// ── Prompt Reference Replacement ──────────────────────────────────
/**
 * Replace @prompt:id references in a string with actual prompt content.
 * Used in the chat pipeline before sending to AI.
 */
function replacePromptReferences(text) {
    if (!text || !text.includes('@prompt:'))
        return text;
    const store = load();
    return text.replace(/@prompt:([a-f0-9-]+)/g, (_match, id) => {
        const prompt = store.prompts.find(p => p.id === id);
        return prompt ? prompt.content : _match;
    });
}
/**
 * Get multiple prompts by IDs (for batch lookups).
 */
function getPromptsByIds(ids) {
    const store = load();
    const result = {};
    for (const p of store.prompts) {
        if (ids.includes(p.id)) {
            result[p.id] = p;
        }
    }
    return result;
}
