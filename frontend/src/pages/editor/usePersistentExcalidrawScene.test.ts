import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePersistentExcalidrawScene } from "./usePersistentExcalidrawScene";

describe("usePersistentExcalidrawScene", () => {
  it("swaps scene content through the existing Excalidraw API", async () => {
    const api = {
      addFiles: vi.fn(),
      updateScene: vi.fn(),
      scrollToContent: vi.fn(),
    };
    const excalidrawAPI = { current: api };
    const isSyncing = { current: false };
    const onHydrated = vi.fn();
    const first = {
      elements: [{ id: "first" }],
      appState: { viewBackgroundColor: "#fff" },
      files: {},
    };
    const second = {
      elements: [{ id: "second" }],
      appState: { viewBackgroundColor: "#eee" },
      files: { image: { id: "image" } },
    };
    const { rerender } = renderHook(
      ({ drawingId, initialData }) =>
        usePersistentExcalidrawScene({
          drawingId,
          loadedDrawingId: drawingId,
          initialData,
          hasCanvasApi: true,
          excalidrawAPI,
          isSyncing,
          onHydrated,
        }),
      { initialProps: { drawingId: "canvas-1", initialData: first } },
    );

    await waitFor(() => expect(api.updateScene).toHaveBeenCalledOnce());
    rerender({ drawingId: "canvas-2", initialData: second });

    await waitFor(() => expect(api.updateScene).toHaveBeenCalledTimes(2));
    expect(api.updateScene).toHaveBeenLastCalledWith(
      expect.objectContaining({ elements: second.elements, captureUpdate: "NEVER" }),
    );
    expect(api.addFiles).toHaveBeenCalledWith([second.files.image]);
    expect(api.scrollToContent).toHaveBeenLastCalledWith(second.elements, {
      fitToContent: true,
      animate: false,
    });
    expect(excalidrawAPI.current).toBe(api);
    expect(isSyncing.current).toBe(false);
    expect(onHydrated).toHaveBeenCalledTimes(2);
  });
});
