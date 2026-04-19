import { useStore } from '@nanostores/react';
import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { workbenchStore } from '~/lib/stores/workbench';
import { streamingStore } from '~/lib/stores/streaming';
import { PortDropdown } from './PortDropdown';
import { DeviceFrame } from './DeviceFrame';
import { PreviewToolbar } from './PreviewToolbar';
import { dockerGet, dockerPost } from '~/lib/services/docker-api';
import {
  previewDeviceState,
  selectedDevice,
  effectiveDimensions,
  calculateFitScale,
} from '~/lib/stores/preview-device';
import {
  visualEditingEnabled,
  selectComponent,
  clearSelection,
  updateComponentStyles,
  updateComponentCoordinates,
  setHasStaticText,
  setDynamicallyStyled,
  type SelectedComponent,
} from '~/lib/stores/visual-editing';
import { ContainerCreationStatus } from './ContainerCreationStatus';
import { ErrorBanner, type RuntimeError } from './ErrorBanner';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Preview');

// Lazy-loaded conditional components
const ExpoQRPanel = lazy(() => import('./ExpoQRPanel').then(m => ({ default: m.ExpoQRPanel })));
const VisualEditingToolbar = lazy(() => import('./VisualEditingToolbar').then(m => ({ default: m.VisualEditingToolbar })));
const VisualEditingToggle = lazy(() => import('./VisualEditingToolbar').then(m => ({ default: m.VisualEditingToggle })));

// Maximum number of runtime errors to keep in state
const MAX_RUNTIME_ERRORS = 10;

// Coalesced refresh configuration
const REFRESH_COALESCE_MS = 1200; // Combine refreshes within this window

// Loading timeout thresholds (ms)
const FORCE_REFRESH_VISIBLE_MS = 10_000; // Show force-refresh after 10s
const LOADING_TIMEOUT_MS = 30_000; // Show timeout message after 30s

export const Preview = memo(() => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [isPortDropdownOpen, setIsPortDropdownOpen] = useState(false);
  const hasSelectedPreview = useRef(false);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];
  const isVisualEditing = useStore(visualEditingEnabled);

  const [url, setUrl] = useState('');
  const [iframeUrl, setIframeUrl] = useState<string | undefined>();
  const [previewError, setPreviewError] = useState<string | null>(null);
  const recoveryStatus = useStore(workbenchStore.containerRecoveryStatus);

  // Runtime error state for ErrorBanner
  const [runtimeErrors, setRuntimeErrors] = useState<RuntimeError[]>([]);
  const streamingState = useStore(streamingStore);

  // Loading / timeout state
  const [isIframeLoaded, setIsIframeLoaded] = useState(false);
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const loadingStartRef = useRef<number | null>(null);
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Project type detection for Expo mode switcher
  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);
  const [projectType, setProjectType] = useState<string>('unknown');
  const [previewMode, setPreviewMode] = useState<'web' | 'expo-go' | 'device-cloud' | 'canvas'>('web');

  // Device cloud state (Appetize.io)
  const [appetizeKey, setAppetizeKey] = useState<string>('');
  const [appetizeToken, setAppetizeToken] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('appetize_token') || '' : '',
  );
  const [uploadingToAppetize, setUploadingToAppetize] = useState(false);

  // Canvas state (OpenClaw)
  const [canvasConnected, setCanvasConnected] = useState(false);
  const [canvasUrl, setCanvasUrl] = useState('');

  // Sandbox keepalive — ping preview proxy every 5 min to prevent Daytona auto-stop
  useEffect(() => {
    if (!projectId || !containerReady) return;

    const KEEPALIVE_MS = 5 * 60 * 1000;
    const timer = setInterval(() => {
      dockerGet(`/api/preview/${projectId}/health`).catch(() => {});
    }, KEEPALIVE_MS);

    return () => clearInterval(timer);
  }, [projectId, containerReady]);

  // Hot reload visual indicator state
  const [reloadState, setReloadState] = useState<'idle' | 'pending' | 'reloading'>('idle');

  // Dev server restart state
  const [isRestartingDevServer, setIsRestartingDevServer] = useState(false);
  const [devServerStatus, setDevServerStatus] = useState<'unknown' | 'running' | 'stopped' | 'starting'>('unknown');

  // Metro build status (Expo projects only)
  const [metroBuildStatus, setMetroBuildStatus] = useState<'idle' | 'building' | 'ready' | 'error'>('idle');
  const [metroError, setMetroError] = useState<string | undefined>();

  useEffect(() => {
    // Don't detect project type until container is ready
    if (!projectId || !containerReady) return;

    let cancelled = false;

    dockerGet<{ type: string }>(`/api/project-type/${projectId}`, { skipRetry: true, timeout: 10000 })
      .then((data) => {
        if (!cancelled && data?.type) {
          setProjectType(data.type);
          // Auto-switch to Expo Go tab for Expo projects
          if (data.type === 'expo') {
            setPreviewMode('expo-go');
          }
        }
      })
      .catch(() => {
        // Silently ignore - project type detection is best-effort
        if (!cancelled) {
          setProjectType('unknown');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, containerReady]);

  // Listen for preview mode switch events (e.g. from ExpoQRPanel "Test on Device Cloud")
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.mode) {
        setPreviewMode(e.detail.mode);
      }
    };
    window.addEventListener('recoder:switch-preview-mode', handler as any);
    return () => window.removeEventListener('recoder:switch-preview-mode', handler as any);
  }, []);

  // Check canvas connection when switching to canvas mode
  useEffect(() => {
    if (previewMode !== 'canvas' || !projectId || !containerReady) return;
    let cancelled = false;

    dockerPost<{ data: { connected: boolean; canvasUrl?: string } }>(`/api/canvas-connect/${projectId}`, {})
      .then((data) => {
        if (cancelled) return;
        const result = (data as any).data || data;
        setCanvasConnected(result.connected);
        if (result.canvasUrl) setCanvasUrl(result.canvasUrl);
      })
      .catch(() => {
        if (!cancelled) setCanvasConnected(false);
      });

    return () => { cancelled = true; };
  }, [previewMode, projectId, containerReady]);

  // Listen for canvas export events
  useEffect(() => {
    if (previewMode !== 'canvas') return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'canvas:export' && event.data.elements && projectId) {
        dockerPost(`/api/canvas-generate/${projectId}`, { elements: event.data.elements })
          .then(() => console.log('[Preview] Canvas elements exported to components'))
          .catch((err) => console.error('[Preview] Canvas export failed:', err));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [previewMode, projectId]);

  // Listen for dev-server-ready events that indicate Expo framework
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.framework === 'expo') {
        setProjectType('expo');
        setPreviewMode('expo-go');
      }
    };
    window.addEventListener('recoder:dev-server-ready', handler as any);
    return () => window.removeEventListener('recoder:dev-server-ready', handler as any);
  }, []);

  // Poll Metro build status for Expo projects
  useEffect(() => {
    if (projectType !== 'expo' || !projectId || !containerReady) {
      setMetroBuildStatus('idle');
      setMetroError(undefined);
      return;
    }

    let cancelled = false;

    const pollMetroStatus = async () => {
      try {
        const data = await dockerGet<{
          isExpo: boolean;
          metroBuildStatus?: 'idle' | 'building' | 'ready' | 'error';
          metroError?: string;
        }>(`/api/expo-url/${projectId}`, { skipRetry: true, timeout: 5000 });

        if (cancelled) return;

        if (data?.metroBuildStatus) {
          setMetroBuildStatus(data.metroBuildStatus);
          setMetroError(data.metroError);
        }
      } catch {
        // Silently ignore polling errors
      }
    };

    pollMetroStatus();
    const interval = setInterval(pollMetroStatus, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [projectType, projectId, containerReady]);

  // Device preview stores
  const deviceState = useStore(previewDeviceState);
  const device = useStore(selectedDevice);
  const dims = useStore(effectiveDimensions);

  // Container measurement for fit-scale calculation
  const deviceContainerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = deviceContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---------- Loading timeout tracking ----------
  // Start / reset the loading timer whenever the iframe URL changes
  useEffect(() => {
    if (iframeUrl && !previewError) {
      setIsIframeLoaded(false);
      setLoadingElapsed(0);
      loadingStartRef.current = Date.now();

      loadingTimerRef.current = setInterval(() => {
        if (loadingStartRef.current) {
          setLoadingElapsed(Date.now() - loadingStartRef.current);
        }
      }, 1_000);
    }

    return () => {
      if (loadingTimerRef.current) {
        clearInterval(loadingTimerRef.current);
        loadingTimerRef.current = undefined;
      }
    };
  }, [iframeUrl, previewError]);

  // Stop the timer once the iframe reports it has loaded
  useEffect(() => {
    if (isIframeLoaded && loadingTimerRef.current) {
      clearInterval(loadingTimerRef.current);
      loadingTimerRef.current = undefined;
      loadingStartRef.current = null;
      setLoadingElapsed(0);
    }
  }, [isIframeLoaded]);

  const showForceRefresh = previewError || (!isIframeLoaded && loadingElapsed >= FORCE_REFRESH_VISIBLE_MS);
  const hasTimedOut = !isIframeLoaded && loadingElapsed >= LOADING_TIMEOUT_MS;

  /** Completely tear down and rebuild the iframe src for a hard refresh */
  const forceRefreshPreview = useCallback(() => {
    if (iframeRef.current && iframeUrl) {
      setIsIframeLoaded(false);
      setPreviewError(null);
      setRuntimeErrors([]);
      setLoadingElapsed(0);
      loadingStartRef.current = Date.now();
      iframeRef.current.src = '';
      // Small delay so the browser actually clears the frame
      requestAnimationFrame(() => {
        if (iframeRef.current) {
          iframeRef.current.src = iframeUrl;
        }
      });
    }
  }, [iframeUrl]);

  /** Restart the dev server via backend API */
  const restartDevServer = useCallback(async () => {
    if (!projectId || isRestartingDevServer) return;
    
    setIsRestartingDevServer(true);
    setDevServerStatus('starting');
    setPreviewError(null);
    
    try {
      await dockerPost('/api/dev-server/restart', { projectId });
      logger.info('[Preview] Dev server restart requested');
      
      // Poll for dev server to become ready
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds max
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const state = await dockerGet<{ devServerRunning: boolean }>(`/api/workspace-state/${projectId}`, { 
            timeout: 2000, 
            skipRetry: true 
          });
          
          if (state?.devServerRunning) {
            clearInterval(pollInterval);
            setDevServerStatus('running');
            setIsRestartingDevServer(false);
            forceRefreshPreview();
            logger.info('[Preview] Dev server is now running');
          } else if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            setDevServerStatus('stopped');
            setIsRestartingDevServer(false);
            setPreviewError('Dev server failed to start. Check the terminal for errors.');
          }
        } catch (e) {
          if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            setDevServerStatus('stopped');
            setIsRestartingDevServer(false);
            setPreviewError('Failed to check dev server status.');
          }
        }
      }, 1000);
      
    } catch (err: any) {
      logger.error('[Preview] Failed to restart dev server:', err);
      setIsRestartingDevServer(false);
      setDevServerStatus('stopped');
      setPreviewError(`Failed to restart dev server: ${err.message || 'Unknown error'}`);
    }
  }, [projectId, isRestartingDevServer, forceRefreshPreview]);

  /** Clear error state and reload */
  const retryPreview = useCallback(() => {
    setPreviewError(null);
    setRuntimeErrors([]);
    setIsIframeLoaded(false);
    setLoadingElapsed(0);
    loadingStartRef.current = Date.now();

    if (iframeRef.current && iframeUrl) {
      iframeRef.current.src = '';
      requestAnimationFrame(() => {
        if (iframeRef.current) {
          iframeRef.current.src = iframeUrl;
        }
      });
    }
  }, [iframeUrl]);

  /** Called when the iframe fires its onLoad event */
  const handleIframeLoad = useCallback(() => {
    setIsIframeLoaded(true);
    setReloadState('idle');
  }, []);
  // ---------- End loading timeout tracking ----------

  // ---------- Runtime error capture ----------
  // Clear runtime errors when iframe URL changes (new navigation / reload)
  useEffect(() => {
    setRuntimeErrors([]);
  }, [iframeUrl]);

  const dismissRuntimeErrors = useCallback(() => {
    setRuntimeErrors([]);
  }, []);

  // Listen for runtime error messages posted from the preview iframe
  useEffect(() => {
    const handleRuntimeError = (event: MessageEvent) => {
      // Accept both namespaced and generic error message types from the iframe
      const type = event.data?.type;

      if (
        type !== 'recoder:runtime-error' &&
        type !== 'error' &&
        type !== 'unhandledrejection'
      ) {
        return;
      }

      const errorData = event.data.data || event.data;
      const runtimeError: RuntimeError = {
        message: errorData.message || errorData.error || String(errorData),
        stack: errorData.stack,
        filename: errorData.filename,
        lineno: errorData.lineno,
        colno: errorData.colno,
        timestamp: Date.now(),
      };

      setRuntimeErrors((prev) => {
        // Deduplicate: skip if the same message was recorded in the last 2 seconds
        const isDuplicate = prev.some(
          (e) =>
            e.message === runtimeError.message &&
            runtimeError.timestamp - e.timestamp < 2000,
        );

        if (isDuplicate) return prev;

        const next = [...prev, runtimeError];

        // Cap the list so we don't accumulate unbounded entries
        return next.length > MAX_RUNTIME_ERRORS ? next.slice(-MAX_RUNTIME_ERRORS) : next;
      });
    };

    window.addEventListener('message', handleRuntimeError);
    return () => window.removeEventListener('message', handleRuntimeError);
  }, []);
  // ---------- End runtime error capture ----------

  // ---------- Auto-fix for runtime errors ----------
  // Trigger auto-fix when runtime errors are detected (debounced)
  const runtimeErrorFixRef = useRef<NodeJS.Timeout | null>(null);
  const lastFixedRuntimeErrorRef = useRef<string>('');
  
  useEffect(() => {
    // Only trigger if we have errors and not currently streaming
    if (runtimeErrors.length === 0 || streamingState.isStreaming) {
      return;
    }

    // Clear any pending fix
    if (runtimeErrorFixRef.current) {
      clearTimeout(runtimeErrorFixRef.current);
    }

    // Debounce the fix trigger
    runtimeErrorFixRef.current = setTimeout(() => {
      // Check if these are the same errors we already tried to fix
      const errorHash = runtimeErrors.map(e => e.message).join('|');
      if (errorHash === lastFixedRuntimeErrorRef.current) {
        logger.info('[Preview] Skipping auto-fix - same runtime errors as last attempt');
        return;
      }
      
      lastFixedRuntimeErrorRef.current = errorHash;
      
      // Format errors for AI
      const errorDetails = runtimeErrors.map((error, index) => {
        let detail = `Runtime Error ${index + 1}: ${error.message}`;
        if (error.filename) {
          detail += `\nFile: ${error.filename}`;
          if (error.lineno) {
            detail += `:${error.lineno}`;
            if (error.colno) detail += `:${error.colno}`;
          }
        }
        if (error.stack) {
          detail += `\n\nStack trace:\n${error.stack}`;
        }
        return detail;
      }).join('\n\n---\n\n');

      const prompt = `[AUTO-FIX] Fix these runtime errors blocking the preview:\n\n${errorDetails}\n\nPlease fix all errors above. The app crashed with these errors at runtime.`;
      
      logger.info('[Preview] Triggering auto-fix for runtime errors:', runtimeErrors.length);
      
      window.dispatchEvent(new CustomEvent('recoder:fix-errors', {
        detail: {
          prompt,
          auto: true,
          errors: runtimeErrors.map((e, i) => ({
            id: `runtime-${Date.now()}-${i}`,
            type: 'runtime' as const,
            severity: 'error' as const,
            message: e.message,
            shortMessage: e.message.substring(0, 100),
            filePath: e.filename,
            line: e.lineno,
            column: e.colno,
            source: 'runtime' as const,
            rawError: e.stack || e.message,
            timestamp: e.timestamp,
          })),
        }
      }));
    }, 2000); // 2 second debounce
    
    return () => {
      if (runtimeErrorFixRef.current) {
        clearTimeout(runtimeErrorFixRef.current);
      }
    };
  }, [runtimeErrors, streamingState.isStreaming]);
  // ---------- End auto-fix for runtime errors ----------

  // ---------- Visual editing ----------
  // Listen for postMessage events from the iframe for visual editing
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data?.type?.startsWith('recoder:')) return;

      switch (event.data.type) {
        case 'recoder:component-selected': {
          const data = event.data.data as SelectedComponent;
          selectComponent(data);
          if (data.computedStyles) {
            updateComponentStyles(data.computedStyles);
          }
          setHasStaticText(!!data.textContent);
          break;
        }
        case 'recoder:component-deselected': {
          clearSelection();
          break;
        }
        case 'recoder:coordinates-updated': {
          updateComponentCoordinates(event.data.data);
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  /** Inject visual editing script into the preview iframe */
  const injectVisualEditingScript = useCallback(() => {
    if (!iframeRef.current?.contentWindow || !isVisualEditing) return;

    try {
      const iframeDoc = iframeRef.current.contentDocument;
      if (!iframeDoc) return;

      // Remove existing script if any
      const existing = iframeDoc.getElementById('recoder-visual-editing');
      if (existing) existing.remove();

      const script = iframeDoc.createElement('script');
      script.id = 'recoder-visual-editing';
      script.textContent = `
        (function() {
          let overlay = null;
          let selectedEl = null;

          function createOverlay() {
            if (overlay) return overlay;
            overlay = document.createElement('div');
            overlay.id = 'recoder-ve-overlay';
            overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:99999;border:2px solid #6366f1;background:rgba(99,102,241,0.1);transition:all 0.15s ease;display:none;';
            document.body.appendChild(overlay);
            return overlay;
          }

          function positionOverlay(el) {
            const ov = createOverlay();
            const rect = el.getBoundingClientRect();
            ov.style.top = rect.top + 'px';
            ov.style.left = rect.left + 'px';
            ov.style.width = rect.width + 'px';
            ov.style.height = rect.height + 'px';
            ov.style.display = 'block';
          }

          function getComputedStyleData(el) {
            const cs = window.getComputedStyle(el);
            return {
              margin: { top: cs.marginTop, right: cs.marginRight, bottom: cs.marginBottom, left: cs.marginLeft },
              padding: { top: cs.paddingTop, right: cs.paddingRight, bottom: cs.paddingBottom, left: cs.paddingLeft },
              border: { width: cs.borderWidth, radius: cs.borderRadius, color: cs.borderColor, style: cs.borderStyle },
              backgroundColor: cs.backgroundColor,
              text: { fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontFamily: cs.fontFamily, color: cs.color, lineHeight: cs.lineHeight },
            };
          }

          function getComponentName(el) {
            // Try React fiber
            const key = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
            if (key) {
              let fiber = el[key];
              while (fiber) {
                if (fiber.type && typeof fiber.type === 'function') {
                  return fiber.type.displayName || fiber.type.name || 'Component';
                }
                fiber = fiber.return;
              }
            }
            return el.tagName.toLowerCase();
          }

          document.addEventListener('mouseover', function(e) {
            if (!document.body.dataset.veEnabled) return;
            positionOverlay(e.target);
          });

          document.addEventListener('mouseout', function(e) {
            if (!document.body.dataset.veEnabled) return;
            if (!selectedEl) {
              const ov = document.getElementById('recoder-ve-overlay');
              if (ov) ov.style.display = 'none';
            }
          });

          document.addEventListener('click', function(e) {
            if (!document.body.dataset.veEnabled) return;
            e.preventDefault();
            e.stopPropagation();

            const el = e.target;
            selectedEl = el;
            positionOverlay(el);

            const rect = el.getBoundingClientRect();
            const name = getComponentName(el);
            const styles = getComputedStyleData(el);

            window.parent.postMessage({
              type: 'recoder:component-selected',
              data: {
                id: el.id || name + '-' + Math.random().toString(36).slice(2,8),
                name: name,
                filePath: '',
                tagName: el.tagName.toLowerCase(),
                textContent: el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 ? el.textContent?.trim() : undefined,
                computedStyles: styles,
                bounds: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
              }
            }, '*');
          }, true);

          // Listen for style modifications from parent
          window.addEventListener('message', function(e) {
            if (e.data?.type === 'recoder:modify-styles' && selectedEl) {
              const s = e.data.data?.styles;
              if (!s) return;
              if (s.margin) { if (s.margin.top) selectedEl.style.marginTop = s.margin.top; if (s.margin.bottom) selectedEl.style.marginBottom = s.margin.bottom; if (s.margin.left) selectedEl.style.marginLeft = s.margin.left; if (s.margin.right) selectedEl.style.marginRight = s.margin.right; }
              if (s.padding) { if (s.padding.top) selectedEl.style.paddingTop = s.padding.top; if (s.padding.bottom) selectedEl.style.paddingBottom = s.padding.bottom; if (s.padding.left) selectedEl.style.paddingLeft = s.padding.left; if (s.padding.right) selectedEl.style.paddingRight = s.padding.right; }
              if (s.border) { if (s.border.width) selectedEl.style.borderWidth = s.border.width; if (s.border.radius) selectedEl.style.borderRadius = s.border.radius; if (s.border.color) selectedEl.style.borderColor = s.border.color; }
              if (s.backgroundColor) selectedEl.style.backgroundColor = s.backgroundColor;
              if (s.text) { if (s.text.fontSize) selectedEl.style.fontSize = s.text.fontSize; if (s.text.fontWeight) selectedEl.style.fontWeight = s.text.fontWeight; if (s.text.fontFamily) selectedEl.style.fontFamily = s.text.fontFamily; if (s.text.color) selectedEl.style.color = s.text.color; }
              positionOverlay(selectedEl);
            }
            if (e.data?.type === 'recoder:remove-overlay') {
              selectedEl = null;
              const ov = document.getElementById('recoder-ve-overlay');
              if (ov) ov.style.display = 'none';
            }
            if (e.data?.type === 'recoder:enable-ve') {
              document.body.dataset.veEnabled = 'true';
            }
            if (e.data?.type === 'recoder:disable-ve') {
              delete document.body.dataset.veEnabled;
              selectedEl = null;
              const ov = document.getElementById('recoder-ve-overlay');
              if (ov) ov.style.display = 'none';
            }
          });
        })();
      `;
      iframeDoc.head.appendChild(script);
    } catch (e) {
      // Cross-origin iframe - can't inject script, visual editing not available
      logger.warn('[Preview] Cannot inject visual editing script (cross-origin iframe)');
    }
  }, [isVisualEditing]);

  // Inject or disable visual editing when toggled or when iframe loads
  useEffect(() => {
    if (isIframeLoaded) {
      if (isVisualEditing) {
        injectVisualEditingScript();
        // Enable visual editing in iframe
        iframeRef.current?.contentWindow?.postMessage({ type: 'recoder:enable-ve' }, '*');
      } else {
        // Disable visual editing in iframe
        iframeRef.current?.contentWindow?.postMessage({ type: 'recoder:disable-ve' }, '*');
        clearSelection();
      }
    }
  }, [isVisualEditing, isIframeLoaded, injectVisualEditingScript]);
  // ---------- End visual editing ----------

  // Whether the preview should use a device frame (phone/tablet with non-responsive preset)
  const isDeviceMode = !dims.isResponsive && (device.deviceType === 'phone' || device.deviceType === 'tablet');

  // Compute the scale so the framed device fits inside the container
  const fitScale = isDeviceMode
    ? calculateFitScale(containerSize.width, containerSize.height, dims.width, dims.height, 40)
    : 1;

  // Use the smaller of fitScale and the user's chosen zoom so it always fits
  const appliedScale = isDeviceMode ? Math.min(fitScale, deviceState.zoom) : 1;

  // ---------- File-change coalesced refresh ----------
  // Tracks pending file paths that will trigger a single refresh
  const pendingRefreshPathsRef = useRef<Set<string>>(new Set());
  const refreshTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const executeRefresh = useCallback(() => {
    if (iframeRef.current && iframeRef.current.src) {
      const pathCount = pendingRefreshPathsRef.current.size;
      if (pathCount > 0) {
        logger.info(`[Preview] Refreshing preview for ${pathCount} changed files`);
      }
      setReloadState('reloading');
      iframeRef.current.src = iframeRef.current.src;
    }
    pendingRefreshPathsRef.current.clear();
  }, []);

  const scheduleCoalescedRefresh = useCallback((changedPaths: string[]) => {
    // Add new paths to the pending set (automatically deduplicates)
    let newPathCount = 0;
    for (const p of changedPaths) {
      if (!pendingRefreshPathsRef.current.has(p)) {
        pendingRefreshPathsRef.current.add(p);
        newPathCount++;
      }
    }

    // If all paths were already pending, skip rescheduling
    if (newPathCount === 0) {
      logger.info('[Preview] All file paths already pending refresh, skipping');
      return;
    }

    // Signal that file changes have been detected and are waiting to coalesce
    setReloadState('pending');

    // Coalesce: reset the timer so rapid bursts are batched into one refresh
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(executeRefresh, REFRESH_COALESCE_MS);
  }, [executeRefresh]);

  // Listen for file change events and coalesce refreshes
  useEffect(() => {
    const handleFileChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{
        changes: Array<{ type: string; path: string }>;
      }>;
      const changes = customEvent.detail?.changes;
      if (!changes || changes.length === 0) return;

      const paths = changes.map((c) => c.path);
      logger.info(`[Preview] ${paths.length} file changes received, scheduling coalesced refresh`);
      scheduleCoalescedRefresh(paths);
    };

    window.addEventListener('recoder:file-changed', handleFileChanged);
    return () => {
      window.removeEventListener('recoder:file-changed', handleFileChanged);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [scheduleCoalescedRefresh]);
  // ---------- End file-change coalesced refresh ----------

  useEffect(() => {
    if (!activePreview) {
      setUrl('');
      setIframeUrl(undefined);
      setPreviewError(null);

      return;
    }

    const { baseUrl } = activePreview;

    logger.info('📺 [Preview] Active preview changed:', {
      baseUrl,
      port: activePreview.port,
      ready: activePreview.ready,
    });

    // Always update the URL bar display
    setUrl(baseUrl);

    // Verify URL is valid
    if (!baseUrl || baseUrl === 'about:blank') {
      const errorMsg = 'Preview not ready. Make sure the development server is running.';
      setPreviewError(errorMsg);
      setIframeUrl(undefined);
      logger.warn('⚠️ [Preview] Preview URL is not valid:', baseUrl);
      return;
    }

    // Only load the iframe when the preview is marked as ready (dev server responding)
    // or when the preview URL has changed (allows loading the friendly "starting" page)
    if (activePreview.ready) {
      setIframeUrl(baseUrl);
      setPreviewError(null);
      logger.info('✅ [Preview] Preview ready, loading iframe:', baseUrl);
    } else {
      // Dev server not ready yet — don't load iframe (avoids "Failed to fetch" errors)
      // The iframe will load once activePreview.ready flips to true
      setIframeUrl(undefined);
      setPreviewError(null);
      logger.info('🔄 [Preview] Preview not ready yet, waiting for dev server:', baseUrl);
    }
  }, [activePreview]);

  const validateUrl = useCallback(
    (value: string) => {
      if (!activePreview) {
        return false;
      }

      const { baseUrl } = activePreview;

      if (value === baseUrl) {
        return true;
      } else if (value.startsWith(baseUrl)) {
        return ['/', '?', '#'].includes(value.charAt(baseUrl.length));
      }

      return false;
    },
    [activePreview],
  );

  const findMinPortIndex = useCallback(
    (minIndex: number, preview: { port: number }, index: number, array: { port: number }[]) => {
      return preview.port < array[minIndex].port ? index : minIndex;
    },
    [],
  );

  // when previews change, display the lowest port if user hasn't selected a preview
  useEffect(() => {
    if (previews.length > 1 && !hasSelectedPreview.current) {
      const minPortIndex = previews.reduce(findMinPortIndex, 0);

      setActivePreviewIndex(minPortIndex);
    }
  }, [previews]);

  const reloadPreview = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      <ContainerCreationStatus />
      {isPortDropdownOpen && (
        <div className="z-iframe-overlay w-full h-full absolute" onClick={() => setIsPortDropdownOpen(false)} />
      )}
      <div className="bg-recoder-elements-background-depth-2 p-2 flex items-center gap-1.5">
        <button
          onClick={reloadPreview}
          title={reloadState === 'pending' ? 'Changes detected...' : reloadState === 'reloading' ? 'Reloading...' : 'Reload preview'}
          className={`flex items-center text-recoder-elements-textSecondary bg-transparent enabled:hover:text-recoder-elements-textPrimary rounded-md p-1 enabled:hover:bg-recoder-elements-background-depth-3 ${
            reloadState !== 'idle' ? 'text-blue-400' : ''
          }`}
        >
          <div
            className={`i-ph:arrow-clockwise text-xl ${reloadState !== 'idle' ? 'text-blue-400' : ''}`}
            style={reloadState !== 'idle' ? { animation: 'spin 1s linear infinite' } : undefined}
          />
        </button>
        {showForceRefresh && (
          <button
            onClick={forceRefreshPreview}
            title="Force refresh (clear and reload)"
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-recoder-elements-button-primary-background text-recoder-elements-button-primary-text hover:bg-recoder-elements-button-primary-backgroundHover transition-colors whitespace-nowrap"
          >
            <div className="i-ph:arrow-counter-clockwise text-sm" />
            Force Refresh
          </button>
        )}
        {/* Restart Dev Server button - shown when there's an error or timeout */}
        {(previewError || hasTimedOut) && projectId && (
          <button
            onClick={restartDevServer}
            disabled={isRestartingDevServer}
            title="Restart development server"
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
              isRestartingDevServer
                ? 'bg-recoder-elements-background-depth-3 text-recoder-elements-textTertiary cursor-not-allowed'
                : 'bg-orange-600 text-white hover:bg-orange-500'
            }`}
          >
            {isRestartingDevServer ? (
              <>
                <div className="i-ph:spinner-gap text-sm" style={{ animation: 'spin 1s linear infinite' }} />
                Restarting...
              </>
            ) : (
              <>
                <div className="i-ph:power text-sm" />
                Restart Server
              </>
            )}
          </button>
        )}
        <div
          className="flex items-center gap-1 flex-grow bg-recoder-elements-preview-addressBar-background border border-recoder-elements-borderColor text-recoder-elements-preview-addressBar-text rounded-full px-3 py-1 text-sm hover:bg-recoder-elements-preview-addressBar-backgroundHover hover:focus-within:bg-recoder-elements-preview-addressBar-backgroundActive focus-within:bg-recoder-elements-preview-addressBar-backgroundActive
        focus-within-border-recoder-elements-borderColorActive focus-within:text-recoder-elements-preview-addressBar-textActive"
        >
          <input
            ref={inputRef}
            className="w-full bg-transparent outline-none"
            type="text"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && validateUrl(url)) {
                setIframeUrl(url);

                if (inputRef.current) {
                  inputRef.current.blur();
                }
              }
            }}
          />
        </div>
        <Suspense fallback={null}><VisualEditingToggle /></Suspense>
        {previews.length > 1 && (
          <PortDropdown
            activePreviewIndex={activePreviewIndex}
            setActivePreviewIndex={setActivePreviewIndex}
            isDropdownOpen={isPortDropdownOpen}
            setHasSelectedPreview={(value) => (hasSelectedPreview.current = value)}
            setIsDropdownOpen={setIsPortDropdownOpen}
            previews={previews}
          />
        )}
        {/* Metro build status indicator (Expo projects only) */}
        {projectType === 'expo' && metroBuildStatus !== 'idle' && (
          metroBuildStatus === 'building' ? (
            <span className="flex items-center gap-1 text-amber-400 text-xs whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Building...
            </span>
          ) : metroBuildStatus === 'error' ? (
            <span className="flex items-center gap-1 text-red-400 text-xs max-w-[160px] whitespace-nowrap" title={metroError}>
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
              <span className="truncate">{metroError || 'Error'}</span>
            </span>
          ) : metroBuildStatus === 'ready' ? (
            <span className="flex items-center gap-1 text-green-400 text-xs whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Ready
            </span>
          ) : null
        )}
      </div>
      <PreviewToolbar />
      {/* ── Expo / Web mode switcher (only for Expo projects) ── */}
      {projectType === 'expo' && (
        <div className="flex items-center gap-0 bg-recoder-elements-background-depth-2 border-t border-recoder-elements-borderColor px-2">
          <button
            onClick={() => setPreviewMode('web')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 ${
              previewMode === 'web'
                ? 'text-recoder-elements-textPrimary border-recoder-elements-button-primary-background'
                : 'text-recoder-elements-textTertiary border-transparent hover:text-recoder-elements-textSecondary'
            }`}
          >
            Web Preview
          </button>
          <button
            onClick={() => setPreviewMode('expo-go')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 ${
              previewMode === 'expo-go'
                ? 'text-recoder-elements-textPrimary border-recoder-elements-button-primary-background'
                : 'text-recoder-elements-textTertiary border-transparent hover:text-recoder-elements-textSecondary'
            }`}
          >
            Expo Go
          </button>
          <button
            onClick={() => setPreviewMode('device-cloud')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 ${
              previewMode === 'device-cloud'
                ? 'text-recoder-elements-textPrimary border-recoder-elements-button-primary-background'
                : 'text-recoder-elements-textTertiary border-transparent hover:text-recoder-elements-textSecondary'
            }`}
          >
            Device Cloud
          </button>
          <button
            onClick={() => setPreviewMode('canvas')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 ${
              previewMode === 'canvas'
                ? 'text-recoder-elements-textPrimary border-recoder-elements-button-primary-background'
                : 'text-recoder-elements-textTertiary border-transparent hover:text-recoder-elements-textSecondary'
            }`}
          >
            Canvas
          </button>
        </div>
      )}
      <div className="flex-1 border-t border-recoder-elements-borderColor overflow-hidden relative">
        {/* ── Expo Go mode ── */}
        {projectType === 'expo' && previewMode === 'expo-go' && projectId ? (
          <div className="w-full h-full overflow-auto bg-recoder-elements-background-depth-1">
            <Suspense fallback={null}><ExpoQRPanel projectId={projectId} className="h-full" /></Suspense>
          </div>
        ) : projectType === 'expo' && previewMode === 'device-cloud' && projectId ? (
          /* ── Device Cloud (Appetize.io) mode ── */
          <div className="w-full h-full overflow-auto bg-recoder-elements-background-depth-1">
            <div className="flex flex-col items-center p-4 gap-4">
              <div className="flex items-center gap-2">
                <div className="i-ph:device-mobile text-lg text-cyan-400" />
                <span className="text-recoder-elements-textPrimary text-sm font-medium">Device Cloud Testing</span>
              </div>

              {appetizeKey ? (
                <div className="w-full h-[600px]">
                  <iframe
                    src={`https://appetize.io/embed/${appetizeKey}?device=iphone14pro&osVersion=16.0&scale=auto`}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    scrolling="no"
                    className="rounded-lg"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-3 w-full max-w-xs">
                  <div className="text-recoder-elements-textTertiary text-xs text-center">
                    Test your app on a real device emulator via Appetize.io
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-recoder-elements-textTertiary text-[10px]">Appetize API Token</label>
                    <input
                      type="password"
                      value={appetizeToken}
                      onChange={(e) => { setAppetizeToken(e.target.value); localStorage.setItem('appetize_token', e.target.value); }}
                      placeholder="tok_..."
                      className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-xs rounded px-3 py-1.5 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive w-full"
                    />
                    <a href="https://appetize.io/docs#api-token" target="_blank" rel="noopener noreferrer" className="text-cyan-400 text-[10px] hover:text-cyan-300 transition-colors">
                      Get API token from appetize.io
                    </a>
                  </div>

                  <button
                    onClick={async () => {
                      if (!appetizeToken) return;
                      setUploadingToAppetize(true);
                      try {
                        // Try to get the latest build artifact URL
                        const statusRes = await dockerGet<{ data: { active: boolean; publicKey?: string } }>(`/api/appetize-status/${projectId}`);
                        const statusData = (statusRes as any).data || statusRes;
                        if (statusData.publicKey) {
                          setAppetizeKey(statusData.publicKey);
                        } else {
                          // No existing session, user needs to upload a build
                          alert('Build your app first (APK/IPA), then the Device Cloud will automatically detect it.');
                        }
                      } catch {
                        alert('Upload a build first using the Build APK/IPA section.');
                      } finally {
                        setUploadingToAppetize(false);
                      }
                    }}
                    disabled={!appetizeToken || uploadingToAppetize}
                    className={`w-full py-2 rounded text-xs font-medium transition-colors ${
                      !appetizeToken || uploadingToAppetize
                        ? 'bg-recoder-elements-button-secondary-background text-recoder-elements-textTertiary cursor-not-allowed'
                        : 'bg-cyan-600 text-white hover:bg-cyan-500'
                    }`}
                  >
                    {uploadingToAppetize ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="i-svg-spinners:90-ring-with-bg text-xs" />
                        Connecting...
                      </span>
                    ) : (
                      'Connect Device Cloud'
                    )}
                  </button>

                  <a
                    href="https://www.browserstack.com/app-live"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-recoder-elements-textTertiary text-[10px] hover:text-recoder-elements-textSecondary transition-colors text-center"
                  >
                    Or use BrowserStack App Live
                  </a>
                </div>
              )}
            </div>
          </div>
        ) : projectType === 'expo' && previewMode === 'canvas' && projectId ? (
          /* ── Canvas (OpenClaw) mode ── */
          <div className="w-full h-full overflow-auto bg-recoder-elements-background-depth-1">
            {canvasConnected && canvasUrl ? (
              <iframe
                src={canvasUrl}
                width="100%"
                height="100%"
                frameBorder="0"
                className="border-none"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
                <div className="i-ph:paint-brush text-4xl text-recoder-elements-textTertiary" />
                <div className="text-recoder-elements-textSecondary text-sm font-medium">OpenClaw Canvas</div>
                <div className="text-recoder-elements-textTertiary text-xs text-center max-w-xs">
                  {canvasConnected === false
                    ? 'OpenClaw Canvas is not running. Start the Canvas service to use the visual design tool.'
                    : 'Checking Canvas connection...'}
                </div>
                <div className="text-recoder-elements-textTertiary text-[10px] text-center">
                  Canvas elements can be exported as React Native components.
                </div>
              </div>
            )}
          </div>
        ) : previewError ? (
        /* ── Error card ── */
          <div className="flex w-full h-full justify-center items-center bg-recoder-elements-background-depth-1">
            <div className="max-w-md w-full mx-4 rounded-lg border border-recoder-elements-borderColor bg-recoder-elements-background-depth-2 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="i-ph:warning text-2xl text-red-400 flex-shrink-0" />
                <h3 className="text-recoder-elements-textPrimary text-base font-medium">Preview Error</h3>
              </div>
              <p className="text-recoder-elements-textSecondary text-sm mb-5 leading-relaxed">{previewError}</p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={retryPreview}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-recoder-elements-button-primary-background text-recoder-elements-button-primary-text hover:bg-recoder-elements-button-primary-backgroundHover transition-colors"
                >
                  <div className="i-ph:arrow-clockwise text-sm" />
                  Retry
                </button>
                {projectId && (
                  <button
                    onClick={restartDevServer}
                    disabled={isRestartingDevServer}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      isRestartingDevServer
                        ? 'bg-recoder-elements-background-depth-3 text-recoder-elements-textTertiary cursor-not-allowed'
                        : 'bg-orange-600 text-white hover:bg-orange-500'
                    }`}
                  >
                    {isRestartingDevServer ? (
                      <>
                        <div className="i-ph:spinner-gap text-sm" style={{ animation: 'spin 1s linear infinite' }} />
                        Restarting...
                      </>
                    ) : (
                      <>
                        <div className="i-ph:power text-sm" />
                        Restart Server
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={() => workbenchStore.toggleTerminal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3 transition-colors"
                >
                  <div className="i-ph:terminal-window text-sm" />
                  View Console
                </button>
              </div>
            </div>
          </div>
        ) : activePreview ? (
          <>
            {/* ── Iframe (device mode) ── */}
            {isDeviceMode ? (
              <div
                ref={deviceContainerRef}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: '100%',
                  overflow: 'hidden',
                  backgroundColor: 'var(--recoder-elements-background-depth-3, #1a1a1a)',
                }}
              >
                <div
                  style={{
                    transform: `scale(${appliedScale})`,
                    transformOrigin: 'center center',
                    flexShrink: 0,
                  }}
                >
                  <DeviceFrame
                    frameStyle={device.frameStyle || 'none'}
                    width={dims.width}
                    height={dims.height}
                    color={device.deviceColor}
                    showFrame={deviceState.showFrame}
                  >
                    <iframe
                      ref={iframeRef}
                      className="border-none bg-white"
                      src={iframeUrl}
                      onLoad={handleIframeLoad}
                      style={{
                        width: `${dims.width}px`,
                        height: `${dims.height}px`,
                      }}
                    />
                  </DeviceFrame>
                </div>
              </div>
            ) : (
              /* ── Iframe (normal mode) ── */
              <iframe
                ref={iframeRef}
                className="border-none w-full h-full bg-white"
                src={iframeUrl}
                onLoad={handleIframeLoad}
              />
            )}

            {/* ── Loading timeout overlay ── */}
            {hasTimedOut && !isIframeLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-recoder-elements-background-depth-1/90 z-10">
                <div className="max-w-sm w-full mx-4 rounded-lg border border-recoder-elements-borderColor bg-recoder-elements-background-depth-2 p-6 shadow-sm text-center">
                  <div className="i-ph:clock-countdown text-3xl text-recoder-elements-textTertiary mx-auto mb-3" />
                  <h3 className="text-recoder-elements-textPrimary text-base font-medium mb-1">
                    Preview is taking longer than expected
                  </h3>
                  <p className="text-recoder-elements-textTertiary text-sm mb-4">
                    The development server may still be starting up.
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={retryPreview}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-recoder-elements-button-primary-background text-recoder-elements-button-primary-text hover:bg-recoder-elements-button-primary-backgroundHover transition-colors"
                    >
                      <div className="i-ph:arrow-clockwise text-sm" />
                      Retry
                    </button>
                    <button
                      onClick={() => workbenchStore.toggleTerminal(true)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3 transition-colors"
                    >
                      <div className="i-ph:terminal-window text-sm" />
                      View Console
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Visual Editing Toolbar ── */}
            {isVisualEditing && (
              <Suspense fallback={null}>
                <VisualEditingToolbar
                  iframeRef={iframeRef}
                  onEditInChat={(prompt) => {
                    // Dispatch event for chat to pick up
                    window.dispatchEvent(new CustomEvent('recoder:edit-in-chat', { detail: { prompt } }));
                  }}
                />
              </Suspense>
            )}

            {/* ── Container Recovery Banner ── */}
            {recoveryStatus.recovering && (
              <div className="absolute top-0 left-0 right-0 z-30 bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-2 flex items-center gap-2 text-sm text-yellow-400">
                <div className="i-ph:spinner-gap animate-spin" />
                <span>{recoveryStatus.message || 'Container recovering...'}</span>
              </div>
            )}
            {!recoveryStatus.recovering && recoveryStatus.lastRecovery && Date.now() - recoveryStatus.lastRecovery < 5000 && (
              <div className="absolute top-0 left-0 right-0 z-30 bg-green-500/10 border-b border-green-500/30 px-4 py-2 flex items-center gap-2 text-sm text-green-400">
                <div className="i-ph:check-circle" />
                <span>Container recovered successfully</span>
              </div>
            )}

            {/* ── Runtime Error Overlay + Banner ── */}
            {runtimeErrors.length > 0 && (
              <>
                {/* Dark overlay so blank white iframe isn't jarring */}
                <div className="absolute inset-0 z-20 bg-zinc-950/80 backdrop-blur-sm" />
                <div className="absolute inset-0 z-30 flex items-start justify-center pt-4 px-4 overflow-auto">
                  <div className="w-full max-w-2xl">
                    <ErrorBanner
                      errors={runtimeErrors}
                      onDismiss={dismissRuntimeErrors}
                      onRetry={retryPreview}
                      isStreaming={streamingState.isStreaming}
                    />
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          /* ── No preview yet: environment setup state ── */
          <div className="flex w-full h-full justify-center items-center bg-recoder-elements-background-depth-1">
            <div className="text-center p-6">
              <div
                className="i-ph:spinner-gap text-3xl text-recoder-elements-textTertiary mx-auto mb-3"
                style={{ animation: 'spin 1s linear infinite' }}
              />
              <div className="text-recoder-elements-textSecondary text-base mb-1">
                Setting up development environment...
              </div>
              <div className="text-recoder-elements-textTertiary text-sm">
                This may take a moment while packages are installed
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Spinner keyframes – injected once via inline style tag */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
});
