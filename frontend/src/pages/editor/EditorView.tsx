import React, { useEffect, useState } from "react";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  History,
  Loader2,
  PanelLeft,
} from "lucide-react";
import clsx from "clsx";
import { Toaster } from "sonner";
import {
  LanguageSelector,
} from "../../components/LanguageSelector";
import { UIOptions } from "./shared";
import { EditorProjectRail } from "../../components/workspace/EditorProjectRail";
import type { DisposableDraft } from "./disposableDraft";
import { readEditorSidebarScope } from "../../utils/editorSidebar";
import { usePlugins } from "../../plugins/PluginProvider";
import { ExternalPluginActions } from "../../plugins/ExternalPluginActions";
import { PluginActionMenu } from "../../plugins/PluginActionMenu";

type EditorViewProps = {
  id?: string;
  autoHideEnabled: boolean;
  canEdit: boolean;
  drawingName: string;
  drawingNameSourceId: string | null;
  editorContainerRef: React.RefObject<HTMLDivElement>;
  excalidrawAPIRef: React.MutableRefObject<any>;
  initialData: any;
  isHeaderVisible: boolean;
  isRenaming: boolean;
  isSavingOnLeave: boolean;
  isSceneLoading: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  langCode: string;
  loadError: string | null;
  newName: string;
  theme: string;
  onBackClick: () => void;
  onCanvasChange: (elements: readonly any[], appState: any, files?: Record<string, any>) => void;
  onCanvasDropCapture: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrawingSwitch: (
    drawingId: string,
    drawingName: string,
    disposableDraft?: DisposableDraft,
  ) => Promise<boolean>;
  onDrawingRenamed: (drawingId: string, drawingName: string) => void;
  onExportClick: () => void;
  onLibraryChange: (items: readonly any[]) => void;
  onNavigateTo: (destination: string) => Promise<boolean>;
  onNewNameChange: (value: string) => void;
  onPointerUpdate: (payload: any) => void;
  onRenameBlur: () => void;
  onRenameStart: () => void;
  onRenameSubmit: (event: React.FormEvent) => void;
  onSetExcalidrawAPI: (api: any) => void;
  onSetLangCode: (langCode: string) => void;
  onHistoryOpen: () => void;
  onToggleAutoHide: () => void;
};

export const EditorView: React.FC<EditorViewProps> = ({
  id,
  autoHideEnabled,
  canEdit,
  drawingName,
  drawingNameSourceId,
  editorContainerRef,
  excalidrawAPIRef,
  initialData,
  isHeaderVisible,
  isRenaming,
  isSavingOnLeave,
  isSceneLoading,
  saveStatus,
  langCode,
  loadError,
  newName,
  theme,
  onBackClick,
  onCanvasChange,
  onCanvasDropCapture,
  onDrawingSwitch,
  onDrawingRenamed,
  onExportClick,
  onLibraryChange,
  onNavigateTo,
  onNewNameChange,
  onPointerUpdate,
  onRenameBlur,
  onRenameStart,
  onRenameSubmit,
  onSetExcalidrawAPI,
  onSetLangCode,
  onHistoryOpen,
  onToggleAutoHide,
}) => {
  const { enabledEmbeddedPlugins } = usePlugins();
  const [railOpen, setRailOpen] = useState(() =>
    localStorage.getItem("excalidash-editor-project-rail") !== "closed",
  );
  const [projectScope] = useState(readEditorSidebarScope);
  useEffect(() => {
    localStorage.setItem(
      "excalidash-editor-project-rail",
      railOpen ? "open" : "closed",
    );
  }, [railOpen]);

  return (
  <div className="workspace-shell flex h-screen overflow-hidden bg-white dark:bg-neutral-950">
    {railOpen && (
      <button
        type="button"
        className="fixed inset-0 z-40 bg-zinc-950/30 md:hidden"
        onClick={() => setRailOpen(false)}
        aria-label="Close project rail"
      />
    )}
    <div className={clsx(
      "fixed inset-y-0 left-0 z-50 md:static md:z-auto",
      railOpen ? "block" : "hidden",
    )}>
      <EditorProjectRail
        drawingId={id}
        drawingName={drawingName}
        drawingNameSourceId={drawingNameSourceId}
        canEdit={canEdit}
        projectScope={projectScope}
        onSelectDrawing={onDrawingSwitch}
        onDrawingRenamed={onDrawingRenamed}
        onNavigateTo={onNavigateTo}
        onNavigate={() => window.innerWidth < 768 && setRailOpen(false)}
      />
    </div>
    <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <header
      className={clsx(
        "absolute left-0 right-0 top-0 z-10 flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-3 transition-transform duration-300 dark:border-zinc-800 dark:bg-zinc-900 sm:px-4",
        isHeaderVisible ? "translate-y-0" : "-translate-y-full",
      )}
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setRailOpen((open) => !open)}
          className="workspace-focus flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          aria-label={railOpen ? "Hide project rail" : "Show project rail"}
        >
          <PanelLeft size={19} />
        </button>
        <button
          onClick={onBackClick}
          disabled={isSavingOnLeave}
          aria-label={isSavingOnLeave ? "Saving changes before returning Home" : "Back to Home"}
          className={`workspace-focus flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-full text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-wait transition-all duration-200 ${isSavingOnLeave ? "pr-4" : ""}`}
        >
          {isSavingOnLeave ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm font-medium">Saving changes...</span>
            </>
          ) : (
            <ArrowLeft size={20} />
          )}
        </button>
        {isRenaming ? (
          <form onSubmit={onRenameSubmit}>
            <input
              autoFocus
              type="text"
              aria-label="Drawing name"
              value={newName}
              onChange={(e) => onNewNameChange(e.target.value)}
              onBlur={onRenameBlur}
              className="font-medium text-gray-900 dark:text-white bg-transparent px-2 py-1 border-2 border-indigo-500 rounded-md outline-none min-w-[200px]"
              style={{ width: `${Math.max(200, newName.length * 9 + 20)}px` }}
            />
          </form>
        ) : (
          <h1
            className="font-medium text-gray-900 dark:text-white px-2 py-1 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded cursor-text"
            onDoubleClick={onRenameStart}
          >
            {drawingName}
          </h1>
        )}
        <span
          className={clsx(
            "hidden rounded-full px-2 py-1 text-[11px] font-semibold sm:inline-flex",
            saveStatus === "error"
              ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
          )}
        >
          {saveStatus === "saving"
            ? "Saving…"
            : saveStatus === "error"
              ? "Save failed"
              : "Saved"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {enabledEmbeddedPlugins.map((plugin) => plugin.EditorActions ? (
          <plugin.EditorActions key={plugin.manifest.id} canEdit={canEdit} excalidrawAPI={excalidrawAPIRef} hideTrigger onNavigateTo={onNavigateTo} />
        ) : null)}
        <ExternalPluginActions canEdit={canEdit} excalidrawAPI={excalidrawAPIRef} hideTrigger />
        <PluginActionMenu surface="editor" editorContext={{ canEdit, excalidrawAPI: excalidrawAPIRef }} onManage={() => void onNavigateTo("/settings/plugins")} />
        {!canEdit ? (
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
            Read-only
          </span>
        ) : null}
        {canEdit && id ? (
          <button
            onClick={onHistoryOpen}
            className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
            title="Version History"
          >
            <History size={20} />
          </button>
        ) : null}
        <button
          onClick={onToggleAutoHide}
          className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
          title={autoHideEnabled ? "Disable auto-hide" : "Enable auto-hide"}
        >
          {autoHideEnabled ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
        <button
          onClick={onExportClick}
          className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
          title="Export drawing"
        >
          <Download size={20} />
        </button>
      </div>
    </header>
    <div
      ref={editorContainerRef}
      className="flex-1 w-full relative transition-[height,margin] duration-300"
      onDropCapture={onCanvasDropCapture}
      style={{
        height: isHeaderVisible ? "calc(100vh - 4rem)" : "100vh",
        marginTop: isHeaderVisible ? "4rem" : "0",
      }}
    >
      {loadError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-950 px-6">
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Unable to open drawing
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {loadError}
            </p>
          </div>
          <button
            onClick={() => void onNavigateTo("/")}
            className="px-4 py-2 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 font-semibold hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Back to dashboard
          </button>
        </div>
      ) : initialData ? (
        <Excalidraw
          theme={theme === "dark" ? "dark" : "light"}
          langCode={langCode}
          initialData={initialData}
          onChange={onCanvasChange}
          onPointerUpdate={onPointerUpdate}
          onLibraryChange={onLibraryChange}
          excalidrawAPI={onSetExcalidrawAPI}
          UIOptions={UIOptions}
          aiEnabled={import.meta.env.VITE_DESKTOP_MINIMAL !== "true"}
          showDeprecatedFonts={import.meta.env.VITE_DESKTOP_MINIMAL !== "true"}
          viewModeEnabled={!canEdit}
        >
          <MainMenu>
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            <MainMenu.DefaultItems.Help />
            {import.meta.env.VITE_DESKTOP_MINIMAL !== "true" && (
              <>
                <MainMenu.Separator />
                <MainMenu.ItemCustom>
                  <LanguageSelector langCode={langCode} onChange={onSetLangCode} />
                </MainMenu.ItemCustom>
              </>
            )}
          </MainMenu>
        </Excalidraw>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
          <span className="text-sm font-medium">
            {isSceneLoading ? "Loading drawing..." : "Preparing canvas..."}
          </span>
        </div>
      )}
      <Toaster position="bottom-center" />
    </div>
  </div>
  </div>
  );
};
