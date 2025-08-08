const Redis = require('redis');
const { logger } = require('../utils/logger');

let client = null;

const connectRedis = async () => {
  try {
    if (!process.env.REDIS_URL) {
      logger.info('Redis URL not configured, skipping Redis connection');
      return null;
    }

    client = Redis.createClient({
      url: process.env.REDIS_URL,
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          logger.error('The Redis server refused the connection');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          logger.error('Retry time exhausted');
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });

    client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      logger.info('Connected to Redis');
    });

    client.on('ready', () => {
      logger.info('Redis client ready');
    });

    client.on('end', () => {
      logger.info('Redis connection ended');
    });

    await client.connect();
    return client;
  } catch (error) {
    logger.error('Redis connection failed:', error);
    // Don't throw error - allow app to continue without Redis
    return null;
  }
};

const disconnectRedis = async () => {
  try {
    if (client) {
      await client.quit();
      client = null;
      logger.info('Disconnected from Redis');
    }
  } catch (error) {
    logger.error('Redis disconnection failed:', error);
  }
};

const getClient = () => client;

// Helper functions
const set = async (key, value, expiry = null) => {
  try {
    if (!client) return false;
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (expiry) {
      await client.setEx(key, expiry, stringValue);
    } else {
      await client.set(key, stringValue);
    }
    return true;
  } catch (error) {
    logger.error('Redis SET error:', error);
    return false;
  }
};

const get = async (key) => {
  try {
    if (!client) return null;
    const value = await client.get(key);
    if (!value) return null;
    
    // Try to parse as JSON, fallback to string
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch (error) {
    logger.error('Redis GET error:', error);
    return null;
  }
};

const del = async (key) => {
  try {
    if (!client) return false;
    await client.del(key);
    return true;
  } catch (error) {
    logger.error('Redis DEL error:', error);
    return false;
  }
};

const exists = async (key) => {
  try {
    if (!client) return false;
    const result = await client.exists(key);
    return result > 0;
  } catch (error) {
    logger.error('Redis EXISTS error:', error);
    return false;
  }
};

const expire = async (key, seconds) => {
  try {
    if (!client) return false;
    await client.expire(key, seconds);
    return true;
  } catch (error) {
    logger.error('Redis EXPIRE error:', error);
    return false;
  }
};

// Cache helpers
const cache = {
  set,
  get,
  del,
  exists,
  expire,
  
  // Convenience methods
  setJSON: async (key, value, expiry = null) => {
    return await set(key, JSON.stringify(value), expiry);
  },
  
  getJSON: async (key) => {
    const value = await get(key);
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return value;
    }
  }
};

module.exports = {
  connectRedis,
  disconnectRedis,
  getClient,
  cache,
  // Direct access to helper functions
  set,
  get,
  del,
  exists,
  expire
};