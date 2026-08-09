import { useState } from "react";
import { ExternalLink, Loader2, PackagePlus, Plug, Trash2 } from "lucide-react";
import { usePlugins } from "../../plugins/PluginProvider";
import type { PluginPermission } from "../../plugins/types";

const permissionLabels: Record<PluginPermission, string> = {
  "canvas:read": "Read canvas content",
  "canvas:write": "Change canvas content",
  network: "Connect to the internet",
  "preferences:read": "Read plugin settings",
  "preferences:write": "Store plugin settings",
};

export const PluginManagerCard = () => {
  const { plugins, enabledEmbeddedPlugins, install, uninstall, setEnabled } = usePlugins();
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await install(source);
      setSource("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not install plugin");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
      <div className="flex flex-col gap-4 border-b border-zinc-200 p-5 dark:border-zinc-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
            <Plug size={18} />
            <span className="text-xs font-bold uppercase tracking-[0.14em]">Tool shelf</span>
          </div>
          <h2 className="mt-1 text-xl font-bold text-zinc-950 dark:text-white">Plugins</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Enable bundled tools or install a plugin from its manifest URL or GitHub repository. External plugins start disabled so you can review their permissions first.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {enabledEmbeddedPlugins.length + plugins.filter((plugin) => !plugin.embedded && plugin.enabled).length} active
        </span>
      </div>

      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {plugins.map((plugin) => (
          <article key={plugin.manifest.id} className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-zinc-950 dark:text-white">{plugin.manifest.name}</h3>
                <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">v{plugin.manifest.version}</span>
                {plugin.embedded && <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">Bundled</span>}
              </div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{plugin.manifest.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {plugin.manifest.permissions.map((permission) => (
                  <span key={permission} className="rounded-md border border-zinc-200 px-2 py-1 text-[10px] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                    {permissionLabels[permission]}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              {plugin.manifest.homepage && (
                <a href={plugin.manifest.homepage} target="_blank" rel="noopener noreferrer" className="workspace-focus rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label={`Open ${plugin.manifest.name} homepage`}>
                  <ExternalLink size={16} />
                </a>
              )}
              {!plugin.embedded && (
                <button type="button" onClick={() => uninstall(plugin.manifest.id)} className="workspace-focus rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40" aria-label={`Uninstall ${plugin.manifest.name}`}>
                  <Trash2 size={16} />
                </button>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={plugin.enabled}
                onClick={() => setEnabled(plugin.manifest.id, !plugin.enabled)}
                className={`workspace-focus relative h-7 w-12 rounded-full transition-colors ${plugin.enabled ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
                aria-label={`${plugin.enabled ? "Disable" : "Enable"} ${plugin.manifest.name}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${plugin.enabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </article>
        ))}
      </div>

      <form onSubmit={handleInstall} className="border-t border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-950/40">
        <label htmlFor="plugin-source" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Install from link</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="plugin-source"
            type="url"
            required
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="https://github.com/owner/localdraw-plugin"
            className="workspace-focus h-11 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 font-mono text-xs text-zinc-950 placeholder:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          />
          <button type="submit" disabled={busy} className="workspace-focus inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <PackagePlus size={16} />}
            Install
          </button>
        </div>
        {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700 dark:text-red-400">{error}</p>}
      </form>
    </section>
  );
};
