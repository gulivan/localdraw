/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { embeddedPlugins } from "./builtin";
import { fetchPluginManifest } from "./manifest";
import {
  readEmbeddedPluginStates,
  readExternalPlugins,
  removePluginSettings,
  writeEmbeddedPluginStates,
  writeExternalPlugins,
} from "./storage";
import type { EmbeddedPlugin, InstalledPlugin } from "./types";
import { stopExternalPlugin } from "./externalRuntime";

type PluginContextValue = {
  plugins: InstalledPlugin[];
  enabledEmbeddedPlugins: EmbeddedPlugin[];
  install: (source: string) => Promise<InstalledPlugin>;
  uninstall: (pluginId: string) => void;
  setEnabled: (pluginId: string, enabled: boolean) => void;
};

const PluginContext = createContext<PluginContextValue | null>(null);

const buildEmbeddedInstall = (
  plugin: EmbeddedPlugin,
  states: Record<string, boolean>,
): InstalledPlugin => ({
  manifest: plugin.manifest,
  source: "embedded",
  manifestUrl: "embedded",
  enabled: states[plugin.manifest.id] ?? plugin.defaultEnabled,
  embedded: true,
  installedAt: "embedded",
});

export const PluginProvider = ({ children }: { children: ReactNode }) => {
  const [embeddedStates, setEmbeddedStates] = useState(readEmbeddedPluginStates);
  const [externalPlugins, setExternalPlugins] = useState(readExternalPlugins);

  const plugins = useMemo(
    () => [
      ...embeddedPlugins.map((plugin) => buildEmbeddedInstall(plugin, embeddedStates)),
      ...externalPlugins,
    ],
    [embeddedStates, externalPlugins],
  );
  const enabledEmbeddedPlugins = useMemo(
    () => embeddedPlugins.filter((plugin) => plugins.some((installed) => installed.manifest.id === plugin.manifest.id && installed.enabled)),
    [plugins],
  );

  const install = useCallback(async (source: string) => {
    const loaded = await fetchPluginManifest(source);
    if (!loaded.manifest.entry) throw new Error("External plugin manifest must declare an entry module");
    if (embeddedPlugins.some((plugin) => plugin.manifest.id === loaded.manifest.id)) {
      throw new Error("An embedded plugin already uses this id");
    }
    const installed: InstalledPlugin = {
      ...loaded,
      source: source.trim(),
      enabled: false,
      embedded: false,
      installedAt: new Date().toISOString(),
    };
    setExternalPlugins((current) => {
      const next = [...current.filter((plugin) => plugin.manifest.id !== installed.manifest.id), installed];
      writeExternalPlugins(next);
      return next;
    });
    return installed;
  }, []);

  const uninstall = useCallback((pluginId: string) => {
    stopExternalPlugin(pluginId);
    setExternalPlugins((current) => {
      const next = current.filter((plugin) => plugin.manifest.id !== pluginId);
      writeExternalPlugins(next);
      return next;
    });
    removePluginSettings(pluginId);
  }, []);

  const setEnabled = useCallback((pluginId: string, enabled: boolean) => {
    if (embeddedPlugins.some((plugin) => plugin.manifest.id === pluginId)) {
      setEmbeddedStates((current) => {
        const next = { ...current, [pluginId]: enabled };
        writeEmbeddedPluginStates(next);
        return next;
      });
      return;
    }
    if (!enabled) stopExternalPlugin(pluginId);
    setExternalPlugins((current) => {
      const next = current.map((plugin) => plugin.manifest.id === pluginId ? { ...plugin, enabled } : plugin);
      writeExternalPlugins(next);
      return next;
    });
  }, []);

  const value = useMemo<PluginContextValue>(
    () => ({ plugins, enabledEmbeddedPlugins, install, uninstall, setEnabled }),
    [plugins, enabledEmbeddedPlugins, install, uninstall, setEnabled],
  );
  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>;
};

export const usePlugins = (): PluginContextValue => {
  const value = useContext(PluginContext);
  if (!value) throw new Error("usePlugins must be used inside PluginProvider");
  return value;
};
