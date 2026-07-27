import { useCallback, useEffect, useRef } from "react";
import type { FormEvent, MutableRefObject } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import * as api from "../../api";
import { exportFromEditor } from "../../utils/exportUtils";
import { hasRenderableElements } from "./shared";
import type { DisposableDraft } from "./disposableDraft";

type EditorCommandRefs = {
  disposableDraft: MutableRefObject<DisposableDraft | null>;
  excalidrawAPI: MutableRefObject<any>;
  hasSceneChangesSinceLoad: MutableRefObject<boolean>;
  latestFiles: MutableRefObject<any>;
  saveData: MutableRefObject<
    | ((
        drawingId: string,
        elements: readonly any[],
        appState: any,
        files?: Record<string, any>,
      ) => Promise<void>)
    | null
  >;
  savePreview: MutableRefObject<
    | ((
        drawingId: string,
        elements: readonly any[],
        appState: any,
        files: any,
      ) => Promise<void>)
    | null
  >;
  suspiciousBlankLoad: MutableRefObject<boolean>;
};

type UseEditorCommandsParams = {
  autoHideEnabled: boolean;
  canEdit: boolean;
  cancelPendingSceneSaves: () => void;
  debouncedSaveLibrary: (items: any[]) => void;
  drawingId: string | undefined;
  drawingName: string;
  isSavingOnLeave: boolean;
  newName: string;
  refs: EditorCommandRefs;
  resolveSafeSnapshot: (candidateSnapshot?: readonly any[]) => {
    snapshot: readonly any[];
    prevented: boolean;
    staleEmptySnapshot: boolean;
    staleNonRenderableSnapshot: boolean;
  };
  enqueueSceneSave: (
    drawingId: string,
    elements: readonly any[],
    appState: any,
    files?: Record<string, any>,
    options?: { suppressErrors?: boolean },
  ) => Promise<void>;
  setAutoHideEnabled: (enabled: boolean) => void;
  setDrawingName: (name: string) => void;
  setDrawingTitle: (drawingId: string, name: string) => void;
  setIsHeaderVisible: (visible: boolean) => void;
  setIsRenaming: (isRenaming: boolean) => void;
  setIsSavingOnLeave: (isSaving: boolean) => void;
  setNewName: (name: string) => void;
  user: unknown;
};

export const useEditorCommands = ({
  autoHideEnabled,
  canEdit,
  cancelPendingSceneSaves,
  debouncedSaveLibrary,
  drawingId,
  drawingName,
  enqueueSceneSave,
  isSavingOnLeave,
  newName,
  refs,
  resolveSafeSnapshot,
  setAutoHideEnabled,
  setDrawingName,
  setDrawingTitle,
  setIsHeaderVisible,
  setIsRenaming,
  setIsSavingOnLeave,
  setNewName,
  user,
}: UseEditorCommandsParams) => {
  const navigate = useNavigate();
  const navigationInFlightRef = useRef(false);

  const cleanupDisposableDraft = useCallback(
    async (targetDrawingId: string | undefined) => {
      const draft = refs.disposableDraft.current;
      if (
        !targetDrawingId ||
        draft?.drawingId !== targetDrawingId ||
        refs.hasSceneChangesSinceLoad.current
      ) {
        return;
      }
      try {
        await api.deleteDrawingIfUntouched(draft.drawingId, draft.updatedAt);
        if (refs.disposableDraft.current?.drawingId === draft.drawingId) {
          refs.disposableDraft.current = null;
        }
      } catch (error) {
        console.warn("Failed to clean up untouched canvas", error);
      }
    },
    [refs],
  );

  useEffect(() => {
    const handleBrowserHistoryNavigation = () => {
      void cleanupDisposableDraft(drawingId);
    };
    window.addEventListener("popstate", handleBrowserHistoryNavigation);
    return () =>
      window.removeEventListener("popstate", handleBrowserHistoryNavigation);
  }, [cleanupDisposableDraft, drawingId]);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!canEdit) return;
        if (
          !(
            refs.excalidrawAPI.current &&
            refs.saveData.current &&
            refs.savePreview.current
          )
        ) {
          return;
        }
        if (!drawingId) return;
        const elements =
          refs.excalidrawAPI.current.getSceneElementsIncludingDeleted();
        const { snapshot: safeElements } = resolveSafeSnapshot(elements);
        const appState = refs.excalidrawAPI.current.getAppState();
        const files = refs.excalidrawAPI.current.getFiles() || {};
        refs.latestFiles.current = files;
        await enqueueSceneSave(drawingId, safeElements, appState, files);
        refs.savePreview.current(drawingId, safeElements, appState, files);
        toast.success("Saved changes to server");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canEdit, drawingId, enqueueSceneSave, refs, resolveSafeSnapshot]);

  const handleRenameSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!canEdit) return;
      if (newName.trim() && drawingId) {
        refs.disposableDraft.current = null;
        setDrawingName(newName);
        setIsRenaming(false);
        try {
          await api.updateDrawing(drawingId, { name: newName });
        } catch (err) {
          console.error("Failed to rename", err);
        }
      }
    },
    [
      canEdit,
      drawingId,
      newName,
      refs.disposableDraft,
      setDrawingName,
      setIsRenaming,
    ],
  );

  const handleLibraryChange = useCallback(
    (items: readonly any[]) => {
      if (!canEdit || !user) return;
      debouncedSaveLibrary([...items]);
    },
    [canEdit, debouncedSaveLibrary, user],
  );

  const saveBeforeNavigation = useCallback(async () => {
    if (
      !refs.excalidrawAPI.current ||
      !refs.saveData.current ||
      !refs.savePreview.current ||
      !canEdit ||
      !refs.hasSceneChangesSinceLoad.current ||
      !drawingId
    ) {
      return true;
    }
    cancelPendingSceneSaves();
    const elements =
      refs.excalidrawAPI.current.getSceneElementsIncludingDeleted();
    const { snapshot: safeElements } = resolveSafeSnapshot(elements);
    const appState = refs.excalidrawAPI.current.getAppState();
    const files = refs.excalidrawAPI.current.getFiles() || {};
    refs.latestFiles.current = files;
    if (
      refs.suspiciousBlankLoad.current &&
      !hasRenderableElements(safeElements)
    ) {
      toast.warning(
        "Blank scene detected on load. Skipping save to protect existing data.",
      );
      return true;
    }
    await Promise.all([
      enqueueSceneSave(drawingId, safeElements, appState, files, {
        suppressErrors: false,
      }),
      refs.savePreview.current(drawingId, safeElements, appState, files),
    ]);
    return true;
  }, [
    canEdit,
    cancelPendingSceneSaves,
    drawingId,
    enqueueSceneSave,
    refs,
    resolveSafeSnapshot,
  ]);

  const navigateAfterSave = useCallback(
    async (destination: string, nextDraft?: DisposableDraft) => {
      if (navigationInFlightRef.current || isSavingOnLeave) return false;
      navigationInFlightRef.current = true;
      setIsSavingOnLeave(true);
      try {
        const currentDraft = refs.disposableDraft.current;
        if (
          currentDraft?.drawingId === drawingId &&
          !refs.hasSceneChangesSinceLoad.current
        ) {
          cancelPendingSceneSaves();
          await cleanupDisposableDraft(drawingId);
        } else {
          await saveBeforeNavigation();
        }
        if (nextDraft) {
          navigate(destination, { state: { disposableDraft: nextDraft } });
        } else {
          navigate(destination);
        }
        return true;
      } catch (err) {
        console.error("Failed to save before navigation", err);
        toast.error("Failed to save changes. Please retry before leaving.");
        return false;
      } finally {
        navigationInFlightRef.current = false;
        setIsSavingOnLeave(false);
      }
    },
    [
      cancelPendingSceneSaves,
      cleanupDisposableDraft,
      drawingId,
      isSavingOnLeave,
      navigate,
      refs,
      saveBeforeNavigation,
      setIsSavingOnLeave,
    ],
  );

  const handleBackClick = useCallback(async () => {
    await navigateAfterSave("/");
  }, [navigateAfterSave]);

  const handleDrawingSwitch = useCallback(
    async (
      nextDrawingId: string,
      nextDrawingName: string,
      nextDraft?: DisposableDraft,
    ) => {
      if (!nextDrawingId || nextDrawingId === drawingId) return true;
      const switched = await navigateAfterSave(
        `/editor/${nextDrawingId}`,
        nextDraft,
      );
      if (switched) setDrawingTitle(nextDrawingId, nextDrawingName);
      return switched;
    },
    [drawingId, navigateAfterSave, setDrawingTitle],
  );

  const handleExportClick = useCallback(() => {
    if (!refs.excalidrawAPI.current) return;
    const elements =
      refs.excalidrawAPI.current.getSceneElementsIncludingDeleted();
    const appState = refs.excalidrawAPI.current.getAppState();
    const files = refs.excalidrawAPI.current.getFiles() || {};
    exportFromEditor(drawingName, elements, appState, files);
    toast.success("Drawing exported");
  }, [drawingName, refs]);

  const handleToggleAutoHide = useCallback(() => {
    setAutoHideEnabled(!autoHideEnabled);
    setIsHeaderVisible(true);
  }, [autoHideEnabled, setAutoHideEnabled, setIsHeaderVisible]);

  const handleRenameStart = useCallback(() => {
    if (!canEdit) return;
    setNewName(drawingName);
    setIsRenaming(true);
  }, [canEdit, drawingName, setIsRenaming, setNewName]);

  return {
    handleBackClick,
    handleDrawingSwitch,
    handleExportClick,
    handleLibraryChange,
    handleRenameStart,
    handleRenameSubmit,
    handleToggleAutoHide,
    navigateAfterSave,
  };
};
