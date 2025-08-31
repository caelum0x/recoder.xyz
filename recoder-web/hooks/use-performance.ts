import { useState, useEffect, useCallback } from 'react';

interface PerformanceMetrics {
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  cpuUsage: number;
  loadTime: number;
  renderTime: number;
  networkLatency: number;
  bundleSize: number;
  errorCount: number;
  frameRate: number;
}

interface PerformanceAlert {
  id: string;
  type: 'warning' | 'error' | 'info';
  message: string;
  timestamp: number;
  metric: string;
  value: number;
  threshold: number;
}

export const usePerformance = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const measurePageLoad = useCallback(() => {
    if (typeof window !== 'undefined' && window.performance) {
      const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return navigation.loadEventEnd - navigation.fetchStart;
    }
    return 0;
  }, []);

  const measureMemoryUsage = useCallback(() => {
    if (typeof window !== 'undefined' && 'memory' in window.performance) {
      const memory = (window.performance as any).memory;
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        percentage: (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100
      };
    }
    return { used: 0, total: 0, percentage: 0 };
  }, []);

  const measureNetworkLatency = useCallback(async () => {
    const start = performance.now();
    try {
      await fetch('/api/health', { method: 'HEAD' });
      return performance.now() - start;
    } catch {
      return 0;
    }
  }, []);

  const measureFrameRate = useCallback(() => {
    let frames = 0;
    let lastTime = performance.now();
    
    const measureFPS = () => {
      frames++;
      const currentTime = performance.now();
      if (currentTime >= lastTime + 1000) {
        const fps = Math.round((frames * 1000) / (currentTime - lastTime));
        lastTime = currentTime;
        frames = 0;
        return fps;
      }
      requestAnimationFrame(measureFPS);
      return 60; // Default assumption
    };
    
    return measureFPS();
  }, []);

  const checkThresholds = useCallback((newMetrics: PerformanceMetrics) => {
    const newAlerts: PerformanceAlert[] = [];
    
    // Memory usage alert
    if (newMetrics.memoryUsage.percentage > 80) {
      newAlerts.push({
        id: `memory-${Date.now()}`,
        type: 'warning',
        message: 'High memory usage detected',
        timestamp: Date.now(),
        metric: 'memory',
        value: newMetrics.memoryUsage.percentage,
        threshold: 80
      });
    }
    
    // Load time alert
    if (newMetrics.loadTime > 3000) {
      newAlerts.push({
        id: `loadtime-${Date.now()}`,
        type: 'warning',
        message: 'Slow page load detected',
        timestamp: Date.now(),
        metric: 'loadTime',
        value: newMetrics.loadTime,
        threshold: 3000
      });
    }
    
    // Network latency alert
    if (newMetrics.networkLatency > 1000) {
      newAlerts.push({
        id: `latency-${Date.now()}`,
        type: 'warning',
        message: 'High network latency detected',
        timestamp: Date.now(),
        metric: 'networkLatency',
        value: newMetrics.networkLatency,
        threshold: 1000
      });
    }
    
    // Frame rate alert
    if (newMetrics.frameRate < 30) {
      newAlerts.push({
        id: `framerate-${Date.now()}`,
        type: 'warning',
        message: 'Low frame rate detected',
        timestamp: Date.now(),
        metric: 'frameRate',
        value: newMetrics.frameRate,
        threshold: 30
      });
    }
    
    if (newAlerts.length > 0) {
      setAlerts(prev => [...prev, ...newAlerts].slice(-10)); // Keep last 10 alerts
    }
  }, []);

  const collectMetrics = useCallback(async () => {
    const startTime = performance.now();
    
    const [networkLatency] = await Promise.all([
      measureNetworkLatency()
    ]);
    
    const endTime = performance.now();
    
    const newMetrics: PerformanceMetrics = {
      memoryUsage: measureMemoryUsage(),
      cpuUsage: 0, // Browser can't measure CPU directly
      loadTime: measurePageLoad(),
      renderTime: endTime - startTime,
      networkLatency,
      bundleSize: 0, // Would need build-time measurement
      errorCount: 0, // Would track from error boundary
      frameRate: measureFrameRate()
    };
    
    setMetrics(newMetrics);
    checkThresholds(newMetrics);
  }, [measureMemoryUsage, measurePageLoad, measureNetworkLatency, measureFrameRate, checkThresholds]);

  const startMonitoring = useCallback(() => {
    setIsMonitoring(true);
    collectMetrics();
    
    const interval = setInterval(collectMetrics, 5000); // Collect every 5 seconds
    
    return () => {
      clearInterval(interval);
      setIsMonitoring(false);
    };
  }, [collectMetrics]);

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  const dismissAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  }, []);

  useEffect(() => {
    const cleanup = startMonitoring();
    return cleanup;
  }, [startMonitoring]);

  return {
    metrics,
    alerts,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    clearAlerts,
    dismissAlert,
    collectMetrics
  };
};
