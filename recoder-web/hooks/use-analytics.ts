import { useState, useEffect, useCallback } from 'react';

interface AnalyticsMetrics {
  linesOfCode: number;
  fileCount: number;
  buildTime?: number;
  lastDeployment?: string;
  totalEdits: number;
  collaborators: number;
  uptime: number;
  performance: {
    avgLoadTime: number;
    avgSaveTime: number;
    errorRate: number;
  };
}

export const useAnalytics = (projectId: string) => {
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/projects/${projectId}/analytics`);
      const data = await response.json();
      
      if (data.success) {
        setMetrics(data.data.metrics);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const trackEvent = useCallback(async (event: string, properties?: any) => {
    try {
      await fetch(`/api/projects/${projectId}/analytics/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event,
          properties: {
            timestamp: Date.now(),
            projectId,
            ...properties
          }
        })
      });
    } catch (error) {
      console.error('Error tracking event:', error);
    }
  }, [projectId]);

  const trackFileEdit = useCallback((fileName: string, linesChanged: number) => {
    trackEvent('file_edit', {
      fileName,
      linesChanged,
      action: 'edit'
    });
  }, [trackEvent]);

  const trackFileSave = useCallback((fileName: string, fileSize: number) => {
    trackEvent('file_save', {
      fileName,
      fileSize,
      action: 'save'
    });
  }, [trackEvent]);

  const trackCodeGeneration = useCallback((prompt: string, generatedLines: number) => {
    trackEvent('ai_code_generation', {
      prompt: prompt.substring(0, 100), // First 100 chars for privacy
      generatedLines,
      action: 'generate'
    });
  }, [trackEvent]);

  const trackDeployment = useCallback((platform: string, status: string) => {
    trackEvent('deployment', {
      platform,
      status,
      action: 'deploy'
    });
  }, [trackEvent]);

  const trackCollaboration = useCallback((action: string, collaboratorCount: number) => {
    trackEvent('collaboration', {
      action,
      collaboratorCount,
      timestamp: Date.now()
    });
  }, [trackEvent]);

  useEffect(() => {
    loadAnalytics();
    
    // Refresh analytics every 30 seconds
    const interval = setInterval(loadAnalytics, 30000);
    
    return () => clearInterval(interval);
  }, [loadAnalytics]);

  return {
    metrics,
    loading,
    loadAnalytics,
    trackEvent,
    trackFileEdit,
    trackFileSave,
    trackCodeGeneration,
    trackDeployment,
    trackCollaboration
  };
};
