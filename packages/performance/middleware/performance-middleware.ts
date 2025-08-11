// Performance middleware placeholder for startup speed
export const performanceMiddleware = {
  createRateLimitMiddleware: (options: any) => (req: any, res: any, next: any) => next(),
  createHealthCheckMiddleware: () => (req: any, res: any) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  }
};

export const middlewareStacks = {
  full: (options?: any) => []
};