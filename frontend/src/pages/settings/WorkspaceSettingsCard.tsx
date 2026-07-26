import { useEffect, useState } from "react";
import { FolderOpen, HardDrive, RefreshCw } from "lucide-react";
import {
  chooseDesktopWorkspace,
  getDesktopWorkspace,
  openDesktopWorkspace,
  rescanDesktopWorkspace,
  type DesktopWorkspaceStatus,
} from "../../api";

export const WorkspaceSettingsCard = () => {
  const [status, setStatus] = useState<DesktopWorkspaceStatus | null>(null);
  const [busy, setBusy] = useState<"choose" | "open" | "rescan" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDesktopWorkspace().then(setStatus).catch((value) => {
      setError(value instanceof Error ? value.message : "Could not read workspace settings");
    });
  }, []);

  const run = async (
    action: "choose" | "open" | "rescan",
    operation: () => Promise<DesktopWorkspaceStatus>,
  ) => {
    setBusy(action);
    setError(null);
    try {
      setStatus(await operation());
    } catch (value) {
      setError(value instanceof Error ? value.message : "Workspace operation failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900" aria-labelledby="drawing-folder-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
          <HardDrive size={21} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="drawing-folder-title" className="font-bold">Drawing folder</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Drawings are stored as ordinary .excalidraw files. Version history is kept in the hidden .localdraw folder.
          </p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
            {status?.path || "Loading…"}
          </code>
          {error && <p role="alert" className="mt-2 text-sm font-medium text-red-700 dark:text-red-400">{error}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" disabled={busy !== null} onClick={() => void run("open", openDesktopWorkspace)} className="workspace-focus inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 px-3 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
            <FolderOpen size={14} /> Open
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void run("rescan", rescanDesktopWorkspace)} className="workspace-focus inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 px-3 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
            <RefreshCw size={14} className={busy === "rescan" ? "animate-spin" : ""} /> Rescan
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void run("choose", chooseDesktopWorkspace)} className="workspace-focus h-9 rounded-xl bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
            {busy === "choose" ? "Moving…" : "Choose folder"}
          </button>
        </div>
      </div>
    </section>
  );
};
