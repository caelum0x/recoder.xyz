import { useStore } from '@nanostores/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { workbenchStore } from '~/lib/stores/workbench';
import { PortDropdown } from './PortDropdown';

export const Preview = memo(() => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [isPortDropdownOpen, setIsPortDropdownOpen] = useState(false);
  const hasSelectedPreview = useRef(false);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];

  const [url, setUrl] = useState('');
  const [iframeUrl, setIframeUrl] = useState<string | undefined>();
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logs, setLogs] = useState<string>('');
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const healthTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const healthPollInterval = 5000; // ms
  const maxRetries = 10; // 10 retries total
  const firstLoadTimeout = 45000; // First attempt: 45 seconds (matches backend health check)
  const retryLoadTimeout = 10000; // Subsequent attempts: 10 seconds

  // Set credentialless attribute on iframe (can't be done in JSX due to React warning)
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.setAttribute('credentialless', 'true');
    }
  }, [iframeUrl, retryCount]);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
      if (healthTimerRef.current) {
        clearTimeout(healthTimerRef.current);
      }
    };
  }, []);

  // Handle iframe successful load
  const handleIframeLoad = useCallback(() => {
    console.log('✅ [Preview] Iframe loaded successfully');

    // Clear load timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    // Clear health polling when iframe successfully loads
    if (healthTimerRef.current) {
      clearTimeout(healthTimerRef.current);
      healthTimerRef.current = null;
    }
    setIsCheckingHealth(false);

    setIsLoading(false);
    setPreviewError(null);
    setRetryCount(0);
  }, []);

  // Handle iframe error or timeout with retry logic
  const handleIframeError = useCallback((reason: any = 'error') => {
    console.warn(`⚠️ [Preview] Iframe load ${typeof reason === 'string' ? reason : 'error'} (attempt ${retryCount + 1}/${maxRetries})`);

    // Clear load timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    if (retryCount < maxRetries) {
      // Exponential backoff: 1s, 2s, 4s, 8s, then cap at 5s
      const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);

      console.log(`🔄 [Preview] Retrying in ${delay}ms...`);
      setIsLoading(true);

      retryTimerRef.current = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        // Force iframe reload - the iframe's onLoad/onError will be triggered naturally
        if (iframeRef.current && activePreview) {
          console.log(`🔄 [Preview] Reloading iframe (attempt ${retryCount + 2}/${maxRetries})`);
          iframeRef.current.src = activePreview.baseUrl;
        }
      }, delay);
    } else {
      console.error('❌ [Preview] Max retries reached, attempting auto-fix');
      setIsLoading(false);
      setPreviewError('Dev server not responding after multiple retries. Check terminal for errors.');
      
      // Auto-fetch errors and trigger AI fix (inline to avoid hoisting issues)
      (async () => {
        if (!activePreview) return;
        let pid: string | undefined = (activePreview as any).projectId;
        if (!pid && activePreview.baseUrl) {
          try {
            const u = new URL(activePreview.baseUrl);
            const parts = u.pathname.split('/').filter(Boolean);
            const idx = parts.indexOf('preview');
            if (idx >= 0 && parts.length > idx + 1) pid = parts[idx + 1];
          } catch {}
        }
        if (!pid || pid === 'undefined' || pid === 'null') return;
        
        const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || 'http://localhost:3100';
        let errorPrompt = '';
        
        try {
          // First try to get Vite error directly from preview response
          const previewResp = await fetch(activePreview.baseUrl, { signal: AbortSignal.timeout(5000) });
          const html = await previewResp.text();
          
          // Extract missing package from Vite error
          // Pattern: Failed to resolve import "package-name"
          const importMatch = html.match(/Failed to resolve import "([^"]+)"/);
          if (importMatch) {
            const packageName = importMatch[1];
            console.log('🔍 [Preview] Found missing package:', packageName);
            errorPrompt = `Build error: Missing npm package "${packageName}". Please add it to package.json and run: bun add ${packageName}`;
          } else {
            // Try to find other Vite errors
            const errorMatch = html.match(/"message":"([^"]{10,200})"/);
            if (errorMatch && (errorMatch[1].includes('Failed') || errorMatch[1].includes('Error'))) {
              console.log('🔍 [Preview] Found Vite error:', errorMatch[1]);
              errorPrompt = `Build error: ${errorMatch[1]}`;
            }
          }
        } catch (e) {
          console.warn('[Preview] Failed to fetch preview for error parsing:', e);
        }
        
        // If no Vite error found, try the errors API
        if (!errorPrompt) {
          try {
            const resp = await fetch(`${DOCKER_URL}/api/errors/${pid}?tail=200`);
            if (resp.ok) {
              const data = await resp.json() as { errors?: any[]; hasBlockingErrors?: boolean };
              if (data.errors?.length || data.hasBlockingErrors) {
                const { formatErrorsForAI } = await import('~/lib/services/auto-fix');
                errorPrompt = formatErrorsForAI(data.errors || []) || '';
              }
            }
          } catch (e) {
            console.warn('[Preview] Auto-fix fetch failed:', e);
          }
        }
        
        if (errorPrompt) {
          console.log('🤖 [Preview] Auto-triggering AI fix for build errors');
          window.dispatchEvent(new CustomEvent('recoder:fix-errors', {
            detail: { prompt: errorPrompt, auto: true }
          }));
        }
      })();
    }
  }, [retryCount, maxRetries, activePreview]);

  // Effect for initial load - only runs when activePreview changes
  useEffect(() => {
    if (!activePreview) {
      setUrl('');
      setIframeUrl(undefined);
      setPreviewError(null);
      setRetryCount(0);
      setIsLoading(false);

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }

      return;
    }

    const { baseUrl, ready } = activePreview;

    // Don't set iframe URL until dev server is ready
    if (!ready) {
      setUrl(baseUrl);
      setIframeUrl(undefined); // Don't load iframe yet
      setIsLoading(false);
      console.log('🔄 [Preview] Waiting for dev server to be ready...');
      return;
    }

    // Preview is ready - load it
    console.log('✅ [Preview] Dev server ready, loading preview:', baseUrl);
    setRetryCount(0);
    setUrl(baseUrl);
    setIframeUrl(baseUrl);
    setPreviewError(null);
    setIsLoading(true); // Show loading while iframe loads

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    // Verify preview URL is valid
    if (!baseUrl || baseUrl === 'about:blank') {
      const errorMsg = 'Preview not ready. Make sure the development server is running.';
      setPreviewError(errorMsg);
      setIsLoading(false);
      console.warn('⚠️ [Preview] Preview URL is not valid:', baseUrl);
      console.warn('⚠️ [Preview] This usually means:');
      console.warn('  1. Docker container has not initialized');
      console.warn('  2. Dev server has not started');
      console.warn('  3. Port has not been exposed');
      console.warn('  Check workbench store for preview state');
    } else {
      console.log(`🔍 [Preview] Starting preview for: ${baseUrl}`);

      // Start load timeout - first load gets longer timeout
      const timeout = firstLoadTimeout;
      console.log(`⏱️ [Preview] Setting ${timeout}ms timeout for initial load`);

      loadTimeoutRef.current = setTimeout(() => {
        console.warn(`⏱️ [Preview] Load timeout after ${timeout}ms, triggering retry`);
        handleIframeError('timeout');
      }, timeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePreview]); // Only re-run when activePreview changes

  // Effect for retry timeouts - runs when retryCount changes
  useEffect(() => {
    // Skip if no active preview, initial load (retryCount=0), or error already shown
    if (!activePreview || retryCount === 0 || previewError) {
      return;
    }

    // Set timeout for this retry attempt
    const timeout = retryLoadTimeout;
    console.log(`⏱️ [Preview] Setting ${timeout}ms timeout for retry ${retryCount}`);

    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }

    loadTimeoutRef.current = setTimeout(() => {
      console.warn(`⏱️ [Preview] Retry ${retryCount} timeout after ${timeout}ms`);
      handleIframeError('timeout');
    }, timeout);

    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]); // Run when retryCount changes (meaning a retry happened)

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

  // Listen for file changes from CLI tools (claude, recoder-code) to auto-refresh
  useEffect(() => {
    const handleFileChange = (event: CustomEvent) => {
      console.log('[Preview] File changes detected from CLI, refreshing...');
      // Small delay to let Vite hot reload process the changes
      setTimeout(() => {
        reloadPreview();
      }, 500);
    };

    window.addEventListener('recoder:file-changed', handleFileChange as EventListener);
    return () => {
      window.removeEventListener('recoder:file-changed', handleFileChange as EventListener);
    };
  }, []);

  // Resolve projectId helper (shared by logs and health checks)
  const resolveProjectId = useCallback((): string | undefined => {
    if (!activePreview) return undefined;
    let pid: string | undefined = (activePreview as any).projectId;
    if (!pid && activePreview.baseUrl) {
      try {
        const u = new URL(activePreview.baseUrl);
        const parts = u.pathname.split('/').filter(Boolean);
        const previewIndex = parts.indexOf('preview');
        if (previewIndex >= 0 && parts.length > previewIndex + 1) {
          pid = parts[previewIndex + 1];
        }
      } catch (e) {
        // ignore
      }
    }
    if (!pid || pid === 'undefined' || pid === 'null') return undefined;
    return pid;
  }, [activePreview]);

  const fetchPreviewHealth = useCallback(async () => {
    const pid = resolveProjectId();
    if (!pid) return false;

    try {
      const resp = await fetch(`/api/preview/${encodeURIComponent(pid)}/health`);
      if (!resp.ok) return false;
      const json = await resp.json().catch(() => ({})) as { ports?: Array<{ responding?: boolean }> };
      // If any port is responding, consider healthy
      if (Array.isArray(json.ports)) {
        return json.ports.some((p) => p.responding === true);
      }
      return false;
    } catch (err) {
      return false;
    }
  }, [resolveProjectId]);

  // Poll health endpoint when previewError is present to perform heartbeat/reconnect
  useEffect(() => {
    let cancelled = false;
    const startPolling = async () => {
      if (!activePreview || !previewError) return;
      setIsCheckingHealth(true);

      const healthy = await fetchPreviewHealth();
      if (cancelled) return;

      if (healthy) {
        console.log('💓 [Preview] Healthy again; reloading iframe');
        setPreviewError(null);
        setRetryCount(0);
        setIsLoading(true);
        if (iframeRef.current && activePreview) {
          iframeRef.current.src = activePreview.baseUrl;
        }
        setIsCheckingHealth(false);
        if (healthTimerRef.current) {
          clearTimeout(healthTimerRef.current);
          healthTimerRef.current = null;
        }
        return;
      }

      // schedule next poll
      if (!cancelled) {
        healthTimerRef.current = setTimeout(() => startPolling(), healthPollInterval);
      }
    };

    if (previewError && activePreview) {
      // start initial poll immediately
      startPolling();
    }

    return () => {
      cancelled = true;
      if (healthTimerRef.current) {
        clearTimeout(healthTimerRef.current);
        healthTimerRef.current = null;
      }
      setIsCheckingHealth(false);
    };
  }, [previewError, activePreview, fetchPreviewHealth]);

  const fetchLogs = useCallback(async (tail = 200) => {
    if (!activePreview) return;
    setIsFetchingLogs(true);
    try {
      // Resolve projectId robustly: prefer explicit projectId, fall back to parsing from baseUrl
      let pid: string | undefined = (activePreview as any).projectId;
      if (!pid && activePreview.baseUrl) {
        try {
          const u = new URL(activePreview.baseUrl);
          const parts = u.pathname.split('/').filter(Boolean);
          // expecting /preview/:projectId
          const previewIndex = parts.indexOf('preview');
          if (previewIndex >= 0 && parts.length > previewIndex + 1) {
            pid = parts[previewIndex + 1];
          }
        } catch (e) {
          // ignore URL parse errors
        }
      }

      // Treat literal 'undefined' or 'null' as invalid
      if (!pid || pid === 'undefined' || pid === 'null') {
        setLogs('Failed to determine project id for logs');
        setIsFetchingLogs(false);
        return;
      }

      const resp = await fetch(`/api/preview/${encodeURIComponent(pid)}/logs?tail=${tail}`);
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({})) as { message?: string };
        setLogs(`Failed to fetch logs: ${resp.status} ${resp.statusText}\n${JSON.stringify(json)}`);
      } else {
        const json = await resp.json() as { logs?: string };
        setLogs(json.logs || '');
      }
    } catch (err) {
      setLogs(`Error fetching logs: ${String(err)}`);
    } finally {
      setIsFetchingLogs(false);
    }
  }, [activePreview]);

  return (
    <div className="w-full h-full flex flex-col">
      {isPortDropdownOpen && (
        <div className="z-iframe-overlay w-full h-full absolute" onClick={() => setIsPortDropdownOpen(false)} />
      )}
      <div className="bg-bolt-elements-background-depth-2 p-2 flex items-center gap-1.5">
        <IconButton icon="i-ph:arrow-clockwise" onClick={reloadPreview} />
        <div
          className="flex items-center gap-1 flex-grow bg-bolt-elements-preview-addressBar-background border border-bolt-elements-borderColor text-bolt-elements-preview-addressBar-text rounded-full px-3 py-1 text-sm hover:bg-bolt-elements-preview-addressBar-backgroundHover hover:focus-within:bg-bolt-elements-preview-addressBar-backgroundActive focus-within:bg-bolt-elements-preview-addressBar-backgroundActive
        focus-within-border-bolt-elements-borderColorActive focus-within:text-bolt-elements-preview-addressBar-textActive"
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
      </div>
      <div className="flex-1 border-t border-bolt-elements-borderColor relative">
        {(activePreview && !activePreview.ready) || (activePreview && !iframeUrl) ? (
          // ✅ Show loading state when preview URL is set but dev server not ready yet
          <div className="flex w-full h-full justify-center items-center bg-white">
            <div className="text-center p-6">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <div className="text-gray-700 text-lg mb-2">Waiting for dev server...</div>
              <div className="text-gray-500 text-sm">Installing dependencies and starting server</div>
              <div className="text-gray-400 text-xs mt-2">This usually takes 10-30 seconds</div>
            </div>
          </div>
        ) : previewError ? (
          <div className="flex w-full h-full justify-center items-center bg-white">
            <div className="text-center p-6">
              <div className="text-red-500 text-lg mb-2"><span className="i-ph:warning" /> Preview Error</div>
              <div className="text-gray-600">{previewError}</div>
              <div className="flex gap-2 justify-center mt-4">
                <button
                  onClick={() => {
                    setRetryCount(0);
                    setPreviewError(null);
                    setIsLoading(true);
                    if (iframeRef.current && activePreview) {
                      iframeRef.current.src = activePreview.baseUrl;
                    }
                  }}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Retry
                </button>
                <button
                  onClick={() => {
                    setShowLogsModal(true);
                    fetchLogs();
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
                >
                  Tail logs
                </button>
              </div>
            </div>
          </div>
        ) : activePreview ? (
          <>
            {isLoading && (
              <div className="absolute inset-0 flex flex-col w-full h-full justify-center items-center bg-white z-10">
                <div className="text-center p-6">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <div className="text-gray-700 text-lg mb-2">Starting dev server...</div>
                  <div className="text-gray-500 text-sm">
                    {retryCount > 0 ? `Retry ${retryCount}/${maxRetries}` : 'Building your project...'}
                  </div>
                  <div className="text-gray-400 text-xs mt-2">This usually takes 10-30 seconds</div>
                  <div className="mt-4">
                    <button
                      onClick={() => {
                        setShowLogsModal(true);
                        fetchLogs();
                      }}
                      className="px-3 py-1 bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
                    >
                      Tail logs
                    </button>
                  </div>
                </div>
              </div>
            )}
            <iframe
              key={retryCount} // Force re-render on retry
              ref={iframeRef}
              className="border-none w-full h-full bg-white"
              src={iframeUrl}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
              allow="cross-origin-isolated"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          </>
        ) : (
          <div className="flex w-full h-full justify-center items-center bg-white">
            <div className="text-center p-6">
              <div className="text-gray-500 text-lg mb-2">No preview available</div>
              <div className="text-gray-400 text-sm">Start building your project to see a preview</div>
            </div>
          </div>
        )}
      </div>

      {/* Logs modal */}
      {showLogsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg w-3/4 max-h-3/4 overflow-auto p-4">
            <div className="flex justify-between items-center mb-2">
              <div className="font-semibold">Preview Logs</div>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchLogs(200)}
                  className="px-2 py-1 bg-gray-100 rounded"
                >Refresh</button>
                <button onClick={() => setShowLogsModal(false)} className="px-2 py-1 bg-red-100 rounded">Close</button>
              </div>
            </div>
            <pre className="text-xs whitespace-pre-wrap bg-gray-100 p-2 rounded">{isFetchingLogs ? 'Loading logs...' : logs}</pre>
          </div>
        </div>
      )}
    </div>
  );
});
