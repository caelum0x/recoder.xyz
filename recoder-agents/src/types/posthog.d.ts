interface Window {
  posthog?: {
    capture: (event: string, properties?: Record<string, unknown>) => void;
    identify: (distinctId: string, properties?: Record<string, unknown>) => void;
    reset: () => void;
  };
  __pendingCanvasRefreshEvents?: Map<string, number>;
  $?: typeof import('jquery');
  jQuery?: typeof import('jquery');
  opera?: string;
}

interface WindowEventMap {
  'canvas-tool-updated': CustomEvent<{ canvasPath: string; timestamp: number }>;
  'locale-change': CustomEvent<string>;
}
