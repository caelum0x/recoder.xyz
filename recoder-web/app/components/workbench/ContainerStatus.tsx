/**
 * Container Status Component
 * Displays Docker container status, resource usage, and controls.
 *
 * Features:
 * - Status indicator with color coding
 * - CPU/Memory usage display
 * - Restart/Stop/Start buttons
 * - View logs button
 * - Port information
 */

import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import {
  containerStatusStore,
  containerState,
  containerHealth,
  containerResources,
  containerPorts,
  isContainerRunning,
  isContainerTransitioning,
  canStartContainer,
  canStopContainer,
  stateColor,
  healthColor,
  formattedMemoryUsage,
  getStateText,
  getHealthText,
  formatPortMapping,
  type ContainerState,
  type HealthStatus,
  type LogEntry,
} from '~/lib/stores/container-status';
import {
  restartContainer,
  stopContainer,
  startContainer,
  fetchContainerLogs,
} from '~/lib/services/container-monitor';
import { restartSandboxVite } from '~/lib/sandbox';
import { classNames } from '~/utils/classNames';

interface ContainerStatusProps {
  className?: string;
  showLabel?: boolean;
  compact?: boolean;
}

export const ContainerStatus = memo(({
  className,
  showLabel = false,
  compact = false,
}: ContainerStatusProps) => {
  const status = useStore(containerStatusStore);
  const state = useStore(containerState);
  const health = useStore(containerHealth);
  const isRunning = useStore(isContainerRunning);
  const isTransitioning = useStore(isContainerTransitioning);
  const canStart = useStore(canStartContainer);
  const canStop = useStore(canStopContainer);
  const stateColorClass = useStore(stateColor);
  const memUsage = useStore(formattedMemoryUsage);

  const [showDetails, setShowDetails] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDetails(false);
        setShowLogs(false);
      }
    };

    if (showDetails || showLogs) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDetails, showLogs]);

  const handleRestart = useCallback(async () => {
    setIsLoading(true);
    try {
      await restartContainer();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleStop = useCallback(async () => {
    setIsLoading(true);
    try {
      await stopContainer();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleStart = useCallback(async () => {
    setIsLoading(true);
    try {
      await startContainer();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleViewLogs = useCallback(async () => {
    setShowDetails(false);
    setShowLogs(true);
    await fetchContainerLogs(100);
  }, []);

  const handleRestartDevServer = useCallback(async () => {
    setIsLoading(true);
    try {
      await restartSandboxVite();
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Determine if we should pulse (transitioning)
  const shouldPulse = isTransitioning;

  // Don't render if state is unknown and no error
  if (state === 'unknown' && !status.error) {
    return null;
  }

  if (compact) {
    return (
      <CompactContainerStatus
        state={state}
        health={health}
        stateColorClass={stateColorClass}
        shouldPulse={shouldPulse}
        className={className}
      />
    );
  }

  return (
    <div ref={containerRef} className={classNames('relative', className)}>
      {/* Main indicator button */}
      <button
        onClick={() => {
          setShowDetails(!showDetails);
          setShowLogs(false);
        }}
        className={classNames(
          'flex items-center gap-2 px-2 py-1 rounded-md transition-colors',
          'hover:bg-bolt-elements-background-depth-2',
          'focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColor'
        )}
        title="Container status"
        aria-label="Show container status details"
      >
        {/* Status dot */}
        <div className="relative">
          <div className={classNames('w-2 h-2 rounded-full', stateColorClass)} />
          {shouldPulse && (
            <div
              className={classNames(
                'absolute inset-0 w-2 h-2 rounded-full animate-ping',
                stateColorClass,
                'opacity-75'
              )}
            />
          )}
        </div>

        {/* Optional label */}
        {showLabel && (
          <span className="text-xs text-bolt-elements-textSecondary">
            {getStateText(state)}
          </span>
        )}

        {/* Resource usage (when running) */}
        {isRunning && memUsage && (
          <span className="text-xs text-bolt-elements-textTertiary">
            {status.resources?.cpuPercent.toFixed(0)}% | {memUsage.percent}%
          </span>
        )}
      </button>

      {/* Details dropdown */}
      {showDetails && (
        <div
          className={classNames(
            'absolute right-0 mt-2 w-72 z-50',
            'bg-bolt-elements-background-depth-2 rounded-lg shadow-lg',
            'border border-bolt-elements-borderColor',
            'overflow-hidden'
          )}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-bolt-elements-borderColor flex items-center justify-between">
            <h3 className="text-sm font-medium text-bolt-elements-textPrimary">
              Container Status
            </h3>
            <div className="flex items-center gap-1.5">
              <div className={classNames('w-2 h-2 rounded-full', stateColorClass)} />
              <span className="text-xs text-bolt-elements-textSecondary">
                {getStateText(state)}
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="p-3 space-y-3">
            {/* Health Status */}
            <HealthStatusRow health={health} message={status.healthMessage} />

            {/* Resource Usage */}
            {isRunning && status.resources && (
              <ResourceUsageSection
                cpuPercent={status.resources.cpuPercent}
                memUsage={memUsage}
              />
            )}

            {/* Port Mappings */}
            {status.ports.length > 0 && (
              <PortMappingsSection ports={status.ports} />
            )}

            {/* Error Message */}
            {status.error && (
              <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
                {status.error}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-3 py-2 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 flex items-center gap-2">
            {canStart && (
              <ActionButton
                onClick={handleStart}
                disabled={isLoading || isTransitioning}
                icon="i-ph:play"
                label="Start"
                className="bg-green-600 hover:bg-green-700"
              />
            )}
            {canStop && (
              <ActionButton
                onClick={handleStop}
                disabled={isLoading || isTransitioning}
                icon="i-ph:stop"
                label="Stop"
                className="bg-red-600 hover:bg-red-700"
              />
            )}
            {isRunning && (
              <ActionButton
                onClick={handleRestart}
                disabled={isLoading || isTransitioning}
                icon="i-ph:arrow-clockwise"
                label="Restart"
                className="bg-blue-600 hover:bg-blue-700"
                loading={isLoading}
              />
            )}
            {isRunning && (
              <ActionButton
                onClick={handleRestartDevServer}
                disabled={isLoading || isTransitioning}
                icon="i-ph:rocket-launch"
                label="Restart Dev Server"
                className="bg-indigo-600 hover:bg-indigo-700"
              />
            )}
            <ActionButton
              onClick={handleViewLogs}
              icon="i-ph:terminal-window"
              label="Logs"
              className="bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-3"
            />
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {showLogs && (
        <LogsModal
          logs={status.logs}
          onClose={() => setShowLogs(false)}
        />
      )}
    </div>
  );
});

// Health status row
interface HealthStatusRowProps {
  health: HealthStatus;
  message?: string;
}

const HealthStatusRow = memo(({ health, message }: HealthStatusRowProps) => {
  const healthColorClass = (() => {
    switch (health) {
      case 'healthy':
        return 'text-green-400';
      case 'degraded':
        return 'text-yellow-400';
      case 'unhealthy':
        return 'text-red-400';
      default:
        return 'text-bolt-elements-textSecondary';
    }
  })();

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-bolt-elements-textSecondary">Health</span>
      <div className="flex items-center gap-1.5">
        <span className={classNames('text-xs', healthColorClass)}>
          {getHealthText(health)}
        </span>
        {message && (
          <span className="text-xs text-bolt-elements-textTertiary">
            ({message})
          </span>
        )}
      </div>
    </div>
  );
});

// Resource usage section
interface ResourceUsageSectionProps {
  cpuPercent: number;
  memUsage: { used: string; limit: string; percent: string } | null;
}

const ResourceUsageSection = memo(({ cpuPercent, memUsage }: ResourceUsageSectionProps) => {
  return (
    <div className="space-y-2">
      <div className="text-xs text-bolt-elements-textSecondary mb-1">Resources</div>

      {/* CPU */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-bolt-elements-textTertiary">CPU</span>
          <span className="text-bolt-elements-textSecondary">{cpuPercent.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 bg-bolt-elements-background-depth-2 rounded-full overflow-hidden">
          <div
            className={classNames(
              'h-full rounded-full transition-all',
              cpuPercent > 80 ? 'bg-red-500' : cpuPercent > 50 ? 'bg-yellow-500' : 'bg-green-500'
            )}
            style={{ width: `${Math.min(cpuPercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Memory */}
      {memUsage && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-bolt-elements-textTertiary">Memory</span>
            <span className="text-bolt-elements-textSecondary">
              {memUsage.used} / {memUsage.limit}
            </span>
          </div>
          <div className="h-1.5 bg-bolt-elements-background-depth-2 rounded-full overflow-hidden">
            <div
              className={classNames(
                'h-full rounded-full transition-all',
                parseFloat(memUsage.percent) > 80
                  ? 'bg-red-500'
                  : parseFloat(memUsage.percent) > 50
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
              )}
              style={{ width: `${Math.min(parseFloat(memUsage.percent), 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
});

// Port mappings section
interface PortMappingsSectionProps {
  ports: Array<{
    containerPort: number;
    hostPort: number;
    protocol: 'tcp' | 'udp';
    hostIp?: string;
  }>;
}

const PortMappingsSection = memo(({ ports }: PortMappingsSectionProps) => {
  return (
    <div className="space-y-1">
      <div className="text-xs text-bolt-elements-textSecondary mb-1">Ports</div>
      {ports.map((port, index) => (
        <div
          key={index}
          className="flex items-center justify-between text-xs bg-bolt-elements-background-depth-2 px-2 py-1 rounded"
        >
          <span className="text-bolt-elements-textTertiary">
            :{port.containerPort}
          </span>
          <a
            href={`http://localhost:${port.hostPort}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            localhost:{port.hostPort}
            <div className="i-ph:arrow-square-out w-3 h-3" />
          </a>
        </div>
      ))}
    </div>
  );
});

// Action button
interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  icon: string;
  label: string;
  className?: string;
  loading?: boolean;
}

const ActionButton = memo(({
  onClick,
  disabled,
  icon,
  label,
  className,
  loading,
}: ActionButtonProps) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        'px-2 py-1 text-xs rounded transition-colors',
        'text-white flex items-center gap-1',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    >
      <div className={classNames(icon, 'w-3.5 h-3.5', loading && 'animate-spin')} />
      {label}
    </button>
  );
});

// Logs modal
interface LogsModalProps {
  logs: LogEntry[];
  onClose: () => void;
}

const LogsModal = memo(({ logs, onClose }: LogsModalProps) => {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div
      className={classNames(
        'fixed inset-0 z-50 flex items-center justify-center',
        'bg-black/50 backdrop-blur-sm'
      )}
      onClick={onClose}
    >
      <div
        className={classNames(
          'w-full max-w-2xl max-h-[80vh] m-4',
          'bg-bolt-elements-background-depth-2 rounded-lg shadow-xl',
          'border border-bolt-elements-borderColor',
          'flex flex-col overflow-hidden'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-bolt-elements-borderColor flex items-center justify-between">
          <h3 className="text-sm font-medium text-bolt-elements-textPrimary">
            Container Logs
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bolt-elements-background-depth-2 transition-colors"
          >
            <div className="i-ph:x w-4 h-4 text-bolt-elements-textSecondary" />
          </button>
        </div>

        {/* Logs content */}
        <div className="flex-1 overflow-auto p-4 font-mono text-xs">
          {logs.length === 0 ? (
            <div className="text-bolt-elements-textTertiary text-center py-4">
              No logs available
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-bolt-elements-textTertiary whitespace-nowrap">
                    {formatLogTime(log.timestamp)}
                  </span>
                  <span
                    className={classNames(
                      log.level === 'error'
                        ? 'text-red-400'
                        : log.level === 'warn'
                          ? 'text-yellow-400'
                          : 'text-bolt-elements-textSecondary'
                    )}
                  >
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-2 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});

// Compact version for header
interface CompactContainerStatusProps {
  state: ContainerState;
  health: HealthStatus;
  stateColorClass: string;
  shouldPulse: boolean;
  className?: string;
}

const CompactContainerStatus = memo(({
  state,
  health,
  stateColorClass,
  shouldPulse,
  className,
}: CompactContainerStatusProps) => {
  // Don't show when running and healthy
  if (state === 'running' && health === 'healthy') {
    return null;
  }

  return (
    <div
      className={classNames(
        'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
        state === 'running' && health !== 'healthy'
          ? 'bg-yellow-500/10 text-yellow-400'
          : state === 'exited' || state === 'dead'
            ? 'bg-red-500/10 text-red-400'
            : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary',
        className
      )}
      title={`Container: ${getStateText(state)}, Health: ${getHealthText(health)}`}
    >
      <div className="relative">
        <div className={classNames('w-1.5 h-1.5 rounded-full', stateColorClass)} />
        {shouldPulse && (
          <div
            className={classNames(
              'absolute inset-0 w-1.5 h-1.5 rounded-full animate-ping',
              stateColorClass,
              'opacity-75'
            )}
          />
        )}
      </div>
      <span>
        {state === 'running'
          ? getHealthText(health)
          : getStateText(state)}
      </span>
    </div>
  );
});

// Helper function to format log timestamp
function formatLogTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default ContainerStatus;
