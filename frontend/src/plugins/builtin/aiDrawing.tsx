/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Loader2, Settings, X } from "lucide-react";
import { AiProfilesSettings } from "../AiProfilesSettings";
import { listenForPluginAction } from "../actionEvents";
import { readActiveAiProfileId, readAiProfiles } from "../aiProfiles";
import type { EmbeddedPlugin, PluginEditorContext } from "../types";
import { AiProviderError, generateDrawingElements } from "./aiDrawingClient";

const PLUGIN_ID = "localdraw.ai-drawing";
const ACTION_ID = `${PLUGIN_ID}:create`;
const AiDrawingSettings = () => <AiProfilesSettings modelKind="chat" />;

const AiDrawingActions = ({ canEdit, excalidrawAPI, hideTrigger = false, onNavigateTo }: PluginEditorContext) => {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfiguration, setNeedsConfiguration] = useState(false);
  useEffect(() => listenForPluginAction(ACTION_ID, () => setOpen(true)), []);
  if (!canEdit || !excalidrawAPI.current) return null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    const profiles = readAiProfiles();
    const activeId = readActiveAiProfileId();
    const profile = profiles.find((item) => item.id === activeId) || profiles[0];
    if (!profile) {
      setError("Configure an AI connection before creating a drawing.");
      setNeedsConfiguration(true);
      return;
    }
    if (profile.providerId !== "custom" && !profile.apiKey.trim()) {
      setError(`Add an API key to the ${profile.name || "AI"} connection before creating a drawing.`);
      setNeedsConfiguration(true);
      return;
    }
    setBusy(true); setError(null);
    setNeedsConfiguration(false);
    try {
      const skeletons = await generateDrawingElements(profile, prompt);
      const { CaptureUpdateAction, convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
      const added = convertToExcalidrawElements(skeletons as any[], { regenerateIds: true });
      const api = excalidrawAPI.current;
      api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), ...added], appState: { selectedElementIds: Object.fromEntries(added.map((element) => [element.id, true])) }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      setOpen(false); setPrompt("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "AI drawing failed");
      setNeedsConfiguration(value instanceof AiProviderError && value.status === 401);
    }
    finally { setBusy(false); }
  };
  return <>{!hideTrigger && <button type="button" onClick={() => setOpen(true)}>Create with AI</button>}{open && createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/55 p-4" onMouseDown={(event) => event.target === event.currentTarget && !busy && setOpen(false)}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="ai-drawing-title" className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_70px_rgba(24,24,27,0.28)] dark:border-zinc-700 dark:bg-zinc-900">
        <header className="flex items-start justify-between border-b border-zinc-200 p-5 dark:border-zinc-800"><div><h2 id="ai-drawing-title" className="flex items-center gap-2 text-xl font-bold"><Bot size={19} aria-hidden="true" /> Create with AI</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Describe a diagram, plan, or visual. LocalDraw adds editable Excalidraw elements.</p></div><button type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Close AI drawing" className="workspace-focus rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X size={18} /></button></header>
        <div className="space-y-3 p-5">
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Prompt
            <textarea autoFocus rows={6} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Draw a service architecture with a web app, API, queue, and database…" className="workspace-focus mt-1.5 w-full resize-y rounded-xl border border-zinc-300 bg-zinc-100 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
          </label>
          {error && (
            <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:bg-red-950/40 dark:text-red-200">
              <p>{error}</p>
              {needsConfiguration && (
                <button type="button" onClick={() => { setOpen(false); void onNavigateTo?.(`/settings/plugins/${PLUGIN_ID}`); }} className="workspace-focus mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-100 px-3 py-2 text-xs font-bold text-red-900 hover:bg-red-200 dark:border-red-800 dark:bg-red-900/60 dark:text-red-100 dark:hover:bg-red-900">
                  <Settings size={14} /> Configure AI drawing
                </button>
              )}
            </div>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40"><button type="button" onClick={() => setOpen(false)} disabled={busy} className="workspace-focus rounded-xl px-4 py-2 text-sm font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-800">Cancel</button><button type="submit" disabled={busy || !prompt.trim()} className="workspace-focus inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">{busy && <Loader2 size={15} className="animate-spin" />}Create drawing</button></footer>
      </form>
    </div>, document.body)}</>;
};

export const aiDrawingPlugin: EmbeddedPlugin = {
  manifest: { manifestVersion: 1, id: PLUGIN_ID, name: "AI drawing", version: "1.0.0", description: "Prompt an OpenAI-compatible model to add editable elements to the canvas.", author: "LocalDraw", permissions: ["canvas:write", "network", "preferences:read", "preferences:write"], contributes: { editorActions: [{ id: "create", label: "Create with AI", description: "Add an editable diagram or drawing from a prompt." }] } },
  defaultEnabled: true,
  EditorActions: AiDrawingActions,
  SettingsPanel: AiDrawingSettings,
};
