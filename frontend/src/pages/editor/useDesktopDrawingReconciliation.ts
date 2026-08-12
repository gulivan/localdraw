import { useCallback } from "react";
import type { MutableRefObject } from "react";
import * as api from "../../api";
import { useDesktopDrawingChange } from "../../hooks/useDesktopWorkspaceEvents";
import { buildRemoteSceneUpdate } from "./shared";

type Params = {
  drawingId?: string;
  loadedDrawingId: string | null;
  excalidrawAPI: MutableRefObject<any>;
  isSyncing: MutableRefObject<boolean>;
  saveQueue: MutableRefObject<Promise<void>>;
  currentDrawingVersion: MutableRefObject<number | null>;
  lastPersistedElements: MutableRefObject<readonly any[]>;
  lastPersistedFiles: MutableRefObject<Record<string, any>>;
  latestElements: MutableRefObject<readonly any[]>;
  latestFiles: MutableRefObject<any>;
  lastSyncedFiles: MutableRefObject<Record<string, any>>;
  latestAppState: MutableRefObject<any>;
  debouncedSave: (drawingId: string, elements: readonly any[], appState: any, files?: Record<string, any>) => void;
  recordElementVersion: (element: any) => void;
};

export const useDesktopDrawingReconciliation = ({ drawingId, loadedDrawingId, excalidrawAPI, isSyncing, saveQueue, currentDrawingVersion, lastPersistedElements, lastPersistedFiles, latestElements, latestFiles, lastSyncedFiles, latestAppState, debouncedSave, recordElementVersion }: Params) => {
  const reconcile = useCallback(async () => {
    if (!drawingId || !excalidrawAPI.current || loadedDrawingId !== drawingId || isSyncing.current) return;
    try {
      await saveQueue.current.catch(() => undefined);
      const remote = await api.getDrawing(drawingId);
      if (remote.version <= (currentDrawingVersion.current ?? 0)) return;
      const localElements = excalidrawAPI.current.getSceneElementsIncludingDeleted();
      const remoteElements = remote.elements || [];
      const changedRemote = remoteElements.filter((element: any) => {
        const local = localElements.find((candidate: any) => candidate.id === element.id);
        if (!local) return true;
        const versionDelta = Number(element.version || 0) - Number(local.version || 0);
        return versionDelta > 0 || (versionDelta === 0 && Number(element.updated || 0) > Number(local.updated || 0));
      });
      const remoteIds = new Set(remoteElements.map((element: any) => element.id));
      const externallyDeleted = lastPersistedElements.current.filter((element: any) => !remoteIds.has(element.id)).map((element: any) => ({ ...element, isDeleted: true, version: Number(element.version || 0) + 1, updated: Date.now() }));
      const incomingFiles = remote.files || {};
      const { sceneUpdate, mergedElements, nextFiles } = buildRemoteSceneUpdate({ localElements, pendingElements: [...changedRemote, ...externallyDeleted], elementOrder: remoteElements.map((element: any) => element.id), lastSyncedFiles: latestFiles.current || {}, incomingFiles });
      currentDrawingVersion.current = remote.version;
      lastPersistedElements.current = remoteElements;
      lastPersistedFiles.current = incomingFiles;
      if (!sceneUpdate || !mergedElements) return;
      isSyncing.current = true;
      try {
        if (Object.keys(incomingFiles).length) excalidrawAPI.current.addFiles(Object.values(incomingFiles));
        excalidrawAPI.current.updateScene(sceneUpdate);
        latestElements.current = mergedElements;
        latestFiles.current = nextFiles;
        lastSyncedFiles.current = nextFiles;
        mergedElements.forEach(recordElementVersion);
      } finally { isSyncing.current = false; }
      const hasLocalDifference = mergedElements.some((element: any) => {
        const persisted = remoteElements.find((candidate: any) => candidate.id === element.id);
        return !persisted || Number(element.version || 0) > Number(persisted.version || 0);
      });
      if (hasLocalDifference && latestAppState.current) debouncedSave(drawingId, mergedElements, latestAppState.current, nextFiles);
    } catch (error) {
      console.warn("[Editor] Could not reconcile external canvas update", error);
    }
  }, [currentDrawingVersion, debouncedSave, drawingId, excalidrawAPI, isSyncing, lastPersistedElements, lastPersistedFiles, lastSyncedFiles, latestAppState, latestElements, latestFiles, loadedDrawingId, recordElementVersion, saveQueue]);
  useDesktopDrawingChange(drawingId, () => void reconcile());
};
