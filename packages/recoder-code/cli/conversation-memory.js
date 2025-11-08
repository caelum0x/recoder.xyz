/**
 * Conversation Memory System
 * Intelligent memory management for long-running conversations
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ConversationMemory {
  constructor(options = {}) {
    this.memoryDir = options.memoryDir || path.join(process.cwd(), '.recoder', 'memory');
    this.maxMemoryItems = options.maxMemoryItems || 1000;
    this.memories = new Map();
    this.importance = new Map(); // Track importance scores
    this.initialized = false;
  }

  /**
   * Initialize memory system
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.memoryDir, { recursive: true });
      await this.loadMemories();
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing conversation memory:', error.message);
    }
  }

  /**
   * Store a memory item
   */
  async storeMemory(key, value, metadata = {}) {
    const memoryId = this.generateMemoryId(key);
    const memory = {
      id: memoryId,
      key,
      value,
      metadata: {
        ...metadata,
        timestamp: Date.now(),
        accessCount: 0
      }
    };

    this.memories.set(memoryId, memory);
    this.importance.set(memoryId, this.calculateImportance(memory));

    // Persist to disk periodically
    if (this.memories.size % 10 === 0) {
      await this.persistMemories();
    }

    return memoryId;
  }

  /**
   * Retrieve a memory item
   */
  async retrieveMemory(key) {
    const memoryId = this.generateMemoryId(key);
    const memory = this.memories.get(memoryId);

    if (memory) {
      // Update access count
      memory.metadata.accessCount++;
      memory.metadata.lastAccess = Date.now();
      this.importance.set(memoryId, this.calculateImportance(memory));
      return memory.value;
    }

    return null;
  }

  /**
   * Search memories by pattern
   */
  searchMemories(pattern) {
    const regex = new RegExp(pattern, 'i');
    const results = [];

    for (const [id, memory] of this.memories.entries()) {
      if (regex.test(memory.key) || regex.test(JSON.stringify(memory.value))) {
        results.push({
          id,
          key: memory.key,
          value: memory.value,
          metadata: memory.metadata
        });
      }
    }

    // Sort by importance
    return results.sort((a, b) => {
      const importanceA = this.importance.get(a.id) || 0;
      const importanceB = this.importance.get(b.id) || 0;
      return importanceB - importanceA;
    });
  }

  /**
   * Get most important memories
   */
  getTopMemories(count = 10) {
    const sortedMemories = Array.from(this.memories.entries())
      .map(([id, memory]) => ({
        id,
        memory,
        importance: this.importance.get(id) || 0
      }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, count);

    return sortedMemories.map(item => ({
      key: item.memory.key,
      value: item.memory.value,
      importance: item.importance,
      metadata: item.memory.metadata
    }));
  }

  /**
   * Calculate importance score
   */
  calculateImportance(memory) {
    const age = Date.now() - memory.metadata.timestamp;
    const ageInDays = age / (1000 * 60 * 60 * 24);
    
    // Decay factor: memories lose importance over time
    const timeFactor = Math.exp(-ageInDays / 7); // 7-day half-life
    
    // Access frequency factor
    const accessFactor = Math.log(memory.metadata.accessCount + 1);
    
    // Recency factor
    const lastAccess = memory.metadata.lastAccess || memory.metadata.timestamp;
    const recencyFactor = Math.exp(-(Date.now() - lastAccess) / (1000 * 60 * 60 * 24 * 3));
    
    // Manual importance from metadata
    const manualImportance = memory.metadata.importance || 1;
    
    return (timeFactor * 0.3 + accessFactor * 0.3 + recencyFactor * 0.2 + manualImportance * 0.2);
  }

  /**
   * Clean up old, unimportant memories
   */
  async pruneMemories() {
    if (this.memories.size <= this.maxMemoryItems) {
      return;
    }

    const sortedByImportance = Array.from(this.memories.entries())
      .map(([id, memory]) => ({
        id,
        importance: this.importance.get(id) || 0
      }))
      .sort((a, b) => b.importance - a.importance);

    // Keep only top memories
    const toKeep = new Set(
      sortedByImportance.slice(0, this.maxMemoryItems).map(item => item.id)
    );

    for (const [id] of this.memories.entries()) {
      if (!toKeep.has(id)) {
        this.memories.delete(id);
        this.importance.delete(id);
      }
    }

    await this.persistMemories();
  }

  /**
   * Generate memory ID from key
   */
  generateMemoryId(key) {
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  }

  /**
   * Load memories from disk
   */
  async loadMemories() {
    try {
      const memoryFile = path.join(this.memoryDir, 'memories.json');
      const data = await fs.readFile(memoryFile, 'utf8');
      const parsed = JSON.parse(data);

      this.memories = new Map(parsed.memories);
      this.importance = new Map(parsed.importance);
    } catch (error) {
      // No existing memories, start fresh
      this.memories = new Map();
      this.importance = new Map();
    }
  }

  /**
   * Persist memories to disk
   */
  async persistMemories() {
    try {
      const memoryFile = path.join(this.memoryDir, 'memories.json');
      const data = {
        memories: Array.from(this.memories.entries()),
        importance: Array.from(this.importance.entries()),
        lastSaved: Date.now()
      };

      await fs.writeFile(memoryFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('Error persisting memories:', error.message);
    }
  }

  /**
   * Export memories for context
   */
  exportForContext(maxItems = 20) {
    const topMemories = this.getTopMemories(maxItems);
    
    if (topMemories.length === 0) {
      return '';
    }

    return `\n[Long-term Memory Context]\n${topMemories
      .map(m => `• ${m.key}: ${JSON.stringify(m.value)}`)
      .join('\n')}\n[End Memory Context]\n`;
  }

  /**
   * Get memory statistics
   */
  getStats() {
    return {
      totalMemories: this.memories.size,
      averageImportance: Array.from(this.importance.values()).reduce((a, b) => a + b, 0) / this.importance.size || 0,
      oldestMemory: Math.min(...Array.from(this.memories.values()).map(m => m.metadata.timestamp)),
      newestMemory: Math.max(...Array.from(this.memories.values()).map(m => m.metadata.timestamp))
    };
  }

  /**
   * Clear all memories
   */
  async clearAll() {
    this.memories.clear();
    this.importance.clear();
    await this.persistMemories();
  }
}

module.exports = ConversationMemory;
