import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { AI_PROVIDERS, providerFor, type AiProfile } from "./aiProfiles";
import { loadModelCatalog, type ModelCatalogEntry } from "./modelCatalog";

export const AiProfileFields = ({ profile, modelKind, onChange }: {
  profile: AiProfile;
  modelKind: "chat" | "image";
  onChange: (profile: AiProfile) => void;
}) => {
  const [models, setModels] = useState<ModelCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const model = modelKind === "image" ? profile.imageModel : profile.chatModel;
  const matchingModels = useMemo(() => models.filter((entry) =>
    entry.providerId === profile.providerId && (modelKind !== "image" || entry.output.includes("image")),
  ).slice(0, 120), [modelKind, models, profile.providerId]);
  const refresh = () => {
    setLoading(true);
    void loadModelCatalog().then(setModels).catch(() => setModels([])).finally(() => setLoading(false));
  };
  useEffect(refresh, []);
  const setModel = (value: string) => onChange({ ...profile, [modelKind === "image" ? "imageModel" : "chatModel"]: value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Provider
        <select value={profile.providerId} onChange={(event) => {
          const provider = providerFor(event.target.value);
          onChange({ ...profile, providerId: provider.id, baseUrl: provider.baseUrl, name: profile.name || provider.name });
        }} className="workspace-focus mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800">
          {AI_PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Model
        <span className="relative mt-1.5 block">
          <input list={`models-${modelKind}`} value={model} onChange={(event) => setModel(event.target.value)} placeholder="Enter any model ID" spellCheck={false} className="workspace-focus h-11 w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 pr-10 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800" />
          <button type="button" onClick={refresh} disabled={loading} aria-label="Refresh models from models.dev" className="workspace-focus absolute right-1.5 top-1.5 rounded-lg p-2 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
          <datalist id={`models-${modelKind}`}>{matchingModels.map((entry) => <option key={`${entry.providerId}:${entry.id}`} value={entry.id}>{entry.name}</option>)}</datalist>
        </span>
      </label>
      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 sm:col-span-2">API endpoint
        <input type="url" value={profile.baseUrl} onChange={(event) => onChange({ ...profile, baseUrl: event.target.value })} spellCheck={false} className="workspace-focus mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800" />
      </label>
      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 sm:col-span-2">API key
        <span className="relative mt-1.5 block"><input type={showKey ? "text" : "password"} value={profile.apiKey} onChange={(event) => onChange({ ...profile, apiKey: event.target.value })} autoComplete="off" spellCheck={false} placeholder={profile.providerId === "custom" ? "Optional for local providers" : "API key"} className="workspace-focus h-11 w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 pr-11 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800" /><button type="button" onClick={() => setShowKey((value) => !value)} className="workspace-focus absolute right-1.5 top-1.5 rounded-lg p-2 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700" aria-label={showKey ? "Hide API key" : "Show API key"}>{showKey ? <EyeOff size={15} /> : <Eye size={15} />}</button></span>
      </label>
      <p className="text-[11px] leading-5 text-zinc-500 dark:text-zinc-400 sm:col-span-2">Model suggestions are refreshed from models.dev. You can always type a model ID or use a local OpenAI-compatible endpoint.</p>
    </div>
  );
};
