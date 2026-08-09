/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, ImagePlus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { readPluginSettings, writePluginSettings } from "../storage";
import type { EmbeddedPlugin, PluginEditorContext } from "../types";
import {
  DEFAULT_IMAGE_GENERATION_CONFIG,
  describeSelectedElements,
  exportSelectedElements,
  generateImages,
  normalizeImageCount,
  type ImageGenerationConfig,
} from "./imageGenerationClient";
import {
  createImageGenerationPlaceholders,
  failImageGenerationPlaceholder,
  recoverInterruptedImageGeneration,
  replaceImageGenerationPlaceholder,
  type ImageGenerationPlaceholder,
} from "./imageGenerationCanvas";

const PLUGIN_ID = "localdraw.image-generation";

const readConfig = (): ImageGenerationConfig => ({
  ...DEFAULT_IMAGE_GENERATION_CONFIG,
  ...readPluginSettings<Partial<ImageGenerationConfig>>(PLUGIN_ID),
});

const saveConfig = (config: ImageGenerationConfig) => writePluginSettings(PLUGIN_ID, config);

const ConfigFields = ({ config, onChange }: { config: ImageGenerationConfig; onChange: (config: ImageGenerationConfig) => void }) => {
  const [showKey, setShowKey] = useState(false);
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem]">
      <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 sm:col-span-3">
        API key
        <span className="relative mt-1.5 block">
          <input type={showKey ? "text" : "password"} value={config.apiKey} onChange={(event) => onChange({ ...config, apiKey: event.target.value })} autoComplete="off" spellCheck={false} placeholder="sk-…" className="workspace-focus h-11 w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 pr-11 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800" />
          <button type="button" onClick={() => setShowKey((value) => !value)} className="workspace-focus absolute right-1.5 top-1.5 rounded-lg p-2 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700" aria-label={showKey ? "Hide API key" : "Show API key"}>{showKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
        </span>
      </label>
      <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
        Provider host
        <input type="url" value={config.baseUrl} onChange={(event) => onChange({ ...config, baseUrl: event.target.value })} spellCheck={false} className="workspace-focus mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800" />
      </label>
      <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
        Model
        <input value={config.model} onChange={(event) => onChange({ ...config, model: event.target.value })} spellCheck={false} className="workspace-focus mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800" />
      </label>
      <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
        Options
        <input type="number" min={1} step={1} inputMode="numeric" value={config.count} onChange={(event) => onChange({ ...config, count: Number(event.target.value) })} className="workspace-focus mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-800" />
      </label>
    </div>
  );
};

const ImageGenerationModal = ({ open, selectedCount, onStart, onClose }: { open: boolean; selectedCount: number; onStart: (request: { config: ImageGenerationConfig; prompt: string }) => void; onClose: () => void }) => {
  const [config, setConfig] = useState(readConfig);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);
  if (!open) return null;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!prompt.trim()) return setError("Describe the image you want");
    try {
      const count = normalizeImageCount(config.count);
      const nextConfig = { ...config, count };
      saveConfig(nextConfig);
      onStart({ config: nextConfig, prompt: prompt.trim() });
      setPrompt("");
      setError(null);
      onClose();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Image generation failed");
    }
  };
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/55 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="image-generation-title" className="w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_70px_rgba(24,24,27,0.28)] dark:border-zinc-700 dark:bg-zinc-900">
        <header className="flex items-start justify-between border-b border-zinc-200 p-5 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300"><Sparkles size={17} /><span className="text-xs font-bold uppercase tracking-[0.14em]">Image generation</span></div>
            <h2 id="image-generation-title" className="mt-1 text-xl font-bold">Turn the selection into an image</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{selectedCount ? `${selectedCount} selected element${selectedCount === 1 ? "" : "s"} will be sent as a visual reference.` : "No selection: a new image will be generated from the prompt."}</p>
          </div>
          <button type="button" onClick={onClose} className="workspace-focus rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close image generation"><X size={18} /></button>
        </header>
        <div className="space-y-4 p-5">
          <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Prompt
            <textarea autoFocus rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Replace these rough shapes with a hand-drawn product illustration…" className="workspace-focus mt-1.5 w-full resize-y rounded-xl border border-zinc-300 bg-zinc-100 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
          </label>
          <ConfigFields config={config} onChange={setConfig} />
          <p className="text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">The API key stays in this browser profile. The selected canvas image and prompt are sent only to the configured provider host.</p>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
          <button type="button" onClick={onClose} className="workspace-focus rounded-xl px-4 py-2 text-sm font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-800">Cancel</button>
          <button type="submit" className="workspace-focus inline-flex min-w-32 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700"><ImagePlus size={16} />Generate{config.count > 1 ? ` ${config.count} options` : ""}</button>
        </footer>
      </form>
    </div>,
    document.body,
  );
};

const ImageGenerationShimmers = ({ api, placeholders }: { api: any; placeholders: ImageGenerationPlaceholder[] }) => {
  const [, setRevision] = useState(0);
  useEffect(() => {
    if (!api) return;
    const refresh = () => setRevision((value) => value + 1);
    const unsubscribeChange = api.onChange?.(refresh);
    const unsubscribeScroll = api.onScrollChange?.(refresh);
    window.addEventListener("resize", refresh);
    return () => {
      unsubscribeChange?.();
      unsubscribeScroll?.();
      window.removeEventListener("resize", refresh);
    };
  }, [api]);
  if (!placeholders.length) return null;
  const appState = api.getAppState?.() || {};
  const elements = api.getSceneElements?.() || [];
  const rectangles = placeholders.flatMap((placeholder) => {
    const element = elements.find((candidate: any) => candidate.id === placeholder.rectangleId);
    if (!element || element.isDeleted) return [];
    const zoom = Number(appState.zoom?.value || 1);
    const topLeft = {
      x: (Number(element.x) + Number(appState.scrollX || 0)) * zoom + Number(appState.offsetLeft || 0),
      y: (Number(element.y) + Number(appState.scrollY || 0)) * zoom + Number(appState.offsetTop || 0),
    };
    const canvasLeft = Number(appState.offsetLeft || 0);
    const canvasTop = Number(appState.offsetTop || 0);
    const left = Math.max(topLeft.x, canvasLeft);
    const top = Math.max(topLeft.y, canvasTop);
    const right = Math.min(topLeft.x + element.width * zoom, canvasLeft + Number(appState.width || window.innerWidth));
    const bottom = Math.min(topLeft.y + element.height * zoom, canvasTop + Number(appState.height || window.innerHeight));
    if (right <= left || bottom <= top) return [];
    return [{ id: element.id, x: left, y: top, width: right - left, height: bottom - top }];
  });
  return createPortal(<>{rectangles.map((rectangle) => (
    <div
      key={rectangle.id}
      aria-hidden="true"
      className="localdraw-image-generation-shimmer fixed pointer-events-none overflow-hidden"
      style={{
        left: rectangle.x,
        top: rectangle.y,
        width: rectangle.width,
        height: rectangle.height,
        borderRadius: Math.min(18, Math.max(6, rectangle.width * 0.04)),
        zIndex: 4,
      }}
    />
  ))}</>, document.body);
};

const ImageGenerationActions = ({ canEdit, excalidrawAPI }: PluginEditorContext) => {
  const [open, setOpen] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [activePlaceholders, setActivePlaceholders] = useState<ImageGenerationPlaceholder[]>([]);
  const activePlaceholderIds = useRef(new Set<string>());
  const api = excalidrawAPI.current;
  useEffect(() => {
    if (!api?.onChange) return;
    const update = (_elements: readonly any[], appState: any) => setSelectedCount(Object.values(appState?.selectedElementIds || {}).filter(Boolean).length);
    update([], api.getAppState?.());
    return api.onChange(update);
  }, [api]);
  useEffect(() => {
    if (!api) return;
    const timer = window.setTimeout(() => {
      void recoverInterruptedImageGeneration(api, activePlaceholderIds.current);
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [api]);
  if (!canEdit || !api) return null;
  const startGeneration = ({ config, prompt }: { config: ImageGenerationConfig; prompt: string }) => {
    const selectionContext = describeSelectedElements(api);
    const reference = exportSelectedElements(api);
    void (async () => {
      let placeholders: ImageGenerationPlaceholder[];
      try {
        placeholders = await createImageGenerationPlaceholders(api, config.count);
      } catch (value) {
        toast.error(value instanceof Error ? value.message : "Could not create image placeholders");
        return;
      }
      placeholders.forEach((placeholder) => activePlaceholderIds.current.add(placeholder.rectangleId));
      setActivePlaceholders((current) => [...current, ...placeholders]);
      toast.message(`${config.count === 1 ? "Image" : `${config.count} images`} generating on the canvas`);
      try {
        const images = await generateImages({ config, prompt, reference: await reference, selectionContext });
        for (let index = 0; index < placeholders.length; index += 1) {
          const image = images[index];
          if (!image) {
            await failImageGenerationPlaceholder(api, placeholders[index], `The provider returned ${images.length} of ${placeholders.length} requested images.`);
            continue;
          }
          try {
            await replaceImageGenerationPlaceholder(api, placeholders[index], image);
          } catch (value) {
            await failImageGenerationPlaceholder(api, placeholders[index], value instanceof Error ? value.message : "Could not add the generated image");
          }
        }
        toast.success(`${Math.min(images.length, placeholders.length)} generated image${Math.min(images.length, placeholders.length) === 1 ? "" : "s"} added`);
      } catch (value) {
        const message = value instanceof Error ? value.message : "Image generation failed";
        for (const placeholder of placeholders) {
          await failImageGenerationPlaceholder(api, placeholder, message);
        }
        toast.error("Image generation failed — see the canvas for details");
      } finally {
        const completed = new Set(placeholders.map((placeholder) => placeholder.rectangleId));
        completed.forEach((id) => activePlaceholderIds.current.delete(id));
        setActivePlaceholders((current) => current.filter((placeholder) => !completed.has(placeholder.rectangleId)));
      }
    })();
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="workspace-focus inline-flex h-9 items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-700 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300" title="Generate an image from the selected elements">
        <Sparkles size={15} /> Generate image{activePlaceholders.length > 0 ? ` · ${activePlaceholders.length} running` : selectedCount > 0 ? ` · ${selectedCount}` : ""}
      </button>
      <ImageGenerationModal open={open} selectedCount={selectedCount} onStart={startGeneration} onClose={() => setOpen(false)} />
      <ImageGenerationShimmers api={api} placeholders={activePlaceholders} />
    </>
  );
};

const ImageGenerationSettings = () => {
  const [config, setConfig] = useState(readConfig);
  const saved = useMemo(() => Boolean(config.apiKey.trim()), [config.apiKey]);
  return (
    <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-start justify-between gap-4"><div><h2 className="font-bold">Image generation</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">OpenAI-compatible Image API configuration for the bundled plugin.</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${saved ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}>{saved ? "Key configured" : "Key required"}</span></div>
      <ConfigFields config={config} onChange={(next) => { setConfig(next); saveConfig(next); }} />
    </section>
  );
};

export const imageGenerationPlugin: EmbeddedPlugin = {
  manifest: {
    manifestVersion: 1,
    id: PLUGIN_ID,
    name: "Image generation",
    version: "1.0.0",
    description: "Generate an image from a prompt and optional selected canvas elements using an OpenAI-compatible Image API.",
    author: "LocalDraw",
    permissions: ["canvas:read", "canvas:write", "network", "preferences:read", "preferences:write"],
  },
  defaultEnabled: true,
  EditorActions: ImageGenerationActions,
  SettingsPanel: ImageGenerationSettings,
};
