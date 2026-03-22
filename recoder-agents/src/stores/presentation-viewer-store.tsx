import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import React from 'react';
import { FullScreenPresentationViewer } from '@/components/thread/tool-views/presentation-tools/FullScreenPresentationViewer';

interface PresentationViewerState {
  isOpen: boolean;
  presentationName?: string;
  sandboxUrl?: string;
  sandboxId?: string;
  initialSlide?: number;

  openPresentation: (presentationName: string, sandboxUrl: string, initialSlide?: number, sandboxId?: string) => void;
  closePresentation: () => void;
}

export const usePresentationViewerStore = create<PresentationViewerState>()(
  devtools(
    (set) => ({
      isOpen: false,
      presentationName: undefined,
      sandboxUrl: undefined,
      sandboxId: undefined,
      initialSlide: undefined,

      openPresentation: (presentationName: string, sandboxUrl: string, initialSlide: number = 1, sandboxId?: string) => {
        set({
          isOpen: true,
          presentationName,
          sandboxUrl,
          sandboxId,
          initialSlide,
        });
      },

      closePresentation: () => {
        set({
          isOpen: false,
          presentationName: undefined,
          sandboxUrl: undefined,
          sandboxId: undefined,
          initialSlide: undefined,
        });
      },
    }),
    {
      name: 'presentation-viewer-store',
    }
  )
);

// Backward compatibility hook
export function usePresentationViewerContext() {
  const store = usePresentationViewerStore();
  
  return {
    openPresentation: store.openPresentation,
    closePresentation: store.closePresentation,
  };
}

// Hook for backward compatibility with usePresentationViewer
export function usePresentationViewer() {
  const store = usePresentationViewerStore();

  return {
    viewerState: {
      isOpen: store.isOpen,
      presentationName: store.presentationName,
      sandboxUrl: store.sandboxUrl,
      sandboxId: store.sandboxId,
      initialSlide: store.initialSlide,
    },
    openPresentation: store.openPresentation,
    closePresentation: store.closePresentation,
  };
}

// Component wrapper to render the FullScreenPresentationViewer
export function PresentationViewerWrapper() {
  const { isOpen, presentationName, sandboxUrl, sandboxId, initialSlide, closePresentation } = usePresentationViewerStore();

  return (
    <FullScreenPresentationViewer
      isOpen={isOpen}
      onClose={closePresentation}
      presentationName={presentationName}
      sandboxUrl={sandboxUrl}
      sandboxId={sandboxId}
      initialSlide={initialSlide}
    />
  );
}

