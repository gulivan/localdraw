import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorCommands } from "./useEditorCommands";

const navigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router-dom")>();
  return { ...original, useNavigate: () => navigate };
});

describe("useEditorCommands canvas switching", () => {
  beforeEach(() => navigate.mockReset());

  it("waits for the current canvas save before navigating", async () => {
    let finishSave: () => void = () => undefined;
    const pendingSave = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const enqueueSceneSave = vi.fn(() => pendingSave);
    const cancelPendingSceneSaves = vi.fn();
    const setIsSavingOnLeave = vi.fn();
    const setDrawingTitle = vi.fn();
    const elements = [{ id: "shape-1", type: "rectangle" }];
    const appState = { viewBackgroundColor: "#ffffff" };
    const files = {};
    const refs = {
      excalidrawAPI: {
        current: {
          getSceneElementsIncludingDeleted: () => elements,
          getAppState: () => appState,
          getFiles: () => files,
        },
      },
      hasSceneChangesSinceLoad: { current: true },
      latestFiles: { current: files },
      saveData: { current: vi.fn() },
      savePreview: { current: vi.fn().mockResolvedValue(undefined) },
      suspiciousBlankLoad: { current: false },
    };
    const { result } = renderHook(() =>
      useEditorCommands({
        autoHideEnabled: false,
        canEdit: true,
        cancelPendingSceneSaves,
        debouncedSaveLibrary: vi.fn(),
        drawingId: "canvas-1",
        drawingName: "Canvas 1",
        enqueueSceneSave,
        isSavingOnLeave: false,
        newName: "Canvas 1",
        refs,
        resolveSafeSnapshot: (snapshot) => ({
          snapshot: snapshot ?? [],
          prevented: false,
          staleEmptySnapshot: false,
          staleNonRenderableSnapshot: false,
        }),
        setAutoHideEnabled: vi.fn(),
        setDrawingName: vi.fn(),
        setDrawingTitle,
        setIsHeaderVisible: vi.fn(),
        setIsRenaming: vi.fn(),
        setIsSavingOnLeave,
        setNewName: vi.fn(),
        user: null,
      }),
    );

    let switchPromise!: Promise<boolean>;
    act(() => {
      switchPromise = result.current.handleDrawingSwitch("canvas-2", "Canvas 2");
    });

    await waitFor(() => expect(enqueueSceneSave).toHaveBeenCalledOnce());
    expect(cancelPendingSceneSaves).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
    expect(setDrawingTitle).not.toHaveBeenCalled();

    await act(async () => {
      finishSave();
      await switchPromise;
    });

    expect(navigate).toHaveBeenCalledWith("/editor/canvas-2");
    expect(setDrawingTitle).toHaveBeenCalledWith("canvas-2", "Canvas 2");
    expect(setIsSavingOnLeave).toHaveBeenNthCalledWith(1, true);
    expect(setIsSavingOnLeave).toHaveBeenLastCalledWith(false);
  });
});
