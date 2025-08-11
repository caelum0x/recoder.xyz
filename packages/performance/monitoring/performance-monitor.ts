// Performance monitor placeholder for startup speed
export const performanceMonitor = {
  getMetrics: () => ({ responseTime: 100, throughput: 1000, system: {}, errors: {} }),
  getPerformanceSummary: () => ({ status: 'healthy', score: 95, activeAlerts: 0 }),
  recordError: (code: string) => {},
  stop: () => {},
  on: (event: string, callback: Function) => {}
};