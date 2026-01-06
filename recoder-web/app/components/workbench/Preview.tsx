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
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxRetries = 10; // 10 retries total
  const firstLoadTimeout = 45000; // First attempt: 45 seconds (matches backend health check)
  const retryLoadTimeout = 10000; // Subsequent attempts: 10 seconds

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
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

    setIsLoading(false);
    setPreviewError(null);
    setRetryCount(0);
  }, []);

  // Handle iframe error or timeout with retry logic
  const handleIframeError = useCallback((reason = 'error') => {
    console.warn(`⚠️ [Preview] Iframe load ${reason} (attempt ${retryCount + 1}/${maxRetries})`);

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
      console.error('❌ [Preview] Max retries reached, giving up');
      setIsLoading(false);
      setPreviewError('Dev server not responding after multiple retries. Check terminal for errors.');
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

    const { baseUrl } = activePreview;

    // Preview changed - reset retry state
    setRetryCount(0);
    setUrl(baseUrl);
    setIframeUrl(baseUrl);
    setPreviewError(null);
    setIsLoading(true); // Show loading initially

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
        {previewError ? (
          <div className="flex w-full h-full justify-center items-center bg-white">
            <div className="text-center p-6">
              <div className="text-red-500 text-lg mb-2"><span className="i-ph:warning" /> Preview Error</div>
              <div className="text-gray-600">{previewError}</div>
              <button
                onClick={() => {
                  setRetryCount(0);
                  setPreviewError(null);
                  setIsLoading(true);
                  if (iframeRef.current && activePreview) {
                    iframeRef.current.src = activePreview.baseUrl;
                  }
                }}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Retry
              </button>
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
                </div>
              </div>
            )}
            <iframe
              credentialless
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
    </div>
  );
});
