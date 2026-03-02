import { useEffect, useMemo, useState } from 'react';

type SystemStatus = 'operational' | 'degraded' | 'down';
type ReadinessStatus = 'ready' | 'not_ready' | 'error';
type SummaryLevel = 'healthy' | 'degraded' | 'down' | 'loading';

interface PublicApiReadinessResponse {
  status: ReadinessStatus;
  queue?: {
    queue?: {
      selectedBackend?: string;
      hasRedisUrl?: boolean;
    };
  };
}

interface SystemHealthResponse {
  health?: {
    status?: SystemStatus;
  };
}

function levelStyles(level: SummaryLevel): string {
  if (level === 'healthy') return 'bg-green-100 text-green-800 border-green-300';
  if (level === 'degraded') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  if (level === 'down') return 'bg-red-100 text-red-800 border-red-300';
  return 'bg-recoder-elements-background-depth-3 text-recoder-elements-textSecondary border-recoder-elements-borderColor';
}

function dotStyles(level: SummaryLevel): string {
  if (level === 'healthy') return 'bg-green-500';
  if (level === 'degraded') return 'bg-yellow-500';
  if (level === 'down') return 'bg-red-500';
  return 'bg-recoder-elements-textTertiary';
}

export function AdminHealthSummary({ onClick }: { onClick?: () => void }) {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [readinessStatus, setReadinessStatus] = useState<ReadinessStatus | null>(null);
  const [queueBackend, setQueueBackend] = useState<string>('unknown');
  const [redisUrlState, setRedisUrlState] = useState<string>('unknown');

  useEffect(() => {
    let cancelled = false;

    const fetchSummary = async () => {
      try {
        const [systemResponse, readinessResponse] = await Promise.all([
          fetch('/api/system-health'),
          fetch('/api/health/public-api-readiness'),
        ]);

        const systemJson = await systemResponse.json() as SystemHealthResponse;
        const readinessJson = await readinessResponse.json() as PublicApiReadinessResponse;

        if (cancelled) return;

        setSystemStatus(systemJson?.health?.status || 'down');
        setReadinessStatus(readinessJson?.status || 'error');
        setQueueBackend(readinessJson?.queue?.queue?.selectedBackend || 'unknown');
        if (typeof readinessJson?.queue?.queue?.hasRedisUrl === 'boolean') {
          setRedisUrlState(String(readinessJson.queue.queue.hasRedisUrl));
        } else {
          setRedisUrlState('unknown');
        }
      } catch {
        if (cancelled) return;
        setSystemStatus('down');
        setReadinessStatus('error');
      }
    };

    void fetchSummary();
    const interval = setInterval(fetchSummary, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const level = useMemo<SummaryLevel>(() => {
    if (!systemStatus || !readinessStatus) return 'loading';
    if (systemStatus === 'down' || readinessStatus === 'error') return 'down';
    if (systemStatus === 'degraded' || readinessStatus === 'not_ready') return 'degraded';
    return 'healthy';
  }, [readinessStatus, systemStatus]);

  const label = useMemo(() => {
    if (level === 'healthy') return 'Healthy';
    if (level === 'degraded') return 'Needs Attention';
    if (level === 'down') return 'Incident';
    return 'Loading';
  }, [level]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-xs min-w-[220px] text-left ${levelStyles(level)} ${
        onClick ? 'hover:opacity-90 cursor-pointer' : ''
      }`}
      title={onClick ? 'Open System Health tab' : undefined}
    >
      <div className="flex items-center gap-2 font-semibold">
        <div className={`w-2 h-2 rounded-full ${dotStyles(level)}`} />
        <span>Ops: {label}</span>
      </div>
      <div className="mt-1">
        <span>Queue: {queueBackend}</span>
        <span className="mx-1">|</span>
        <span>Redis URL: {redisUrlState}</span>
      </div>
    </button>
  );
}
