'use client';

import { useQuery } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';
import Link from 'next/link';
import { Play, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface RecentRun {
  agent_run_id: string;
  agent_name?: string;
  status: string;
  started_at: string;
  completed_at?: string;
}

function useRecentRuns() {
  return useQuery({
    queryKey: ['recent-runs-widget'],
    queryFn: async () => {
      const response = await backendApi.get<any>('/runs?limit=5&sort=started_at', { showErrors: false });
      if (response.error) return [];
      const data = response.data;
      if (Array.isArray(data)) return data.slice(0, 5);
      if (data?.runs) return data.runs.slice(0, 5);
      return [];
    },
    staleTime: 30_000,
  });
}

const statusIcon: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="h-3 w-3 text-green-500" />,
  failed: <XCircle className="h-3 w-3 text-red-500" />,
  running: <Play className="h-3 w-3 text-blue-500 animate-pulse" />,
};

function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function RecentRunsWidget() {
  const { data: runs, isLoading } = useRecentRuns();

  if (isLoading) return <div className="h-32 rounded-lg border bg-card animate-pulse" />;
  if (!runs || runs.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Play className="h-4 w-4" /> Recent Runs
        </h3>
        <Link href="/runs" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
      </div>
      <div className="space-y-2">
        {runs.map((run: any) => (
          <Link
            key={run.agent_run_id || run.id}
            href={`/runs/${run.agent_run_id || run.id}`}
            className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted transition-colors text-sm"
          >
            <div className="flex items-center gap-2">
              {statusIcon[run.status] || <Clock className="h-3 w-3 text-muted-foreground" />}
              <span className="truncate max-w-[150px]">{run.agent_name || 'Agent Run'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={run.status === 'completed' ? 'default' : run.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px] h-4">
                {run.status}
              </Badge>
              <span className="text-[10px] text-muted-foreground">{getRelativeTime(run.started_at)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
