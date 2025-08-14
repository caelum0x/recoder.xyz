/**
 * Caching module exports
 */

export { 
  RedisCache, 
  CacheOptions, 
  CacheStats, 
  CacheEntry 
} from './redis-cache';

// Default export
export { RedisCache as default } from './redis-cache';