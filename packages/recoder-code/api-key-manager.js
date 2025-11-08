const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class ApiKeyManager {
    constructor(storagePath = './api-keys.json') {
        this.storagePath = path.resolve(storagePath);
        this.keys = new Map();
        this.initialize();
    }

    async initialize() {
        try {
            await this.loadKeys();
        } catch (error) {
            // File doesn't exist yet, create empty storage
            await this.saveKeys();
        }
    }

    /**
     * Generate a new API key
     * @param {string} owner - Owner/application name
     * @param {Object} permissions - Permissions object
     * @returns {Object} API key details
     */
    generateKey(owner, permissions = { read: true, write: false }) {
        const apiKey = crypto.randomBytes(32).toString('hex');
        const secret = crypto.randomBytes(16).toString('hex');
        const keyId = crypto.randomBytes(8).toString('hex');
        
        const keyData = {
            key: apiKey,
            secret: secret,
            keyId: keyId,
            owner: owner,
            permissions: permissions,
            createdAt: new Date().toISOString(),
            lastUsed: null,
            usageCount: 0,
            isActive: true
        };

        this.keys.set(keyId, keyData);
        this.saveKeys();

        return {
            keyId: keyId,
            apiKey: apiKey,
            secret: secret,
            fullKey: `${keyId}.${apiKey}.${secret}`
        };
    }

    /**
     * Validate an API key
     * @param {string} apiKey - Full API key string
     * @returns {Object|null} Key data if valid, null if invalid
     */
    validateKey(apiKey) {
        const parts = apiKey.split('.');
        if (parts.length !== 3) return null;

        const [keyId, key, secret] = parts;
        const keyData = this.keys.get(keyId);
        
        if (!keyData || !keyData.isActive) return null;
        if (keyData.key !== key || keyData.secret !== secret) return null;

        // Update usage stats
        keyData.lastUsed = new Date().toISOString();
        keyData.usageCount++;
        this.saveKeys();

        return keyData;
    }

    /**
     * Revoke an API key
     * @param {string} keyId - Key ID to revoke
     * @returns {boolean} Success status
     */
    revokeKey(keyId) {
        const keyData = this.keys.get(keyId);
        if (!keyData) return false;

        keyData.isActive = false;
        keyData.revokedAt = new Date().toISOString();
        this.saveKeys();
        return true;
    }

    /**
     * Get all keys for an owner
     * @param {string} owner - Owner name
     * @returns {Array} Array of key data
     */
    getKeysByOwner(owner) {
        return Array.from(this.keys.values())
            .filter(key => key.owner === owner && key.isActive);
    }

    /**
     * Load keys from storage
     */
    async loadKeys() {
        try {
            const data = await fs.readFile(this.storagePath, 'utf8');
            const keysArray = JSON.parse(data);
            
            this.keys.clear();
            keysArray.forEach(key => {
                this.keys.set(key.keyId, key);
            });
        } catch (error) {
            console.warn('Could not load API keys:', error.message);
            this.keys.clear();
        }
    }

    /**
     * Save keys to storage
     */
    async saveKeys() {
        try {
            const keysArray = Array.from(this.keys.values());
            await fs.writeFile(this.storagePath, JSON.stringify(keysArray, null, 2));
        } catch (error) {
            console.error('Failed to save API keys:', error.message);
        }
    }

    /**
     * Clean up expired keys
     * @param {number} maxAgeDays - Maximum age in days
     */
    async cleanupExpiredKeys(maxAgeDays = 90) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - maxAgeDays);
        
        let removedCount = 0;
        for (const [keyId, keyData] of this.keys) {
            const created = new Date(keyData.createdAt);
            if (created < cutoff && !keyData.isActive) {
                this.keys.delete(keyId);
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            await this.saveKeys();
        }
        
        return removedCount;
    }
}

module.exports = ApiKeyManager;