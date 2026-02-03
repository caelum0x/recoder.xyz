/**
 * Expo Go QR Panel
 * Displays a QR code that users can scan with the Expo Go app on their phone
 * to preview their React Native app on a real device.
 *
 * Features:
 * - Auto-detects Expo projects via polling
 * - Generates QR code from Metro bundler URL
 * - Supports starting Expo in different modes (LAN, Tunnel, Web)
 * - Copyable Metro URL
 * - Connection status indicator
 */

import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { dockerGet, dockerPost } from '~/lib/services/docker-api';
import { classNames } from '~/utils/classNames';

interface ExpoUrlResponse {
  isExpo: boolean;
  metroUrl?: string;
  webUrl?: string;
  metroRunning?: boolean;
  expoPort?: number;
  hostname?: string;
  error?: string;
}

interface ExpoStartResponse {
  success: boolean;
  mode: string;
  metroUrl: string;
  webUrl: string;
  running: boolean;
  message: string;
}

type ExpoMode = 'lan' | 'tunnel' | 'web';

interface ExpoQRPanelProps {
  projectId: string;
  className?: string;
}

export const ExpoQRPanel = memo(({ projectId, className }: ExpoQRPanelProps) => {
  const [expoInfo, setExpoInfo] = useState<ExpoUrlResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ExpoMode>('lan');
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchExpoUrl = useCallback(async () => {
    if (!projectId) return;

    try {
      const data = await dockerGet<ExpoUrlResponse>(`/api/expo-url/${projectId}`);
      setExpoInfo(data);
      setError(null);
    } catch (err: any) {
      // Don't show errors during normal polling - only if it's not a 404
      if (err?.statusCode !== 404) {
        setError(err?.message || 'Failed to check Expo status');
      }
      setExpoInfo(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Poll for Expo status
  useEffect(() => {
    if (!projectId) return;

    fetchExpoUrl();

    pollIntervalRef.current = setInterval(fetchExpoUrl, 3000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [projectId, fetchExpoUrl]);

  const handleStartExpo = useCallback(async () => {
    if (!projectId || starting) return;

    setStarting(true);
    setError(null);

    try {
      const data = await dockerPost<ExpoStartResponse>(`/api/expo-start/${projectId}`, {
        mode: selectedMode,
      });

      if (data.success) {
        // Refresh Expo info after starting
        setTimeout(fetchExpoUrl, 2000);
      } else {
        setError('Failed to start Expo');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to start Expo');
    } finally {
      setStarting(false);
    }
  }, [projectId, selectedMode, starting, fetchExpoUrl]);

  const handleCopyUrl = useCallback(async () => {
    if (!expoInfo?.metroUrl) return;

    try {
      await navigator.clipboard.writeText(expoInfo.metroUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = expoInfo.metroUrl;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [expoInfo?.metroUrl]);

  // Loading state
  if (loading) {
    return (
      <div className={classNames('flex items-center justify-center p-6', className)}>
        <div className="text-bolt-elements-textTertiary text-sm">
          Checking for Expo project...
        </div>
      </div>
    );
  }

  // Not an Expo project
  if (!expoInfo?.isExpo) {
    return (
      <div className={classNames('flex flex-col items-center justify-center p-6 gap-3', className)}>
        <div className="i-ph:device-mobile-slash text-3xl text-bolt-elements-textTertiary" />
        <div className="text-bolt-elements-textTertiary text-sm text-center">
          Not an Expo project. Create a React Native project with Expo to use the QR code preview.
        </div>
      </div>
    );
  }

  // Expo project detected but Metro not running
  if (!expoInfo.metroRunning) {
    return (
      <div className={classNames('flex flex-col items-center justify-center p-6 gap-4', className)}>
        <div className="i-ph:device-mobile text-4xl text-bolt-elements-textSecondary" />
        <div className="text-bolt-elements-textSecondary text-sm text-center font-medium">
          Expo project detected
        </div>
        <div className="text-bolt-elements-textTertiary text-xs text-center">
          Start the Metro bundler to generate a QR code for Expo Go.
        </div>

        {/* Mode selector */}
        <div className="flex items-center gap-2">
          <label className="text-bolt-elements-textTertiary text-xs">Mode:</label>
          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value as ExpoMode)}
            className="bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary text-xs rounded px-2 py-1 border border-bolt-elements-borderColor outline-none focus:border-bolt-elements-borderColorActive"
          >
            <option value="lan">LAN (same network)</option>
            <option value="tunnel">Tunnel (any network)</option>
            <option value="web">Web only</option>
          </select>
        </div>

        <button
          onClick={handleStartExpo}
          disabled={starting}
          className={classNames(
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            starting
              ? 'bg-bolt-elements-button-secondary-background text-bolt-elements-textTertiary cursor-not-allowed'
              : 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover'
          )}
        >
          {starting ? (
            <span className="flex items-center gap-2">
              <span className="i-svg-spinners:90-ring-with-bg text-sm" />
              Starting Expo...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="i-ph:play-fill text-sm" />
              Start Expo
            </span>
          )}
        </button>

        {error && (
          <div className="text-red-400 text-xs text-center mt-1">{error}</div>
        )}
      </div>
    );
  }

  // Metro is running - show QR code
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(expoInfo.metroUrl || '')}&bgcolor=1a1a2e&color=ffffff&format=svg`;

  return (
    <div className={classNames('flex flex-col items-center p-4 gap-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="i-ph:device-mobile text-lg text-green-400" />
        <span className="text-bolt-elements-textPrimary text-sm font-medium">
          Expo Go Preview
        </span>
        <span className="flex items-center gap-1 text-green-400 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Connected
        </span>
      </div>

      {/* QR Code */}
      <div className="bg-white p-3 rounded-lg shadow-sm">
        <img
          src={qrUrl}
          alt="Expo Go QR Code"
          width={180}
          height={180}
          className="block"
          loading="eager"
        />
      </div>

      {/* Instructions */}
      <div className="text-bolt-elements-textTertiary text-xs text-center leading-relaxed">
        Open <strong className="text-bolt-elements-textSecondary">Expo Go</strong> on your phone and scan this QR code to preview your app.
      </div>

      {/* Metro URL */}
      <div className="w-full max-w-xs">
        <div className="flex items-center gap-1 bg-bolt-elements-background-depth-3 rounded-md border border-bolt-elements-borderColor overflow-hidden">
          <code className="flex-1 text-xs text-bolt-elements-textSecondary px-3 py-2 truncate select-all">
            {expoInfo.metroUrl}
          </code>
          <button
            onClick={handleCopyUrl}
            className="flex-shrink-0 px-3 py-2 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary transition-colors border-l border-bolt-elements-borderColor"
            title="Copy URL"
          >
            {copied ? (
              <span className="i-ph:check text-green-400 text-sm" />
            ) : (
              <span className="i-ph:copy text-sm" />
            )}
          </button>
        </div>
      </div>

      {/* Web URL link */}
      {expoInfo.webUrl && (
        <a
          href={expoInfo.webUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-bolt-elements-textTertiary text-xs hover:text-bolt-elements-textSecondary transition-colors flex items-center gap-1"
        >
          <span className="i-ph:globe text-xs" />
          Open web version
        </a>
      )}

      {/* Mode info */}
      <div className="text-bolt-elements-textTertiary text-[10px] text-center">
        Port {expoInfo.expoPort} &middot; {expoInfo.hostname}
      </div>

      {error && (
        <div className="text-red-400 text-xs text-center">{error}</div>
      )}
    </div>
  );
});

ExpoQRPanel.displayName = 'ExpoQRPanel';

/**
 * Standalone ExpoQRPanel that reads projectId from the workbench store.
 * Convenient wrapper for embedding in workbench layouts without passing props.
 */
export const ExpoQRPanelConnected = memo(({ className }: { className?: string }) => {
  const projectId = useStore(workbenchStore.projectId);

  if (!projectId) {
    return (
      <div className={classNames('flex items-center justify-center p-6', className)}>
        <div className="text-bolt-elements-textTertiary text-sm">
          No project loaded.
        </div>
      </div>
    );
  }

  return <ExpoQRPanel projectId={projectId} className={className} />;
});

ExpoQRPanelConnected.displayName = 'ExpoQRPanelConnected';
