// Redis cache placeholder for startup speed
export const redisCache = {
  getHealthStatus: async () => ({ connected: true, hitRate: 85.5 }),
  close: async () => {},
  on: (event: string, callback: Function) => {}
};