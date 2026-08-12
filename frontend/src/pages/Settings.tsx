import React, { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import * as api from "../api";
import { useTheme } from "../context/ThemeContext";
import { SettingsMainGrid } from "./settings/SettingsMainGrid";
import { displayFontFamily } from "../utils/displayFont";
import { isDesktopApp } from "../utils/productBrand";
import { WorkspaceSettingsCard } from "./settings/WorkspaceSettingsCard";
import { SettingsFooter } from "./settings/SettingsFooter";
import { PluginManagerCard } from "./settings/PluginManagerCard";
import { usePlugins } from "../plugins/PluginProvider";
import { AiProfilesSettings } from "../plugins/AiProfilesSettings";
import {
  readEditorSidebarScope,
  writeEditorSidebarScope,
} from "../utils/editorSidebar";
import {
  readRecentCanvasesLimit,
  writeRecentCanvasesLimit,
} from "../utils/recentCanvases";
export const Settings: React.FC = () => {
  const { enabledEmbeddedPlugins } = usePlugins();
  const { theme, toggleTheme } = useTheme();
  const [backupExportExt, setBackupExportExt] = useState<
    "localdraw" | "localdraw.zip"
  >("localdraw");
  const [backupExportError, setBackupExportError] = useState<string | null>(null);
  const appVersion = import.meta.env.VITE_APP_VERSION || "Unknown version";
  const buildLabel = import.meta.env.VITE_APP_BUILD_LABEL;
  const UPDATE_CHANNEL_KEY = "excalidash-update-channel";
  const UPDATE_INFO_KEY = "excalidash-update-info";
  const [updateChannel, setUpdateChannel] = useState<api.UpdateChannel>(() => {
    const raw =
      typeof window === "undefined"
        ? null
        : (window.localStorage?.getItem?.(UPDATE_CHANNEL_KEY) ?? null);
    return raw === "prerelease" ? "prerelease" : "stable";
  });
  const [updateInfo, setUpdateInfo] = useState<api.UpdateInfo | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const COMPRESSION_ENABLED_KEY = "excalidash-image-compression";
  const [imageCompression, setImageCompression] = useState<boolean>(() => {
    const raw =
      typeof window === "undefined"
        ? null
        : window.localStorage?.getItem?.(COMPRESSION_ENABLED_KEY);
    return raw !== "false";
  });
  const [editorSidebarScope, setEditorSidebarScope] = useState(
    readEditorSidebarScope,
  );
  const [recentCanvasesLimit, setRecentCanvasesLimit] = useState(
    readRecentCanvasesLimit,
  );
  const [tab, setTab] = useState<"general" | "plugins" | "ai">(() => {
    if (window.location.hash === "#plugins") return "plugins";
    if (window.location.hash === "#ai") return "ai";
    return "general";
  });
  const selectTab = (next: "general" | "plugins" | "ai") => {
    setTab(next);
    window.history.replaceState(null, "", next === "general" ? window.location.pathname : `#${next}`);
  };
  const toggleImageCompression = () => {
    const next = !imageCompression;
    try {
      window.localStorage?.setItem?.(COMPRESSION_ENABLED_KEY, String(next));
    } catch {
      // Ignore unavailable storage in private/embedded contexts.
    }
    setImageCompression(next);
  };
  const checkForUpdates = async (channel: api.UpdateChannel) => {
    setUpdateLoading(true);
    setUpdateError(null);
    try {
      const info = await api.getUpdateInfo(channel);
      setUpdateInfo(info);
      try {
        window.localStorage?.setItem?.(
          `${UPDATE_INFO_KEY}:${channel}`,
          JSON.stringify(info),
        );
      } catch {
        // Ignore unavailable storage in private/embedded contexts.
      }
    } catch (err: unknown) {
      let message = "Failed to check for updates";
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message || err.response?.data?.error || message;
      }
      setUpdateError(message);
    } finally {
      setUpdateLoading(false);
    }
  };
  useEffect(() => {
    void checkForUpdates(updateChannel);
  }, []);
  const exportBackup = async () => {
    setBackupExportError(null);
    try {
      const extQuery = backupExportExt === "localdraw.zip" ? "?ext=zip" : "";
      const response = await api.api.get(`/export/excalidash${extQuery}`, {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/zip" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const date = new Date().toISOString().split("T")[0];
      link.download =
        backupExportExt === "localdraw.zip"
          ? `localdraw-backup-${date}.localdraw.zip`
          : `localdraw-backup-${date}.localdraw`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error("Backup export failed:", err);
      setBackupExportError("Failed to export backup. Please try again.");
    }
  };
  return (
    <Layout>
      {" "}
      <h1
        className="text-3xl sm:text-4xl lg:text-5xl mb-6 lg:mb-8 text-slate-900 dark:text-white pl-1"
        style={{ fontFamily: displayFontFamily }}
      >
        {" "}
        Settings{" "}
      </h1>{" "}
      {backupExportError && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
          {" "}
          <p className="text-red-800 dark:text-red-200 font-medium">
            {backupExportError}
          </p>{" "}
        </div>
      )}{" "}
      <nav className="mb-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800" aria-label="Settings sections">{(["general", "plugins", "ai"] as const).map((item) => <button key={item} type="button" onClick={() => selectTab(item)} aria-current={tab === item ? "page" : undefined} className={`workspace-focus border-b-2 px-4 py-2.5 text-sm font-semibold capitalize ${tab === item ? "border-violet-600 text-violet-700 dark:text-violet-300" : "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"}`}>{item}</button>)}</nav>
      {tab === "plugins" && <><PluginManagerCard />{enabledEmbeddedPlugins.map((plugin) => plugin.SettingsPanel ? <plugin.SettingsPanel key={plugin.manifest.id} /> : null)}</>}
      {tab === "ai" && <AiProfilesSettings />}
      {tab === "general" && <>{isDesktopApp && <WorkspaceSettingsCard />}<SettingsMainGrid
        backupExportExt={backupExportExt}
        setBackupExportExt={setBackupExportExt}
        exportBackup={exportBackup}
        theme={theme}
        toggleTheme={toggleTheme}
        imageCompression={imageCompression}
        toggleImageCompression={toggleImageCompression}
        editorSidebarScope={editorSidebarScope}
        setEditorSidebarScope={(scope) => {
          writeEditorSidebarScope(scope);
          setEditorSidebarScope(scope);
        }}
        recentCanvasesLimit={recentCanvasesLimit}
        setRecentCanvasesLimit={(limit) => {
          setRecentCanvasesLimit(writeRecentCanvasesLimit(limit));
        }}
        updateChannel={updateChannel}
        updateInfo={updateInfo}
        updateLoading={updateLoading}
        updateError={updateError}
        onUpdateChannelChange={(next) => {
          try {
            window.localStorage?.setItem?.(UPDATE_CHANNEL_KEY, next);
          } catch {
            // Ignore unavailable storage in private/embedded contexts.
          }
          setUpdateChannel(next);
          void checkForUpdates(next);
        }}
        onCheckForUpdates={() => void checkForUpdates(updateChannel)}
      /></>}
      {tab === "general" && <SettingsFooter appVersion={appVersion} buildLabel={buildLabel} />}
    </Layout>
  );
};
