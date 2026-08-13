import { ArrowLeft, ExternalLink, Plug } from "lucide-react";
import { embeddedPlugins } from "../../plugins/builtin";
import { usePlugins } from "../../plugins/PluginProvider";
import type { PluginPermission } from "../../plugins/types";

const permissionLabels: Record<PluginPermission, string> = {
  "canvas:read": "Read canvas content",
  "canvas:write": "Change canvas content",
  network: "Connect to the internet",
  "preferences:read": "Read plugin settings",
  "preferences:write": "Store plugin settings",
};

export const PluginSettingsPage = ({ pluginId, onBack }: {
  pluginId: string;
  onBack: () => void;
}) => {
  const { plugins, setEnabled } = usePlugins();
  const installed = plugins.find((plugin) => plugin.manifest.id === pluginId);
  const embedded = embeddedPlugins.find((plugin) => plugin.manifest.id === pluginId);

  if (!installed) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300"><Plug size={17} /><span className="text-xs font-bold uppercase tracking-[0.14em]">Plugin</span></div>
        <h2 className="mt-2 text-xl font-bold">Plugin not found</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">This plugin may have been uninstalled or its link is no longer valid.</p>
        <button type="button" onClick={onBack} className="workspace-focus mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700"><ArrowLeft size={15} /> Back to plugins</button>
      </section>
    );
  }

  const SettingsPanel = embedded?.SettingsPanel;
  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="workspace-focus inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"><ArrowLeft size={15} /> Plugins</button>
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-zinc-950 dark:text-white">{installed.manifest.name}</h2>
              <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">v{installed.manifest.version}</span>
              {installed.embedded && <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">Bundled</span>}
            </div>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">{installed.manifest.description}</p>
          </div>
          <div className="flex items-center gap-3">
            {installed.manifest.homepage && <a href={installed.manifest.homepage} target="_blank" rel="noopener noreferrer" className="workspace-focus inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"><ExternalLink size={14} /> Homepage</a>}
            <button type="button" role="switch" aria-checked={installed.enabled} onClick={() => setEnabled(installed.manifest.id, !installed.enabled)} className={`workspace-focus relative h-7 w-12 rounded-full transition-colors ${installed.enabled ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-700"}`} aria-label={`${installed.enabled ? "Disable" : "Enable"} ${installed.manifest.name}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${installed.enabled ? "translate-x-6" : "translate-x-1"}`} /></button>
          </div>
        </div>
        <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Permissions</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">{installed.manifest.permissions.map((permission) => <span key={permission} className="rounded-md border border-zinc-200 px-2 py-1 text-[10px] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">{permissionLabels[permission]}</span>)}</div>
        </div>
      </section>
      {SettingsPanel ? <SettingsPanel /> : (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-bold">No additional settings</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">This plugin is ready to use when enabled. Its actions appear in the plugin shelf wherever they are available.</p>
        </section>
      )}
    </div>
  );
};
