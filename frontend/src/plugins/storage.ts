import type { InstalledPlugin } from "./types";

const PLUGINS_KEY = "localdraw.plugins.v1";
const ENABLED_KEY = "localdraw.plugin-enabled.v1";
const SETTINGS_PREFIX = "localdraw.plugin-settings.v1.";
const PINNED_ACTIONS_KEY = "localdraw.plugin-pins.v1";

export const readExternalPlugins = (): InstalledPlugin[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PLUGINS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object" && item.embedded === false) : [];
  } catch {
    return [];
  }
};

export const writeExternalPlugins = (plugins: InstalledPlugin[]): void => {
  window.localStorage.setItem(PLUGINS_KEY, JSON.stringify(plugins.filter((plugin) => !plugin.embedded)));
};

export const readEmbeddedPluginStates = (): Record<string, boolean> => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ENABLED_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, boolean>
      : {};
  } catch {
    return {};
  }
};

export const writeEmbeddedPluginStates = (states: Record<string, boolean>): void => {
  window.localStorage.setItem(ENABLED_KEY, JSON.stringify(states));
};

export const readPluginSettings = <T extends Record<string, unknown>>(pluginId: string): T => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${SETTINGS_PREFIX}${pluginId}`) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as T : {} as T;
  } catch {
    return {} as T;
  }
};

export const writePluginSettings = (pluginId: string, settings: Record<string, unknown>): void => {
  window.localStorage.setItem(`${SETTINGS_PREFIX}${pluginId}`, JSON.stringify(settings));
};

export const removePluginSettings = (pluginId: string): void => {
  window.localStorage.removeItem(`${SETTINGS_PREFIX}${pluginId}`);
};

export const readPinnedPluginActions = (): string[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PINNED_ACTIONS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
};

export const writePinnedPluginActions = (actionIds: string[]): void => {
  window.localStorage.setItem(PINNED_ACTIONS_KEY, JSON.stringify([...new Set(actionIds)]));
};
