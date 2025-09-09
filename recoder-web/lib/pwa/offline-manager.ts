import { PWAConfig } from '../types';

export function generateOfflineManager(config: PWAConfig): string {
  return `
// Offline Manager for ${config.name}
// Handles offline data storage, sync, and conflict resolution

class OfflineManager {
  constructor() {
    this.dbName = '${config.shortName.toLowerCase()}-offline-db';
    this.version = 1;
    this.db = null;
    this.isOnline = navigator.onLine;
    this.syncQueue = [];
    this.conflictResolution = '${config.offline.conflictResolution}';
    
    this.init();
    this.setupEventListeners();
  }
  
  async init() {
    try {
      await this.initDatabase();
      console.log('OfflineManager: Initialized successfully');
      
      // Sync any pending data on startup
      if (this.isOnline) {
        await this.processSyncQueue();
      }
    } catch (error) {
      console.error('OfflineManager: Initialization failed', error);
    }
  }
  
  async initDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Offline data store
        if (!db.objectStoreNames.contains('offline-data')) {
          const offlineStore = db.createObjectStore('offline-data', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          offlineStore.createIndex('type', 'type', { unique: false });
          offlineStore.createIndex('timestamp', 'timestamp', { unique: false });
          offlineStore.createIndex('synced', 'synced', { unique: false });
        }
        
        // Sync queue store
        if (!db.objectStoreNames.contains('sync-queue')) {
          const syncStore = db.createObjectStore('sync-queue', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          syncStore.createIndex('action', 'action', { unique: false });
          syncStore.createIndex('pending', 'pending', { unique: false });
          syncStore.createIndex('priority', 'priority', { unique: false });
        }
        
        // Cache metadata store
        if (!db.objectStoreNames.contains('cache-metadata')) {
          const metaStore = db.createObjectStore('cache-metadata', { 
            keyPath: 'url' 
          });
          metaStore.createIndex('expiry', 'expiry', { unique: false });
          metaStore.createIndex('strategy', 'strategy', { unique: false });
        }
        
        // Conflict resolution store
        if (!db.objectStoreNames.contains('conflicts')) {
          const conflictStore = db.createObjectStore('conflicts', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          conflictStore.createIndex('resource', 'resource', { unique: false });
          conflictStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }
  
  setupEventListeners() {
    // Network status changes
    window.addEventListener('online', () => {
      console.log('OfflineManager: Device came online');
      this.isOnline = true;
      this.onNetworkStatusChange('online');
      this.processSyncQueue();
    });
    
    window.addEventListener('offline', () => {
      console.log('OfflineManager: Device went offline');
      this.isOnline = false;
      this.onNetworkStatusChange('offline');
    });
    
    // Before page unload
    window.addEventListener('beforeunload', () => {
      // Attempt to sync critical data
      if (navigator.sendBeacon && this.syncQueue.length > 0) {
        const criticalItems = this.syncQueue.filter(item => item.priority === 'high');
        if (criticalItems.length > 0) {
          navigator.sendBeacon('/api/offline-sync', JSON.stringify(criticalItems));
        }
      }
    });
    
    // Storage events (for cross-tab sync)
    window.addEventListener('storage', (e) => {
      if (e.key === 'offline-sync-trigger') {
        this.processSyncQueue();
      }
    });
  }
  
  onNetworkStatusChange(status) {
    // Dispatch custom event
    document.dispatchEvent(new CustomEvent('networkchange', { 
      detail: { status, manager: this } 
    }));
    
    // Update UI indicators
    this.updateOfflineIndicators(status);
  }
  
  updateOfflineIndicators(status) {
    const indicators = document.querySelectorAll('[data-offline-indicator]');
    indicators.forEach(indicator => {
      if (status === 'offline') {
        indicator.style.display = 'block';
        indicator.textContent = 'You are currently offline. Changes will be saved locally.';
      } else {
        indicator.style.display = 'none';
      }
    });
    
    // Update forms
    const forms = document.querySelectorAll('form[data-offline-form]');
    forms.forEach(form => {
      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) {
        submitBtn.textContent = status === 'offline' ? 'Save Offline' : 'Save';
      }
    });
  }
  
  async saveOfflineData(type, data, options = {}) {
    try {
      const record = {
        type,
        data,
        timestamp: Date.now(),
        synced: false,
        priority: options.priority || 'normal',
        metadata: options.metadata || {},
        version: 1
      };
      
      const transaction = this.db.transaction(['offline-data'], 'readwrite');
      const store = transaction.objectStore('offline-data');
      const result = await this.promisifyRequest(store.add(record));
      
      console.log('OfflineManager: Data saved offline', { type, id: result });
      
      // Add to sync queue
      await this.addToSyncQueue('save', {
        offlineId: result,
        type,
        data,
        priority: record.priority
      });
      
      return result;
    } catch (error) {
      console.error('OfflineManager: Failed to save offline data', error);
      throw error;
    }
  }
  
  async getOfflineData(type, options = {}) {
    try {
      const transaction = this.db.transaction(['offline-data'], 'readonly');
      const store = transaction.objectStore('offline-data');
      const index = store.index('type');
      
      const records = await this.promisifyRequest(index.getAll(type));
      
      if (options.includeMetadata) {
        return records;
      }
      
      return records.map(record => record.data);
    } catch (error) {
      console.error('OfflineManager: Failed to get offline data', error);
      return [];
    }
  }
  
  async deleteOfflineData(id) {
    try {
      const transaction = this.db.transaction(['offline-data'], 'readwrite');
      const store = transaction.objectStore('offline-data');
      await this.promisifyRequest(store.delete(id));
      
      console.log('OfflineManager: Offline data deleted', id);
    } catch (error) {
      console.error('OfflineManager: Failed to delete offline data', error);
    }
  }
  
  async addToSyncQueue(action, data, options = {}) {
    try {
      const queueItem = {
        action,
        data,
        timestamp: Date.now(),
        pending: true,
        retryCount: 0,
        maxRetries: options.maxRetries || 3,
        priority: options.priority || 'normal',
        url: options.url,
        method: options.method || 'POST',
        headers: options.headers || {}
      };
      
      const transaction = this.db.transaction(['sync-queue'], 'readwrite');
      const store = transaction.objectStore('sync-queue');
      const result = await this.promisifyRequest(store.add(queueItem));
      
      this.syncQueue.push({ ...queueItem, id: result });
      
      console.log('OfflineManager: Added to sync queue', { action, id: result });
      
      // Trigger immediate sync if online
      if (this.isOnline) {
        this.processSyncQueue();
      }
      
      return result;
    } catch (error) {
      console.error('OfflineManager: Failed to add to sync queue', error);
      throw error;
    }
  }
  
  async processSyncQueue() {
    if (!this.isOnline || this.syncQueue.length === 0) {
      return;
    }
    
    console.log('OfflineManager: Processing sync queue', this.syncQueue.length, 'items');
    
    // Get pending items from database
    const transaction = this.db.transaction(['sync-queue'], 'readonly');
    const store = transaction.objectStore('sync-queue');
    const index = store.index('pending');
    const pendingItems = await this.promisifyRequest(index.getAll(true));
    
    // Sort by priority and timestamp
    pendingItems.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      const aPriority = priorityOrder[a.priority] || 2;
      const bPriority = priorityOrder[b.priority] || 2;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      return a.timestamp - b.timestamp;
    });
    
    for (const item of pendingItems) {
      try {
        await this.syncItem(item);
      } catch (error) {
        console.error('OfflineManager: Sync failed for item', item.id, error);
        await this.handleSyncError(item, error);
      }
    }
  }
  
  async syncItem(item) {
    console.log('OfflineManager: Syncing item', item.id, item.action);
    
    let response;
    
    switch (item.action) {
      case 'save':
        response = await this.syncSaveAction(item);
        break;
      case 'update':
        response = await this.syncUpdateAction(item);
        break;
      case 'delete':
        response = await this.syncDeleteAction(item);
        break;
      default:
        response = await this.syncCustomAction(item);
    }
    
    if (response && response.ok) {
      await this.markItemSynced(item.id);
      
      // Handle potential conflicts
      const responseData = await response.json();
      if (responseData.conflict) {
        await this.handleConflict(item, responseData);
      }
    } else {
      throw new Error(\`Sync failed: \${response?.status || 'Network error'}\`);
    }
  }
  
  async syncSaveAction(item) {
    const url = item.url || '/api/sync';
    return fetch(url, {
      method: item.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...item.headers
      },
      body: JSON.stringify({
        action: 'sync-save',
        type: item.data.type,
        data: item.data.data,
        offlineId: item.data.offlineId,
        timestamp: item.timestamp
      })
    });
  }
  
  async syncUpdateAction(item) {
    const url = item.url || \`/api/sync/\${item.data.id}\`;
    return fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...item.headers
      },
      body: JSON.stringify({
        action: 'sync-update',
        data: item.data.data,
        version: item.data.version,
        timestamp: item.timestamp
      })
    });
  }
  
  async syncDeleteAction(item) {
    const url = item.url || \`/api/sync/\${item.data.id}\`;
    return fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...item.headers
      },
      body: JSON.stringify({
        action: 'sync-delete',
        id: item.data.id,
        timestamp: item.timestamp
      })
    });
  }
  
  async syncCustomAction(item) {
    const url = item.url || '/api/sync';
    return fetch(url, {
      method: item.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...item.headers
      },
      body: JSON.stringify({
        action: item.action,
        data: item.data,
        timestamp: item.timestamp
      })
    });
  }
  
  async handleConflict(item, responseData) {
    console.log('OfflineManager: Handling conflict', item.id, this.conflictResolution);
    
    const conflict = {
      resource: item.data.type || 'unknown',
      localData: item.data,
      serverData: responseData.serverData,
      timestamp: Date.now(),
      resolution: null
    };
    
    switch (this.conflictResolution) {
      case 'client-wins':
        conflict.resolution = 'client';
        await this.applyClientWinsResolution(conflict);
        break;
      case 'server-wins':
        conflict.resolution = 'server';
        await this.applyServerWinsResolution(conflict);
        break;
      case 'manual':
        conflict.resolution = 'manual';
        await this.saveConflictForManualResolution(conflict);
        this.notifyUserOfConflict(conflict);
        break;
    }
  }
  
  async applyClientWinsResolution(conflict) {
    // Force sync with client data
    console.log('OfflineManager: Applying client-wins resolution');
    // Implementation would force the server to accept client data
  }
  
  async applyServerWinsResolution(conflict) {
    // Accept server data and update local
    console.log('OfflineManager: Applying server-wins resolution');
    await this.updateLocalDataFromServer(conflict.serverData);
  }
  
  async saveConflictForManualResolution(conflict) {
    const transaction = this.db.transaction(['conflicts'], 'readwrite');
    const store = transaction.objectStore('conflicts');
    await this.promisifyRequest(store.add(conflict));
  }
  
  notifyUserOfConflict(conflict) {
    // Show user notification about conflict
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Data Conflict', {
        body: \`A conflict was detected in \${conflict.resource}. Please review.\`,
        icon: '/icons/conflict-icon.png',
        tag: 'data-conflict'
      });
    }
    
    // Dispatch event for UI to handle
    document.dispatchEvent(new CustomEvent('dataconflict', { 
      detail: conflict 
    }));
  }
  
  async updateLocalDataFromServer(serverData) {
    // Update local storage with server data
    console.log('OfflineManager: Updating local data from server');
  }
  
  async markItemSynced(itemId) {
    const transaction = this.db.transaction(['sync-queue'], 'readwrite');
    const store = transaction.objectStore('sync-queue');
    
    const item = await this.promisifyRequest(store.get(itemId));
    if (item) {
      item.pending = false;
      item.syncedAt = Date.now();
      await this.promisifyRequest(store.put(item));
    }
    
    // Remove from memory queue
    this.syncQueue = this.syncQueue.filter(item => item.id !== itemId);
  }
  
  async handleSyncError(item, error) {
    const transaction = this.db.transaction(['sync-queue'], 'readwrite');
    const store = transaction.objectStore('sync-queue');
    
    item.retryCount = (item.retryCount || 0) + 1;
    item.lastError = error.message;
    item.lastAttempt = Date.now();
    
    if (item.retryCount >= item.maxRetries) {
      console.error('OfflineManager: Max retries reached for item', item.id);
      item.pending = false;
      item.failed = true;
      
      // Notify user of failed sync
      this.notifyUserOfSyncFailure(item);
    }
    
    await this.promisifyRequest(store.put(item));
  }
  
  notifyUserOfSyncFailure(item) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Sync Failed', {
        body: \`Failed to sync \${item.action} after \${item.retryCount} attempts.\`,
        icon: '/icons/error-icon.png',
        tag: 'sync-failed'
      });
    }
  }
  
  async clearSyncedItems() {
    const transaction = this.db.transaction(['sync-queue'], 'readwrite');
    const store = transaction.objectStore('sync-queue');
    const index = store.index('pending');
    
    const syncedItems = await this.promisifyRequest(index.getAll(false));
    for (const item of syncedItems) {
      if (item.syncedAt && Date.now() - item.syncedAt > 24 * 60 * 60 * 1000) { // 24 hours
        await this.promisifyRequest(store.delete(item.id));
      }
    }
  }
  
  async getStorageUsage() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage,
        available: estimate.quota,
        usedPercent: (estimate.usage / estimate.quota) * 100
      };
    }
    return null;
  }
  
  async cleanup() {
    // Clean up old data
    await this.clearSyncedItems();
    
    // Clean up old offline data
    const transaction = this.db.transaction(['offline-data'], 'readwrite');
    const store = transaction.objectStore('offline-data');
    const index = store.index('timestamp');
    
    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    const oldRecords = await this.promisifyRequest(
      index.getAll(IDBKeyRange.upperBound(cutoff))
    );
    
    for (const record of oldRecords) {
      if (record.synced) {
        await this.promisifyRequest(store.delete(record.id));
      }
    }
    
    console.log('OfflineManager: Cleanup completed');
  }
  
  promisifyRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

// Initialize offline manager
${config.offline.enabled ? `
const offlineManager = new OfflineManager();
window.offlineManager = offlineManager;

// Export for use in other modules
export default OfflineManager;
` : `
console.log('OfflineManager: Offline support is disabled');
export default null;
`}
`;
}
