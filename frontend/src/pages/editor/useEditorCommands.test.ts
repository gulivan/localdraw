import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorCommands } from "./useEditorCommands";
import type { DisposableDraft } from "./disposableDraft";

const navigate = vi.fn();
const deleteDrawingIfUntouched = vi.fn();
const updateDrawing = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router-dom")>();
  return { ...original, useNavigate: () => navigate };
});

vi.mock("../../api", () => ({
  deleteDrawingIfUntouched: (...args: unknown[]) =>
    deleteDrawingIfUntouched(...args),
  updateDrawing: (...args: unknown[]) => updateDrawing(...args),
  isAxiosError: () => false,
}));

describe("useEditorCommands canvas switching", () => {
  beforeEach(() => {
    navigate.mockReset();
    deleteDrawingIfUntouched.mockReset();
    deleteDrawingIfUntouched.mockResolvedValue(true);
    updateDrawing.mockReset();
  });

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
      disposableDraft: { current: null },
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

  it("deletes a newly created canvas when leaving it untouched", async () => {
    const cancelPendingSceneSaves = vi.fn();
    const enqueueSceneSave = vi.fn().mockResolvedValue(undefined);
    const refs = {
      disposableDraft: {
        current: {
          drawingId: "canvas-1",
          updatedAt: 1_700_000_000_000,
        } as DisposableDraft | null,
      },
      excalidrawAPI: { current: null },
      hasSceneChangesSinceLoad: { current: false },
      latestFiles: { current: {} },
      saveData: { current: null },
      savePreview: { current: null },
      suspiciousBlankLoad: { current: false },
    };
    const { result } = renderHook(() =>
      useEditorCommands({
        autoHideEnabled: false,
        canEdit: true,
        cancelPendingSceneSaves,
        debouncedSaveLibrary: vi.fn(),
        drawingId: "canvas-1",
        drawingName: "Untitled Canvas",
        enqueueSceneSave,
        isSavingOnLeave: false,
        newName: "Untitled Canvas",
        refs,
        resolveSafeSnapshot: (snapshot) => ({
          snapshot: snapshot ?? [],
          prevented: false,
          staleEmptySnapshot: false,
          staleNonRenderableSnapshot: false,
        }),
        setAutoHideEnabled: vi.fn(),
        setDrawingName: vi.fn(),
        setDrawingTitle: vi.fn(),
        setIsHeaderVisible: vi.fn(),
        setIsRenaming: vi.fn(),
        setIsSavingOnLeave: vi.fn(),
        setNewName: vi.fn(),
        user: null,
      }),
    );

    await act(async () => {
      await result.current.handleBackClick();
    });

    expect(cancelPendingSceneSaves).toHaveBeenCalledOnce();
    expect(deleteDrawingIfUntouched).toHaveBeenCalledWith(
      "canvas-1",
      1_700_000_000_000,
    );
    expect(enqueueSceneSave).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/");
    expect(refs.disposableDraft.current).toBeNull();
  });

  it("keeps the current canvas when adding another canvas", async () => {
    const cancelPendingSceneSaves = vi.fn();
    const enqueueSceneSave = vi.fn().mockResolvedValue(undefined);
    const refs = {
      disposableDraft: {
        current: {
          drawingId: "canvas-1",
          updatedAt: 1_700_000_000_000,
        } as DisposableDraft | null,
      },
      excalidrawAPI: { current: null },
      hasSceneChangesSinceLoad: { current: false },
      latestFiles: { current: {} },
      saveData: { current: null },
      savePreview: { current: null },
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
        setDrawingTitle: vi.fn(),
        setIsHeaderVisible: vi.fn(),
        setIsRenaming: vi.fn(),
        setIsSavingOnLeave: vi.fn(),
        setNewName: vi.fn(),
        user: null,
      }),
    );
    const nextDraft = {
      drawingId: "canvas-2",
      updatedAt: 1_700_000_000_100,
    };

    await act(async () => {
      await result.current.handleDrawingSwitch(
        "canvas-2",
        "Canvas 2",
        nextDraft,
      );
    });

    expect(deleteDrawingIfUntouched).not.toHaveBeenCalled();
    expect(cancelPendingSceneSaves).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/editor/canvas-2", {
      state: { disposableDraft: nextDraft },
    });
  });

  it("keeps a new canvas after it has been edited", async () => {
    const refs = {
      disposableDraft: { current: null },
      excalidrawAPI: {
        current: {
          getSceneElementsIncludingDeleted: () => [
            { id: "shape-1", type: "rectangle" },
          ],
          getAppState: () => ({}),
          getFiles: () => ({}),
        },
      },
      hasSceneChangesSinceLoad: { current: true },
      latestFiles: { current: {} },
      saveData: { current: vi.fn() },
      savePreview: { current: vi.fn().mockResolvedValue(undefined) },
      suspiciousBlankLoad: { current: false },
    };
    const enqueueSceneSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useEditorCommands({
        autoHideEnabled: false,
        canEdit: true,
        cancelPendingSceneSaves: vi.fn(),
        debouncedSaveLibrary: vi.fn(),
        drawingId: "canvas-1",
        drawingName: "Untitled Canvas",
        enqueueSceneSave,
        isSavingOnLeave: false,
        newName: "Untitled Canvas",
        refs,
        resolveSafeSnapshot: (snapshot) => ({
          snapshot: snapshot ?? [],
          prevented: false,
          staleEmptySnapshot: false,
          staleNonRenderableSnapshot: false,
        }),
        setAutoHideEnabled: vi.fn(),
        setDrawingName: vi.fn(),
        setDrawingTitle: vi.fn(),
        setIsHeaderVisible: vi.fn(),
        setIsRenaming: vi.fn(),
        setIsSavingOnLeave: vi.fn(),
        setNewName: vi.fn(),
        user: null,
      }),
    );

    await act(async () => {
      await result.current.handleBackClick();
    });

    expect(deleteDrawingIfUntouched).not.toHaveBeenCalled();
    expect(enqueueSceneSave).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/");
  });
});
