import React, { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { getInitialLangCode } from "../components/LanguageSelector";
import type { UserIdentity } from "../utils/identity";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getFilesDelta } from "./editor/shared";
import { useEditorChrome } from "./editor/useEditorChrome";
import { useEditorAutoHide } from "./editor/useEditorAutoHide";
import { useEditorIdentity } from "./editor/useEditorIdentity";
import { EditorDialogs } from "./editor/EditorDialogs";
import { EditorView } from "./editor/EditorView";
import { useLibraryImportFromUrl } from "./editor/useLibraryImportFromUrl";
import { useEditorSnapshotGuards } from "./editor/useEditorSnapshotGuards";
import { useEditorSceneLoader } from "./editor/useEditorSceneLoader";
import { useEditorCollaboration } from "./editor/useEditorCollaboration";
import { useEditorPersistence } from "./editor/useEditorPersistence";
import { useEditorCanvasHandlers } from "./editor/useEditorCanvasHandlers";
import { useEditorCommands } from "./editor/useEditorCommands";
import { useEditorElementTracking } from "./editor/useEditorElementTracking";
import { useEditorBroadcast } from "./editor/useEditorBroadcast";
import { usePersistentExcalidrawScene } from "./editor/usePersistentExcalidrawScene";
import { useEditorTitle } from "./editor/useEditorTitle";
import {
  readDisposableDraft,
  type DisposableDraft,
} from "./editor/disposableDraft";
export const Editor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [accessLevel, setAccessLevel] = useState<"none" | "view" | "edit" | "owner">("none");
  const canEdit = accessLevel === "edit" || accessLevel === "owner";
  const { drawingName, drawingNameSourceId, setDrawingName, setDrawingTitle } = useEditorTitle();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [initialData, setInitialData] = useState<any>(null);
  const [loadedDrawingId, setLoadedDrawingId] = useState<string | null>(null);
  const sceneDrawingId = loadedDrawingId ?? id;
  const [isSceneLoading, setIsSceneLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavingOnLeave, setIsSavingOnLeave] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const { autoHideEnabled, setAutoHideEnabled } = useEditorAutoHide();
  const [langCode, setLangCode] = useState(getInitialLangCode);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const previewBackup = useRef<{
    elements: readonly any[];
    appState: any;
    files: any;
  } | null>(null);
  const { isHeaderVisible, setIsHeaderVisible } = useEditorChrome({
    drawingName,
    autoHideEnabled,
    isRenaming,
  });
  const me: UserIdentity = useEditorIdentity(user);
  const [isReady, setIsReady] = useState(false);
  const [hasCanvasApi, setHasCanvasApi] = useState(false);
  const {
    computeElementOrderSig,
    elementVersionMap,
    hasElementChanged,
    recordElementVersion,
  } = useEditorElementTracking();
  const isBootstrappingScene = useRef(true);
  const hasHydratedInitialScene = useRef(false);
  const isUnmounting = useRef(false);
  const latestElementsRef = useRef<readonly any[]>([]);
  const initialSceneElementsRef = useRef<readonly any[]>([]);
  const latestFilesRef = useRef<any>(null);
  const lastSyncedFilesRef = useRef<Record<string, any>>({});
  const lastSyncedElementOrderSigRef = useRef<string>("");
  const lastPersistedFilesRef = useRef<Record<string, any>>({});
  const latestAppStateRef = useRef<any>(null);
  const debouncedSaveRef = useRef<
    | ((
        drawingId: string,
        elements: readonly any[],
        appState: any,
        files?: Record<string, any>,
      ) => void)
    | null
  >(null);
  const currentDrawingVersionRef = useRef<number | null>(null);
  const lastPersistedElementsRef = useRef<readonly any[]>([]);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const patchedAddFilesApisRef = useRef<WeakSet<object>>(new WeakSet());
  const suspiciousBlankLoadRef = useRef(false);
  const hasSceneChangesSinceLoadRef = useRef(false);
  const disposableDraftRef = useRef<DisposableDraft | null>(null);
  const lastLocalChangeAtRef = useRef<number>(0);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const excalidrawAPI = useRef<any>(null);
  const currentDrawingIdRef = useRef(id);
  useEffect(() => {
    currentDrawingIdRef.current = sceneDrawingId;
  }, [sceneDrawingId]);
  useEffect(() => {
    disposableDraftRef.current = readDisposableDraft(location.state, id);
  }, [id, location.key, location.state]);
  const { resolveSafeSnapshot, normalizeImageElementStatus } =
    useEditorSnapshotGuards({
      lastPersistedElementsRef,
      initialSceneElementsRef,
      latestElementsRef,
    });
  useEffect(() => {
    isUnmounting.current = false;
    return () => {
      isUnmounting.current = true;
    };
  }, []);
  const { socketMeRef, socketRef, isSyncing, onPointerUpdate } =
    useEditorCollaboration({
      drawingId: loadedDrawingId === id ? id : undefined,
      me,
      isReady,
      excalidrawAPI,
      lastSyncedFilesRef,
      lastSyncedElementOrderSigRef,
      latestElementsRef,
      latestFilesRef,
      computeElementOrderSig,
      recordElementVersion,
    });
  const emitFilesDeltaIfNeeded = useCallback(
    (nextFiles: Record<string, any>) => {
      if (!socketRef.current || !sceneDrawingId) return false;
      const filesDelta = getFilesDelta(
        lastSyncedFilesRef.current,
        nextFiles || {},
      );
      if (Object.keys(filesDelta).length === 0) return false;
      latestFilesRef.current = nextFiles;
      lastSyncedFilesRef.current = nextFiles;
      socketRef.current.emit("element-update", {
        drawingId: sceneDrawingId,
        elements: [],
        files: filesDelta,
        userId: socketMeRef.current.id,
      });
      return true;
    },
    [sceneDrawingId, socketMeRef, socketRef],
  );
  const emitFilesDeltaIfNeededRef = useRef(emitFilesDeltaIfNeeded);
  useEffect(() => {
    emitFilesDeltaIfNeededRef.current = emitFilesDeltaIfNeeded;
  }, [emitFilesDeltaIfNeeded]);
  const setExcalidrawAPI = useCallback(
    (api: any) => {
      excalidrawAPI.current = api;
      if (import.meta.env.DEV) {
        (window as any).__EXCALIDASH_EXCALIDRAW_API__ = api;
      }
      if (
        api &&
        typeof api.addFiles === "function" &&
        !patchedAddFilesApisRef.current.has(api as object)
      ) {
        patchedAddFilesApisRef.current.add(api as object);
        const originalAddFiles = api.addFiles.bind(api);
        api.addFiles = (filesInput: Record<string, any> | any[]) => {
          const normalizedFiles = Array.isArray(filesInput)
            ? filesInput
            : Object.values(filesInput || {});
          originalAddFiles(normalizedFiles);
          if (isSyncing.current) return;
          const nextFiles = api.getFiles?.() || {};
          const didEmit = emitFilesDeltaIfNeededRef.current(nextFiles);
          const currentDrawingId = currentDrawingIdRef.current;
          if (
            didEmit &&
            currentDrawingId &&
            latestAppStateRef.current &&
            debouncedSaveRef.current
          ) {
            disposableDraftRef.current = null;
            hasSceneChangesSinceLoadRef.current = true;
            debouncedSaveRef.current(
              currentDrawingId,
              latestElementsRef.current,
              latestAppStateRef.current,
              latestFilesRef.current || {},
            );
          }
        };
      }
      setHasCanvasApi(Boolean(api));
    },
    [isSyncing],
  );
  const handleSceneHydrated = useCallback(() => setIsReady(true), []);
  usePersistentExcalidrawScene({
    drawingId: id,
    loadedDrawingId,
    initialData,
    hasCanvasApi,
    excalidrawAPI,
    isSyncing,
    onHydrated: handleSceneHydrated,
  });
  useLibraryImportFromUrl({ excalidrawAPIRef: excalidrawAPI, isReady, user });
  const persistenceRefs = React.useMemo(
    () => ({
      currentDrawingVersion: currentDrawingVersionRef,
      debouncedSave: debouncedSaveRef,
      excalidrawAPI,
      isSyncing,
      isUnmounting,
      lastLocalChangeAt: lastLocalChangeAtRef,
      lastPersistedElements: lastPersistedElementsRef,
      lastPersistedFiles: lastPersistedFilesRef,
      lastSyncedFiles: lastSyncedFilesRef,
      latestAppState: latestAppStateRef,
      latestElements: latestElementsRef,
      latestFiles: latestFilesRef,
      saveQueue: saveQueueRef,
      suspiciousBlankLoad: suspiciousBlankLoadRef,
    }),
    [isSyncing],
  );
  const {
    cancelPendingSceneSaves,
    debouncedSave,
    debouncedSaveLibrary,
    debouncedSavePreview,
    enqueueSceneSave,
    saveDataRef,
    savePreviewRef,
  } = useEditorPersistence({
    refs: persistenceRefs,
    user,
    normalizeImageElementStatus,
    resolveSafeSnapshot,
    onSaveStateChange: setSaveStatus,
  });
  const markSceneChangedSinceLoad = useCallback(() => {
    disposableDraftRef.current = null;
    hasSceneChangesSinceLoadRef.current = true;
  }, []);
  const broadcastChanges = useEditorBroadcast({
    drawingId: sceneDrawingId,
    excalidrawAPI,
    lastLocalChangeAtRef,
    lastSyncedElementOrderSigRef,
    lastSyncedFilesRef,
    latestAppStateRef,
    latestFilesRef,
    socketMeRef,
    socketRef,
    debouncedSave,
    debouncedSavePreview,
    computeElementOrderSig,
    hasElementChanged,
    normalizeImageElementStatus,
    recordElementVersion,
    setHasSceneChangesSinceLoad: markSceneChangedSinceLoad,
  });
  const sceneLoaderRefs = React.useMemo(
    () => ({
      elementVersionMap,
      saveQueue: saveQueueRef,
      latestElements: latestElementsRef,
      initialSceneElements: initialSceneElementsRef,
      latestFiles: latestFilesRef,
      lastSyncedFiles: lastSyncedFilesRef,
      lastSyncedElementOrderSig: lastSyncedElementOrderSigRef,
      lastPersistedFiles: lastPersistedFilesRef,
      currentDrawingVersion: currentDrawingVersionRef,
      lastPersistedElements: lastPersistedElementsRef,
      suspiciousBlankLoad: suspiciousBlankLoadRef,
      hasSceneChangesSinceLoad: hasSceneChangesSinceLoadRef,
      latestAppState: latestAppStateRef,
      isBootstrappingScene,
      hasHydratedInitialScene,
    }),
    [elementVersionMap],
  );
  useEditorSceneLoader({
    id,
    user,
    location,
    navigate,
    refs: sceneLoaderRefs,
    setAccessLevel,
    setDrawingTitle,
    setInitialData,
    setLoadedDrawingId,
    setIsReady,
    setIsSceneLoading,
    setLoadError,
    recordElementVersion,
  });
  const canvasHandlerRefs = React.useMemo(
    () => ({
      debouncedSave: debouncedSaveRef,
      excalidrawAPI,
      hasHydratedInitialScene,
      hasSceneChangesSinceLoad: hasSceneChangesSinceLoadRef,
      initialSceneElements: initialSceneElementsRef,
      isBootstrappingScene,
      isSyncing,
      isUnmounting,
      lastLocalChangeAt: lastLocalChangeAtRef,
      latestAppState: latestAppStateRef,
      latestElements: latestElementsRef,
      latestFiles: latestFilesRef,
      suspiciousBlankLoad: suspiciousBlankLoadRef,
    }),
    [isSyncing],
  );
  const { handleCanvasChange, handleCanvasDropCapture } =
    useEditorCanvasHandlers({
      canEdit,
      debouncedSavePreview,
      drawingId: sceneDrawingId,
      emitFilesDeltaIfNeeded,
      isReady,
      refs: canvasHandlerRefs,
      resolveSafeSnapshot,
      broadcastChanges,
    });
  const commandRefs = React.useMemo(
    () => ({
      disposableDraft: disposableDraftRef,
      excalidrawAPI,
      hasSceneChangesSinceLoad: hasSceneChangesSinceLoadRef,
      latestFiles: latestFilesRef,
      saveData: saveDataRef,
      savePreview: savePreviewRef,
      suspiciousBlankLoad: suspiciousBlankLoadRef,
    }),
    [saveDataRef, savePreviewRef],
  );
  const {
    handleBackClick,
    handleDrawingSwitch,
    handleExportClick,
    handleLibraryChange,
    handleRenameStart,
    handleRenameSubmit,
    handleToggleAutoHide,
    navigateAfterSave,
  } = useEditorCommands({
    autoHideEnabled,
    canEdit,
    cancelPendingSceneSaves,
    debouncedSaveLibrary,
    drawingId: id,
    drawingName,
    enqueueSceneSave,
    isSavingOnLeave,
    newName,
    refs: commandRefs,
    resolveSafeSnapshot,
    setAutoHideEnabled,
    setDrawingName,
    setDrawingTitle,
    setIsHeaderVisible,
    setIsRenaming,
    setIsSavingOnLeave,
    setNewName,
    user,
  });
  return (
    <>
      <EditorView
        id={id}
        autoHideEnabled={autoHideEnabled}
        canEdit={canEdit}
        drawingName={drawingName}
        editorContainerRef={editorContainerRef}
        initialData={initialData}
        drawingNameSourceId={drawingNameSourceId}
        isHeaderVisible={isHeaderVisible}
        isRenaming={isRenaming}
        isSavingOnLeave={isSavingOnLeave}
        isSceneLoading={isSceneLoading}
        saveStatus={saveStatus}
        langCode={langCode}
        loadError={loadError}
        newName={newName}
        theme={theme}
        onBackClick={handleBackClick}
        onCanvasChange={handleCanvasChange}
        onCanvasDropCapture={handleCanvasDropCapture}
        onDrawingSwitch={handleDrawingSwitch}
        onDrawingRenamed={(drawingId, name) => {
          if (drawingId === id) setDrawingTitle(drawingId, name);
        }}
        onExportClick={handleExportClick}
        onLibraryChange={handleLibraryChange}
        onNavigateTo={navigateAfterSave}
        onNewNameChange={setNewName}
        onPointerUpdate={onPointerUpdate}
        onRenameBlur={() => setIsRenaming(false)}
        onRenameStart={handleRenameStart}
        onRenameSubmit={handleRenameSubmit}
        onSetExcalidrawAPI={setExcalidrawAPI}
        onSetLangCode={setLangCode}
        onHistoryOpen={() => setIsHistoryOpen(true)}
        onToggleAutoHide={handleToggleAutoHide}
      />
      <EditorDialogs
        drawingId={id}
        excalidrawAPIRef={excalidrawAPI}
        isHistoryOpen={isHistoryOpen}
        previewBackupRef={previewBackup}
        onCloseHistory={() => setIsHistoryOpen(false)}
      />
    </>
  );
};
