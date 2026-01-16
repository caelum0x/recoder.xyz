/**
 * Visibility optimization utilities for frontend
 * Help reduce resource usage when user isn't actively viewing the page
 */

/**
 * Check if document is visible
 */
export function isDocumentVisible(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible';
}

/**
 * Add visibility change listener
 * Returns cleanup function
 */
export function onVisibilityChange(callback: (visible: boolean) => void): () => void {
  if (typeof document === 'undefined') return () => {};
  
  const handler = () => {
    callback(document.visibilityState === 'visible');
  };
  
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}

/**
 * Hook to track document visibility
 */
export function useVisibility(onVisible?: () => void, onHidden?: () => void): boolean {
  if (typeof window === 'undefined') return true;
  
  let visible = isDocumentVisible();
  
  onVisibilityChange((isVisible) => {
    visible = isVisible;
    if (isVisible && onVisible) {
      onVisible();
    } else if (!isVisible && onHidden) {
      onHidden();
    }
  });
  
  return visible;
}
