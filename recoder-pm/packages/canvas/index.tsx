"use client";

import "./styles/canvas.css";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import type {
  BinaryFiles,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types/types";
import { useDebouncedCallback } from "@react-hookz/web";
import deepEqual from "deep-equal";
import { useRef } from "react";
import { CanvasBackground } from "./components/background";

export type CanvasState = {
  readonly elements: readonly ExcalidrawElement[];
  readonly files: BinaryFiles;
};

type CanvasProperties = {
  readonly theme: "dark" | "light" | undefined;
  readonly onSave?: (state: CanvasState) => void;
  readonly defaultValue?: object;
  readonly autoFocus?: boolean;
  readonly editable?: boolean;
};

let hasPatchedCanvasGetContext = false;

function ensureCanvasReadbackPatch() {
  if (
    hasPatchedCanvasGetContext ||
    typeof HTMLCanvasElement === "undefined"
  ) {
    return;
  }

  const canvasPrototype = HTMLCanvasElement.prototype as HTMLCanvasElement & {
    getContext: typeof HTMLCanvasElement.prototype.getContext;
  };
  const originalGetContext = canvasPrototype.getContext;

  const patchedGetContext = (function patchedGetContext(
      this: HTMLCanvasElement,
      contextId: string,
      options?: unknown,
    ) {
    if (contextId === "2d") {
      const nextOptions =
        options && typeof options === "object"
          ? { ...(options as Record<string, unknown>), willReadFrequently: true }
          : { willReadFrequently: true };

      return originalGetContext.call(
        this,
        "2d",
        nextOptions as CanvasRenderingContext2DSettings,
      );
    }

    return originalGetContext.call(
      this,
      contextId as Parameters<typeof originalGetContext>[0],
      options as never,
    );
  }) as typeof HTMLCanvasElement.prototype.getContext;

  canvasPrototype.getContext = patchedGetContext;
  hasPatchedCanvasGetContext = true;
}

function CanvasBase({
  theme,
  defaultValue,
  onSave,
  autoFocus = true,
  editable = false,
  zenModeEnabled = false,
}: CanvasProperties & { readonly zenModeEnabled?: boolean }) {
  ensureCanvasReadbackPatch();

  const lastSnapshot = useRef<CanvasState | null>(null);

  const handleChange: ExcalidrawProps["onChange"] = (
    elements,
    _appState,
    files
  ) => {
    const newSnapshot = structuredClone({ elements, files });
    const isSame = deepEqual(lastSnapshot.current, newSnapshot);

    if (!isSame) {
      onSave?.(newSnapshot);
      lastSnapshot.current = structuredClone(newSnapshot);
    }
  };

  const debouncedHandleChange = useDebouncedCallback(handleChange, [], 500);

  return (
    <div className="not-prose relative flex flex-1 bg-background">
      <CanvasBackground />
      <Excalidraw
        autoFocus={autoFocus}
        initialData={{
          ...defaultValue,
          appState: {
            viewBackgroundColor: "transparent",
          },
        }}
        onChange={debouncedHandleChange}
        theme={theme}
        UIOptions={{
          canvasActions: {
            toggleTheme: false,
            loadScene: false,
          },
        }}
        viewModeEnabled={!editable}
        zenModeEnabled={zenModeEnabled}
      />
    </div>
  );
}

export const Canvas = (props: CanvasProperties) => (
  <CanvasBase {...props} zenModeEnabled />
);

export const CanvasBeta = (props: CanvasProperties) => <CanvasBase {...props} />;
