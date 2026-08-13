import type React from "react";

export const PLUGIN_MANIFEST_VERSION = 1 as const;

export type PluginPermission =
  | "canvas:read"
  | "canvas:write"
  | "network"
  | "preferences:read"
  | "preferences:write";

export type PluginEditorActionManifest = {
  id: string;
  label: string;
  description?: string;
  selection?: "optional" | "required";
};

export type LocalDrawPluginManifest = {
  manifestVersion: typeof PLUGIN_MANIFEST_VERSION;
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  homepage?: string;
  entry?: string;
  permissions: PluginPermission[];
  contributes?: {
    editorActions?: PluginEditorActionManifest[];
  };
};

export type InstalledPlugin = {
  manifest: LocalDrawPluginManifest;
  source: string;
  manifestUrl: string;
  enabled: boolean;
  embedded: boolean;
  installedAt: string;
};

export type PluginEditorContext = {
  canEdit: boolean;
  excalidrawAPI: React.MutableRefObject<any>;
  hideTrigger?: boolean;
  onNavigateTo?: (destination: string) => Promise<boolean> | void;
};

export type PluginHomeContext = {
  hideTrigger?: boolean;
};

export type EmbeddedPlugin = {
  manifest: LocalDrawPluginManifest;
  defaultEnabled: boolean;
  HomeAction?: React.ComponentType<PluginHomeContext>;
  EditorActions?: React.ComponentType<PluginEditorContext>;
  SettingsPanel?: React.ComponentType;
};
