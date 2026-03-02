import { useEffect, useState } from 'react';

interface StatusIndicatorProps {
  type: 'mcp' | 'github';
}

export function IntegrationStatus({ type }: StatusIndicatorProps) {
  const [status, setStatus] = useState<{
    connected: boolean;
    loading: boolean;
    message: string;
  }>({
    connected: false,
    loading: true,
    message: 'Checking...',
  });

  useEffect(() => {
    checkStatus();
  }, [type]);

  const checkStatus = async () => {
    setStatus(prev => ({ ...prev, loading: true }));
    
    try {
      const endpoint = type === 'mcp' ? '/api/mcp/health' : '/api/github/health';
      const response = await fetch(endpoint);
      const data = (await response.json()) as { connected?: boolean; enabled?: boolean; message?: string };

      setStatus({
        connected: data.connected || data.enabled || false,
        loading: false,
        message: data.message || 'Unknown status',
      });
    } catch (error) {
      setStatus({
        connected: false,
        loading: false,
        message: 'Failed to check status',
      });
    }
  };

  const label = type === 'mcp' ? 'MCP' : 'GitHub';
  const icon = type === 'mcp' ? 'i-ph:plugs-connected' : 'i-ph:github-logo';

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor">
      <div className={icon} />
      <span className="text-sm font-medium">{label}</span>
      
      {status.loading ? (
        <div className="i-svg-spinners:90-ring-with-bg text-recoder-elements-loader-progress" />
      ) : (
        <div className={`w-2 h-2 rounded-full ${status.connected ? 'bg-green-500' : 'bg-red-500'}`} />
      )}
      
      <span className="text-xs text-recoder-elements-textSecondary">
        {status.message}
      </span>
      
      <button
        onClick={checkStatus}
        className="ml-2 text-xs text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary"
        title="Refresh status"
      >
        <div className="i-ph:arrow-clockwise" />
      </button>
    </div>
  );
}
