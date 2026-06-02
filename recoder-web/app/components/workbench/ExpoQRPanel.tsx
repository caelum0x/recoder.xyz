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
import { dockerGet, dockerPost, dockerPut } from '~/lib/services/docker-api';
import { classNames } from '~/utils/classNames';

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

interface ExpoUrlResponse {
  isExpo: boolean;
  metroUrl?: string;
  tunnelUrl?: string;
  webUrl?: string;
  metroRunning?: boolean;
  metroBuildStatus?: 'idle' | 'building' | 'ready' | 'error';
  metroError?: string;
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

interface EasBuildStatus {
  buildId: string;
  status: string;
  artifactUrl?: string;
  error?: string;
  expoProjectUrl?: string;
  profile?: string;
  autoSubmit?: boolean;
  submitStatus?: 'pending' | 'submitting' | 'submitted' | 'failed';
  submitError?: string;
}

interface EasUpdateResult {
  updateId: string;
  branch: string;
  message: string;
  platforms: string[];
  createdAt: string;
  runtimeVersion?: string;
}

interface EasUpdateHistoryItem {
  id?: string;
  group?: string;
  message?: string;
  branch?: string;
  platforms?: string[];
  runtimeVersion?: string;
  createdAt?: string;
  // local format
  updateId?: string;
}

export const ExpoQRPanel = memo(({ projectId, className }: ExpoQRPanelProps) => {
  const [expoInfo, setExpoInfo] = useState<ExpoUrlResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ExpoMode>(() => {
    // Default to tunnel in production (non-localhost) for better phone connectivity
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
      return 'tunnel';
    }
    return 'lan';
  });
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // EAS Build state
  const [showBuildSection, setShowBuildSection] = useState(false);
  const [expoToken, setExpoToken] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('expo_token') || '' : '',
  );
  const [buildPlatform, setBuildPlatform] = useState<'android' | 'ios'>('android');
  const [buildStatus, setBuildStatus] = useState<EasBuildStatus | null>(null);
  const [building, setBuilding] = useState(false);
  const buildPollRef = useRef<NodeJS.Timeout | null>(null);

  // Build profile state
  const [buildProfile, setBuildProfile] = useState<'development' | 'preview' | 'production'>('preview');
  const [autoSubmit, setAutoSubmit] = useState(false);

  // Share state
  const [showShareSection, setShowShareSection] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareResult, setShareResult] = useState<{ shareUrl: string; updateId: string; qrUrl: string } | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  // Publish Wizard state
  const [showPublishWizard, setShowPublishWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [appConfig, setAppConfig] = useState<Record<string, any>>({});
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // OTA Update state
  const [showUpdateSection, setShowUpdateSection] = useState(false);
  const [updateBranch, setUpdateBranch] = useState('preview');
  const [updateMessage, setUpdateMessage] = useState('');
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<EasUpdateResult | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [updateHistory, setUpdateHistory] = useState<EasUpdateHistoryItem[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

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

  const copyUrl = expoInfo?.tunnelUrl || expoInfo?.metroUrl || '';

  const handleCopyUrl = useCallback(async () => {
    if (!copyUrl) return;

    try {
      await navigator.clipboard.writeText(copyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = copyUrl;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [copyUrl]);

  // Cleanup build poll on unmount
  useEffect(() => {
    return () => {
      if (buildPollRef.current) {
        clearInterval(buildPollRef.current);
        buildPollRef.current = null;
      }
    };
  }, []);

  const handleStartBuild = useCallback(async () => {
    if (!projectId || !expoToken || building) return;

    // Save token
    localStorage.setItem('expo_token', expoToken);
    setBuilding(true);
    setBuildStatus(null);

    try {
      const data = await dockerPost<{ data: { buildId: string; platform: string; status: string; expoProjectUrl?: string; profile?: string; autoSubmit?: boolean } }>(
        `/api/eas-build/${projectId}`,
        { platform: buildPlatform, expoToken, profile: buildProfile, autoSubmit },
      );
      const result = data.data || (data as any);

      const newStatus: EasBuildStatus = {
        buildId: result.buildId,
        status: result.status || 'submitted',
        expoProjectUrl: result.expoProjectUrl,
      };
      setBuildStatus(newStatus);

      // Start polling
      if (buildPollRef.current) clearInterval(buildPollRef.current);

      buildPollRef.current = setInterval(async () => {
        try {
          const statusData = await dockerGet<{ data: EasBuildStatus }>(
            `/api/eas-build/${projectId}/${newStatus.buildId}?expoToken=${encodeURIComponent(expoToken)}`,
          );
          const s = statusData.data || (statusData as any);

          setBuildStatus({
            buildId: s.buildId,
            status: s.status,
            artifactUrl: s.artifactUrl,
            error: s.error,
            expoProjectUrl: s.expoProjectUrl,
            profile: s.profile,
            autoSubmit: s.autoSubmit,
            submitStatus: s.submitStatus,
            submitError: s.submitError,
          });

          const terminal = ['finished', 'errored', 'canceled'];
          if (terminal.includes(s.status)) {
            if (buildPollRef.current) {
              clearInterval(buildPollRef.current);
              buildPollRef.current = null;
            }
            setBuilding(false);
          }
        } catch {
          // Ignore poll errors
        }
      }, 10000);
    } catch (err: any) {
      setBuildStatus({ buildId: '', status: 'errored', error: err?.message || 'Failed to start build' });
      setBuilding(false);
    }
  }, [projectId, expoToken, buildPlatform, buildProfile, autoSubmit, building]);

  // OTA Update handlers
  const handleLoadHistory = useCallback(async () => {
    if (!projectId || !expoToken) return;

    setLoadingHistory(true);

    try {
      const data = await dockerGet<{ data: { remote: EasUpdateHistoryItem[]; local: EasUpdateHistoryItem[] } }>(
        `/api/eas-updates/${projectId}?expoToken=${encodeURIComponent(expoToken)}&branch=${encodeURIComponent(updateBranch)}`,
      );
      const result = data.data || (data as any);
      const combined = [...(result.remote || []), ...(result.local || [])];
      setUpdateHistory(combined);
    } catch {
      // Silently fail — history is supplementary
      setUpdateHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [projectId, expoToken, updateBranch]);

  const handlePushUpdate = useCallback(async () => {
    if (!projectId || !expoToken || pushing) return;

    localStorage.setItem('expo_token', expoToken);
    setPushing(true);
    setPushResult(null);
    setPushError(null);

    try {
      const data = await dockerPost<{ data: EasUpdateResult }>(
        `/api/eas-update/${projectId}`,
        { expoToken, branch: updateBranch, message: updateMessage || 'Update' },
      );
      const result = (data.data || data) as EasUpdateResult;
      setPushResult(result);
      setUpdateMessage('');
      // Refresh history
      handleLoadHistory();
      // Clear success after 5s
      setTimeout(() => setPushResult(null), 5000);
    } catch (err: any) {
      setPushError(err?.message || 'Failed to push update');
    } finally {
      setPushing(false);
    }
  }, [projectId, expoToken, updateBranch, updateMessage, pushing, handleLoadHistory]);

  const handleRollback = useCallback(async () => {
    if (!projectId || !expoToken) return;

    try {
      await dockerPost(`/api/eas-update/${projectId}/rollback`, {
        expoToken,
        branch: updateBranch,
      });
      // Refresh history
      handleLoadHistory();
    } catch (err: any) {
      setPushError(err?.message || 'Rollback failed');
      setTimeout(() => setPushError(null), 5000);
    }
  }, [projectId, expoToken, updateBranch, handleLoadHistory]);

  // Share handler
  const handleShare = useCallback(async () => {
    if (!projectId || !expoToken || sharing) return;

    localStorage.setItem('expo_token', expoToken);
    setSharing(true);
    setShareResult(null);
    setShareError(null);

    try {
      const data = await dockerPost<{ data: { shareUrl: string; updateId: string; qrUrl: string } }>(
        `/api/eas-share/${projectId}`,
        { expoToken, message: 'Shared from Recoder' },
      );
      const result = (data.data || data) as { shareUrl: string; updateId: string; qrUrl: string };
      setShareResult(result);
    } catch (err: any) {
      setShareError(err?.message || 'Failed to share');
    } finally {
      setSharing(false);
    }
  }, [projectId, expoToken, sharing]);

  // Publish wizard handlers
  const handleLoadAppConfig = useCallback(async () => {
    if (!projectId) return;
    setLoadingConfig(true);
    try {
      const data = await dockerGet<{ data: Record<string, any> }>(`/api/app-config/${projectId}`);
      setAppConfig((data.data || data) as Record<string, any>);
    } catch {
      setAppConfig({});
    } finally {
      setLoadingConfig(false);
    }
  }, [projectId]);

  const handleSaveAppConfig = useCallback(async () => {
    if (!projectId) return;
    setSavingConfig(true);
    try {
      await dockerPut(`/api/app-config/${projectId}`, appConfig);
    } catch { /* ignore */ }
    finally { setSavingConfig(false); }
  }, [projectId, appConfig]);

  const handleSaveEasConfig = useCallback(async (easSubmitConfig: any) => {
    if (!projectId) return;
    setSavingConfig(true);
    try {
      await dockerPut(`/api/eas-config/${projectId}`, { submit: { production: easSubmitConfig } });
    } catch { /* ignore */ }
    finally { setSavingConfig(false); }
  }, [projectId]);

  // Load config when publish wizard opens
  useEffect(() => {
    if (showPublishWizard) {
      handleLoadAppConfig();
    }
  }, [showPublishWizard, handleLoadAppConfig]);

  // Load history when OTA section is expanded
  useEffect(() => {
    if (showUpdateSection && expoToken) {
      handleLoadHistory();
    }
  }, [showUpdateSection, handleLoadHistory, expoToken]);

  // Loading state
  if (loading) {
    return (
      <div className={classNames('flex items-center justify-center p-6', className)}>
        <div className="text-recoder-elements-textTertiary text-sm">
          Checking for Expo project...
        </div>
      </div>
    );
  }

  // Not an Expo project
  if (!expoInfo?.isExpo) {
    return (
      <div className={classNames('flex flex-col items-center justify-center p-6 gap-3', className)}>
        <div className="i-ph:device-mobile-slash text-3xl text-recoder-elements-textTertiary" />
        <div className="text-recoder-elements-textTertiary text-sm text-center">
          Not an Expo project. Create a React Native project with Expo to use the QR code preview.
        </div>
      </div>
    );
  }

  // Expo project detected but Metro not running
  if (!expoInfo.metroRunning) {
    return (
      <div className={classNames('flex flex-col items-center justify-center p-6 gap-4', className)}>
        <div className="i-ph:device-mobile text-4xl text-recoder-elements-textSecondary" />
        <div className="text-recoder-elements-textSecondary text-sm text-center font-medium">
          Expo project detected
        </div>
        <div className="text-recoder-elements-textTertiary text-xs text-center">
          Start the Metro bundler to generate a QR code for Expo Go.
        </div>

        {/* Mode selector */}
        <div className="flex items-center gap-2">
          <label className="text-recoder-elements-textTertiary text-xs">Mode:</label>
          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value as ExpoMode)}
            className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-xs rounded px-2 py-1 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive"
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
              ? 'bg-recoder-elements-button-secondary-background text-recoder-elements-textTertiary cursor-not-allowed'
              : 'bg-recoder-elements-button-primary-background text-recoder-elements-button-primary-text hover:bg-recoder-elements-button-primary-backgroundHover'
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
  // Prefer tunnel URL when available (works across any network)
  const displayUrl = expoInfo.tunnelUrl || expoInfo.metroUrl || '';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(displayUrl)}&bgcolor=1a1a2e&color=ffffff&format=svg`;

  return (
    <div className={classNames('flex flex-col items-center p-4 gap-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="i-ph:device-mobile text-lg text-green-400" />
        <span className="text-recoder-elements-textPrimary text-sm font-medium">
          Expo Go Preview
        </span>
        {expoInfo.metroBuildStatus === 'building' ? (
          <span className="flex items-center gap-1 text-amber-400 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Building...
          </span>
        ) : expoInfo.metroBuildStatus === 'error' ? (
          <span className="flex items-center gap-1 text-red-400 text-xs max-w-[160px]" title={expoInfo.metroError}>
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
            <span className="truncate">{expoInfo.metroError || 'Error'}</span>
          </span>
        ) : expoInfo.metroBuildStatus === 'ready' ? (
          <span className="flex items-center gap-1 text-green-400 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Ready
          </span>
        ) : (
          <span className="flex items-center gap-1 text-green-400 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Connected
          </span>
        )}
      </div>

      {/* QR Code */}
      <div className="bg-recoder-elements-background-depth-3 p-3 rounded-lg border border-recoder-elements-borderColor shadow-sm">
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
      <div className="text-recoder-elements-textTertiary text-xs text-center leading-relaxed">
        Open <strong className="text-recoder-elements-textSecondary">Expo Go</strong> on your phone and scan this QR code to preview your app.
      </div>

      {/* Metro URL */}
      <div className="w-full max-w-xs">
        <div className="flex items-center gap-1 bg-recoder-elements-background-depth-3 rounded-md border border-recoder-elements-borderColor overflow-hidden">
          <code className="flex-1 text-xs text-recoder-elements-textSecondary px-3 py-2 truncate select-all">
            {displayUrl}
          </code>
          <button
            onClick={handleCopyUrl}
            className="flex-shrink-0 px-3 py-2 text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary transition-colors border-l border-recoder-elements-borderColor"
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
          className="text-recoder-elements-textTertiary text-xs hover:text-recoder-elements-textSecondary transition-colors flex items-center gap-1"
        >
          <span className="i-ph:globe text-xs" />
          Open web version
        </a>
      )}

      {/* Share via Expo Section */}
      <div className="w-full max-w-xs">
        <button
          onClick={() => setShowShareSection(!showShareSection)}
          className="flex items-center gap-2 w-full text-left text-recoder-elements-textSecondary text-xs font-medium py-2 hover:text-recoder-elements-textPrimary transition-colors"
        >
          <span className={classNames('i-ph:caret-right text-xs transition-transform', showShareSection && 'rotate-90')} />
          <span className="i-ph:share-network text-sm" />
          Share via Expo
        </button>

        {showShareSection && (
          <div className="flex flex-col gap-3 pt-1 pb-2">
            {!expoToken && (
              <div className="text-amber-400 text-[10px]">
                Enter your Expo Token in the Build section below to share.
              </div>
            )}

            <button
              onClick={handleShare}
              disabled={!expoToken || sharing}
              className={classNames(
                'w-full py-2 rounded text-xs font-medium transition-colors',
                !expoToken || sharing
                  ? 'bg-recoder-elements-button-secondary-background text-recoder-elements-textTertiary cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-500',
              )}
            >
              {sharing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="i-svg-spinners:90-ring-with-bg text-xs" />
                  Sharing...
                </span>
              ) : (
                'Share via Expo'
              )}
            </button>

            {shareResult && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2.5">
                <div className="text-blue-400 text-[10px] font-medium mb-1">Share Link Ready</div>
                <div className="bg-recoder-elements-background-depth-3 p-2 rounded mb-2 flex justify-center border border-recoder-elements-borderColor">
                  <img
                    src={shareResult.qrUrl}
                    alt="Share QR Code"
                    width={120}
                    height={120}
                    className="block"
                  />
                </div>
                <div className="flex items-center gap-1 bg-recoder-elements-background-depth-3 rounded px-2 py-1">
                  <code className="flex-1 text-[10px] text-recoder-elements-textSecondary truncate select-all">
                    {shareResult.shareUrl}
                  </code>
                  <button
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(shareResult.shareUrl); } catch {}
                    }}
                    className="text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary transition-colors"
                    title="Copy share URL"
                  >
                    <span className="i-ph:copy text-xs" />
                  </button>
                </div>
              </div>
            )}

            {shareError && (
              <div className="text-red-400 text-[10px]">{shareError}</div>
            )}
          </div>
        )}
      </div>

      {/* Build APK / IPA Section */}
      <div className="w-full max-w-xs">
        <button
          onClick={() => setShowBuildSection(!showBuildSection)}
          className="flex items-center gap-2 w-full text-left text-recoder-elements-textSecondary text-xs font-medium py-2 hover:text-recoder-elements-textPrimary transition-colors"
        >
          <span className={classNames('i-ph:caret-right text-xs transition-transform', showBuildSection && 'rotate-90')} />
          <span className="i-ph:package text-sm" />
          Build APK / IPA
        </button>

        {showBuildSection && (
          <div className="flex flex-col gap-3 pt-1 pb-2">
            {/* Expo Token */}
            <div className="flex flex-col gap-1">
              <label className="text-recoder-elements-textTertiary text-[10px]">Expo Token</label>
              <input
                type="password"
                value={expoToken}
                onChange={(e) => setExpoToken(e.target.value)}
                placeholder="expo_token_..."
                className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-xs rounded px-3 py-1.5 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive w-full"
              />
              <a
                href="https://expo.dev/accounts/[account]/settings/access-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 text-[10px] hover:text-purple-300 transition-colors"
              >
                Get token from expo.dev
              </a>
            </div>

            {/* Platform selector */}
            <div className="flex gap-1">
              <button
                onClick={() => setBuildPlatform('android')}
                className={classNames(
                  'flex-1 text-xs py-1.5 rounded font-medium transition-colors',
                  buildPlatform === 'android'
                    ? 'bg-green-600 text-white'
                    : 'bg-recoder-elements-background-depth-3 text-recoder-elements-textTertiary hover:text-recoder-elements-textSecondary',
                )}
              >
                Android
              </button>
              <button
                onClick={() => setBuildPlatform('ios')}
                className={classNames(
                  'flex-1 text-xs py-1.5 rounded font-medium transition-colors',
                  buildPlatform === 'ios'
                    ? 'bg-blue-600 text-white'
                    : 'bg-recoder-elements-background-depth-3 text-recoder-elements-textTertiary hover:text-recoder-elements-textSecondary',
                )}
              >
                iOS
              </button>
            </div>

            {/* Build profile selector */}
            <div className="flex flex-col gap-1">
              <label className="text-recoder-elements-textTertiary text-[10px]">Build Profile</label>
              <div className="flex gap-1">
                {(['development', 'preview', 'production'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setBuildProfile(p)}
                    className={classNames(
                      'flex-1 text-[10px] py-1 rounded font-medium transition-colors capitalize',
                      buildProfile === p
                        ? 'bg-purple-600 text-white'
                        : 'bg-recoder-elements-background-depth-3 text-recoder-elements-textTertiary hover:text-recoder-elements-textSecondary',
                    )}
                  >
                    {p === 'development' ? 'Dev' : p}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-submit toggle (iOS + Production only) */}
            {buildPlatform === 'ios' && buildProfile === 'production' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSubmit}
                  onChange={(e) => setAutoSubmit(e.target.checked)}
                  className="rounded border-recoder-elements-borderColor"
                />
                <span className="text-recoder-elements-textSecondary text-[10px]">
                  Auto-submit to TestFlight after build
                </span>
              </label>
            )}

            {/* Start Build button */}
            <button
              onClick={handleStartBuild}
              disabled={!expoToken || building}
              className={classNames(
                'w-full py-2 rounded text-xs font-medium transition-colors',
                !expoToken || building
                  ? 'bg-recoder-elements-button-secondary-background text-recoder-elements-textTertiary cursor-not-allowed'
                  : 'bg-purple-600 text-white hover:bg-purple-500',
              )}
            >
              {building ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="i-svg-spinners:90-ring-with-bg text-xs" />
                  Building...
                </span>
              ) : (
                `Start ${buildPlatform === 'android' ? 'APK' : 'IPA'} Build`
              )}
            </button>

            {/* Build status */}
            {buildStatus && (
              <div className="bg-recoder-elements-background-depth-3 rounded p-2.5 border border-recoder-elements-borderColor">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={classNames(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      buildStatus.status === 'finished' && 'bg-green-400',
                      buildStatus.status === 'errored' && 'bg-red-400',
                      buildStatus.status === 'canceled' && 'bg-gray-400',
                      ['submitted', 'in-queue'].includes(buildStatus.status) && 'bg-amber-400 animate-pulse',
                      buildStatus.status === 'in-progress' && 'bg-blue-400 animate-pulse',
                    )}
                  />
                  <span className="text-recoder-elements-textSecondary capitalize">
                    {buildStatus.status.replace('-', ' ')}
                  </span>
                </div>

                {buildStatus.error && (
                  <div className="text-red-400 text-[10px] mt-1.5 break-words">
                    {buildStatus.error}
                  </div>
                )}

                {buildStatus.artifactUrl && (
                  <a
                    href={buildStatus.artifactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-green-400 text-[10px] mt-1.5 hover:text-green-300 transition-colors"
                  >
                    <span className="i-ph:download-simple text-xs" />
                    Download {buildPlatform === 'android' ? 'APK' : 'IPA'}
                  </a>
                )}

                {buildStatus.expoProjectUrl && (
                  <a
                    href={buildStatus.expoProjectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-purple-400 text-[10px] mt-1 hover:text-purple-300 transition-colors"
                  >
                    <span className="i-ph:arrow-square-out text-xs" />
                    View on expo.dev
                  </a>
                )}

                {/* TestFlight submit status */}
                {buildStatus.submitStatus && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span
                      className={classNames(
                        'w-1.5 h-1.5 rounded-full flex-shrink-0',
                        buildStatus.submitStatus === 'submitted' && 'bg-green-400',
                        buildStatus.submitStatus === 'failed' && 'bg-red-400',
                        buildStatus.submitStatus === 'submitting' && 'bg-blue-400 animate-pulse',
                        buildStatus.submitStatus === 'pending' && 'bg-amber-400 animate-pulse',
                      )}
                    />
                    <span className="text-recoder-elements-textSecondary text-[10px] capitalize">
                      {buildStatus.submitStatus === 'submitted' ? 'Submitted to App Store' :
                       buildStatus.submitStatus === 'submitting' ? 'Submitting to App Store...' :
                       buildStatus.submitStatus === 'failed' ? 'Submit failed' :
                       'Submit pending'}
                    </span>
                  </div>
                )}
                {buildStatus.submitError && (
                  <div className="text-red-400 text-[10px] mt-1">{buildStatus.submitError}</div>
                )}

                {/* Test on Device Cloud */}
                {buildStatus.artifactUrl && buildStatus.status === 'finished' && (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('recoder:switch-preview-mode', { detail: { mode: 'device-cloud' } }))}
                    className="flex items-center gap-1 text-cyan-400 text-[10px] mt-1.5 hover:text-cyan-300 transition-colors"
                  >
                    <span className="i-ph:device-mobile text-xs" />
                    Test on Device Cloud
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* OTA Updates Section */}
      <div className="w-full max-w-xs">
        <button
          onClick={() => setShowUpdateSection(!showUpdateSection)}
          className="flex items-center gap-2 w-full text-left text-recoder-elements-textSecondary text-xs font-medium py-2 hover:text-recoder-elements-textPrimary transition-colors"
        >
          <span className={classNames('i-ph:caret-right text-xs transition-transform', showUpdateSection && 'rotate-90')} />
          <span className="i-ph:cloud-arrow-up text-sm" />
          OTA Updates
        </button>

        {showUpdateSection && (
          <div className="flex flex-col gap-3 pt-1 pb-2">
            {/* Token note if empty */}
            {!expoToken && (
              <div className="text-amber-400 text-[10px]">
                Enter your Expo Token in the Build section above to use OTA Updates.
              </div>
            )}

            {/* Branch input */}
            <div className="flex flex-col gap-1">
              <label className="text-recoder-elements-textTertiary text-[10px]">Branch</label>
              <input
                type="text"
                value={updateBranch}
                onChange={(e) => setUpdateBranch(e.target.value)}
                placeholder="preview"
                className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-xs rounded px-3 py-1.5 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive w-full"
              />
            </div>

            {/* Message input */}
            <div className="flex flex-col gap-1">
              <label className="text-recoder-elements-textTertiary text-[10px]">Message</label>
              <input
                type="text"
                value={updateMessage}
                onChange={(e) => setUpdateMessage(e.target.value)}
                placeholder="Describe this update..."
                className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-xs rounded px-3 py-1.5 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive w-full"
              />
            </div>

            {/* Push Update button */}
            <button
              onClick={handlePushUpdate}
              disabled={!expoToken || pushing}
              className={classNames(
                'w-full py-2 rounded text-xs font-medium transition-colors',
                !expoToken || pushing
                  ? 'bg-recoder-elements-button-secondary-background text-recoder-elements-textTertiary cursor-not-allowed'
                  : 'bg-purple-600 text-white hover:bg-purple-500',
              )}
            >
              {pushing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="i-svg-spinners:90-ring-with-bg text-xs" />
                  Pushing Update...
                </span>
              ) : (
                'Push Update'
              )}
            </button>

            {/* Success flash */}
            {pushResult && (
              <div className="bg-green-500/10 border border-green-500/30 rounded p-2 text-green-400 text-[10px]">
                Update pushed! ID: {pushResult.updateId.slice(0, 8)}...
                {pushResult.platforms.length > 0 && ` (${pushResult.platforms.join(', ')})`}
              </div>
            )}

            {/* Error */}
            {pushError && (
              <div className="text-red-400 text-[10px]">{pushError}</div>
            )}

            {/* Update history */}
            {expoToken && (
              <div className="flex flex-col gap-1.5 mt-1">
                <div className="flex items-center justify-between">
                  <span className="text-recoder-elements-textTertiary text-[10px] font-medium">Recent Updates</span>
                  <button
                    onClick={handleLoadHistory}
                    disabled={loadingHistory}
                    className="text-recoder-elements-textTertiary text-[10px] hover:text-recoder-elements-textSecondary transition-colors"
                  >
                    {loadingHistory ? (
                      <span className="i-svg-spinners:90-ring-with-bg text-[10px]" />
                    ) : (
                      <span className="i-ph:arrow-clockwise text-xs" />
                    )}
                  </button>
                </div>

                {updateHistory && updateHistory.length === 0 && (
                  <div className="text-recoder-elements-textTertiary text-[10px]">No updates found on this branch.</div>
                )}

                {updateHistory && updateHistory.map((item, idx) => {
                  const id = item.group || item.updateId || item.id || `${idx}`;
                  const msg = item.message || 'No message';
                  const platforms = item.platforms || [];
                  const createdAt = item.createdAt;

                  return (
                    <div
                      key={id}
                      className="bg-recoder-elements-background-depth-3 rounded p-2 border border-recoder-elements-borderColor"
                    >
                      <div className="text-recoder-elements-textSecondary text-[10px] font-medium truncate" title={msg}>
                        "{msg}"
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {platforms.length > 0 && (
                          <span className="text-recoder-elements-textTertiary text-[10px]">
                            {platforms.join(', ')}
                          </span>
                        )}
                        {createdAt && (
                          <span className="text-recoder-elements-textTertiary text-[10px]">
                            {formatRelativeTime(createdAt)}
                          </span>
                        )}
                      </div>
                      {idx === 0 && (
                        <button
                          onClick={handleRollback}
                          className="flex items-center gap-1 text-amber-400 text-[10px] mt-1 hover:text-amber-300 transition-colors"
                        >
                          <span className="i-ph:arrow-counter-clockwise text-xs" />
                          Rollback
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Publish to App Store Wizard */}
      <div className="w-full max-w-xs">
        <button
          onClick={() => setShowPublishWizard(!showPublishWizard)}
          className="flex items-center gap-2 w-full text-left text-recoder-elements-textSecondary text-xs font-medium py-2 hover:text-recoder-elements-textPrimary transition-colors"
        >
          <span className={classNames('i-ph:caret-right text-xs transition-transform', showPublishWizard && 'rotate-90')} />
          <span className="i-ph:storefront text-sm" />
          Publish to App Store
        </button>

        {showPublishWizard && (
          <div className="flex flex-col gap-3 pt-1 pb-2">
            {/* Step indicators */}
            <div className="flex items-center gap-1">
              {['App Info', 'Assets', 'Credentials', 'Review'].map((label, idx) => (
                <button
                  key={label}
                  onClick={() => setWizardStep(idx)}
                  className={classNames(
                    'flex-1 text-[9px] py-1 rounded font-medium transition-colors text-center',
                    wizardStep === idx
                      ? 'bg-purple-600 text-white'
                      : 'bg-recoder-elements-background-depth-3 text-recoder-elements-textTertiary hover:text-recoder-elements-textSecondary',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {loadingConfig ? (
              <div className="flex items-center justify-center py-4">
                <span className="i-svg-spinners:90-ring-with-bg text-sm text-recoder-elements-textTertiary" />
              </div>
            ) : (
              <>
                {/* Step 0: App Info */}
                {wizardStep === 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-recoder-elements-textTertiary text-[10px]">App Name</label>
                      <input type="text" value={appConfig.name || ''} onChange={(e) => setAppConfig({ ...appConfig, name: e.target.value })}
                        className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-xs rounded px-3 py-1.5 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive w-full" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-recoder-elements-textTertiary text-[10px]">Slug</label>
                      <input type="text" value={appConfig.slug || ''} onChange={(e) => setAppConfig({ ...appConfig, slug: e.target.value })}
                        className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-xs rounded px-3 py-1.5 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive w-full" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-recoder-elements-textTertiary text-[10px]">Version</label>
                      <input type="text" value={appConfig.version || ''} onChange={(e) => setAppConfig({ ...appConfig, version: e.target.value })}
                        className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-xs rounded px-3 py-1.5 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive w-full" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-recoder-elements-textTertiary text-[10px]">Bundle Identifier (iOS)</label>
                      <input type="text" value={appConfig.ios?.bundleIdentifier || ''} onChange={(e) => setAppConfig({ ...appConfig, ios: { ...appConfig.ios, bundleIdentifier: e.target.value } })}
                        className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-xs rounded px-3 py-1.5 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive w-full"
                        placeholder="com.yourcompany.yourapp" />
                    </div>
                  </div>
                )}

                {/* Step 1: Assets */}
                {wizardStep === 1 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-recoder-elements-textTertiary text-[10px]">Icon Path</label>
                      <input type="text" value={appConfig.icon || ''} onChange={(e) => setAppConfig({ ...appConfig, icon: e.target.value })}
                        className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-xs rounded px-3 py-1.5 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive w-full"
                        placeholder="./assets/images/icon.png" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-recoder-elements-textTertiary text-[10px]">Splash Background Color</label>
                      <input type="text" value={appConfig.splash?.backgroundColor || ''} onChange={(e) => setAppConfig({ ...appConfig, splash: { ...appConfig.splash, backgroundColor: e.target.value } })}
                        className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-xs rounded px-3 py-1.5 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive w-full"
                        placeholder="#ffffff" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-recoder-elements-textTertiary text-[10px]">Splash Image Path</label>
                      <input type="text" value={appConfig.splash?.image || ''} onChange={(e) => setAppConfig({ ...appConfig, splash: { ...appConfig.splash, image: e.target.value } })}
                        className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-xs rounded px-3 py-1.5 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive w-full"
                        placeholder="./assets/images/splash.png" />
                    </div>
                  </div>
                )}

                {/* Step 2: Credentials */}
                {wizardStep === 2 && (
                  <div className="flex flex-col gap-2">
                    <div className="text-recoder-elements-textTertiary text-[10px] font-medium">iOS (Apple)</div>
                    <div className="flex flex-col gap-1">
                      <label className="text-recoder-elements-textTertiary text-[10px]">Apple Team ID</label>
                      <input type="text" value={appConfig._appleTeamId || ''} onChange={(e) => setAppConfig({ ...appConfig, _appleTeamId: e.target.value })}
                        className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-xs rounded px-3 py-1.5 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive w-full"
                        placeholder="XXXXXXXXXX" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-recoder-elements-textTertiary text-[10px]">ASC App ID</label>
                      <input type="text" value={appConfig._ascAppId || ''} onChange={(e) => setAppConfig({ ...appConfig, _ascAppId: e.target.value })}
                        className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-xs rounded px-3 py-1.5 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive w-full"
                        placeholder="123456789" />
                    </div>
                    <div className="text-recoder-elements-textTertiary text-[10px] font-medium mt-2">Android (Google)</div>
                    <div className="flex flex-col gap-1">
                      <label className="text-recoder-elements-textTertiary text-[10px]">Service Account Key Path</label>
                      <input type="text" value={appConfig._googleServiceAccountKey || ''} onChange={(e) => setAppConfig({ ...appConfig, _googleServiceAccountKey: e.target.value })}
                        className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-xs rounded px-3 py-1.5 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive w-full"
                        placeholder="./google-services.json" />
                    </div>
                  </div>
                )}

                {/* Step 3: Review & Submit */}
                {wizardStep === 3 && (
                  <div className="flex flex-col gap-2">
                    <div className="bg-recoder-elements-background-depth-3 rounded p-2.5 border border-recoder-elements-borderColor text-[10px]">
                      <div className="text-recoder-elements-textSecondary font-medium mb-1">Summary</div>
                      <div className="text-recoder-elements-textTertiary space-y-0.5">
                        <div>Name: {appConfig.name || '(not set)'}</div>
                        <div>Slug: {appConfig.slug || '(not set)'}</div>
                        <div>Version: {appConfig.version || '(not set)'}</div>
                        <div>Bundle ID: {appConfig.ios?.bundleIdentifier || '(not set)'}</div>
                        <div>Icon: {appConfig.icon || '(not set)'}</div>
                      </div>
                    </div>

                    <button
                      onClick={async () => {
                        await handleSaveAppConfig();
                        // Save EAS submit config if credentials provided
                        const easSubmit: Record<string, any> = {};
                        if (appConfig._appleTeamId || appConfig._ascAppId) {
                          easSubmit.ios = {};
                          if (appConfig._appleTeamId) easSubmit.ios.appleTeamId = appConfig._appleTeamId;
                          if (appConfig._ascAppId) easSubmit.ios.ascAppId = appConfig._ascAppId;
                        }
                        if (appConfig._googleServiceAccountKey) {
                          easSubmit.android = { serviceAccountKeyPath: appConfig._googleServiceAccountKey };
                        }
                        if (Object.keys(easSubmit).length > 0) {
                          await handleSaveEasConfig(easSubmit);
                        }
                      }}
                      disabled={savingConfig}
                      className={classNames(
                        'w-full py-2 rounded text-xs font-medium transition-colors',
                        savingConfig
                          ? 'bg-recoder-elements-button-secondary-background text-recoder-elements-textTertiary cursor-not-allowed'
                          : 'bg-green-600 text-white hover:bg-green-500',
                      )}
                    >
                      {savingConfig ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="i-svg-spinners:90-ring-with-bg text-xs" />
                          Saving...
                        </span>
                      ) : (
                        'Save Configuration'
                      )}
                    </button>

                    {expoToken && (
                      <button
                        onClick={async () => {
                          // Trigger production build + submit
                          setBuildProfile('production');
                          setAutoSubmit(true);
                          setShowBuildSection(true);
                          setShowPublishWizard(false);
                        }}
                        className="w-full py-2 rounded text-xs font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors"
                      >
                        Build & Publish
                      </button>
                    )}
                  </div>
                )}

                {/* Navigation */}
                <div className="flex gap-2 mt-1">
                  {wizardStep > 0 && (
                    <button onClick={() => setWizardStep(wizardStep - 1)} className="flex-1 py-1.5 rounded text-[10px] font-medium bg-recoder-elements-background-depth-3 text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary transition-colors">
                      Back
                    </button>
                  )}
                  {wizardStep < 3 && (
                    <button
                      onClick={async () => {
                        // Save current step data
                        if (wizardStep <= 1) await handleSaveAppConfig();
                        setWizardStep(wizardStep + 1);
                      }}
                      className="flex-1 py-1.5 rounded text-[10px] font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors"
                    >
                      Next
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Mode info */}
      <div className="text-recoder-elements-textTertiary text-[10px] text-center">
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
        <div className="text-recoder-elements-textTertiary text-sm">
          No project loaded.
        </div>
      </div>
    );
  }

  return <ExpoQRPanel projectId={projectId} className={className} />;
});

ExpoQRPanelConnected.displayName = 'ExpoQRPanelConnected';
