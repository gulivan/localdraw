import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

const CAPTURE_UPDATE_NEVER = "NEVER" as const;

export const usePersistentExcalidrawScene = ({
  drawingId,
  loadedDrawingId,
  initialData,
  hasCanvasApi,
  excalidrawAPI,
  isSyncing,
  onHydrated,
}: {
  drawingId?: string;
  loadedDrawingId: string | null;
  initialData: any;
  hasCanvasApi: boolean;
  excalidrawAPI: MutableRefObject<any>;
  isSyncing: MutableRefObject<boolean>;
  onHydrated: () => void;
}) => {
  const hydratedDrawingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      drawingId &&
      loadedDrawingId &&
      loadedDrawingId !== drawingId
    ) {
      isSyncing.current = true;
      return;
    }
    if (
      !hasCanvasApi ||
      !excalidrawAPI.current ||
      !initialData ||
      !drawingId ||
      loadedDrawingId !== drawingId ||
      hydratedDrawingIdRef.current === drawingId
    ) {
      return;
    }
    const api = excalidrawAPI.current;
    const elements = Array.isArray(initialData.elements)
      ? initialData.elements
      : [];
    const files = initialData.files || {};
    isSyncing.current = true;
    try {
      if (Object.keys(files).length > 0) {
        api.addFiles(Object.values(files));
      }
      api.updateScene({
        elements,
        appState: initialData.appState || {},
        captureUpdate: CAPTURE_UPDATE_NEVER,
      });
      api.scrollToContent?.(elements, {
        fitToContent: true,
        animate: false,
      });
      hydratedDrawingIdRef.current = drawingId;
    } finally {
      isSyncing.current = false;
    }
    onHydrated();
  }, [
    drawingId,
    excalidrawAPI,
    hasCanvasApi,
    initialData,
    isSyncing,
    loadedDrawingId,
    onHydrated,
  ]);
};
