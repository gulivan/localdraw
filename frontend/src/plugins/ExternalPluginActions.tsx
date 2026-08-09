import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CaptureUpdateAction, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { Loader2, Puzzle, X } from "lucide-react";
import { toast } from "sonner";
import { usePlugins } from "./PluginProvider";
import { runExternalPluginAction, type ExternalPluginActionResult } from "./externalRuntime";
import { readPluginSettings } from "./storage";
import type { InstalledPlugin, PluginEditorActionManifest, PluginEditorContext } from "./types";

const MAX_RESULT_FILES = 10;
const MAX_RESULT_DATA_URL = 20 * 1024 * 1024;

const applyResult = (api: any, result: ExternalPluginActionResult, canWrite: boolean): void => {
  if ((result.elements?.length || result.files?.length) && !canWrite) {
    throw new Error("Plugin returned canvas changes without canvas:write permission");
  }
  const files = (result.files || []).slice(0, MAX_RESULT_FILES).map((file) => {
    if (!file || typeof file.id !== "string" || typeof file.mimeType !== "string" || typeof file.dataURL !== "string") throw new Error("Plugin returned an invalid file");
    if (!file.dataURL.startsWith("data:image/") || file.dataURL.length > MAX_RESULT_DATA_URL) throw new Error("Plugin returned an unsupported image payload");
    return { ...file, created: file.created || Date.now() };
  });
  if (files.length) api.addFiles(files);
  if (result.elements?.length) {
    const added = convertToExcalidrawElements(result.elements as any[], { regenerateIds: true });
    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), ...added],
      appState: { selectedElementIds: Object.fromEntries(added.map((element) => [element.id, true])) },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }
  if (result.message) toast.success(result.message);
};

const ExternalActionDialog = ({ plugin, action, selectedCount, api, onClose }: { plugin: InstalledPlugin; action: PluginEditorActionManifest; selectedCount: number; api: any; onClose: () => void }) => {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const appState = api.getAppState?.() || {};
      const selectedIds = appState.selectedElementIds || {};
      const canRead = plugin.manifest.permissions.includes("canvas:read");
      const selectedElements = canRead ? (api.getSceneElements?.() || []).filter((element: any) => selectedIds[element.id] && !element.isDeleted) : undefined;
      const settings = plugin.manifest.permissions.includes("preferences:read") ? readPluginSettings(plugin.manifest.id) : undefined;
      const result = await runExternalPluginAction(plugin, action.id, { prompt, selectedElements, settings });
      applyResult(api, result, plugin.manifest.permissions.includes("canvas:write"));
      onClose();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Plugin action failed");
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/55 p-4" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="external-plugin-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_70px_rgba(24,24,27,0.28)] dark:border-zinc-700 dark:bg-zinc-900">
        <header className="flex items-start justify-between border-b border-zinc-200 p-5 dark:border-zinc-800"><div><span className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">{plugin.manifest.name}</span><h2 id="external-plugin-title" className="mt-1 text-xl font-bold">{action.label}</h2>{action.description && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{action.description}</p>}</div><button type="button" onClick={onClose} disabled={busy} className="workspace-focus rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close plugin action"><X size={18} /></button></header>
        <div className="space-y-3 p-5"><label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Prompt<textarea autoFocus rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} className="workspace-focus mt-1.5 w-full resize-y rounded-xl border border-zinc-300 bg-zinc-100 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800" /></label><p className="text-[11px] text-zinc-500">{selectedCount} selected element{selectedCount === 1 ? "" : "s"} · runs in an isolated worker</p>{error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}</div>
        <footer className="flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40"><button type="button" onClick={onClose} disabled={busy} className="workspace-focus rounded-xl px-4 py-2 text-sm font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-800">Cancel</button><button type="submit" disabled={busy} className="workspace-focus inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60">{busy && <Loader2 size={15} className="animate-spin" />}Run action</button></footer>
      </form>
    </div>,
    document.body,
  );
};
export const ExternalPluginActions = ({ canEdit, excalidrawAPI }: PluginEditorContext) => {
  const { plugins } = usePlugins();
  const [selectedCount, setSelectedCount] = useState(0);
  const [active, setActive] = useState<{ plugin: InstalledPlugin; action: PluginEditorActionManifest } | null>(null);
  const api = excalidrawAPI.current;
  useEffect(() => {
    if (!api?.onChange) return;
    const update = (_elements: readonly any[], appState: any) => setSelectedCount(Object.values(appState?.selectedElementIds || {}).filter(Boolean).length);
    update([], api.getAppState?.());
    return api.onChange(update);
  }, [api]);
  if (!canEdit || !api) return null;
  const actions = plugins.flatMap((plugin) => plugin.enabled && !plugin.embedded ? (plugin.manifest.contributes?.editorActions || []).map((action) => ({ plugin, action })) : []);
  return (
    <>
      {actions.map(({ plugin, action }) => (
        <button key={`${plugin.manifest.id}:${action.id}`} type="button" disabled={action.selection === "required" && selectedCount === 0} onClick={() => setActive({ plugin, action })} className="workspace-focus inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800" title={action.description}>
          <Puzzle size={14} /> {action.label}
        </button>
      ))}
      {active && <ExternalActionDialog plugin={active.plugin} action={active.action} selectedCount={selectedCount} api={api} onClose={() => setActive(null)} />}
    </>
  );
};
