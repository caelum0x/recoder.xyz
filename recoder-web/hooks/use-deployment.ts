import { useState, useCallback } from 'react';

interface DeploymentStatus {
  status: 'idle' | 'building' | 'deploying' | 'deployed' | 'failed';
  platform?: string;
  url?: string;
  progress?: number;
  error?: string;
  deploymentId?: string;
}

export const useDeployment = (projectId: string) => {
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus>({
    status: 'idle'
  });

  const startDeployment = useCallback(async (platform: string, options?: any) => {
    try {
      setDeploymentStatus({
        status: 'building',
        platform,
        progress: 0
      });

      const response = await fetch(`/api/projects/${projectId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          platforms: [platform],
          ...options 
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setDeploymentStatus({
          status: 'deploying',
          platform,
          progress: 25,
          deploymentId: data.data.deployments?.[0]?.id
        });

        // Start polling for deployment status
        pollDeploymentStatus(data.data.deployments?.[0]?.id);
      } else {
        setDeploymentStatus({
          status: 'failed',
          platform,
          error: data.error || 'Deployment failed'
        });
      }
    } catch (error) {
      setDeploymentStatus({
        status: 'failed',
        platform,
        error: error instanceof Error ? error.message : 'Deployment failed'
      });
    }
  }, [projectId]);

  const pollDeploymentStatus = useCallback(async (deploymentId: string) => {
    const maxAttempts = 30; // 5 minutes with 10-second intervals
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/deploy?deploymentId=${deploymentId}`);
        const data = await response.json();

        if (data.success) {
          const deployment = data.data.deployment;
          const progress = Math.min(50 + (attempts * 2), 95); // Simulate progress

          setDeploymentStatus(prev => ({
            ...prev,
            progress,
            status: deployment.status
          }));

          if (deployment.status === 'deployed') {
            setDeploymentStatus(prev => ({
              ...prev,
              status: 'deployed',
              progress: 100,
              url: deployment.url
            }));
          } else if (deployment.status === 'failed') {
            setDeploymentStatus(prev => ({
              ...prev,
              status: 'failed',
              error: deployment.error || 'Deployment failed'
            }));
          } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(poll, 10000); // Poll every 10 seconds
          } else {
            setDeploymentStatus(prev => ({
              ...prev,
              status: 'failed',
              error: 'Deployment timeout'
            }));
          }
        }
      } catch (error) {
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 10000);
        } else {
          setDeploymentStatus(prev => ({
            ...prev,
            status: 'failed',
            error: 'Failed to check deployment status'
          }));
        }
      }
    };

    poll();
  }, [projectId]);

  const resetDeployment = useCallback(() => {
    setDeploymentStatus({ status: 'idle' });
  }, []);

  const getDeploymentUrl = useCallback((platform: string) => {
    const baseUrls: Record<string, string> = {
      'vercel': 'vercel.app',
      'netlify': 'netlify.app',
      'railway': 'railway.app',
      'render': 'render.com'
    };

    return `https://${projectId}.${baseUrls[platform] || 'app.com'}`;
  }, [projectId]);

  return {
    deploymentStatus,
    startDeployment,
    resetDeployment,
    getDeploymentUrl,
    isDeploying: deploymentStatus.status === 'building' || deploymentStatus.status === 'deploying',
    isDeployed: deploymentStatus.status === 'deployed',
    hasFailed: deploymentStatus.status === 'failed'
  };
};
